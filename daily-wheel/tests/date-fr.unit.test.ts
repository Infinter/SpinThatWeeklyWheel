import { describe, it, expect } from 'vitest'
import { weekdayShortFr, dayOfMonth, monthShortFr, mondayIndex } from '@/lib/format/date-fr'

// Story 5.3 — formatteurs COURTS pour la timeline (AC-2). Parsing LOCAL (jamais UTC) ; point final
// des abréviations FR retiré. Ancrage : 2026-06-22 = lundi.
describe('formatteurs courts FR (Story 5.3)', () => {
  it('weekdayShortFr : jour abrégé sans point final', () => {
    expect(weekdayShortFr('2026-06-22')).toBe('lun')
    expect(weekdayShortFr('2026-06-27')).toBe('sam')
  })

  it('dayOfMonth : numéro du jour, parsé en local', () => {
    expect(dayOfMonth('2026-06-22')).toBe('22')
    expect(dayOfMonth('2026-06-01')).toBe('1')
  })

  it('monthShortFr : mois abrégé sans point final', () => {
    expect(monthShortFr('2026-06-22')).toBe('juin')
    expect(monthShortFr('2026-01-15')).toBe('janv')
  })
})

// Story 5.10 (affichage) — index jour de semaine base LUNDI (0 = lun … 6 = dim). Ancrage : 2026-06-22 = lundi.
describe('mondayIndex (Story 5.10 — alignement grille calendaire)', () => {
  it('lundi = 0 … dimanche = 6', () => {
    expect(mondayIndex('2026-06-22')).toBe(0) // lundi
    expect(mondayIndex('2026-06-23')).toBe(1) // mardi
    expect(mondayIndex('2026-06-24')).toBe(2) // mercredi
    expect(mondayIndex('2026-06-26')).toBe(4) // vendredi
    expect(mondayIndex('2026-06-27')).toBe(5) // samedi
    expect(mondayIndex('2026-06-28')).toBe(6) // dimanche
  })
})
