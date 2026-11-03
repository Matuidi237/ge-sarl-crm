import type { BrancheAssurance, TypeAffaire } from "@prisma/client";

/**
 * Règles de commission d'un agent général.
 *
 * Elles ne doivent exister qu'ici : le tableau de bord du commercial, celui de
 * la direction et le relevé de commissions lisent tous ce fichier, sans quoi
 * deux écrans finiraient par afficher deux montants pour la même quittance.
 */

/** Les Decimal de Prisma arrivent en objet ; on les ramène à un nombre. */
export const nb = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

type Bareme = { compagnieId: string; branche: BrancheAssurance; typeAffaire: TypeAffaire; tauxPct: unknown };

/** Index des barèmes, interrogé une fois par police plutôt que par requête. */
export function indexBaremes(baremes: Bareme[]) {
  const index = new Map<string, number>();
  for (const b of baremes) index.set(`${b.compagnieId}|${b.branche}|${b.typeAffaire}`, nb(b.tauxPct));
  return index;
}

/**
 * Taux applicable à une police, en pourcentage.
 *
 * Le taux négocié porté par la police l'emporte sur le barème de la compagnie.
 * Null quand ni l'un ni l'autre n'existe : un taux inconnu ne vaut pas zéro,
 * et le compter pour tel ferait croire à une affaire qui ne rapporte rien.
 */
export function tauxDe(
  police: { compagnieId: string; branche: BrancheAssurance; typeAffaire: TypeAffaire; tauxCommissionPct: unknown },
  baremes: Map<string, number>
): number | null {
  if (police.tauxCommissionPct !== null && police.tauxCommissionPct !== undefined) {
    return nb(police.tauxCommissionPct);
  }
  return baremes.get(`${police.compagnieId}|${police.branche}|${police.typeAffaire}`) ?? null;
}

/** Commission d'un montant de prime, arrondie au franc : le XAF n'a pas de sous-unité. */
export function commissionDe(montant: number, tauxPct: number | null): number | null {
  return tauxPct === null ? null : Math.round((montant * tauxPct) / 100);
}

/**
 * Clé de mois d'une colonne @db.Date.
 *
 * Ces colonnes reviennent à minuit UTC : lues en heure locale, un 1er du mois
 * glisserait dans le mois précédent sur tout fuseau à l'ouest de Greenwich.
 */
export function moisDe(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
