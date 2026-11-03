import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RapportJournalier,
  ValeursRapport,
  enregistrerRapport,
  fetchRapportsDuMois,
} from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconLock,
  IconMinus,
  IconPlus,
  IconSend,
} from "../components/Icons";

/**
 * Rapports journaliers du commercial.
 *
 * Une fiche par jour, pensée pour être remplie en deux minutes en fin de
 * journée : des compteurs qu'on incrémente du pouce, deux montants, trois
 * zones de texte. Pas de bouton « Enregistrer » : la fiche se sauvegarde
 * seule pendant la saisie, parce qu'un rapport perdu à cause d'un onglet
 * fermé ne sera pas réécrit. Le seul geste délibéré est l'envoi à la
 * direction, qui fige la fiche.
 */

const VIDE: ValeursRapport = {
  appels: 0,
  visites: 0,
  rendezVous: 0,
  nouveauxProspects: 0,
  devisRemis: 0,
  contratsSignes: 0,
  primesSouscrites: 0,
  encaissements: 0,
  faitsMarquants: "",
  difficultes: "",
  programmeLendemain: "",
};

type CleCompteur = "appels" | "visites" | "rendezVous" | "nouveauxProspects" | "devisRemis" | "contratsSignes";

const COMPTEURS: { cle: CleCompteur; libelle: CleTraduction }[] = [
  { cle: "appels", libelle: "rj.appels" },
  { cle: "visites", libelle: "rj.visites" },
  { cle: "rendezVous", libelle: "rj.rendezVous" },
  { cle: "nouveauxProspects", libelle: "rj.nouveauxProspects" },
  { cle: "devisRemis", libelle: "rj.devisRemis" },
  { cle: "contratsSignes", libelle: "rj.contratsSignes" },
];

const DELAI_SAUVEGARDE = 900;

/* Les jours circulent en « AAAA-MM-JJ » : un jour calendaire n'a pas d'heure,
   et le manipuler en Date ferait resurgir les décalages de fuseau. */
const versDate = (jour: string) => {
  const [a, m, j] = jour.split("-").map(Number);
  return new Date(a, m - 1, j);
};
const versJour = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const moisDe = (jour: string) => jour.slice(0, 7);
const decalerMois = (mois: string, pas: number) => {
  const [a, m] = mois.split("-").map(Number);
  const d = new Date(a, m - 1 + pas, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function valeursDe(r: RapportJournalier | undefined): ValeursRapport {
  if (!r) return VIDE;
  const { jour: _j, statut: _s, envoyeLe: _e, modifieLe: _m, ...valeurs } = r;
  return valeurs;
}

type EtatSauvegarde = "repos" | "enCours" | "enregistre" | "erreur";

export default function RapportsPage() {
  const { t, nombre, locale } = useLangue();

  const [aujourdhui, setAujourdhui] = useState<string | null>(null);
  const [mois, setMois] = useState<string | null>(null);
  const [rapports, setRapports] = useState<Map<string, RapportJournalier>>(new Map());
  const [jour, setJour] = useState<string | null>(null);
  const [valeurs, setValeurs] = useState<ValeursRapport>(VIDE);
  const [etat, setEtat] = useState<EtatSauvegarde>("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  /* Ce qui attend d'être sauvegardé, hors de l'état React : le minuteur et le
     changement de jour doivent lire la dernière saisie, pas celle du rendu où
     ils ont été créés. */
  const enAttente = useRef<{ jour: string; valeurs: ValeursRapport } | null>(null);
  const minuteur = useRef<number | undefined>(undefined);

  const charger = useCallback(async (m?: string) => {
    try {
      const r = await fetchRapportsDuMois(m ?? moisDe(versJour(new Date())));
      setAujourdhui(r.aujourdhui);
      setMois(m ?? moisDe(r.aujourdhui));
      setRapports((avant) => {
        const suivant = new Map(avant);
        for (const x of r.rapports) suivant.set(x.jour, x);
        return suivant;
      });
      return r;
    } catch (e) {
      setErreur((e as Error).message);
      return null;
    }
  }, []);

  // Au premier affichage : le mois en cours, et la fiche du jour ouverte.
  useEffect(() => {
    charger().then((r) => {
      if (!r) return;
      const existant = r.rapports.find((x) => x.jour === r.aujourdhui);
      setJour(r.aujourdhui);
      setValeurs(valeursDe(existant));
    });
  }, [charger]);

  const sauvegarder = useCallback(async () => {
    window.clearTimeout(minuteur.current);
    const tache = enAttente.current;
    if (!tache) return;
    enAttente.current = null;
    setEtat("enCours");
    try {
      const r = await enregistrerRapport(tache.jour, tache.valeurs);
      setRapports((avant) => new Map(avant).set(r.jour, r));
      // Une saisie arrivée pendant l'envoi relance un cycle ; on ne l'écrase pas.
      setEtat(enAttente.current ? "enCours" : "enregistre");
    } catch (e) {
      setErreur((e as Error).message);
      setEtat("erreur");
    }
  }, []);

  // Fermer l'onglet ne doit pas perdre les dernières secondes de saisie.
  useEffect(() => {
    const avantFermeture = (e: BeforeUnloadEvent) => {
      if (enAttente.current) {
        void sauvegarder();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", avantFermeture);
    return () => {
      window.removeEventListener("beforeunload", avantFermeture);
      void sauvegarder();
    };
  }, [sauvegarder]);

  const rapport = jour ? rapports.get(jour) : undefined;
  const envoye = rapport?.statut === "ENVOYE";

  function modifier(patch: Partial<ValeursRapport>) {
    if (!jour || envoye) return;
    const suivant = { ...valeurs, ...patch };
    setValeurs(suivant);
    setConfirmation(false);
    setErreur(null);
    enAttente.current = { jour, valeurs: suivant };
    setEtat("enCours");
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => void sauvegarder(), DELAI_SAUVEGARDE);
  }

  async function ouvrir(j: string) {
    if (j === jour) return;
    await sauvegarder();
    setJour(j);
    setValeurs(valeursDe(rapports.get(j)));
    setConfirmation(false);
    setErreur(null);
    setEtat("repos");
  }

  async function changerMois(pas: number) {
    if (!mois) return;
    await sauvegarder();
    await charger(decalerMois(mois, pas));
  }

  async function envoyer() {
    if (!jour) return;
    window.clearTimeout(minuteur.current);
    enAttente.current = null;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await enregistrerRapport(jour, valeurs, true);
      setRapports((avant) => new Map(avant).set(r.jour, r));
      setConfirmation(false);
      setEtat("repos");
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  /* Les jours affichés : du lundi au vendredi jusqu'à aujourd'hui, plus tout
     jour de week-end où un rapport existe. Un samedi travaillé apparaît donc
     dès qu'on l'a rempli, sans qu'un samedi chômé soit compté comme manquant. */
  const jours = useMemo(() => {
    if (!mois || !aujourdhui) return [];
    const [a, m] = mois.split("-").map(Number);
    const liste: string[] = [];
    for (let d = new Date(a, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) {
      const j = versJour(d);
      if (j > aujourdhui) break;
      const semaine = d.getDay() !== 0 && d.getDay() !== 6;
      if (semaine || rapports.has(j) || j === aujourdhui) liste.push(j);
    }
    return liste.reverse();
  }, [mois, aujourdhui, rapports]);

  /* Aujourd'hui ne compte comme attendu qu'une fois envoyé : à midi, la
     journée n'est pas en retard, elle est en cours. */
  const attendus = jours.filter((j) => {
    const d = versDate(j).getDay();
    if (j === aujourdhui) return rapports.get(j)?.statut === "ENVOYE";
    return d !== 0 && d !== 6;
  }).length;
  const envoyes = jours.filter((j) => rapports.get(j)?.statut === "ENVOYE").length;

  /* Le programme annoncé la veille, rappelé en tête de la fiche : c'est le
     point de comparaison naturel d'un compte rendu, et le commercial n'a pas
     à rouvrir le rapport précédent pour le retrouver. */
  const veille = useMemo(() => {
    if (!jour) return null;
    const precedents = [...rapports.values()]
      .filter((r) => r.jour < jour && r.programmeLendemain.trim())
      .sort((x, y) => (x.jour < y.jour ? 1 : -1));
    const r = precedents[0];
    if (!r) return null;
    /* Quatre jours couvrent le week-end : le programme du vendredi vaut pour
       le lundi. Au-delà, il ne décrit plus la journée en cours. */
    const ecart = (versDate(jour).getTime() - versDate(r.jour).getTime()) / 86_400_000;
    return ecart <= 4 ? r : null;
  }, [jour, rapports]);

  const formatJourCourt = (j: string) =>
    versDate(j).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const formatJourLong = (j: string) =>
    versDate(j).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dateCourte = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const heure = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const libelleMois = mois
    ? versDate(`${mois}-01`).toLocaleDateString(locale, { month: "long", year: "numeric" })
    : "";

  function statutJour(j: string) {
    const r = rapports.get(j);
    if (r?.statut === "ENVOYE") return <span className="pill pill-success">{t("rj.statutEnvoye")}</span>;
    if (r) return <span className="pill pill-warn">{t("rj.statutBrouillon")}</span>;
    if (j === aujourdhui) return <span className="pill pill-brand">{t("rj.statutAujourdhui")}</span>;
    return <span className="pill pill-neutral">{t("rj.statutManquant")}</span>;
  }

  function resumeJour(r: RapportJournalier | undefined) {
    if (!r) return null;
    const compte = (n: number, un: CleTraduction, plusieurs: CleTraduction) =>
      n === 0 ? null : n === 1 ? t(un) : t(plusieurs, { n: nombre(n) });
    const morceaux = [
      compte(r.appels, "rj.resumeAppel", "rj.resumeAppels"),
      compte(r.visites, "rj.resumeVisite", "rj.resumeVisites"),
      compte(r.contratsSignes, "rj.resumeContrat", "rj.resumeContrats"),
    ].filter(Boolean);
    return morceaux.length ? morceaux.join(" · ") : null;
  }

  function etatFiche() {
    if (envoye && rapport?.envoyeLe) {
      return t("rj.envoyeLe", { date: dateCourte(rapport.envoyeLe), heure: heure(rapport.envoyeLe) });
    }
    if (etat === "enCours") return t("rj.enregistrement");
    if (etat === "erreur") return t("rj.nonEnregistre");
    if (rapport) return t("rj.brouillonEnregistre", { heure: heure(rapport.modifieLe) });
    return t("rj.pasCommence");
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("nav.rapports")}</h1>
        <div className="page-sub">{t("rj.sousTitre")}</div>
      </div>
    </div>
  );

  if (!jour || !mois || !aujourdhui) {
    return (
      <>
        {entete}
        {erreur ? (
          <div className="alert alert-error">
            <IconAlert />
            {erreur}
          </div>
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

  const moisCourant = mois === moisDe(aujourdhui);

  return (
    <>
      {entete}

      <div className="rj-grille">
        {/* ------------------------------------------------ Liste des jours */}
        <aside className="card rj-jours">
          <div className="rj-mois">
            <button className="rj-mois-nav" onClick={() => changerMois(-1)} aria-label={t("rj.moisPrecedent")}>
              <IconChevronLeft size={16} />
            </button>
            <div className="rj-mois-titre">{libelleMois}</div>
            <button
              className="rj-mois-nav"
              onClick={() => changerMois(1)}
              disabled={moisCourant}
              aria-label={t("rj.moisSuivant")}
            >
              <IconChevronRight size={16} />
            </button>
          </div>

          <div className="rj-bilan">
            <div className="rj-bilan-chiffre">
              {nombre(envoyes)}
              <span>/{nombre(attendus)}</span>
            </div>
            <div className="rj-bilan-libelle">{t("rj.bilan")}</div>
            <div className="rj-bilan-barre" aria-hidden>
              <div style={{ width: `${attendus ? Math.min(100, (envoyes / attendus) * 100) : 0}%` }} />
            </div>
          </div>

          <ul className="rj-liste">
            {jours.map((j) => {
              const r = rapports.get(j);
              const resume = resumeJour(r);
              return (
                <li key={j}>
                  <button className={`rj-jour${j === jour ? " actif" : ""}`} onClick={() => ouvrir(j)}>
                    <span className="rj-jour-texte">
                      <span className="rj-jour-date">{formatJourCourt(j)}</span>
                      {resume && <span className="rj-jour-resume">{resume}</span>}
                    </span>
                    {statutJour(j)}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* --------------------------------------------------- Fiche du jour */}
        <section className="card rj-fiche">
          <div className="rj-fiche-tete">
            <div>
              <div className="rj-fiche-titre">{t("rj.ficheDu", { jour: formatJourLong(jour) })}</div>
              <div className={`rj-fiche-etat${etat === "erreur" ? " erreur" : ""}`}>
                {envoye ? <IconLock /> : etat === "enregistre" || (rapport && etat === "repos") ? <IconCheck size={14} /> : null}
                {etatFiche()}
              </div>
            </div>
            {statutJour(jour)}
          </div>

          {veille && (
            <div className="rj-veille">
              <div className="rj-veille-titre">{t("rj.prevu", { jour: formatJourCourt(veille.jour) })}</div>
              <p>{veille.programmeLendemain}</p>
            </div>
          )}

          <div className="rj-section-titre">{t("rj.activite")}</div>
          <div className="rj-compteurs">
            {COMPTEURS.map(({ cle, libelle }) => (
              <div className="rj-compteur" key={cle}>
                <label htmlFor={`rj-${cle}`}>{t(libelle)}</label>
                <div className="rj-compteur-saisie">
                  {!envoye && (
                    <button
                      type="button"
                      onClick={() => modifier({ [cle]: Math.max(0, valeurs[cle] - 1) })}
                      disabled={valeurs[cle] === 0}
                      aria-label={t("rj.retirer", { quoi: t(libelle) })}
                    >
                      <IconMinus size={15} />
                    </button>
                  )}
                  <input
                    id={`rj-${cle}`}
                    inputMode="numeric"
                    value={valeurs[cle]}
                    readOnly={envoye}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, "") || "0", 10);
                      modifier({ [cle]: Math.min(999, n) });
                    }}
                  />
                  {!envoye && (
                    <button
                      type="button"
                      onClick={() => modifier({ [cle]: Math.min(999, valeurs[cle] + 1) })}
                      aria-label={t("rj.ajouter", { quoi: t(libelle) })}
                    >
                      <IconPlus size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="rj-section-titre">{t("rj.production")}</div>
          <div className="rj-montants">
            {(["primesSouscrites", "encaissements"] as const).map((cle) => (
              <div className="field" key={cle}>
                <label htmlFor={`rj-${cle}`}>{t(cle === "primesSouscrites" ? "rj.primes" : "rj.encaissements")}</label>
                <div className="rj-montant">
                  <input
                    id={`rj-${cle}`}
                    inputMode="numeric"
                    readOnly={envoye}
                    /* Affiché groupé par milliers : « 1 250 000 » se relit,
                       « 1250000 » se recompte. */
                    value={valeurs[cle] ? nombre(valeurs[cle]) : ""}
                    placeholder="0"
                    onChange={(e) => modifier({ [cle]: parseInt(e.target.value.replace(/\D/g, "") || "0", 10) })}
                  />
                  <span>XAF</span>
                </div>
              </div>
            ))}
          </div>

          <div className="rj-section-titre">{t("rj.compteRendu")}</div>
          {(
            [
              ["faitsMarquants", "rj.faitsMarquants", "rj.faitsMarquantsAide"],
              ["difficultes", "rj.difficultes", "rj.difficultesAide"],
              ["programmeLendemain", "rj.programme", "rj.programmeAide"],
            ] as const
          ).map(([cle, libelle, aide]) => (
            <div className="field" key={cle}>
              <label htmlFor={`rj-${cle}`}>{t(libelle)}</label>
              {envoye ? (
                <p className="rj-texte-fige">{valeurs[cle] || <span className="muted-3">{t("rj.rien")}</span>}</p>
              ) : (
                <textarea
                  id={`rj-${cle}`}
                  rows={3}
                  placeholder={t(aide)}
                  value={valeurs[cle]}
                  onChange={(e) => modifier({ [cle]: e.target.value })}
                />
              )}
            </div>
          ))}

          {erreur && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              <IconAlert />
              {erreur}
            </div>
          )}

          {!envoye && (
            <div className="rj-pied">
              <p className="rj-pied-texte">{confirmation ? t("rj.avertissement") : t("rj.autoSauvegarde")}</p>
              <div className="rj-pied-actions">
                {confirmation ? (
                  <>
                    <button className="btn btn-ghost" onClick={() => setConfirmation(false)} disabled={envoi}>
                      {t("rj.annuler")}
                    </button>
                    <button className="btn btn-primary" onClick={envoyer} disabled={envoi}>
                      <IconSend size={15} />
                      {envoi ? t("rj.envoiEnCours") : t("rj.confirmerEnvoi")}
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary" onClick={() => setConfirmation(true)}>
                    <IconSend size={15} />
                    {t("rj.envoyer")}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
