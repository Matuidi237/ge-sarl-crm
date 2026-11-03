import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  SemaineRapports,
  TableauPilotage,
  fetchSemaineRapports,
  fetchTableauPilotage,
} from "../api";
import { useAuth } from "../AuthContext";
import { useLangue } from "../i18n";
import CarteIndicateur, { type Carte } from "../components/CarteIndicateur";
import { BarList, CourbeEvolution, DonutInteractif, type VocabulaireCourbe } from "../components/Charts";
import { IconAlert, IconArrowRight, IconAward, IconCoins, IconTrend, IconUsers } from "../components/Icons";
import { dernierJourOuvre, lundiDe } from "../lib/jours";

const VOCABULAIRE: VocabulaireCourbe = {
  legendeA: "as.legendePrimes",
  legendeB: "as.legendeCommissions",
  detail: "as.moisDetail",
  vide: "as.moisVide",
};

/**
 * Accueil de la directrice.
 *
 * Elle ouvre l'outil pour trois questions, dans cet ordre : où en est
 * l'agence, qu'est-ce qui se vend, et qui fait quoi. Les quatre cartes
 * répondent à la première, les deux encarts du milieu à la deuxième, le
 * tableau des commerciaux et le relevé des rapports à la troisième.
 */
export default function DirectricePage() {
  const { t, nombre, montant, montantCompact, locale } = useLangue();
  const { utilisateur } = useAuth();
  const [donnees, setDonnees] = useState<TableauPilotage | null>(null);
  const [semaine, setSemaine] = useState<SemaineRapports | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  /* Le relevé porte sur le dernier jour ouvré écoulé : à dix heures du
     matin, les rapports du jour ne sont pas en retard, ils ne sont pas
     encore dus. */
  const jourReleve = dernierJourOuvre(new Date());

  useEffect(() => {
    Promise.all([fetchTableauPilotage(), fetchSemaineRapports(lundiDe(jourReleve))])
      .then(([d, s]) => {
        setDonnees(d);
        setSemaine(s);
      })
      .catch((e) => setErreur(e.message));
  }, [jourReleve]);

  const prenom = utilisateur?.nomComplet.split(/\s+/)[0] ?? "";
  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("di.bonjour", { nom: prenom })}</h1>
        <div className="page-sub">
          {t("di.sousTitre", {
            date: new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }),
          })}
        </div>
      </div>
    </div>
  );

  if (erreur) {
    return (
      <>
        {entete}
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      </>
    );
  }

  if (!donnees || !semaine) {
    return (
      <>
        {entete}
        <div className="card">
          <p className="muted-3" style={{ margin: 0 }}>
            {t("commun.chargementDonnees")}
          </p>
        </div>
      </>
    );
  }

  const rien = t("dg.aucuneDonnee");
  const { primes, prospects, produits, commissions } = donnees;
  const completion = primes.objectif ? Math.round((primes.realise / primes.objectif) * 100) : null;
  const meilleur = produits[0];
  const partMeilleur =
    meilleur && donnees.nbAffairesNouvelles > 0 ? Math.round((meilleur.nb / donnees.nbAffairesNouvelles) * 100) : null;

  const cartes: Carte[] = [
    {
      label: t("di.primes", { annee: donnees.annee }),
      valeur: montantCompact(primes.realise),
      note:
        completion === null
          ? t("di.primesSansObjectif")
          : t("di.primesNote", {
              pct: nombre(completion),
              objectif: montantCompact(primes.objectif!),
              ecoule: donnees.partEcoulee,
            }),
      icone: IconTrend,
      fg: "#0c8074",
      bg: "#e2f4f1",
      jauge: completion === null ? undefined : { valeurPct: Math.min(100, completion), couleur: "#0c8074" },
    },
    {
      label: t("di.prospects"),
      valeur: nombre(prospects.enCours),
      note: t("di.prospectsNote", { n: nombre(prospects.nouveauxCeMois), clients: nombre(prospects.clients) }),
      icone: IconUsers,
      fg: "#5b4bc4",
      bg: "#eeebfa",
      vers: "/clients",
      libelleLien: t("di.voirBase"),
    },
    {
      label: t("di.meilleurProduit"),
      valeur: meilleur ? meilleur.produit : rien,
      valeurTexte: true,
      note: meilleur
        ? t("di.meilleurProduitNote", {
            n: nombre(meilleur.nb),
            total: nombre(donnees.nbAffairesNouvelles),
            primes: montantCompact(meilleur.primes),
          })
        : t("di.aucuneAffaire"),
      icone: IconAward,
      fg: "#9e6b06",
      bg: "#fcf2e0",
      // La part des affaires nouvelles : c'est elle qui dit si ce produit domine ou devance de peu.
      jauge: partMeilleur === null ? undefined : { valeurPct: partMeilleur, couleur: "#c07a00" },
    },
    {
      label: t("co.commissions"),
      valeur: `${montantCompact(commissions.acquises).replace(" XAF", "")} / ${montantCompact(commissions.attendues)}`,
      valeurTexte: true,
      note:
        commissions.impayees > 0
          ? t("di.impayesNote", {
              n: nombre(commissions.impayees),
              montant: montantCompact(commissions.montantImpaye),
            })
          : t("di.aucunImpaye"),
      icone: IconCoins,
      fg: "#1e6597",
      bg: "#e8f0f7",
    },
  ];

  const totalBranches = donnees.parBranche.reduce((s, b) => s + b.primes, 0);
  const totalPipeline = prospects.pipeline.reduce((s, p) => s + p.nb, 0);
  const maxPrimes = Math.max(1, ...donnees.commerciaux.map((c) => c.primes));

  const releve = semaine.commerciaux.map((c) => ({ ...c, rapport: c.rapports[jourReleve] }));
  const envoyes = releve.filter((c) => c.rapport?.statut === "ENVOYE").length;

  return (
    <>
      {entete}

      <div className="stat-grid">
        {cartes.map((c) => (
          <CarteIndicateur
            key={c.label}
            {...c}
            libelleVariation={t("dg.depuisMoisDernier")}
            libelleSansVariation={t("dg.pasDeComparaison")}
          />
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("di.evolutionTitre")}</div>
            <div className="card-sub">{t("as.evolutionSousTitre")}</div>
          </div>
          <span className="tag">{t("di.contratsEnCours", { n: nombre(donnees.contratsEnCours) })}</span>
        </div>
        <CourbeEvolution
          vocabulaire={VOCABULAIRE}
          points={donnees.parMois.map((p) => ({
            ...p,
            libelle: new Date(`${p.mois}-01T00:00:00`).toLocaleDateString(locale, { month: "short" }),
          }))}
        />
      </div>

      <div className="dash-grid dash-grid-egal">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("di.produitsTitre")}</div>
              <div className="card-sub">{t("di.produitsSousTitre", { annee: donnees.annee })}</div>
            </div>
          </div>
          {produits.length === 0 ? (
            <p className="muted-3" style={{ margin: 0 }}>
              {t("di.aucuneAffaire")}
            </p>
          ) : (
            <BarList
              data={produits.map((p) => ({ label: p.produit, count: p.nb }))}
              total={donnees.nbAffairesNouvelles}
              unite={t("di.uniteContrats")}
            />
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("di.branchesTitre")}</div>
              <div className="card-sub">{t("di.branchesSousTitre", { annee: donnees.annee })}</div>
            </div>
          </div>
          <DonutInteractif
            lignes={donnees.parBranche.map((b) => ({
              label: t(`branche.${b.branche}`),
              valeur: b.primes,
              valeurCourte: montantCompact(b.primes),
              detail: t("di.brancheDetail", {
                montant: montant(b.primes),
                part: totalBranches ? Math.round((b.primes / totalBranches) * 100) : 0,
              }),
            }))}
            libelleCentre={t("as.legendePrimes")}
            totalFormate={montantCompact(totalBranches)}
          />
        </div>
      </div>

      <div className="dash-grid dash-grid-egal">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("di.pipelineTitre")}</div>
              <div className="card-sub">{t("di.pipelineSousTitre", { n: nombre(totalPipeline) })}</div>
            </div>
          </div>
          <BarList
            data={prospects.pipeline.map((p) => ({ label: t(`statut.${p.statut}`), count: p.nb }))}
            total={totalPipeline}
            unite={t("di.uniteProspects")}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("di.releveTitre")}</div>
              <div className="card-sub">
                {t("di.releveSousTitre", {
                  jour: new Date(`${jourReleve}T00:00:00`).toLocaleDateString(locale, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }),
                  n: nombre(envoyes),
                  total: nombre(releve.length),
                })}
              </div>
            </div>
            <Link className="panneau-lien" to={`/rapports-equipe?jour=${jourReleve}`}>
              {t("di.lireRapports")}
              <IconArrowRight size={14} />
            </Link>
          </div>
          <ul className="pd-releve">
            {releve.map((c) => (
              <li key={c.id}>
                <span className="pd-releve-nom">{c.nomComplet}</span>
                {c.rapport?.statut === "ENVOYE" ? (
                  <span className="pill pill-success">{t("rj.statutEnvoye")}</span>
                ) : c.rapport ? (
                  <span className="pill pill-warn">{t("rj.statutBrouillon")}</span>
                ) : (
                  <span className="pill pill-danger">{t("di.absent")}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("di.equipeTitre")}</h2>
          <Link className="panneau-lien" to="/commerciaux">
            {t("di.voirCommerciaux")}
            <IconArrowRight size={14} />
          </Link>
        </header>
        <table className="rangs">
          <tbody>
            {donnees.commerciaux.map((c, i) => (
              <tr key={c.id}>
                <td className="rang-num">{i + 1}</td>
                <td className="rang-nom">
                  {/* La part est celle du premier, pas de l'agence : on lit
                      d'un regard l'écart qui sépare chacun de la tête. */}
                  <span className="rang-fond" style={{ width: `${(c.primes / maxPrimes) * 100}%` }} aria-hidden />
                  <Link className="rang-texte pd-lien-nom" to={`/commerciaux/${c.id}`}>
                    {c.nomComplet}
                  </Link>
                </td>
                <td className="rang-chiffre">
                  {c.completionPct === null ? "" : t("di.dObjectif", { pct: nombre(c.completionPct) })}
                </td>
                <td className="rang-chiffre rang-montant" title={montant(c.primes)}>
                  {montantCompact(c.primes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
