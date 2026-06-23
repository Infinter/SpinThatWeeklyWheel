// Domaine PUR de la disponibilité (Story 2.3, AC1). FEUILLE (AD-1) : aucun import
// React/DOM/Supabase/`Date`/`lib/data`. Le domaine définit son PROPRE type structurel
// minimal — il ne dépend de rien (AD-1/AD-11).
//
// Toutes les comparaisons de dates sont LEXICOGRAPHIQUES sur des chaînes `YYYY-MM-DD`
// (= chronologiques pour ce format) — JAMAIS via `Date` (convention dates, AD-Consistency).
//
// `isPersonUnavailable` est LE prédicat de planification mandaté par AD-3, consommé par
// la génération en Story 4.2. Les validateurs (`isValidRange`/`isDuplicateDay`) sont la
// validation d'entrée primaire (AC1), co-localisée dans ce module pur testé en CI (AD-13).

// Une indisponibilité : un jour isolé, ou une plage `date1..date2` (bornes incluses).
export type DayOrRange = {
  kind: 'day' | 'range'
  date1: string // YMD
  date2: string | null // YMD pour une plage ; null pour un jour
}

// Vrai ssi `date` (YMD) tombe dans l'une des indisponibilités.
// Parité legacy isDateIndispo (historique L640-645) :
//   day   → entry.date1 === date
//   range → entry.date1 <= date <= entry.date2 (bornes incluses)
export function isPersonUnavailable(unavailabilities: DayOrRange[], date: string): boolean {
  return unavailabilities.some((entry) => {
    if (entry.kind === 'day') return entry.date1 === date
    if (entry.kind === 'range') {
      if (entry.date2 === null) return false // range incohérent : défensif, ne matche pas.
      return entry.date1 <= date && date <= entry.date2
    }
    return false
  })
}

// Valide une plage avant écriture (parité legacy L901) :
//   false si date2 absent OU date2 < date1 ; true sinon.
//   date2 === date1 est VALIDE (plage d'un jour — le legacy refuse d2 < d1, pas d2 === d1).
export function isValidRange(date1: string, date2: string | null): boolean {
  if (date2 === null) return false
  return date2 >= date1
}

// Vrai si `existing` contient déjà un JOUR de même date1 (parité legacy L904).
// Les plages ne sont PAS dédupliquées : seules les entrées `kind === 'day'` comptent.
export function isDuplicateDay(
  existing: DayOrRange[],
  candidate: { kind: 'day'; date1: string },
): boolean {
  return existing.some((entry) => entry.kind === 'day' && entry.date1 === candidate.date1)
}
