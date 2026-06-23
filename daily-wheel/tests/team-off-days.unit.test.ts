import { describe, it, expect } from 'vitest'
import { isTeamOffDay, isTeamNonSessionDay } from '@/lib/domain/team-availability'

// Story 3.3, AC1 — sous-prédicat pur `isTeamOffDay` + dernière branche `teamOffDays` câblée dans
// `isTeamNonSessionDay`. `isTeamOffDay` RÉUTILISE `isPersonUnavailable` (membership jour/plage déjà
// prouvée par availability.unit.test.ts, 2.3) : on vérifie surtout le câblage en `||`. Comparaison de
// chaînes YMD — aucun recours à Date. Aucune règle d'unicité/récurrence (≠ holidays/group-exclusions).

describe('isTeamOffDay (AC1 — membership jour/plage, alias de isPersonUnavailable)', () => {
  it('liste vide → false', () => {
    expect(isTeamOffDay([], '2026-06-23')).toBe(false)
  })

  it('jour présent → true', () => {
    expect(isTeamOffDay([{ kind: 'day', date1: '2026-06-23', date2: null }], '2026-06-23')).toBe(true)
  })

  it('jour absent → false', () => {
    expect(isTeamOffDay([{ kind: 'day', date1: '2026-06-23', date2: null }], '2026-06-24')).toBe(false)
  })

  it('plage : borne de début incluse → true', () => {
    expect(isTeamOffDay([{ kind: 'range', date1: '2026-07-01', date2: '2026-07-05' }], '2026-07-01')).toBe(true)
  })

  it('plage : borne de fin incluse → true', () => {
    expect(isTeamOffDay([{ kind: 'range', date1: '2026-07-01', date2: '2026-07-05' }], '2026-07-05')).toBe(true)
  })

  it('plage : intérieur → true', () => {
    expect(isTeamOffDay([{ kind: 'range', date1: '2026-07-01', date2: '2026-07-05' }], '2026-07-03')).toBe(true)
  })

  it('plage : hors plage → false', () => {
    expect(isTeamOffDay([{ kind: 'range', date1: '2026-07-01', date2: '2026-07-05' }], '2026-07-06')).toBe(false)
  })

  it('plage incohérente (date2:null) → false (défensif)', () => {
    expect(isTeamOffDay([{ kind: 'range', date1: '2026-07-01', date2: null }], '2026-07-01')).toBe(false)
  })
})

describe('isTeamNonSessionDay (AD-3 — dernière branche teamOffDays câblée en 3.3)', () => {
  it('jour off fourni → true (désormais neutralisé)', () => {
    expect(
      isTeamNonSessionDay('2026-06-23', { teamOffDays: [{ kind: 'day', date1: '2026-06-23', date2: null }] }),
    ).toBe(true)
  })

  it('jour off via plage couvrante → true', () => {
    expect(
      isTeamNonSessionDay('2026-07-03', { teamOffDays: [{ kind: 'range', date1: '2026-07-01', date2: '2026-07-05' }] }),
    ).toBe(true)
  })

  it('jour hors jours off, ctx avec teamOffDays → false', () => {
    expect(
      isTeamNonSessionDay('2026-06-24', { teamOffDays: [{ kind: 'day', date1: '2026-06-23', date2: null }] }),
    ).toBe(false)
  })

  it('combiné : jour off OU exclusion de groupe → true', () => {
    // 2026-06-24 n'est pas couvert par l'exclusion (mardi) mais l'est par le jour off.
    expect(
      isTeamNonSessionDay('2026-06-24', {
        teamOffDays: [{ kind: 'day', date1: '2026-06-24', date2: null }],
        groupExclusions: [{ day_of_week: 2, every_n: 1, ref_date: '2026-06-23' }],
      }),
    ).toBe(true)
  })

  it('combiné : jour off OU férié → true', () => {
    expect(
      isTeamNonSessionDay('2026-01-01', {
        teamOffDays: [],
        holidays: [{ date: '2026-01-01' }],
      }),
    ).toBe(true)
  })

  it('ctx sans teamOffDays → délègue aux autres branches', () => {
    expect(isTeamNonSessionDay('2026-06-23', { groupExclusions: [] })).toBe(false)
  })
})
