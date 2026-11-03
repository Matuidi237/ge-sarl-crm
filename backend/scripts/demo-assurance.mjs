/**
 * Jeu de démonstration de l'agence : commerciaux, prospects, polices et
 * quittances, pour voir vivre les tableaux de bord avant la reprise du
 * portefeuille réel.
 *
 *   node scripts/demo-assurance.mjs             met le jeu en place (le remplace s'il existe)
 *   node scripts/demo-assurance.mjs --supprimer le retire entièrement
 *   node scripts/demo-assurance.mjs --etat      dit seulement ce qu'il en reste
 *
 * PRODUCTION : lancez « --supprimer » avant la mise en service. Tout ce que ce
 * script crée est repérable sans dépendre des comptes : drapeau « estDemo »
 * sur la compagnie et les polices, « demo: true » dans les champs
 * personnalisés des fiches, préfixe « demo- » des identifiants.
 *
 * Les taux du barème sont des valeurs d'exemple, pas ceux du traité signé avec
 * CHANAS Assurances. Les remplacer avant toute lecture sérieuse des
 * commissions.
 *
 * Tirage pseudo-aléatoire à graine fixe : deux exécutions donnent le même
 * jeu, ce qui permet de comparer un écran avant et après une modification.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const MOT_DE_PASSE = "DemoGE2026!";
const PREFIXE = "demo-";
const COMPAGNIE = "CHANAS Assurances";

/* Les colonnes de date sont de type DATE : PostgreSQL y tronque l'horodatage
   sur UTC. Y écrire un minuit local décalerait la date d'un jour à Douala. */
const jour = (a, m, j) => new Date(Date.UTC(a, m, j));
const ajouterJours = (d, n) => new Date(d.getTime() + n * 86_400_000);
const ajouterMois = (d, n) => jour(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate());

let graine = 20261103;
function alea() {
  graine = (graine * 1103515245 + 12345) % 2147483648;
  return graine / 2147483648;
}
const entre = (min, max) => Math.round(min + alea() * (max - min));
const parmi = (liste) => liste[Math.floor(alea() * liste.length)];
/* Primes arrondies au millier : une prime d'assurance se tarifie ainsi, et
   un montant au franc près trahirait le tirage. */
const prime = (min, max) => Math.round(entre(min, max) / 1000) * 1000;

const COMMERCIAUX = [
  { identifiant: "demo-armelle", nomComplet: "Armelle NGO BIYONG", poids: 1.4, objectif: 60_000_000 },
  { identifiant: "demo-cedric", nomComplet: "Cédric FOTSO", poids: 1.1, objectif: 50_000_000 },
  { identifiant: "demo-ines", nomComplet: "Inès MBARGA", poids: 1.0, objectif: 45_000_000 },
  { identifiant: "demo-boris", nomComplet: "Boris ETOUNDI", poids: 0.8, objectif: 40_000_000 },
  { identifiant: "demo-sandrine", nomComplet: "Sandrine KAMGA", poids: 0.6, objectif: 35_000_000 },
];

/** Taux d'exemple, affaire nouvelle puis renouvellement. */
const BAREME = {
  AUTO: [12, 10],
  SANTE: [10, 8],
  PREVOYANCE: [15, 12],
  IARD: [17.5, 15],
  VIE: [5, 3],
  EPARGNE: [4, 3],
  VOYAGE: [20, 20],
};

const PRODUITS = [
  { branche: "AUTO", produit: "Auto Tous Risques", min: 350_000, max: 900_000, frac: "SEMESTRIEL", poids: 5, pour: "P" },
  { branche: "AUTO", produit: "Auto Tiers Complet", min: 120_000, max: 300_000, frac: "ANNUEL", poids: 5, pour: "P" },
  { branche: "AUTO", produit: "Flotte Automobile", min: 2_500_000, max: 9_000_000, frac: "TRIMESTRIEL", poids: 2, pour: "E" },
  { branche: "SANTE", produit: "Santé Famille", min: 400_000, max: 1_500_000, frac: "TRIMESTRIEL", poids: 3, pour: "P" },
  { branche: "SANTE", produit: "Santé Groupe", min: 3_000_000, max: 12_000_000, frac: "TRIMESTRIEL", poids: 2, pour: "E" },
  { branche: "PREVOYANCE", produit: "Individuelle Accident", min: 50_000, max: 150_000, frac: "ANNUEL", poids: 2, pour: "P" },
  { branche: "IARD", produit: "Multirisque Habitation", min: 80_000, max: 250_000, frac: "ANNUEL", poids: 3, pour: "P" },
  { branche: "IARD", produit: "Multirisque Professionnelle", min: 500_000, max: 3_000_000, frac: "SEMESTRIEL", poids: 3, pour: "E" },
  { branche: "VIE", produit: "Assurance Emprunteur", min: 200_000, max: 800_000, frac: "ANNUEL", poids: 1, pour: "P" },
  { branche: "EPARGNE", produit: "Épargne Retraite", min: 300_000, max: 1_200_000, frac: "MENSUEL", poids: 2, pour: "P" },
  { branche: "VOYAGE", produit: "Assistance Voyage", min: 30_000, max: 90_000, frac: "ANNUEL", poids: 2, pour: "P" },
];

const PRENOMS = ["Jean-Paul", "Christelle", "Hervé", "Mireille", "Serge", "Pélagie", "Alain", "Rosine", "Thierry", "Brigitte", "Rodrigue", "Carine", "Fabrice", "Laure", "Guy", "Nadège", "Patrick", "Estelle", "Yannick", "Josiane"];
const NOMS = ["ATANGANA", "NJOYA", "TCHOUA", "EBOGO", "MANGA", "NANA", "OWONA", "BELLO", "FOUDA", "NKOULOU", "DJOMO", "ESSOMBA", "KAMDEM", "ABENA", "MOUKOURI", "NDJOCK", "TAGNE", "EKANI", "YOMBI", "WAMBA"];
const ENTREPRISES = ["Boulangerie Le Palmier", "Transports Mbeng Express", "Clinique Sainte-Rita", "Quincaillerie du Wouri", "Cabinet Ndoumbe & Associés", "Imprimerie Akwa", "Groupe Scolaire Les Lauriers", "Pharmacie de Bonapriso", "SODIBEL Distribution", "Hôtel La Falaise", "Garage Central Bassa", "Agro-Industries du Moungo", "BTP Sanaga Construction", "Restaurant Le Bistrot", "Cliniques dentaires Smile", "Logistique Port Autonome Services"];
const VILLES = ["Douala", "Douala", "Douala", "Yaoundé", "Yaoundé", "Bafoussam", "Kribi", "Limbé"];
const STATUTS_PROSPECT = ["A_CONTACTER", "CONTACTE", "RENDEZ_VOUS", "DEVIS_REMIS", "EN_NEGOCIATION", "PERDU", "SANS_SUITE"];

/* Phrases de compte rendu, tirées pour que deux rapports voisins ne se
   ressemblent pas mot pour mot. */
const FAITS = [
  "Rendez-vous chez {e} : le gérant veut comparer notre offre santé groupe avec son assureur actuel.",
  "Deux renouvellements auto signés sur place, les clients ont réglé en espèces.",
  "Visite de trois commerces au marché Mboppi, un devis multirisque professionnelle à préparer.",
  "Relance de {e} : accord de principe, signature prévue en fin de semaine.",
  "Bonne journée de prospection à Bonamoussadi, quatre contacts qualifiés.",
  "Encaissement de la quittance trimestrielle de {e}.",
];
const DIFFICULTES = [
  "Le client attend une réponse de la compagnie sur la franchise, à appuyer si possible.",
  "Deux clients injoignables malgré trois relances.",
  "Besoin de plaquettes santé famille, le stock est épuisé.",
  "",
  "",
];
const PROGRAMMES = [
  "Relancer {e} pour la signature, puis tournée à Akwa.",
  "Matinée au bureau pour les devis, après-midi en rendez-vous clients.",
  "Visite chez {e}, encaissement de deux quittances en retard.",
  "Prospection à Bonapriso et dépôt des devis de la semaine.",
];

const PAS_MOIS = { ANNUEL: 12, SEMESTRIEL: 6, TRIMESTRIEL: 3, MENSUEL: 1 };

function tirerProduit(type) {
  const offre = PRODUITS.filter((p) => p.pour === type);
  const total = offre.reduce((s, p) => s + p.poids, 0);
  let r = alea() * total;
  for (const p of offre) if ((r -= p.poids) <= 0) return p;
  return offre[0];
}

/**
 * Quittances d'une police, générées jusqu'à un mois après aujourd'hui.
 *
 * Passée de plus d'un mois, une quittance non payée devient impayée ; plus
 * récente, elle reste à encaisser. C'est la distinction que fait l'agence au
 * moment de relancer.
 */
function quittancesDe(police, aujourdhui, tauxImpaye) {
  const pas = PAS_MOIS[police.fractionnement];
  const montant = Math.round(police.primeAnnuelle / (12 / pas));
  const liste = [];
  let debut = police.dateEffet;
  const horizon = ajouterJours(aujourdhui, 30);
  while (debut <= police.dateEcheance && debut <= horizon) {
    const fin = ajouterJours(ajouterMois(debut, pas), -1);
    const age = (aujourdhui - debut) / 86_400_000;
    let statut = "A_ENCAISSER";
    let dateEncaissement = null;
    if (age > 0) {
      if (alea() > tauxImpaye) {
        statut = "ENCAISSEE";
        dateEncaissement = ajouterJours(debut, entre(0, 20));
        if (dateEncaissement > aujourdhui) dateEncaissement = aujourdhui;
      } else if (age > 30) {
        statut = "IMPAYEE";
      }
    }
    liste.push({ periodeDebut: debut, periodeFin: fin, montant, dateEcheance: debut, statut, dateEncaissement });
    debut = ajouterMois(debut, pas);
  }
  return liste;
}

async function supprimer() {
  const polices = await prisma.police.deleteMany({ where: { estDemo: true } });
  const clients = await prisma.client.deleteMany({
    where: { champsPersonnalises: { path: ["demo"], equals: true } },
  });
  const objectifs = await prisma.objectifCommercial.deleteMany({
    where: { utilisateur: { identifiant: { startsWith: PREFIXE } } },
  });
  const rapports = await prisma.rapportJournalier.deleteMany({ where: { estDemo: true } });
  const comptes = await prisma.utilisateur.deleteMany({
    where: { identifiant: { in: COMMERCIAUX.map((c) => c.identifiant) } },
  });
  const compagnies = await prisma.compagnie.deleteMany({ where: { estDemo: true } });
  return { rapports: rapports.count, polices: polices.count, clients: clients.count, objectifs: objectifs.count, comptes: comptes.count, compagnies: compagnies.count };
}

async function etat() {
  const [polices, quittances, clients, comptes] = await Promise.all([
    prisma.police.count({ where: { estDemo: true } }),
    prisma.quittance.count({ where: { police: { estDemo: true } } }),
    prisma.client.count({ where: { champsPersonnalises: { path: ["demo"], equals: true } } }),
    prisma.utilisateur.count({ where: { identifiant: { in: COMMERCIAUX.map((c) => c.identifiant) } } }),
  ]);
  return { comptes, clients, polices, quittances };
}

async function installer() {
  await supprimer();
  const aujourdhui = new Date();
  const auj = jour(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());
  const hash = bcrypt.hashSync(MOT_DE_PASSE, 10);

  const compagnie = await prisma.compagnie.create({
    data: {
      nom: COMPAGNIE,
      estDemo: true,
      baremes: {
        create: Object.entries(BAREME).flatMap(([branche, [nouvelle, renouvellement]]) => [
          { branche, typeAffaire: "NOUVELLE", tauxPct: nouvelle },
          { branche, typeAffaire: "REMPLACEMENT", tauxPct: nouvelle },
          { branche, typeAffaire: "RENOUVELLEMENT", tauxPct: renouvellement },
        ]),
      },
    },
  });

  let numero = 100000;
  const bilan = { comptes: 0, clients: 0, polices: 0, quittances: 0 };

  for (const c of COMMERCIAUX) {
    const compte = await prisma.utilisateur.create({
      data: {
        identifiant: c.identifiant,
        nomComplet: c.nomComplet,
        role: "COMMERCIAL",
        fonction: "Commercial(e)",
        motDePasseHash: hash,
        pays: "Cameroun",
      },
    });
    bilan.comptes += 1;

    await prisma.objectifCommercial.create({
      data: {
        utilisateurId: compte.id,
        periode: "ANNEE",
        debut: jour(auj.getUTCFullYear(), 0, 1),
        cibleCaXAF: c.objectif,
        fixeParEncadrement: true,
        definiParNom: "Direction GE SARL",
        estDemo: true,
      },
    });

    /* Rapports des trois dernières semaines, du lundi au vendredi. La
       plupart sont envoyés ; quelques jours restent en brouillon ou vides,
       comme dans une vraie équipe. Aujourd'hui reste à remplir. */
    for (let ilYa = 21; ilYa >= 1; ilYa--) {
      const j = ajouterJours(auj, -ilYa);
      if (j.getUTCDay() === 0 || j.getUTCDay() === 6) continue;
      const tirage = alea();
      if (tirage < 0.1 / c.poids) continue; // jour sans rapport
      const envoye = tirage > 0.18;
      const contrats = alea() < 0.35 * c.poids ? entre(1, 2) : 0;
      const entreprise = parmi(ENTREPRISES);
      await prisma.rapportJournalier.create({
        data: {
          auteurId: compte.id,
          jour: j,
          appels: Math.round(entre(6, 16) * c.poids),
          visites: Math.round(entre(1, 5) * c.poids),
          rendezVous: entre(0, 3),
          nouveauxProspects: entre(0, 4),
          devisRemis: entre(0, 3),
          contratsSignes: contrats,
          primesSouscrites: contrats ? prime(150_000, 2_500_000) : 0,
          encaissements: alea() < 0.6 ? prime(80_000, 1_800_000) : 0,
          faitsMarquants: parmi(FAITS).replace("{e}", entreprise),
          difficultes: parmi(DIFFICULTES) || null,
          programmeLendemain: parmi(PROGRAMMES).replace("{e}", parmi(ENTREPRISES)),
          statut: envoye ? "ENVOYE" : "BROUILLON",
          envoyeLe: envoye ? new Date(j.getTime() + 17 * 3_600_000 + entre(0, 120) * 60_000) : null,
          estDemo: true,
        },
      });
    }

    const nbClients = Math.round(22 * c.poids);
    const nbProspects = Math.round(14 * c.poids);
    const tauxImpaye = 0.06 + (1.4 - c.poids) * 0.08;

    for (let k = 0; k < nbClients + nbProspects; k++) {
      const estClient = k < nbClients;
      const entreprise = alea() < 0.3;
      const nom = entreprise ? parmi(ENTREPRISES) : `${parmi(PRENOMS)} ${parmi(NOMS)}`;
      const fiche = await prisma.client.create({
        data: {
          nom,
          ville: parmi(VILLES),
          pays: "Cameroun",
          telephone: `+237 6${entre(50, 99)} ${entre(10, 99)} ${entre(10, 99)} ${entre(10, 99)}`,
          typePersonne: entreprise ? "ENTREPRISE" : "PARTICULIER",
          statut: estClient ? "CLIENT" : parmi(STATUTS_PROSPECT),
          proprietaireId: compte.id,
          commercialEnCharge: c.nomComplet,
          champsPersonnalises: { demo: true },
        },
      });
      bilan.clients += 1;
      if (!estClient) continue;

      const nbPolices = alea() < 0.3 ? 2 : 1;
      for (let n = 0; n < nbPolices; n++) {
        const offre = tirerProduit(entreprise ? "E" : "P");
        /* Première souscription sur les deux dernières années : celles de
           l'an passé arrivent à échéance cette année, ce qui donne au taux de
           renouvellement quelque chose à mesurer. */
        let effet = ajouterJours(auj, -entre(0, 700));
        let precedente = null;
        let typeAffaire = "NOUVELLE";
        let primeAnnuelle = prime(offre.min, offre.max);

        while (effet <= auj) {
          const echeance = ajouterJours(ajouterMois(effet, 12), -1);
          const echue = echeance < auj;
          const renouvelee = echue && alea() < 0.78;
          const police = {
            numeroPolice: `CH-${effet.getUTCFullYear()}-${numero++}`,
            clientId: fiche.id,
            compagnieId: compagnie.id,
            apporteurId: compte.id,
            branche: offre.branche,
            produit: offre.produit,
            typeAffaire,
            dateEffet: effet,
            dateEcheance: echeance,
            primeAnnuelle,
            fractionnement: offre.frac,
            statut: echue ? "EXPIRE" : "EN_COURS",
            policePrecedenteId: precedente,
            estDemo: true,
          };
          const quittances = quittancesDe(police, auj, tauxImpaye);
          const creee = await prisma.police.create({ data: { ...police, quittances: { create: quittances } } });
          bilan.polices += 1;
          bilan.quittances += quittances.length;
          if (!renouvelee) break;
          precedente = creee.id;
          typeAffaire = "RENOUVELLEMENT";
          // Indexation modeste au renouvellement, comme le pratiquent les compagnies.
          primeAnnuelle = Math.round((primeAnnuelle * (1 + entre(0, 6) / 100)) / 1000) * 1000;
          effet = ajouterJours(echeance, 1);
        }
      }
    }
  }
  return bilan;
}

const action = process.argv.includes("--supprimer") ? supprimer : process.argv.includes("--etat") ? etat : installer;
action()
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
