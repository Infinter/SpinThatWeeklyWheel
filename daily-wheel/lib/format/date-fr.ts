// Formatage de dates FR — parsing LOCAL (jamais UTC). Porté du legacy (parseYMD/formatDateFr).
// CRITIQUE (convention dates) : `new Date('YYYY-MM-DD')` interprète en UTC → décalage d'un jour
// selon le fuseau. On parse explicitement en local via `new Date(y, m-1, d)`.

// Parse une chaîne `YYYY-MM-DD` en Date LOCALE (minuit local).
export function parseYMD(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Formate une chaîne `YYYY-MM-DD` en date longue française (ex. « mardi 23 juin 2026 »).
export function formatDateFr(ymd: string): string {
  return parseYMD(ymd).toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// Formatteurs COURTS pour la timeline (Story 5.3, AC-2). Mêmes conventions : parsing LOCAL via
// `parseYMD` (jamais UTC). Le point final que `toLocaleDateString` ajoute aux abréviations FR
// (« lun. », « juin », « janv. ») est retiré pour des cellules compactes (« lun », « juin »).

// Jour de semaine abrégé FR (« lun », « mar », …).
export function weekdayShortFr(ymd: string): string {
  return parseYMD(ymd).toLocaleDateString('fr-FR', { weekday: 'short' }).replace(/\.$/, '')
}

// Numéro du jour dans le mois (« 1 », « 23 »).
export function dayOfMonth(ymd: string): string {
  return String(parseYMD(ymd).getDate())
}

// Index du jour de semaine en base LUNDI (0 = lundi … 6 = dimanche). Story 5.10 (affichage) : aligne la
// timeline sur une grille calendaire 7 colonnes lun→dim — la première cellule est décalée à sa colonne via
// `grid-column-start = mondayIndex + 1`. `getDay()` est dimanche-first (0 = dim) → on tourne de +6 mod 7.
export function mondayIndex(ymd: string): number {
  return (parseYMD(ymd).getDay() + 6) % 7
}

// Mois abrégé FR (« juin », « janv », …).
export function monthShortFr(ymd: string): string {
  return parseYMD(ymd).toLocaleDateString('fr-FR', { month: 'short' }).replace(/\.$/, '')
}

// Date longue FR SANS jour de semaine (ex. « 23 juin 2026 »). Story 5.7 : en-tête du message Slack
// (« semaine du {date de début} »). Mêmes conventions : parsing LOCAL via `parseYMD`, jamais UTC.
export function dateLongNoWeekdayFr(ymd: string): string {
  return parseYMD(ymd).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Date du jour en `YYYY-MM-DD` LOCAL (défaut d'affichage de la date de début — Story 4.1, FR10).
// CRITIQUE : formatage local via getFullYear/getMonth/getDate, JAMAIS toISOString() (UTC → décalage).
export function todayYMD(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
