import { describe, it, expect } from 'vitest'
import {
  isPersonUnavailable,
  isValidRange,
  isDuplicateDay,
  type DayOrRange,
} from '@/lib/domain/availability'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe le prédicat de
// planification mandaté par AD-3 (`isPersonUnavailable`, consommé en Story 4.2) et les
// validateurs d'entrée purs (AC1). Comparaisons YMD lexicographiques — JAMAIS `Date`.
// Parité avec le legacy : isDateIndispo (L640-645), validation add (L897-908).

const day = (date1: string): DayOrRange => ({ kind: 'day', date1, date2: null })
const range = (date1: string, date2: string): DayOrRange => ({ kind: 'range', date1, date2 })

describe('isPersonUnavailable (AD-3 — prédicat pur, parité legacy isDateIndispo)', () => {
  it('liste vide → false', () => {
    expect(isPersonUnavailable([], '2026-06-23')).toBe(false)
  })

  it('day : date identique → true', () => {
    expect(isPersonUnavailable([day('2026-06-23')], '2026-06-23')).toBe(true)
  })

  it('day : date différente → false', () => {
    expect(isPersonUnavailable([day('2026-06-23')], '2026-06-24')).toBe(false)
  })

  it('range : borne de début incluse → true', () => {
    expect(isPersonUnavailable([range('2026-06-23', '2026-06-27')], '2026-06-23')).toBe(true)
  })

  it('range : borne de fin incluse → true', () => {
    expect(isPersonUnavailable([range('2026-06-23', '2026-06-27')], '2026-06-27')).toBe(true)
  })

  it('range : date au milieu → true', () => {
    expect(isPersonUnavailable([range('2026-06-23', '2026-06-27')], '2026-06-25')).toBe(true)
  })

  it('range : date avant le début → false', () => {
    expect(isPersonUnavailable([range('2026-06-23', '2026-06-27')], '2026-06-22')).toBe(false)
  })

  it('range : date après la fin → false', () => {
    expect(isPersonUnavailable([range('2026-06-23', '2026-06-27')], '2026-06-28')).toBe(false)
  })

  it('plusieurs entrées : match sur l’une suffit', () => {
    const list = [day('2026-06-23'), range('2026-07-01', '2026-07-05')]
    expect(isPersonUnavailable(list, '2026-07-03')).toBe(true)
    expect(isPersonUnavailable(list, '2026-06-30')).toBe(false)
  })

  it('range avec date2 null (entrée incohérente) → ne matche pas (comparaison lexicographique sûre)', () => {
    // date2 null ne devrait pas arriver pour un range valide, mais le prédicat reste défensif.
    expect(isPersonUnavailable([{ kind: 'range', date1: '2026-06-23', date2: null }], '2026-06-23')).toBe(
      false,
    )
  })
})

describe('isValidRange (AC1 — parité legacy add L901 : d2 < d1 refusé, d2 === d1 autorisé)', () => {
  it('date2 absent (null) → false', () => {
    expect(isValidRange('2026-06-23', null)).toBe(false)
  })

  it('date2 < date1 → false', () => {
    expect(isValidRange('2026-06-27', '2026-06-23')).toBe(false)
  })

  it('date2 === date1 → true (plage d’un jour, autorisée)', () => {
    expect(isValidRange('2026-06-23', '2026-06-23')).toBe(true)
  })

  it('date2 > date1 → true', () => {
    expect(isValidRange('2026-06-23', '2026-06-27')).toBe(true)
  })
})

describe('isDuplicateDay (AC1 — parité legacy L904 : jour dédupliqué, plage NON)', () => {
  it('jour déjà présent → true', () => {
    const existing = [day('2026-06-23')]
    expect(isDuplicateDay(existing, { kind: 'day', date1: '2026-06-23' })).toBe(true)
  })

  it('jour absent → false', () => {
    const existing = [day('2026-06-23')]
    expect(isDuplicateDay(existing, { kind: 'day', date1: '2026-06-24' })).toBe(false)
  })

  it('plage de même date1 → false (les plages ne sont PAS dédupliquées)', () => {
    const existing = [range('2026-06-23', '2026-06-27')]
    expect(isDuplicateDay(existing, { kind: 'day', date1: '2026-06-23' })).toBe(false)
  })

  it('liste vide → false', () => {
    expect(isDuplicateDay([], { kind: 'day', date1: '2026-06-23' })).toBe(false)
  })
})
