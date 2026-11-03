import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FichePilotage, fetchFichePilotage } from "../api";
import { useFilAriane } from "../ContexteEntete";
import { useLangue, type CleTraduction } from "../i18n";
import TableauCommercialVue from "../components/TableauCommercialVue";
import { IconAlert, IconArrowRight } from "../components/Icons";
import { versDate } from "../lib/jours";

/**
 * Un commercial vu par la direction : exactement son tableau de bord, plus
 * ses derniers rapports. Rien de plus, rien de moins, pour que l'entretien
 * de suivi porte sur les mêmes chiffres des deux côtés du bureau.
 */
export default function FicheCommercialAssurancePage() {
  const { id } = useParams();
  const { t, nombre, montantCompact, locale } = useLangue();
  const [fiche, setFiche] = useState<FichePilotage | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useFilAriane("/commerciaux", t("nav.commerciaux"), fiche?.identite.nomComplet);

  useEffect(() => {
    if (!id) return;
    fetchFichePilotage(id)
      .then(setFiche)
      .catch((e) => setErreur(e.message));
  }, [id]);

  // « 1 contrats » se lit comme une faute ; zéro garde le pluriel, comme en français.
  const compte = (n: number, un: CleTraduction, plusieurs: CleTraduction) =>
    n === 1 ? t(un) : t(plusieurs, { n: nombre(n) });

  if (erreur) {
    return (
      <div className="alert alert-error">
        <IconAlert />
        {erreur}
      </div>
    );
  }

  if (!fiche) {
    return (
      <div className="card">
        <p className="muted-3" style={{ margin: 0 }}>
          {t("commun.chargementDonnees")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{fiche.identite.nomComplet}</h1>
          <div className="page-sub">{fiche.identite.fonction ?? t("di.commercial")}</div>
        </div>
      </div>

      <TableauCommercialVue donnees={fiche.tableau} vueDirection />

      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("di.derniersRapports")}</h2>
          <Link className="panneau-lien" to="/rapports-equipe">
            {t("di.tousLesRapports")}
            <IconArrowRight size={14} />
          </Link>
        </header>
        {fiche.rapports.length === 0 ? (
          <p className="panneau-vide">{t("di.aucunRapport")}</p>
        ) : (
          <ul className="pd-rapports">
            {fiche.rapports.map((r) => (
              <li key={r.jour}>
                <Link to={`/rapports-equipe?jour=${r.jour}&commercial=${fiche.identite.id}`}>
                  <span className="pd-rapports-jour">
                    {versDate(r.jour).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
                  </span>
                  <span className="pd-rapports-chiffres">
                    {[
                      compte(r.appels, "rj.resumeAppel", "rj.resumeAppels"),
                      compte(r.visites, "rj.resumeVisite", "rj.resumeVisites"),
                      compte(r.contratsSignes, "rj.resumeContrat", "rj.resumeContrats"),
                    ].join(", ")}
                    {r.primesSouscrites > 0 && ` · ${montantCompact(r.primesSouscrites)}`}
                  </span>
                  {r.faitsMarquants && <span className="pd-rapports-texte">{r.faitsMarquants}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
