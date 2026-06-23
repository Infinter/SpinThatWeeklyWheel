import { describe, it, expect } from 'vitest'
import { computeStepStates, STEP_ORDER, STEP_LABELS } from '@/lib/ui/stepper'

// Story 5.1 — helper PUR d'état des étapes (AC-2, AC-5, AC-10). Aucun DOM/React : testable en env node.
// Règles : ① Équipe complétée ssi ≥1 actif ; ② Contraintes TOUJOURS complétée (optionnelle) ;
// ③ Spin complétée ssi rotation lancée. `active` = surface en vue. Glyphe = ✓ si complétée, sinon le numéro.

const NONE = { hasActiveParticipant: false, hasLaunchedSchedule: false, activeSurface: null } as const

describe('computeStepStates (Story 5.1)', () => {
  it('ordre et libellés figés (1 Équipe · 2 Contraintes · 3 Spin)', () => {
    expect(STEP_ORDER).toEqual(['equipe', 'contraintes', 'spin'])
    expect(STEP_LABELS).toEqual({ equipe: 'Équipe', contraintes: 'Contraintes', spin: 'Spin' })
  })

  it('état initial : ① à faire, ② complétée (toujours), ③ à faire ; aucune active', () => {
    const s = computeStepStates(NONE)
    expect(s.equipe.completed).toBe(false)
    expect(s.contraintes.completed).toBe(true) // AC-5 : toujours satisfaite
    expect(s.spin.completed).toBe(false)
    expect(s.equipe.active).toBe(false)
    expect(s.contraintes.active).toBe(false)
    expect(s.spin.active).toBe(false)
  })

  it('AC-5 : ① passe à complétée dès ≥1 participant actif', () => {
    const s = computeStepStates({ ...NONE, hasActiveParticipant: true })
    expect(s.equipe.completed).toBe(true)
    expect(s.equipe.glyph).toBe('✓')
  })

  it('AC-5 : ③ passe à complétée dès qu’une rotation est lancée', () => {
    const s = computeStepStates({ ...NONE, hasLaunchedSchedule: true })
    expect(s.spin.completed).toBe(true)
    expect(s.spin.glyph).toBe('✓')
  })

  it('AC-2 : glyphe = numéro tant que non complétée', () => {
    const s = computeStepStates(NONE)
    expect(s.equipe.glyph).toBe('1')
    expect(s.spin.glyph).toBe('3')
    // ② est toujours complétée → ✓ même au départ
    expect(s.contraintes.glyph).toBe('✓')
  })

  it('AC-2 : `active` reflète la surface en vue, indépendamment de la complétion', () => {
    const s = computeStepStates({ ...NONE, activeSurface: 'spin' })
    expect(s.spin.active).toBe(true)
    expect(s.equipe.active).toBe(false)
    expect(s.contraintes.active).toBe(false)
  })

  it('AC-2 : une étape peut être à la fois complétée ET active (glyphe ✓ conservé)', () => {
    const s = computeStepStates({
      hasActiveParticipant: true,
      hasLaunchedSchedule: true,
      activeSurface: 'equipe',
    })
    expect(s.equipe.completed).toBe(true)
    expect(s.equipe.active).toBe(true)
    expect(s.equipe.glyph).toBe('✓')
  })

  it('index numérique stable par étape', () => {
    const s = computeStepStates(NONE)
    expect(s.equipe.index).toBe(1)
    expect(s.contraintes.index).toBe(2)
    expect(s.spin.index).toBe(3)
  })
})
