// Domaine PUR des contraintes d'ÉQUIPE (Story 3.1, AC1). FEUILLE (AD-1) : aucun import
// React/DOM/Supabase/`lib/data`/`lib/format`. Le seul import est un TYPE structurel
// (`DayOrRange`) du domaine voisin — type-only, donc aucune dépendance runtime.
//
// `isTeamNonSessionDay` est l'UNIQUE source de vérité du « jour neutralisé » mandatée par AD-3 :
// le même prédicat sera branché dans la boucle de génération ET le calcul de deadline EDF en
// Story 4.2. Il agrège (en `||`) les 4 contraintes d'équipe. Branches câblées : « exclusions de groupe »
// (3.1), « jours fériés » (3.2), « jours off » (3.3), « week-ends » (4.1). Le prédicat est désormais
// COMPLET ; la signature reste figée (consommée en 4.2).
//
// Calendrier : conversion `YYYY-MM-DD` → n° de jour absolu via l'algorithme entier
// « days-from-civil » (Howard Hinnant). Sans `Date`, sans timezone, sans dérive DST — donc
// strictement plus correct que le legacy `Math.round((t1-t2)/86400000)` (convention dates).

import { isPersonUnavailable, type DayOrRange } from '@/lib/domain/availability'

// Une règle d'exclusion de groupe (forme structurelle du domaine — n'importe PAS le type data).
//   day_of_week : 0=dimanche … 6=samedi (= Date.getDay()).
//   every_n     : périodicité en semaines (≥ 1).
//   ref_date    : date de référence YMD (doit tomber sur day_of_week — validé à la saisie).
export type GroupExclusionRule = {
  day_of_week: number
  every_n: number
  ref_date: string // YMD
}

// Contraintes d'équipe agrégées par `isTeamNonSessionDay` (AD-3). Forme COMPLÈTE déclarée dès 3.1.
// Les 4 champs sont désormais évalués : `groupExclusions` (3.1), `holidays` (3.2), `teamOffDays` (3.3)
// et `skipWeekends` (4.1, conditionnel — neutralise les week-ends seulement si vrai).
export type TeamConstraints = {
  skipWeekends?: boolean
  groupExclusions?: GroupExclusionRule[]
  holidays?: { date: string }[]
  teamOffDays?: DayOrRange[]
}

// N° de jour absolu (epoch 1970-01-01 = 0) — days-from-civil de Howard Hinnant. Pur, entier.
// EXPORTÉ (Story 4.2) : primitive calendaire partagée, base de `addDays`/`ymdFromDayNumber`.
export function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

// INVERSE exact de `dayNumber` (civil-from-days de Howard Hinnant) — n° de jour absolu → `YYYY-MM-DD`.
// Pur, entier, sans `Date`. Story 4.2 (AC1) : pendant de `dayNumber`, prouvé par round-trip.
export function ymdFromDayNumber(n: number): string {
  const z = n + 719468
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097)
  const doe = z - era * 146097 // [0, 146096]
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365) // [0, 399]
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)) // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153) // [0, 11]
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1 // [1, 31]
  const m = mp < 10 ? mp + 3 : mp - 9 // [1, 12]
  const year = m <= 2 ? y + 1 : y
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Avance (ou recule, si `n < 0`) une date YMD de `n` jours, en arithmétique entière pure.
// SEUL moyen autorisé d'itérer jour-par-jour dans la génération (≠ legacy `Date.setDate`) — AD-1.
export function addDays(ymd: string, n: number): string {
  return ymdFromDayNumber(dayNumber(ymd) + n)
}

// Avance une date YMD de `years` années en préservant mois/jour (parité legacy `setFullYear(+years)`).
// Sert UNIQUEMENT à calculer la borne d'horizon (+1 an) de la génération. NUANCE : un 29 février
// (bissextile) + 1 an produit une chaîne `AAAA-02-29` inexistante en année non bissextile ; comme
// l'horizon est une simple BORNE D'ARRÊT comparée lexicographiquement (`cur <= lim`) et jamais
// atteinte pour une équipe typique (NFR6 : ≤ 50 personnes, ≤ 1 an), c'est sans impact.
export function addYears(ymd: string, years: number): string {
  const [y, m, d] = ymd.split('-')
  return `${String(Number(y) + years).padStart(4, '0')}-${m}-${d}`
}

// Jour de semaine 0=dimanche … 6=samedi (parité Date.getDay()).
// 1970-01-01 est un jeudi (getDay()===4) → weekday = (dayNumber + 4) mod 7, normalisé positif.
export function weekdayOf(ymd: string): number {
  const dn = dayNumber(ymd)
  return (((dn % 7) + 4) % 7 + 7) % 7
}

// Vrai ssi `date` (YMD) est couvert par AU MOINS une exclusion de groupe.
// Parité legacy isDateGroupExcluded (historique L651-660) :
//   - liste vide → false
//   - même jour de semaine que la règle, ET
//   - diffDays >= 0 (une date AVANT la réf. n'est jamais exclue — L658), ET
//   - floor(diffDays / 7) % every_n === 0
// Comme date et ref partagent le même jour de semaine quand la règle peut matcher, diffDays est
// alors un multiple de 7 → floor(diffDays/7) est exact.
export function isGroupExcluded(rules: GroupExclusionRule[], date: string): boolean {
  if (rules.length === 0) return false
  const dow = weekdayOf(date)
  const dn = dayNumber(date)
  return rules.some((r) => {
    if (dow !== r.day_of_week) return false
    const diffDays = dn - dayNumber(r.ref_date)
    if (diffDays < 0) return false
    return Math.floor(diffDays / 7) % r.every_n === 0
  })
}

// Vrai ssi `date` (YMD) figure dans l'ensemble des jours fériés de l'équipe (Story 3.2).
// Comparaison de CHAÎNES YMD (dates déjà normalisées local) → aucun recours à `Date`. Liste vide → false.
// La règle métier (unicité de la date) est portée par la saisie + la contrainte DB `holidays.date unique`.
export function isHoliday(holidays: { date: string }[], date: string): boolean {
  return holidays.some((h) => h.date === date)
}

// Vrai ssi `date` (YMD) tombe dans l'un des jours off d'équipe (Story 3.3, jour OU plage).
// ALIAS sémantique de `isPersonUnavailable` (domaine voisin) : un jour off d'équipe neutralise
// EXACTEMENT comme une indispo individuelle (jour → date1 === date ; plage → date1 <= date <= date2,
// bornes incluses). La logique de bornes n'est PAS réimplémentée (anti-réinvention). Liste vide → false.
export function isTeamOffDay(offDays: DayOrRange[], date: string): boolean {
  return isPersonUnavailable(offDays, date)
}

// Vrai ssi `date` (YMD) tombe un week-end (samedi=6 / dimanche=0, via `weekdayOf`). PUR, sans `Date`.
// C'est la base de la branche CONDITIONNELLE de `isTeamNonSessionDay` (Story 4.1) : un week-end ne
// neutralise que si l'option « ignorer les week-ends » est active.
export function isWeekend(date: string): boolean {
  const dow = weekdayOf(date)
  return dow === 0 || dow === 6
}

// UNIQUE prédicat « jour neutralisé » de l'équipe (AD-3). Story 3.1 : branche « exclusions de groupe ».
// Story 3.2 : branche « jours fériés » AJOUTÉE en `||`. Story 3.3 : branche « jours off » AJOUTÉE en `||`.
// Story 4.1 : branche « week-ends » AJOUTÉE en `||`, CONDITIONNELLE (`ctx.skipWeekends === true`) — ≠ les
// 3 autres, toujours actives. Le prédicat est désormais COMPLET ; signature inchangée (consommée en 4.2).
export function isTeamNonSessionDay(date: string, ctx: TeamConstraints): boolean {
  return (
    (ctx.skipWeekends === true && isWeekend(date)) ||
    isGroupExcluded(ctx.groupExclusions ?? [], date) ||
    isHoliday(ctx.holidays ?? [], date) ||
    isTeamOffDay(ctx.teamOffDays ?? [], date)
  )
}

// Validateurs d'entrée purs (validation primaire AC1, co-localisés dans ce module pur testé en CI).

// Parité legacy L736 : la fréquence doit être un entier ≥ 1 (isNaN || < 1 refusé).
export function isValidEveryN(n: number): boolean {
  return Number.isInteger(n) && n >= 1
}

// Parité legacy L738 : la date de référence doit tomber sur le jour de semaine choisi.
export function refDateMatchesDayOfWeek(refDate: string, dayOfWeek: number): boolean {
  return weekdayOf(refDate) === dayOfWeek
}
