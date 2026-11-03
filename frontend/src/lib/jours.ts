/**
 * Jours calendaires au format « AAAA-MM-JJ ».
 *
 * Un jour de rapport n'a ni heure ni fuseau : le manipuler en Date ferait
 * resurgir les décalages d'un jour qu'on a chassés des colonnes @db.Date.
 */

export const versJour = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const versDate = (jour: string) => {
  const [a, m, j] = jour.split("-").map(Number);
  return new Date(a, m - 1, j);
};

/** Le lundi de la semaine qui contient ce jour. */
export function lundiDe(jour: string): string {
  const d = versDate(jour);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return versJour(d);
}

export function decalerJours(jour: string, n: number): string {
  const d = versDate(jour);
  d.setDate(d.getDate() + n);
  return versJour(d);
}

/** La veille ouvrée : vendredi pour un lundi, un samedi ou un dimanche. */
export function dernierJourOuvre(reference: Date): string {
  const d = new Date(reference);
  do d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6);
  return versJour(d);
}
