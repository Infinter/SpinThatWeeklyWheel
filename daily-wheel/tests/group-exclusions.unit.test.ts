import { describe, it, expect } from 'vitest'
import {
  isTeamNonSessionDay,
  isGroupExcluded,
  weekdayOf,
  isValidEveryN,
  refDateMatchesDayOfWeek,
  type GroupExclusionRule,
} from '@/lib/domain/team-availability'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe le prédicat d'équipe
// mandaté par AD-3 (`isTeamNonSessionDay`, source unique du « jour neutralisé », consommé en 4.2),
// le sous-prédicat de récurrence `isGroupExcluded` (parité legacy isDateGroupExcluded L651-660)
// et les validateurs d'entrée purs (AC1). Calculs de calendrier via entiers (days-from-civil),
// JAMAIS de dérive timezone/DST.

const rule = (over: Partial<GroupExclusionRule> = {}): GroupExclusionRule => ({
  day_of_week: 2, // mardi
  every_n: 1,
  ref_date: '2026-06-23', // un mardi (ancré ci-dessous)
  ...over,
})

describe('weekdayOf (0=dimanche … 6=samedi, parité Date.getDay())', () => {
  it('1970-01-01 → 4 (jeudi)', () => {
    expect(weekdayOf('1970-01-01')).toBe(4)
  })
  it('2024-01-01 → 1 (lundi)', () => {
    expect(weekdayOf('2024-01-01')).toBe(1)
  })
  it('2000-01-01 → 6 (samedi)', () => {
    expect(weekdayOf('2000-01-01')).toBe(6)
  })
  it('2026-06-23 → 2 (mardi)', () => {
    expect(weekdayOf('2026-06-23')).toBe(2)
  })
  it('date antérieure à l’epoch : 1969-12-31 → 3 (mercredi)', () => {
    expect(weekdayOf('1969-12-31')).toBe(3)
  })
})

describe('isGroupExcluded (AD-3 — récurrence, parité legacy isDateGroupExcluded L651-660)', () => {
  it('liste vide → false', () => {
    expect(isGroupExcluded([], '2026-06-23')).toBe(false)
  })

  it('mauvais jour de semaine → false', () => {
    // 2026-06-24 est un mercredi ; la règle vise le mardi.
    expect(isGroupExcluded([rule({ every_n: 1 })], '2026-06-24')).toBe(false)
  })

  it('date === ref (diffDays 0) sur le bon jour → true', () => {
    expect(isGroupExcluded([rule({ every_n: 1 })], '2026-06-23')).toBe(true)
  })

  it('every_n=1 → chaque occurrence du jour est exclue', () => {
    const r = [rule({ every_n: 1 })]
    expect(isGroupExcluded(r, '2026-06-30')).toBe(true) // +1 semaine
    expect(isGroupExcluded(r, '2026-07-07')).toBe(true) // +2 semaines
  })

  it('every_n=2 → semaines 0 et 2 true, semaine 1 false', () => {
    const r = [rule({ every_n: 2 })]
    expect(isGroupExcluded(r, '2026-06-23')).toBe(true) // semaine 0
    expect(isGroupExcluded(r, '2026-06-30')).toBe(false) // semaine 1
    expect(isGroupExcluded(r, '2026-07-07')).toBe(true) // semaine 2
  })

  it('date AVANT la date de référence → false (parité legacy L658)', () => {
    // 2026-06-16 est le mardi précédent la réf. → jamais exclu.
    expect(isGroupExcluded([rule({ every_n: 1 })], '2026-06-16')).toBe(false)
  })

  it('plusieurs règles : un match suffit', () => {
    const r = [rule({ day_of_week: 1, ref_date: '2026-06-22' }), rule({ every_n: 2 })]
    expect(isGroupExcluded(r, '2026-07-07')).toBe(true) // matche la 2ᵉ règle (mardi, semaine 2)
  })
})

describe('isTeamNonSessionDay (AD-3 — source unique des 4 branches d’équipe ; ici : exclusions de groupe)', () => {
  it('jour couvert par une exclusion de groupe → true', () => {
    expect(isTeamNonSessionDay('2026-06-23', { groupExclusions: [rule({ every_n: 1 })] })).toBe(true)
  })

  it('jour non couvert → false', () => {
    expect(isTeamNonSessionDay('2026-06-24', { groupExclusions: [rule({ every_n: 1 })] })).toBe(false)
  })

  it('ctx sans groupExclusions → false', () => {
    expect(isTeamNonSessionDay('2026-06-23', {})).toBe(false)
  })
  // La branche week-ends (skipWeekends) est câblée depuis 4.1 → sa couverture vit dans
  // tests/weekends.unit.test.ts (les branches holidays/teamOffDays dans leurs tests dédiés).
})

describe('isValidEveryN (AC1 — parité legacy L736 : isNaN || < 1 refusé)', () => {
  it('1 → true', () => expect(isValidEveryN(1)).toBe(true))
  it('52 → true', () => expect(isValidEveryN(52)).toBe(true))
  it('0 → false', () => expect(isValidEveryN(0)).toBe(false))
  it('-1 → false', () => expect(isValidEveryN(-1)).toBe(false))
  it('1.5 (non entier) → false', () => expect(isValidEveryN(1.5)).toBe(false))
  it('NaN → false', () => expect(isValidEveryN(NaN)).toBe(false))
})

describe('refDateMatchesDayOfWeek (AC1 — parité legacy L738 : la réf. doit tomber sur le jour choisi)', () => {
  it('réf. tombe sur le jour → true', () => {
    expect(refDateMatchesDayOfWeek('2026-06-23', 2)).toBe(true) // mardi
  })
  it('réf. ne tombe PAS sur le jour → false', () => {
    expect(refDateMatchesDayOfWeek('2026-06-23', 1)).toBe(false) // 2026-06-23 est mardi, pas lundi
  })
})
