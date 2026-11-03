import { Router } from "express";
import type { StatutFiche } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { commissionDe, indexBaremes, moisDe, nb, tauxDe } from "../lib/assurance.js";
import { fenetreDe, partEcoulee } from "../lib/periodes.js";
import { tableauAssurance } from "./assurance.js";
import { serialiser } from "./rapports.js";

export const pilotageRouter = Router();

/**
 * Pilotage de l'agence par la direction.
 *
 * Monté derrière la capacité « stats.globales » : ce sont les chiffres de toute
 * l'équipe, et la vue de la directrice n'est qu'un confort d'affichage, pas
 * une protection.
 */

const ROLES_COMMERCIALE = ["RESPONSABLE_COMMERCIAL", "COMMERCIAL"] as const;

/* Les étapes où une fiche est encore un prospect qu'on travaille. PERDU et
   SANS_SUITE en sont sortis, CLIENT aussi, mais dans l'autre sens. */
const PIPELINE: StatutFiche[] = ["A_CONTACTER", "CONTACTE", "RENDEZ_VOUS", "DEVIS_REMIS", "EN_NEGOCIATION"];

const jourUTC = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const texteJour = (d: Date) => d.toISOString().slice(0, 10);

/** Jours ouvrés (lundi à vendredi) entre deux bornes UTC, la fin exclue. */
function joursOuvres(debut: Date, fin: Date): number {
  let n = 0;
  for (let d = new Date(debut); d < fin; d = new Date(d.getTime() + 86_400_000)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n += 1;
  }
  return n;
}

pilotageRouter.get("/tableau", async (_req, res) => {
  const maintenant = new Date();
  const annee = fenetreDe("ANNEE", maintenant);
  const debutAnnee = new Date(Date.UTC(annee.debut.getFullYear(), 0, 1));
  const finAnnee = new Date(Date.UTC(annee.debut.getFullYear() + 1, 0, 1));
  const aujourdhui = jourUTC(maintenant);
  const debutMois = new Date(Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), 1));

  const equipe = await prisma.utilisateur.findMany({
    where: { role: { in: [...ROLES_COMMERCIALE] }, actif: true },
    select: { id: true, nomComplet: true, objectifsPersonnels: true },
    orderBy: { nomComplet: "asc" },
  });
  const ids = equipe.map((e) => e.id);

  const [baremes, polices, statuts, prospectsParCommercial, nouveauxProspects, objectifs, rapports] =
    await Promise.all([
      prisma.baremeCommission.findMany(),
      prisma.police.findMany({
        select: {
          id: true,
          apporteurId: true,
          compagnieId: true,
          branche: true,
          produit: true,
          typeAffaire: true,
          tauxCommissionPct: true,
          dateEffet: true,
          dateEcheance: true,
          statut: true,
          primeAnnuelle: true,
          policeSuivante: { select: { id: true } },
          quittances: {
            where: { statut: { not: "ANNULEE" } },
            select: { montant: true, statut: true, periodeDebut: true, dateEncaissement: true },
          },
        },
      }),
      prisma.client.groupBy({ by: ["statut"], _count: { _all: true } }),
      prisma.client.groupBy({
        by: ["proprietaireId"],
        where: { statut: { in: PIPELINE }, proprietaireId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.client.count({ where: { statut: { in: PIPELINE }, createdAt: { gte: debutMois } } }),
      prisma.objectifCommercial.findMany({
        where: { utilisateurId: { in: ids }, periode: "ANNEE", debut: debutAnnee },
        select: { utilisateurId: true, cibleCaXAF: true, fixeParEncadrement: true },
      }),
      prisma.rapportJournalier.groupBy({
        by: ["auteurId"],
        where: { statut: "ENVOYE", jour: { gte: debutMois, lt: aujourdhui }, auteurId: { in: ids } },
        _count: { _all: true },
      }),
    ]);

  const index = indexBaremes(baremes);

  const parMois: { mois: string; ca: number; benefice: number; nbVentes: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(maintenant.getFullYear(), maintenant.getMonth() - i, 1));
    parMois.push({ mois: moisDe(d), ca: 0, benefice: 0, nbVentes: 0 });
  }
  const indexMois = new Map(parMois.map((m, i) => [m.mois, i]));

  type Perf = {
    primes: number;
    nouvelles: number;
    impayees: number;
    echues: number;
    renouvelees: number;
  };
  const perfs = new Map<string, Perf>(
    ids.map((id) => [id, { primes: 0, nouvelles: 0, impayees: 0, echues: 0, renouvelees: 0 }])
  );

  let primesAnnee = 0;
  let commissionAcquise = 0;
  let commissionAttendue = 0;
  let impayesNb = 0;
  let impayesMontant = 0;
  let enCours = 0;
  const parBranche = new Map<string, number>();
  const parProduit = new Map<string, { produit: string; branche: string; nb: number; primes: number }>();
  const ilYaUnAn = new Date(maintenant.getTime() - 365 * 86_400_000);

  for (const p of polices) {
    const taux = tauxDe(p, index);
    const perf = p.apporteurId ? perfs.get(p.apporteurId) : undefined;
    if (p.statut === "EN_COURS") enCours += 1;

    /* « Le produit le plus vendu » se compte sur les affaires nouvelles de
       l'année : un renouvellement n'est pas une vente, c'est un client qui
       reste. Les compter ensemble couronnerait le produit le plus ancien du
       portefeuille plutôt que celui qui se vend. */
    const nouvelleDeLAnnee =
      p.typeAffaire !== "RENOUVELLEMENT" && p.dateEffet >= debutAnnee && p.dateEffet < finAnnee;
    if (nouvelleDeLAnnee) {
      const cle = `${p.branche}|${p.produit}`;
      const ligne = parProduit.get(cle) ?? { produit: p.produit, branche: p.branche, nb: 0, primes: 0 };
      ligne.nb += 1;
      ligne.primes += nb(p.primeAnnuelle);
      parProduit.set(cle, ligne);
      if (perf) perf.nouvelles += 1;
    }
    const im = indexMois.get(moisDe(p.dateEffet));
    if (im !== undefined && p.typeAffaire !== "RENOUVELLEMENT") parMois[im].nbVentes += 1;

    if (perf && p.dateEcheance < maintenant && p.dateEcheance >= ilYaUnAn && p.statut !== "RESILIE") {
      perf.echues += 1;
      if (p.policeSuivante) perf.renouvelees += 1;
    }

    for (const q of p.quittances) {
      const montant = nb(q.montant);
      const part = commissionDe(montant, taux) ?? 0;
      if (q.periodeDebut >= debutAnnee && q.periodeDebut < finAnnee) {
        primesAnnee += montant;
        commissionAttendue += part;
        if (q.statut === "ENCAISSEE") commissionAcquise += part;
        parBranche.set(p.branche, (parBranche.get(p.branche) ?? 0) + montant);
        if (perf) perf.primes += montant;
      }
      if (q.statut === "IMPAYEE") {
        impayesNb += 1;
        impayesMontant += montant;
        if (perf) perf.impayees += 1;
      }
      const i = indexMois.get(moisDe(q.periodeDebut));
      if (i !== undefined) parMois[i].ca += montant;
      if (q.statut === "ENCAISSEE" && q.dateEncaissement) {
        const ie = indexMois.get(moisDe(q.dateEncaissement));
        if (ie !== undefined) parMois[ie].benefice += part;
      }
    }
  }

  /* L'objectif retenu est celui que suit le commercial : celui de
     l'encadrement par défaut, le sien s'il a choisi d'en fixer un. */
  const objectifDe = new Map<string, number>();
  for (const e of equipe) {
    const source = !e.objectifsPersonnels;
    const o =
      objectifs.find((x) => x.utilisateurId === e.id && x.fixeParEncadrement === source) ??
      objectifs.find((x) => x.utilisateurId === e.id);
    if (o?.cibleCaXAF != null) objectifDe.set(e.id, Number(o.cibleCaXAF));
  }
  const objectifAgence = [...objectifDe.values()].reduce((s, v) => s + v, 0);

  const prospectsDe = new Map(prospectsParCommercial.map((p) => [p.proprietaireId, p._count._all]));
  const rapportsDe = new Map(rapports.map((r) => [r.auteurId, r._count._all]));
  const rapportsAttendus = joursOuvres(debutMois, aujourdhui);

  const commerciaux = equipe
    .map((e) => {
      const p = perfs.get(e.id)!;
      const objectif = objectifDe.get(e.id) ?? null;
      return {
        id: e.id,
        nomComplet: e.nomComplet,
        primes: Math.round(p.primes),
        objectif: objectif === null ? null : Math.round(objectif),
        completionPct: objectif ? Math.round((p.primes / objectif) * 100) : null,
        nouvelles: p.nouvelles,
        prospects: prospectsDe.get(e.id) ?? 0,
        impayees: p.impayees,
        tauxRenouvellementPct: p.echues > 0 ? Math.round((p.renouvelees / p.echues) * 100) : null,
        rapportsEnvoyes: rapportsDe.get(e.id) ?? 0,
      };
    })
    .sort((a, b) => b.primes - a.primes);

  const compteStatut = new Map(statuts.map((s) => [s.statut, s._count._all]));
  const produits = [...parProduit.values()].sort((a, b) => b.nb - a.nb || b.primes - a.primes);

  res.json({
    annee: annee.debut.getFullYear(),
    partEcoulee: Math.round(partEcoulee(annee) * 100),
    primes: { realise: Math.round(primesAnnee), objectif: objectifAgence > 0 ? Math.round(objectifAgence) : null },
    prospects: {
      enCours: PIPELINE.reduce((s, st) => s + (compteStatut.get(st) ?? 0), 0),
      nouveauxCeMois: nouveauxProspects,
      pipeline: PIPELINE.map((st) => ({ statut: st, nb: compteStatut.get(st) ?? 0 })),
      clients: compteStatut.get("CLIENT") ?? 0,
    },
    produits: produits.slice(0, 8).map((p) => ({ ...p, primes: Math.round(p.primes) })),
    nbAffairesNouvelles: produits.reduce((s, p) => s + p.nb, 0),
    commissions: {
      acquises: Math.round(commissionAcquise),
      attendues: Math.round(commissionAttendue),
      impayees: impayesNb,
      montantImpaye: Math.round(impayesMontant),
    },
    contratsEnCours: enCours,
    parBranche: [...parBranche.entries()]
      .map(([branche, primes]) => ({ branche, primes: Math.round(primes) }))
      .sort((a, b) => b.primes - a.primes),
    parMois,
    commerciaux,
    rapportsAttendus,
  });
});

/** La fiche d'un commercial, telle qu'il la voit lui-même, plus ses derniers rapports. */
pilotageRouter.get("/commercial/:id", async (req, res) => {
  const compte = await prisma.utilisateur.findFirst({
    where: { id: req.params.id, role: { in: [...ROLES_COMMERCIALE] } },
    select: { id: true, nomComplet: true, fonction: true, actif: true },
  });
  // 404 et non 403 : on ne confirme pas l'existence d'un compte hors du périmètre.
  if (!compte) return res.status(404).json({ error: "Commercial introuvable." });

  const [tableau, rapports] = await Promise.all([
    tableauAssurance(compte.id),
    prisma.rapportJournalier.findMany({
      where: { auteurId: compte.id, statut: "ENVOYE" },
      orderBy: { jour: "desc" },
      take: 5,
    }),
  ]);
  res.json({ identite: compte, tableau, rapports: rapports.map(serialiser) });
});

/**
 * Les rapports de l'équipe sur une semaine, du lundi au samedi.
 *
 * Un brouillon n'est signalé que par son statut, sans son contenu : c'est le
 * document de travail du commercial, et la direction ne lit que ce qui lui a
 * été adressé.
 */
pilotageRouter.get("/rapports/semaine/:lundi", async (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.lundi)) return res.status(400).json({ error: "Date invalide." });
  const [a, m, j] = req.params.lundi.split("-").map(Number);
  const lundi = new Date(Date.UTC(a, m - 1, j));
  if (lundi.getUTCDay() !== 1) return res.status(400).json({ error: "La semaine commence un lundi." });
  const finSemaine = new Date(lundi.getTime() + 6 * 86_400_000);

  const [equipe, rapports] = await Promise.all([
    prisma.utilisateur.findMany({
      where: { role: { in: [...ROLES_COMMERCIALE] }, actif: true },
      select: { id: true, nomComplet: true },
      orderBy: { nomComplet: "asc" },
    }),
    prisma.rapportJournalier.findMany({ where: { jour: { gte: lundi, lt: finSemaine } } }),
  ]);

  const jours = Array.from({ length: 6 }, (_, i) => texteJour(new Date(lundi.getTime() + i * 86_400_000)));
  res.json({
    aujourdhui: texteJour(jourUTC(new Date())),
    jours,
    commerciaux: equipe.map((e) => ({
      id: e.id,
      nomComplet: e.nomComplet,
      rapports: Object.fromEntries(
        rapports
          .filter((r) => r.auteurId === e.id)
          .map((r) => [
            texteJour(r.jour),
            r.statut === "ENVOYE" ? serialiser(r) : { jour: texteJour(r.jour), statut: "BROUILLON" as const },
          ])
      ),
    })),
  });
});
