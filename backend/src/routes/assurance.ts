import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { commissionDe, indexBaremes, moisDe, nb, tauxDe } from "../lib/assurance.js";
import { fenetreDe, partEcoulee } from "../lib/periodes.js";

export const assuranceRouter = Router();

/** Rôles qui composent le classement commercial. */
const ROLES_COMMERCIALE = ["RESPONSABLE_COMMERCIAL", "COMMERCIAL"] as const;

/**
 * Rang d'un identifiant dans une liste déjà triée, en 1..n.
 *
 * Les ex aequo partagent le même rang : trancher par ordre alphabétique
 * inventerait une hiérarchie que les chiffres ne portent pas.
 */
function rangDe(classement: { id: string; score: number }[], id: string): number | null {
  const index = classement.findIndex((c) => c.id === id);
  if (index === -1) return null;
  const score = classement[index].score;
  return classement.findIndex((c) => c.score === score) + 1;
}

/**
 * Tableau de bord d'un commercial d'agence d'assurance.
 *
 * Une seule fonction pour le commercial et pour la direction qui consulte sa
 * fiche : un chiffre calculé deux fois finit par différer, et c'est le
 * commercial qui aurait à s'expliquer sur l'écart.
 *
 * Les primes se comptent sur les quittances et non sur la prime annuelle des
 * polices. C'est ce que la compagnie appelle « primes émises », et c'est la
 * seule mesure qui tombe dans le bon mois quand une prime est fractionnée.
 */
export async function tableauAssurance(utilisateurId: string) {
  const moi = { id: utilisateurId };
  const maintenant = new Date();
  const annee = fenetreDe("ANNEE", maintenant);
  // Bornes en UTC : elles se comparent à des colonnes @db.Date.
  const debutAnnee = new Date(Date.UTC(annee.debut.getFullYear(), 0, 1));
  const finAnnee = new Date(Date.UTC(annee.debut.getFullYear() + 1, 0, 1));

  const compte = await prisma.utilisateur.findUnique({
    where: { id: moi.id },
    select: { objectifsPersonnels: true },
  });
  if (!compte) return null;

  const [baremes, mesPolices, quittancesEquipe, equipe, objectifs] = await Promise.all([
    prisma.baremeCommission.findMany(),
    prisma.police.findMany({
      where: { apporteurId: moi.id },
      orderBy: { dateEffet: "desc" },
      include: {
        client: { select: { nom: true } },
        compagnie: { select: { nom: true } },
        quittances: true,
        policeSuivante: { select: { id: true } },
      },
    }),
    /* Toute l'équipe en une lecture : le classement a besoin des autres, et
       une requête par collègue coûterait plus cher que ce tri. */
    prisma.quittance.findMany({
      where: {
        statut: { not: "ANNULEE" },
        periodeDebut: { gte: debutAnnee, lt: finAnnee },
        police: { apporteurId: { not: null } },
      },
      select: { montant: true, police: { select: { apporteurId: true, typeAffaire: true, id: true } } },
    }),
    prisma.utilisateur.findMany({
      where: { role: { in: [...ROLES_COMMERCIALE] }, actif: true },
      select: { id: true },
    }),
    prisma.objectifCommercial.findMany({
      where: { utilisateurId: moi.id, periode: "ANNEE", debut: debutAnnee },
      select: { cibleCaXAF: true, fixeParEncadrement: true },
    }),
  ]);

  const index = indexBaremes(baremes);
  const sourceEncadrement = !compte.objectifsPersonnels;
  const objectif = objectifs.find((o) => o.fixeParEncadrement === sourceEncadrement) ?? null;

  /* Douze mois glissants créés vides puis remplis : une courbe qui saute les
     mois creux raconte une progression qui n'a pas eu lieu. */
  const parMois: { mois: string; ca: number; benefice: number; nbVentes: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(maintenant.getFullYear(), maintenant.getMonth() - i, 1));
    parMois.push({ mois: moisDe(d), ca: 0, benefice: 0, nbVentes: 0 });
  }
  const indexMois = new Map(parMois.map((m, i) => [m.mois, i]));

  let primesAnnee = 0;
  let commissionAcquise = 0;
  let commissionAttendue = 0;
  let quittancesAnnee = 0;
  let quittancesEncaissees = 0;
  let impayees = 0;
  let policesEnCours = 0;
  let echeancesProches = 0;
  let echuesRecentes = 0;
  let echuesRenouvelees = 0;
  const clientsEnCours = new Set<string>();

  const dans30j = new Date(maintenant.getTime() + 30 * 86_400_000);
  const ilYaUnAn = new Date(maintenant.getTime() - 365 * 86_400_000);

  const polices = mesPolices.map((p) => {
    const taux = tauxDe(p, index);

    if (p.statut === "EN_COURS") {
      policesEnCours += 1;
      clientsEnCours.add(p.clientId);
      if (p.dateEcheance >= maintenant && p.dateEcheance <= dans30j) echeancesProches += 1;
    }
    /* Taux de renouvellement : parmi les polices arrivées à échéance sur douze
       mois, la part qui a un successeur. Une police résiliée avant terme n'est
       pas un échec de renouvellement, elle n'en a jamais eu l'occasion. */
    if (p.dateEcheance < maintenant && p.dateEcheance >= ilYaUnAn && p.statut !== "RESILIE") {
      echuesRecentes += 1;
      if (p.policeSuivante) echuesRenouvelees += 1;
    }

    const i = indexMois.get(moisDe(p.dateEffet));
    if (i !== undefined) parMois[i].nbVentes += 1;

    let impayeesPolice = 0;
    let aEncaisserPolice = 0;
    for (const q of p.quittances) {
      if (q.statut === "ANNULEE") continue;
      const montant = nb(q.montant);
      const part = commissionDe(montant, taux) ?? 0;

      if (q.periodeDebut >= debutAnnee && q.periodeDebut < finAnnee) {
        primesAnnee += montant;
        quittancesAnnee += 1;
        commissionAttendue += part;
        if (q.statut === "ENCAISSEE") {
          quittancesEncaissees += 1;
          commissionAcquise += part;
        }
      }
      if (q.statut === "IMPAYEE") {
        impayees += 1;
        impayeesPolice += 1;
      }
      if (q.statut === "A_ENCAISSER") aEncaisserPolice += 1;

      const im = indexMois.get(moisDe(q.periodeDebut));
      if (im !== undefined) parMois[im].ca += montant;
      /* La commission tombe dans le mois de l'encaissement, pas de l'émission :
         c'est à ce moment qu'elle est acquise. */
      if (q.statut === "ENCAISSEE" && q.dateEncaissement) {
        const ie = indexMois.get(moisDe(q.dateEncaissement));
        if (ie !== undefined) parMois[ie].benefice += part;
      }
    }

    const prime = nb(p.primeAnnuelle);
    return {
      id: p.id,
      numeroPolice: p.numeroPolice,
      dateEffet: p.dateEffet,
      clientNom: p.client.nom,
      compagnie: p.compagnie.nom,
      branche: p.branche,
      produit: p.produit,
      typeAffaire: p.typeAffaire,
      primeAnnuelle: Math.round(prime),
      commission: commissionDe(prime, taux),
      tauxPct: taux,
      /* Un seul état par ligne, le plus grave d'abord : une police à jour
         sauf une quittance impayée n'est pas à jour. */
      reglement: impayeesPolice > 0 ? "IMPAYE" : aEncaisserPolice > 0 ? "A_ENCAISSER" : "A_JOUR",
      nbImpayees: impayeesPolice,
    };
  });

  /* --- Classement sur l'année ------------------------------------------- */
  const perfs = new Map(equipe.map((e) => [e.id, { primes: 0, nouvelles: new Set<string>() }]));
  for (const q of quittancesEquipe) {
    const p = perfs.get(q.police.apporteurId!);
    if (!p) continue; // apporteur inactif ou d'un autre rôle : hors classement
    p.primes += nb(q.montant);
    if (q.police.typeAffaire === "NOUVELLE") p.nouvelles.add(q.police.id);
  }
  const membres = [...perfs.entries()];
  const parPrimes = membres.map(([id, p]) => ({ id, score: p.primes })).sort((a, b) => b.score - a.score);
  const parNouvelles = membres
    .map(([id, p]) => ({ id, score: p.nouvelles.size }))
    .sort((a, b) => b.score - a.score);
  const rangPrimes = rangDe(parPrimes, moi.id);
  const rangNouvelles = rangDe(parNouvelles, moi.id);
  /* Les deux rangs se somment puis on reclasse : un commercial doit pouvoir
     refaire le calcul de tête, ce qu'une pondération interdirait. */
  const parCombine = membres
    .map(([id]) => ({
      id,
      score: (rangDe(parPrimes, id) ?? membres.length) + (rangDe(parNouvelles, id) ?? membres.length),
    }))
    .sort((a, b) => a.score - b.score);

  const aDesPrimes = primesAnnee > 0;

  return {
    objectifAnnuel: {
      annee: annee.debut.getFullYear(),
      cible: objectif?.cibleCaXAF == null ? null : Math.round(Number(objectif.cibleCaXAF)),
      realise: Math.round(primesAnnee),
      partEcoulee: Math.round(partEcoulee(annee) * 100),
    },
    classement: {
      rang: aDesPrimes ? rangDe(parCombine, moi.id) : null,
      effectif: membres.length,
      rangPrimes: aDesPrimes ? rangPrimes : null,
      rangNouvelles: aDesPrimes ? rangNouvelles : null,
      primesPremier: Math.round(parPrimes[0]?.score ?? 0),
    },
    portefeuille: {
      polices: policesEnCours,
      clients: clientsEnCours.size,
      echeances30j: echeancesProches,
      /* Null sans police échue sur l'année : un taux sur zéro n'existe pas. */
      tauxRenouvellementPct: echuesRecentes > 0 ? Math.round((echuesRenouvelees / echuesRecentes) * 100) : null,
    },
    commissions: {
      acquises: Math.round(commissionAcquise),
      attendues: Math.round(commissionAttendue),
      quittances: quittancesAnnee,
      encaissees: quittancesEncaissees,
      impayees,
    },
    parMois,
    polices: polices.slice(0, 15),
    nbPolices: polices.length,
  };
}

/* L'identité vient du jeton, jamais d'un paramètre : un commercial n'a pas à
   lire la performance d'un collègue en modifiant l'URL. */
assuranceRouter.get("/mon-tableau", async (req, res) => {
  const tableau = await tableauAssurance(req.utilisateur!.id);
  if (!tableau) return res.status(404).json({ error: "Compte introuvable." });
  res.json(tableau);
});
