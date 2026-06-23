import { describe, it, expect } from 'vitest'
import { isHoliday, isTeamNonSessionDay } from '@/lib/domain/team-availability'

// Story 3.2, AC1 — sous-prédicat pur `isHoliday` + branche `holidays` câblée dans `isTeamNonSessionDay`.
// `holidays` = simple ensemble de dates YMD → comparaison de chaînes (aucun recours à Date). Règle métier =
// unicité (validée client + contrainte DB) ; pas de récurrence (≠ exclusions de groupe).

describe('isHoliday (AC1 — appartenance à un ensemble de dates YMD)', () => {
  it('liste vide → false', () => {
    expect(isHoliday([], '2026-01-01')).toBe(false)
  })

  it('date présente → true', () => {
    expect(isHoliday([{ date: '2026-01-01' }, { date: '2026-05-01' }], '2026-05-01')).toBe(true)
  })

  it('date absente → false', () => {
    expect(isHoliday([{ date: '2026-01-01' }], '2026-01-02')).toBe(false)
  })

  it('ne matche pas une date proche mais différente (égalité stricte de chaînes)', () => {
    expect(isHoliday([{ date: '2026-01-01' }], '2026-11-01')).toBe(false)
  })
})

describe('isTeamNonSessionDay (AD-3 — branche holidays câblée en 3.2)', () => {
  it('jour férié fourni → true (désormais neutralisé)', () => {
    expect(isTeamNonSessionDay('2026-01-01', { holidays: [{ date: '2026-01-01' }] })).toBe(true)
  })

  it('jour non férié, ctx avec holidays → false', () => {
    expect(isTeamNonSessionDay('2026-01-02', { holidays: [{ date: '2026-01-01' }] })).toBe(false)
  })

  it('combiné : férié OU exclusion de groupe → true', () => {
    // 2026-01-01 férié ; les exclusions ne couvrent pas ce jour → neutralisé par la branche holidays.
    expect(
      isTeamNonSessionDay('2026-01-01', {
        holidays: [{ date: '2026-01-01' }],
        groupExclusions: [{ day_of_week: 2, every_n: 1, ref_date: '2026-06-23' }],
      }),
    ).toBe(true)
  })

  it('ctx sans holidays → délègue aux exclusions seules (pas de neutralisation férié)', () => {
    expect(isTeamNonSessionDay('2026-01-01', { groupExclusions: [] })).toBe(false)
  })
})
