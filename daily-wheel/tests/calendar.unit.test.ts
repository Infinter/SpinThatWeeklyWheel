import { describe, it, expect } from 'vitest'
import {
  dayNumber,
  ymdFromDayNumber,
  addDays,
  addYears,
} from '@/lib/domain/team-availability'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe les primitives calendaires
// du domaine (Story 4.2, AC1). `ymdFromDayNumber` est l'INVERSE exact de `dayNumber` (civil-from-days
// de Howard Hinnant) ; `addDays`/`addYears` permettent d'itérer le planning en YMD PUR — JAMAIS via
// `Date` (convention dates : pas de dérive timezone/DST). Ces fonctions sont la SEULE base
// d'itération jour-par-jour autorisée dans `generateSchedule` (AD-1).

describe('dayNumber (n° de jour absolu, epoch 1970-01-01 = 0)', () => {
  it('1970-01-01 → 0 (epoch)', () => {
    expect(dayNumber('1970-01-01')).toBe(0)
  })
  it('1970-01-02 → 1', () => {
    expect(dayNumber('1970-01-02')).toBe(1)
  })
  it('1969-12-31 → -1 (veille de l’epoch)', () => {
    expect(dayNumber('1969-12-31')).toBe(-1)
  })
})

describe('ymdFromDayNumber (inverse exact de dayNumber)', () => {
  it('0 → 1970-01-01', () => {
    expect(ymdFromDayNumber(0)).toBe('1970-01-01')
  })
  it('-1 → 1969-12-31', () => {
    expect(ymdFromDayNumber(-1)).toBe('1969-12-31')
  })

  // Round-trip : ymdFromDayNumber(dayNumber(x)) === x sur des dates variées (epoch, avant epoch,
  // bissextile, début/fin d'année, date d'ancrage du projet).
  const roundTrip = [
    '1970-01-01',
    '1969-12-31',
    '2000-01-01',
    '2024-02-29', // bissextile
    '2026-06-23',
    '2026-12-31',
    '2027-01-01',
    '2025-12-31',
  ]
  for (const ymd of roundTrip) {
    it(`round-trip ${ymd}`, () => {
      expect(ymdFromDayNumber(dayNumber(ymd))).toBe(ymd)
    })
  }
})

describe('addDays (itération YMD pure, sans Date)', () => {
  it('+1 jour ordinaire', () => {
    expect(addDays('2026-06-23', 1)).toBe('2026-06-24')
  })
  it('+1 passage de mois', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
  })
  it('+1 passage d’année', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('-1 recul sur l’année précédente', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('+1 vers le 29 février bissextile', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })
  it('+1 depuis le 29 février bissextile', () => {
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01')
  })
  it('+0 jour = identité', () => {
    expect(addDays('2026-06-23', 0)).toBe('2026-06-23')
  })
  it('+7 jours (semaine)', () => {
    expect(addDays('2026-06-23', 7)).toBe('2026-06-30')
  })
})

describe('addYears (borne d’horizon +1 an, parité legacy setFullYear)', () => {
  it('+1 an ordinaire', () => {
    expect(addYears('2026-06-23', 1)).toBe('2027-06-23')
  })
  it('+1 an préserve mois/jour', () => {
    expect(addYears('2026-01-01', 1)).toBe('2027-01-01')
  })
})
