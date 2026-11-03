import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PerfCommercial, TableauPilotage, fetchTableauPilotage } from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { IconAlert, IconArrowDown, IconArrowUp } from "../components/Icons";

type Colonne = {
  cle: keyof PerfCommercial;
  libelle: CleTraduction;
};

const COLONNES: Colonne[] = [
  { cle: "primes", libelle: "di.colPrimes" },
  { cle: "completionPct", libelle: "di.colObjectif" },
  { cle: "nouvelles", libelle: "di.colNouvelles" },
  { cle: "prospects", libelle: "di.colProspects" },
  { cle: "tauxRenouvellementPct", libelle: "di.colRenouvellement" },
  { cle: "impayees", libelle: "di.colImpayes" },
  { cle: "rapportsEnvoyes", libelle: "di.colRapports" },
];

/**
 * L'équipe commerciale, une ligne par personne, triable sur chaque colonne.
 *
 * Le tableau de bord classe sur les primes ; ici chaque colonne peut prendre
 * la tête, parce que la question du jour change : qui a le plus d'impayés,
 * qui oublie ses rapports, qui laisse filer ses renouvellements.
 */
export default function CommerciauxPage() {
  const { t, nombre, montant, montantCompact } = useLangue();
  const navigate = useNavigate();
  const [donnees, setDonnees] = useState<TableauPilotage | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tri, setTri] = useState<{ cle: keyof PerfCommercial; desc: boolean }>({ cle: "primes", desc: true });

  useEffect(() => {
    fetchTableauPilotage()
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }, []);

  const lignes = useMemo(() => {
    if (!donnees) return [];
    return [...donnees.commerciaux].sort((a, b) => {
      // Une valeur absente se range toujours en bas, quel que soit le sens.
      const va = a[tri.cle] as number | null;
      const vb = b[tri.cle] as number | null;
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return tri.desc ? vb - va : va - vb;
    });
  }, [donnees, tri]);

  function trier(cle: keyof PerfCommercial) {
    setTri((avant) => ({ cle, desc: avant.cle === cle ? !avant.desc : true }));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("nav.commerciaux")}</h1>
          <div className="page-sub">
            {donnees ? t("di.commerciauxSousTitre", { n: nombre(donnees.commerciaux.length), annee: donnees.annee }) : ""}
          </div>
        </div>
      </div>

      {erreur ? (
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      ) : !donnees ? (
        <div className="card">
          <p className="muted-3" style={{ margin: 0 }}>
            {t("commun.chargementDonnees")}
          </p>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table className="pd-equipe">
              <thead>
                <tr>
                  <th>{t("di.colCommercial")}</th>
                  {COLONNES.map((c) => (
                    <th key={c.cle} className="num">
                      <button className="pd-tri" onClick={() => trier(c.cle)} aria-sort={undefined}>
                        {t(c.libelle)}
                        {tri.cle === c.cle && (tri.desc ? <IconArrowDown size={12} /> : <IconArrowUp size={12} />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((c) => (
                  <tr key={c.id} className="pd-ligne" onClick={() => navigate(`/commerciaux/${c.id}`)}>
                    <td className="td-strong td-main" data-label={t("di.colCommercial")}>
                      {c.nomComplet}
                    </td>
                    <td className="num" data-label={t("di.colPrimes")} title={montant(c.primes)}>
                      {montantCompact(c.primes)}
                    </td>
                    <td className="num" data-label={t("di.colObjectif")}>
                      {c.completionPct === null ? (
                        <span className="muted-3">-</span>
                      ) : (
                        <span className="pd-objectif">
                          <span className="pd-objectif-barre" aria-hidden>
                            <span style={{ width: `${Math.min(100, c.completionPct)}%` }} />
                          </span>
                          {nombre(c.completionPct)}%
                        </span>
                      )}
                    </td>
                    <td className="num" data-label={t("di.colNouvelles")}>
                      {nombre(c.nouvelles)}
                    </td>
                    <td className="num" data-label={t("di.colProspects")}>
                      {nombre(c.prospects)}
                    </td>
                    <td className="num" data-label={t("di.colRenouvellement")}>
                      {c.tauxRenouvellementPct === null ? (
                        <span className="muted-3">-</span>
                      ) : (
                        `${nombre(c.tauxRenouvellementPct)}%`
                      )}
                    </td>
                    <td className="num" data-label={t("di.colImpayes")}>
                      {c.impayees > 0 ? (
                        <span className="pill pill-danger">{nombre(c.impayees)}</span>
                      ) : (
                        <span className="muted-3">0</span>
                      )}
                    </td>
                    <td className="num" data-label={t("di.colRapports")}>
                      {/* Sur les jours ouvrés écoulés du mois : le rapport
                          du jour n'est pas encore dû. */}
                      <span className={c.rapportsEnvoyes < donnees.rapportsAttendus ? "pd-retard" : undefined}>
                        {nombre(c.rapportsEnvoyes)}/{nombre(donnees.rapportsAttendus)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
