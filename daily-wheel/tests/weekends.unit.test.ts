import { describe, it, expect } from 'vitest'
import { isWeekend, isTeamNonSessionDay } from '@/lib/domain/team-availability'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe la DERNIÈRE branche d'équipe
// (Story 4.1, AC1) — « ignorer les week-ends » (FR9) — branchée dans le prédicat unique
// `isTeamNonSessionDay` (AD-3). Après 4.1, les 4 branches (exclusions/fériés/off/week-ends) sont
// câblées. La branche week-end est CONDITIONNELLE (`ctx.skipWeekends === true`), ≠ les 3 autres
// (toujours actives). Calcul calendaire via `weekdayOf` (days-from-civil, entier) — aucune `Date`.
//
// Ancre : 2026-06-23 est un MARDI (cf. weekdayOf déjà testé) → 2026-06-27 = samedi, 28 = dimanche.

describe('isWeekend (samedi/dimanche, parité weekdayOf)', () => {
  it('samedi 2026-06-27 → true', () => {
    expect(isWeekend('2026-06-27')).toBe(true)
  })
  it('dimanche 2026-06-28 → true', () => {
    expect(isWeekend('2026-06-28')).toBe(true)
  })
  it('lundi 2026-06-22 → false', () => {
    expect(isWeekend('2026-06-22')).toBe(false)
  })
  it('vendredi 2026-06-26 → false', () => {
    expect(isWeekend('2026-06-26')).toBe(false)
  })
  it('mardi 2026-06-23 → false', () => {
    expect(isWeekend('2026-06-23')).toBe(false)
  })
})

describe('isTeamNonSessionDay — branche week-ends (AD-3, conditionnelle à skipWeekends)', () => {
  it('skipWeekends:true + samedi → true (neutralisé)', () => {
    expect(isTeamNonSessionDay('2026-06-27', { skipWeekends: true })).toBe(true)
  })
  it('skipWeekends:false + samedi → false (option désactivée)', () => {
    expect(isTeamNonSessionDay('2026-06-27', { skipWeekends: false })).toBe(false)
  })
  it('skipWeekends ABSENT + samedi → false (branche conditionnelle)', () => {
    expect(isTeamNonSessionDay('2026-06-27', {})).toBe(false)
  })
  it('jour ouvré (mardi) + skipWeekends:true → false (délègue aux autres branches)', () => {
    expect(isTeamNonSessionDay('2026-06-23', { skipWeekends: true })).toBe(false)
  })
  it('samedi + skipWeekends:true COMBINÉ à une exclusion de groupe → true', () => {
    expect(
      isTeamNonSessionDay('2026-06-27', {
        skipWeekends: true,
        groupExclusions: [{ day_of_week: 6, every_n: 1, ref_date: '2026-06-27' }],
      }),
    ).toBe(true)
  })
  it('jour ouvré + skipWeekends:true mais férié ce jour → true (délègue à la branche fériés)', () => {
    expect(
      isTeamNonSessionDay('2026-06-23', { skipWeekends: true, holidays: [{ date: '2026-06-23' }] }),
    ).toBe(true)
  })
})
