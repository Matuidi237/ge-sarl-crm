import { useEffect, useState } from "react";
import { TableauAssurance, fetchMonTableau, type PoliceResume } from "../api";
import { useAuth } from "../AuthContext";
import { useLangue } from "../i18n";
import CarteIndicateur, { type Carte } from "../components/CarteIndicateur";
import { CourbeEvolution, type VocabulaireCourbe } from "../components/Charts";
import { IconAlert, IconAward, IconCoins, IconInbox, IconTrend, IconUsers } from "../components/Icons";

const VOCABULAIRE: VocabulaireCourbe = {
  legendeA: "as.legendePrimes",
  legendeB: "as.legendeCommissions",
  detail: "as.moisDetail",
  vide: "as.moisVide",
};

/**
 * Tableau de bord d'un commercial de l'agence.
 *
 * La même disposition que celle d'un vendeur, mais pas les mêmes questions :
 * un commercial d'agent général ne se juge pas à ce qu'il a signé ce mois-ci,
 * il se juge aux primes qu'il fait émettre, au portefeuille qu'il conserve et
 * aux commissions qui tombent réellement, c'est-à-dire aux quittances payées.
 *
 * Les cartes ne mènent encore nulle part : leurs pages de détail lisent les
 * ventes du dépôt d'origine, et un lien vers des chiffres d'une autre nature
 * serait pire que pas de lien.
 */
export default function CommercialPage() {
  const { t, nombre, montant, montantCompact, rang, date, locale } = useLangue();
  const { utilisateur } = useAuth();
  const [donnees, setDonnees] = useState<TableauAssurance | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetchMonTableau()
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }, []);

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("co.bienvenue", { nom: utilisateur?.nomComplet ?? "" })}</h1>
        <div className="page-sub">{t("co.sousTitre")}</div>
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

  if (!donnees) {
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

  const { objectifAnnuel, classement, portefeuille, commissions } = donnees;
  const rien = t("dg.aucuneDonnee");

  const completionPct =
    objectifAnnuel.cible && objectifAnnuel.cible > 0
      ? Math.round((objectifAnnuel.realise / objectifAnnuel.cible) * 100)
      : null;

  /* Part du premier : « troisième sur cinq » ne dit pas si la place se joue
     à une police ou à une année de travail. */
  const ecartPremier =
    classement.primesPremier > 0 ? Math.round((objectifAnnuel.realise / classement.primesPremier) * 100) : null;

  const cartes: Carte[] = [
    {
      label: t("co.objectifAnnuel", { annee: objectifAnnuel.annee }),
      valeur: objectifAnnuel.cible === null ? rien : montantCompact(objectifAnnuel.cible),
      note:
        completionPct === null
          ? t("co.objectifAbsent")
          : t("as.objectifNote", {
              pct: nombre(completionPct),
              realise: montantCompact(objectifAnnuel.realise),
              ecoule: objectifAnnuel.partEcoulee,
            }),
      icone: IconTrend,
      fg: "#0c8074",
      bg: "#e2f4f1",
      jauge:
        completionPct === null ? undefined : { valeurPct: Math.min(100, completionPct), couleur: "#0c8074" },
    },
    {
      label: t("co.classement"),
      valeur: classement.rang ? t("co.rangSur", { rang: rang(classement.rang), n: classement.effectif }) : rien,
      valeurTexte: true,
      note:
        classement.rangPrimes && classement.rangNouvelles
          ? t("as.classementNote", {
              primes: rang(classement.rangPrimes),
              nouvelles: rang(classement.rangNouvelles),
            })
          : t("as.aucunePrime"),
      icone: IconAward,
      fg: "#9e6b06",
      bg: "#fcf2e0",
      /* Jauge sur l'écart au premier, pas sur le rang : un rang n'a pas de
         fraction, et le dessiner en proportion inventerait une distance. */
      jauge: ecartPremier !== null ? { valeurPct: Math.min(100, ecartPremier), couleur: "#c07a00" } : undefined,
    },
    {
      label: t("as.portefeuille"),
      valeur: portefeuille.polices > 0 ? nombre(portefeuille.polices) : rien,
      note:
        portefeuille.polices === 0
          ? t("as.portefeuilleVide")
          : portefeuille.tauxRenouvellementPct === null
            ? t("as.portefeuilleNote", {
                clients: nombre(portefeuille.clients),
                echeances: nombre(portefeuille.echeances30j),
              })
            : t("as.portefeuilleNoteRenouv", {
                clients: nombre(portefeuille.clients),
                echeances: nombre(portefeuille.echeances30j),
                pct: nombre(portefeuille.tauxRenouvellementPct),
              }),
      icone: IconUsers,
      fg: "#5b4bc4",
      bg: "#eeebfa",
      /* La jauge porte le taux de renouvellement : c'est ce qui dit si le
         portefeuille se conserve ou se vide par le bas. */
      jauge:
        portefeuille.tauxRenouvellementPct !== null
          ? { valeurPct: portefeuille.tauxRenouvellementPct, couleur: "#7c4dcc" }
          : undefined,
    },
    {
      label: t("co.commissions"),
      /* Acquis / attendu sur une ligne : c'est la comparaison qui intéresse.
         L'attendu est ce que rapporteraient toutes les quittances de l'année
         si elles étaient payées. */
      valeur: `${montantCompact(commissions.acquises).replace(" XAF", "")} / ${montantCompact(commissions.attendues)}`,
      valeurTexte: true,
      note:
        commissions.impayees > 0
          ? t("as.commissionsNoteImpayes", {
              n: nombre(commissions.encaissees),
              total: nombre(commissions.quittances),
              i: nombre(commissions.impayees),
            })
          : t("as.commissionsNote", {
              n: nombre(commissions.encaissees),
              total: nombre(commissions.quittances),
            }),
      icone: IconCoins,
      fg: "#1e6597",
      bg: "#e8f0f7",
    },
  ];

  const pillReglement = (p: PoliceResume) => {
    if (p.reglement === "IMPAYE") {
      return (
        <span className="pill pill-danger">
          {p.nbImpayees > 1 ? t("as.impayees", { n: nombre(p.nbImpayees) }) : t("as.impayee")}
        </span>
      );
    }
    if (p.reglement === "A_ENCAISSER") return <span className="pill pill-warn">{t("as.aEncaisser")}</span>;
    return <span className="pill pill-success">{t("as.aJour")}</span>;
  };

  const aDeLActivite = donnees.parMois.some((m) => m.ca > 0 || m.benefice > 0);

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

      {aDeLActivite && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("co.evolutionTitre")}</div>
              <div className="card-sub">{t("as.evolutionSousTitre")}</div>
            </div>
          </div>
          <CourbeEvolution
            vocabulaire={VOCABULAIRE}
            points={donnees.parMois.map((p) => ({
              ...p,
              libelle: new Date(`${p.mois}-01T00:00:00`).toLocaleDateString(locale, { month: "short" }),
            }))}
          />
        </div>
      )}

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("as.contratsTitre")}</div>
            <div className="card-sub">{t("as.contratsSousTitre", { n: nombre(donnees.nbPolices) })}</div>
          </div>
          {donnees.polices[0] && <span className="tag">{date(donnees.polices[0].dateEffet)}</span>}
        </div>

        {donnees.polices.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("as.contratsVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("as.contratsVideTexte")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("as.colEffet")}</th>
                  <th>{t("as.colClient")}</th>
                  <th>{t("as.colProduit")}</th>
                  <th>{t("as.colCompagnie")}</th>
                  <th>{t("as.colPrime")}</th>
                  <th>{t("as.colCommission")}</th>
                  <th>{t("as.colReglement")}</th>
                </tr>
              </thead>
              <tbody>
                {donnees.polices.map((p) => (
                  <tr key={p.id}>
                    <td data-label={t("as.colEffet")}>{date(p.dateEffet)}</td>
                    <td className="td-strong td-main" data-label={t("as.colClient")}>
                      {p.clientNom}
                    </td>
                    <td data-label={t("as.colProduit")}>
                      {p.produit}
                      {/* La branche sous le produit : le libellé commercial
                          varie d'une compagnie à l'autre, la branche non. */}
                      <div className="muted-3" style={{ fontSize: 12.5 }}>
                        {t(`branche.${p.branche}`)}
                        {p.typeAffaire === "RENOUVELLEMENT" && ` · ${t("as.renouvellement")}`}
                      </div>
                    </td>
                    <td data-label={t("as.colCompagnie")}>{p.compagnie}</td>
                    <td className="num" data-label={t("as.colPrime")} title={montant(p.primeAnnuelle)}>
                      {montantCompact(p.primeAnnuelle)}
                    </td>
                    <td
                      className="num"
                      data-label={t("as.colCommission")}
                      title={p.tauxPct === null ? undefined : `${nombre(p.tauxPct)} %`}
                    >
                      {p.commission === null ? <span className="muted-3">-</span> : montantCompact(p.commission)}
                    </td>
                    <td data-label={t("as.colReglement")}>{pillReglement(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
