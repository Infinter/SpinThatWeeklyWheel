// Domaine PUR des contraintes d'ÉQUIPE (Story 3.1, AC1). FEUILLE (AD-1) : aucun import
// React/DOM/Supabase/`lib/data`/`lib/format`. Le seul import est un TYPE structurel
// (`DayOrRange`) du domaine voisin — type-only, donc aucune dépendance runtime.
//
// `isTeamNonSessionDay` est l'UNIQUE source de vérité du « jour neutralisé » mandatée par AD-3 :
// le même prédicat sera branché dans la boucle de génération ET le calcul de deadline EDF en
// Story 4.2. Il agrège (en `||`) les 4 contraintes d'équipe. En Story 3.1, SEULE la branche
// « exclusions de groupe » est câblée ; 3.2 (jours fériés), 3.3 (jours off) et 4.1 (week-ends)
// AJOUTERONT leur branche ici, SANS toucher la signature.
//
// Calendrier : conversion `YYYY-MM-DD` → n° de jour absolu via l'algorithme entier
// « days-from-civil » (Howard Hinnant). Sans `Date`, sans timezone, sans dérive DST — donc
// strictement plus correct que le legacy `Math.round((t1-t2)/86400000)` (convention dates).

import type { DayOrRange } from '@/lib/domain/availability'

// Une règle d'exclusion de groupe (forme structurelle du domaine — n'importe PAS le type data).
//   day_of_week : 0=dimanche … 6=samedi (= Date.getDay()).
//   every_n     : périodicité en semaines (≥ 1).
//   ref_date    : date de référence YMD (doit tomber sur day_of_week — validé à la saisie).
export type GroupExclusionRule = {
  day_of_week: number
  every_n: number
  ref_date: string // YMD
}

// Contraintes d'équipe agrégées par `isTeamNonSessionDay` (AD-3). Forme COMPLÈTE déclarée dès 3.1 ;
// seule `groupExclusions` est évaluée pour l'instant. `holidays` (3.2), `teamOffDays` (3.3) et
// `skipWeekends` (4.1) sont déclarés mais sans effet ici.
export type TeamConstraints = {
  skipWeekends?: boolean
  groupExclusions?: GroupExclusionRule[]
  holidays?: { date: string }[]
  teamOffDays?: DayOrRange[]
}

// N° de jour absolu (epoch 1970-01-01 = 0) — days-from-civil de Howard Hinnant. Pur, entier.
function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
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

// UNIQUE prédicat « jour neutralisé » de l'équipe (AD-3). Story 3.1 : seule la branche
// « exclusions de groupe » est câblée. 3.2/3.3/4.1 ajouteront ici, en `||`, les branches
// jours fériés / jours off d'équipe / week-ends — sans changer la signature.
export function isTeamNonSessionDay(date: string, ctx: TeamConstraints): boolean {
  return isGroupExcluded(ctx.groupExclusions ?? [], date)
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
