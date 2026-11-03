import { useEffect, useState } from "react";
import { TableauAssurance, fetchMonTableau } from "../api";
import { useAuth } from "../AuthContext";
import { useLangue } from "../i18n";
import TableauCommercialVue from "../components/TableauCommercialVue";
import { IconAlert } from "../components/Icons";

/**
 * Tableau de bord du commercial connecté.
 *
 * Les cartes ne mènent encore nulle part : leurs pages de détail lisent les
 * ventes du dépôt d'origine, et un lien vers des chiffres d'une autre nature
 * serait pire que pas de lien.
 */
export default function CommercialPage() {
  const { t } = useLangue();
  const { utilisateur } = useAuth();
  const [donnees, setDonnees] = useState<TableauAssurance | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetchMonTableau()
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("co.bienvenue", { nom: utilisateur?.nomComplet ?? "" })}</h1>
          <div className="page-sub">{t("co.sousTitre")}</div>
        </div>
      </div>

      {erreur ? (
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      ) : donnees ? (
        <TableauCommercialVue donnees={donnees} />
      ) : (
        <div className="card">
          <p className="muted-3" style={{ margin: 0 }}>
            {t("commun.chargementDonnees")}
          </p>
        </div>
      )}
    </>
  );
}
