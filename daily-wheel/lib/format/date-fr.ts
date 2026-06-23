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
