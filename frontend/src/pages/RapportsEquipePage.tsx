import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RapportJournalier, SemaineRapports, fetchSemaineRapports } from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { IconAlert, IconChevronLeft, IconChevronRight } from "../components/Icons";
import { decalerJours, dernierJourOuvre, lundiDe, versDate } from "../lib/jours";

const COMPTEURS: { cle: keyof RapportJournalier; libelle: CleTraduction }[] = [
  { cle: "appels", libelle: "rj.appels" },
  { cle: "visites", libelle: "rj.visites" },
  { cle: "rendezVous", libelle: "rj.rendezVous" },
  { cle: "nouveauxProspects", libelle: "rj.nouveauxProspects" },
  { cle: "devisRemis", libelle: "rj.devisRemis" },
  { cle: "contratsSignes", libelle: "rj.contratsSignes" },
];

const TEXTES: { cle: "faitsMarquants" | "difficultes" | "programmeLendemain"; libelle: CleTraduction }[] = [
  { cle: "faitsMarquants", libelle: "rj.faitsMarquants" },
  { cle: "difficultes", libelle: "rj.difficultes" },
  { cle: "programmeLendemain", libelle: "rj.programme" },
];

const estEnvoye = (r: unknown): r is RapportJournalier =>
  !!r && (r as RapportJournalier).statut === "ENVOYE";

/**
 * Les rapports de l'équipe, une semaine à la fois.
 *
 * La grille répond à « qui a envoyé quoi » d'un coup d'œil ; un clic sur une
 * case ouvre le rapport en dessous, sans quitter la grille, parce qu'on lit
 * les rapports d'une même journée à la suite, d'un commercial à l'autre.
 * La sélection vit dans l'adresse : un lien depuis le tableau de bord ou
 * depuis une fiche arrive directement sur le bon rapport.
 */
export default function RapportsEquipePage() {
  const { t, nombre, montant, montantCompact, locale } = useLangue();
  const [params, setParams] = useSearchParams();
  const [donnees, setDonnees] = useState<SemaineRapports | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const jourChoisi = params.get("jour") ?? dernierJourOuvre(new Date());
  const lundi = lundiDe(jourChoisi);
  const commercialChoisi = params.get("commercial");
  const lecture = useRef<HTMLElement>(null);

  useEffect(() => {
    setDonnees(null);
    fetchSemaineRapports(lundi)
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }, [lundi]);

  // Le rapport s'ouvre sous la grille, souvent hors de l'écran : on l'amène
  // à la lecture, y compris quand on arrive par un lien depuis une fiche.
  useEffect(() => {
    if (commercialChoisi && donnees) lecture.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [commercialChoisi, jourChoisi, donnees]);

  function choisir(jour: string, commercial?: string) {
    const suivant = new URLSearchParams({ jour });
    if (commercial) suivant.set("commercial", commercial);
    setParams(suivant, { replace: true });
  }

  // Les totaux ne comptent que les rapports envoyés : un brouillon peut
  // encore changer, l'additionner ferait bouger les chiffres sous les yeux.
  const totaux = useMemo(() => {
    const somme = Object.fromEntries(
      [...COMPTEURS.map((c) => c.cle), "primesSouscrites", "encaissements"].map((c) => [c, 0])
    ) as Record<string, number>;
    let envoyes = 0;
    for (const c of donnees?.commerciaux ?? []) {
      for (const r of Object.values(c.rapports)) {
        if (!estEnvoye(r)) continue;
        envoyes++;
        for (const cle of Object.keys(somme)) somme[cle] += r[cle as keyof RapportJournalier] as number;
      }
    }
    return { somme, envoyes };
  }, [donnees]);

  const dateLongue = (jour: string) =>
    versDate(jour).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });

  const libelleSemaine = donnees
    ? t("re.semaineDu", {
        debut: versDate(donnees.jours[0]).toLocaleDateString(locale, { day: "numeric", month: "long" }),
        fin: versDate(donnees.jours[donnees.jours.length - 1]).toLocaleDateString(locale, {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      })
    : "";

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("nav.rapportsEquipe")}</h1>
        <div className="page-sub">{libelleSemaine}</div>
      </div>
      <div className="re-semaine-nav">
        <button className="btn btn-ghost" onClick={() => choisir(decalerJours(lundi, -7))}>
          <IconChevronLeft size={16} />
          {t("re.semainePrecedente")}
        </button>
        <button
          className="btn btn-ghost"
          disabled={!donnees || decalerJours(lundi, 7) > donnees.aujourdhui}
          onClick={() => choisir(decalerJours(lundi, 7))}
        >
          {t("re.semaineSuivante")}
          <IconChevronRight size={16} />
        </button>
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

  const { aujourdhui, jours, commerciaux } = donnees;
  const selection = commerciaux.find((c) => c.id === commercialChoisi);
  const rapportChoisi = selection?.rapports[jourChoisi];

  function cellule(rapport: SemaineRapports["commerciaux"][number]["rapports"][string] | undefined, jour: string) {
    if (estEnvoye(rapport)) {
      return (
        <>
          <span className="pill pill-success">{t("rj.statutEnvoye")}</span>
          <span className="re-cellule-chiffres">
            {t("re.celluleResume", { appels: nombre(rapport.appels), contrats: nombre(rapport.contratsSignes) })}
          </span>
        </>
      );
    }
    if (rapport) return <span className="pill pill-warn">{t("rj.statutBrouillon")}</span>;
    // Le samedi n'est pas ouvré : un rapport y est bienvenu, son absence n'est pas un manque.
    if (jour > aujourdhui || versDate(jour).getDay() === 6) return <span className="muted-3">-</span>;
    // Le rapport du jour se remplit le soir : avant cela il n'est pas en retard.
    if (jour === aujourdhui) return <span className="pill pill-neutral">{t("re.attendu")}</span>;
    return <span className="pill pill-danger">{t("di.absent")}</span>;
  }

  return (
    <>
      {entete}

      <div className="tuiles re-totaux">
        <div className="tuile">
          <span className="tuile-libelle">{t("re.rapportsEnvoyes")}</span>
          <span className="tuile-valeur">{nombre(totaux.envoyes)}</span>
        </div>
        {COMPTEURS.map(({ cle, libelle }) => (
          <div className="tuile" key={cle}>
            <span className="tuile-libelle">{t(libelle)}</span>
            <span className="tuile-valeur">{nombre(totaux.somme[cle])}</span>
          </div>
        ))}
        <div className="tuile">
          <span className="tuile-libelle">{t("rj.primes")}</span>
          <span className="tuile-valeur" title={montant(totaux.somme.primesSouscrites)}>
            {montantCompact(totaux.somme.primesSouscrites)}
          </span>
        </div>
      </div>

      <div className="card re-grille-carte">
        <div className="re-grille-defile">
          <table className="re-grille">
            <thead>
              <tr>
                <th>{t("di.colCommercial")}</th>
                {jours.map((j) => (
                  <th key={j} className={j === aujourdhui ? "re-aujourdhui" : undefined}>
                    <span className="re-jour-nom">
                      {versDate(j).toLocaleDateString(locale, { weekday: "short" })}
                    </span>
                    <span className="re-jour-num">{versDate(j).getDate()}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {commerciaux.map((c) => (
                <tr key={c.id}>
                  <td className="re-nom">{c.nomComplet}</td>
                  {jours.map((j) => {
                    const r = c.rapports[j];
                    const actif = c.id === commercialChoisi && j === jourChoisi;
                    return (
                      <td key={j}>
                        {estEnvoye(r) ? (
                          <button
                            className={`re-cellule${actif ? " actif" : ""}`}
                            onClick={() => choisir(j, c.id)}
                            aria-label={t("re.lireLeRapport", { nom: c.nomComplet, jour: dateLongue(j) })}
                          >
                            {cellule(r, j)}
                          </button>
                        ) : (
                          <div className="re-cellule re-cellule-inerte">{cellule(r, j)}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selection && estEnvoye(rapportChoisi) ? (
        <section className="card re-lecture" ref={lecture}>
          <div className="rj-fiche-tete">
            <div>
              <h2 className="rj-fiche-titre">{t("re.rapportDe", { nom: selection.nomComplet, jour: dateLongue(jourChoisi) })}</h2>
              {rapportChoisi.envoyeLe && (
                <div className="rj-fiche-etat">
                  {t("rj.envoyeLe", {
                    date: new Date(rapportChoisi.envoyeLe).toLocaleDateString(locale, { day: "numeric", month: "long" }),
                    heure: new Date(rapportChoisi.envoyeLe).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
                  })}
                </div>
              )}
            </div>
            <button className="btn btn-ghost" onClick={() => choisir(jourChoisi)}>
              {t("re.fermer")}
            </button>
          </div>

          <div className="tuiles">
            {COMPTEURS.map(({ cle, libelle }) => (
              <div className="tuile" key={cle}>
                <span className="tuile-libelle">{t(libelle)}</span>
                <span className="tuile-valeur">{nombre(rapportChoisi[cle] as number)}</span>
              </div>
            ))}
            <div className="tuile">
              <span className="tuile-libelle">{t("rj.primes")}</span>
              <span className="tuile-valeur">{montant(rapportChoisi.primesSouscrites)}</span>
            </div>
            <div className="tuile">
              <span className="tuile-libelle">{t("rj.encaissements")}</span>
              <span className="tuile-valeur">{montant(rapportChoisi.encaissements)}</span>
            </div>
          </div>

          {TEXTES.map(({ cle, libelle }) => (
            <div className="field" key={cle}>
              <label>{t(libelle)}</label>
              <p className="rj-texte-fige">{rapportChoisi[cle] || <span className="muted-3">{t("rj.rien")}</span>}</p>
            </div>
          ))}
        </section>
      ) : (
        <p className="re-invite">{t("re.invite")}</p>
      )}
    </>
  );
}

