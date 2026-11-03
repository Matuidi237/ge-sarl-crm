import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { nb } from "../lib/assurance.js";

export const rapportsRouter = Router();

/**
 * Rapports journaliers du commercial connecté.
 *
 * L'auteur vient toujours du jeton, jamais de l'URL : un commercial ne lit ni
 * n'écrit le rapport d'un collègue en changeant un paramètre. La lecture par
 * la direction passera par une route à part, gardée par une capacité.
 */

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const MOIS = /^\d{4}-\d{2}$/;

/** « 2026-11-03 » vers le minuit UTC que stocke une colonne @db.Date. */
function jourDe(texte: string): Date | null {
  if (!JOUR.test(texte)) return null;
  const [a, m, j] = texte.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCMonth() === m - 1 ? d : null; // refuse le 31 février
}

/** Aujourd'hui dans le fuseau du serveur, ramené au minuit UTC des colonnes DATE. */
function aujourdhui(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

const compteur = z.number().int().min(0).max(999);
const montant = z.number().min(0).max(100_000_000_000);
const texte = z.string().trim().max(4000).nullable().optional();

const corps = z.object({
  appels: compteur,
  visites: compteur,
  rendezVous: compteur,
  nouveauxProspects: compteur,
  devisRemis: compteur,
  contratsSignes: compteur,
  primesSouscrites: montant,
  encaissements: montant,
  faitsMarquants: texte,
  difficultes: texte,
  programmeLendemain: texte,
});

type Rapport = Awaited<ReturnType<typeof prisma.rapportJournalier.findFirst>>;

function serialiser(r: NonNullable<Rapport>) {
  return {
    jour: r.jour.toISOString().slice(0, 10),
    appels: r.appels,
    visites: r.visites,
    rendezVous: r.rendezVous,
    nouveauxProspects: r.nouveauxProspects,
    devisRemis: r.devisRemis,
    contratsSignes: r.contratsSignes,
    primesSouscrites: Math.round(nb(r.primesSouscrites)),
    encaissements: Math.round(nb(r.encaissements)),
    faitsMarquants: r.faitsMarquants ?? "",
    difficultes: r.difficultes ?? "",
    programmeLendemain: r.programmeLendemain ?? "",
    statut: r.statut,
    envoyeLe: r.envoyeLe,
    modifieLe: r.updatedAt,
  };
}

/** Les rapports d'un mois, pour la liste des jours. */
rapportsRouter.get("/mois/:mois", async (req, res) => {
  if (!MOIS.test(req.params.mois)) return res.status(400).json({ error: "Mois invalide." });
  const [a, m] = req.params.mois.split("-").map(Number);
  const rapports = await prisma.rapportJournalier.findMany({
    where: {
      auteurId: req.utilisateur!.id,
      jour: { gte: new Date(Date.UTC(a, m - 1, 1)), lt: new Date(Date.UTC(a, m, 1)) },
    },
    orderBy: { jour: "desc" },
  });
  res.json({ aujourdhui: aujourdhui().toISOString().slice(0, 10), rapports: rapports.map(serialiser) });
});

rapportsRouter.get("/:jour", async (req, res) => {
  const jour = jourDe(req.params.jour);
  if (!jour) return res.status(400).json({ error: "Date invalide." });
  const r = await prisma.rapportJournalier.findUnique({
    where: { auteurId_jour: { auteurId: req.utilisateur!.id, jour } },
  });
  res.json(r ? serialiser(r) : null);
});

/**
 * Enregistre le brouillon, ou l'envoie quand « envoyer » vaut vrai.
 *
 * L'envoi transporte le contenu final plutôt que de basculer un statut : la
 * sauvegarde automatique a pu ne pas partir quand le commercial clique, et la
 * direction recevrait alors une version antérieure à ce qu'il voit à l'écran.
 */
async function enregistrer(req: import("express").Request, res: import("express").Response, envoyer: boolean) {
  const jour = jourDe(req.params.jour);
  if (!jour) return res.status(400).json({ error: "Date invalide." });
  if (jour > aujourdhui()) {
    return res.status(400).json({ error: "On ne rédige pas le rapport d'une journée qui n'a pas eu lieu." });
  }
  const lu = corps.safeParse(req.body);
  if (!lu.success) return res.status(400).json({ error: "Valeurs du rapport invalides." });

  const auteurId = req.utilisateur!.id;
  const existant = await prisma.rapportJournalier.findUnique({
    where: { auteurId_jour: { auteurId, jour } },
    select: { statut: true },
  });
  if (existant?.statut === "ENVOYE") {
    return res.status(409).json({ error: "Ce rapport a déjà été envoyé à la direction, il ne se modifie plus." });
  }

  const donnees = {
    ...lu.data,
    faitsMarquants: lu.data.faitsMarquants || null,
    difficultes: lu.data.difficultes || null,
    programmeLendemain: lu.data.programmeLendemain || null,
    ...(envoyer ? { statut: "ENVOYE" as const, envoyeLe: new Date() } : {}),
  };
  const r = await prisma.rapportJournalier.upsert({
    where: { auteurId_jour: { auteurId, jour } },
    create: { auteurId, jour, ...donnees },
    update: donnees,
  });
  res.json(serialiser(r));
}

rapportsRouter.put("/:jour", (req, res) => enregistrer(req, res, false));
rapportsRouter.post("/:jour/envoyer", (req, res) => enregistrer(req, res, true));
