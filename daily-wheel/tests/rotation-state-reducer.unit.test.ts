import { describe, it, expect } from 'vitest'
import {
  rotationStateReducer,
  DEFAULT_ROTATION_STATE,
  type StoreRotationState,
} from '@/lib/store/rotation-state-reducer'
import { reconcileRotationState } from '@/lib/store/reconcile'
import type { RotationState } from '@/lib/data/rotation-state'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : invariants du réducteur SCALAIRE de
// rotation_state (Story 5.6, patron identique à settings) + reconcileRotationState (LWW une-ligne,
// AD-15/AD-16). C'est la couverture testable de la persistance ; l'intégration (reprise, multi-onglet,
// passphrase) est validée par contrôle navigateur (cf. story T8).

function r(over: Partial<StoreRotationState> = {}): StoreRotationState {
  return {
    id: 'singleton',
    seed: 1234567,
    cursor: 0,
    mode: 'rotation-complete',
    updated_at: '2026-06-24T10:00:00+00:00',
    ...over,
  }
}

describe('rotationStateReducer — transitions optimistes scalaires (AD-5)', () => {
  it('HYDRATE avec une ligne serveur → la remplace (drapeaux effacés)', () => {
    const state = r({ cursor: 0, pending: true })
    const row: RotationState = { id: 'singleton', seed: 42, cursor: 3, mode: 'jour-le-jour', updated_at: 'x' }
    const next = rotationStateReducer(state, { type: 'HYDRATE', row })
    expect(next.seed).toBe(42)
    expect(next.cursor).toBe(3)
    expect(next.mode).toBe('jour-le-jour')
    expect(next.pending).toBeFalsy()
  })

  it('HYDRATE avec null (table vide) → DEFAULT_ROTATION_STATE', () => {
    const next = rotationStateReducer(r({ cursor: 5 }), { type: 'HYDRATE', row: null })
    expect(next).toEqual(DEFAULT_ROTATION_STATE)
    expect(next.seed).toBeNull()
    expect(next.cursor).toBe(0)
    expect(next.mode).toBe('rotation-complete')
  })

  it('OPTIMISTIC : fusionne le patch curseur + pending:true', () => {
    const next = rotationStateReducer(r(), { type: 'OPTIMISTIC', patch: { cursor: 2 } })
    expect(next.cursor).toBe(2)
    expect(next.pending).toBe(true)
    expect(next.failed).toBe(false)
  })

  it('OPTIMISTIC : changement de mode remet le curseur à 0 (patch {mode, cursor:0})', () => {
    const next = rotationStateReducer(r({ cursor: 4 }), {
      type: 'OPTIMISTIC',
      patch: { mode: 'jour-le-jour', cursor: 0 },
    })
    expect(next.mode).toBe('jour-le-jour')
    expect(next.cursor).toBe(0)
    expect(next.pending).toBe(true)
  })

  it('OPTIMISTIC : nouveau tirage (patch {seed, cursor:0}) sans toucher le mode', () => {
    const next = rotationStateReducer(r({ mode: 'jour-le-jour', cursor: 3, seed: 1 }), {
      type: 'OPTIMISTIC',
      patch: { seed: 999, cursor: 0 },
    })
    expect(next.seed).toBe(999)
    expect(next.cursor).toBe(0)
    expect(next.mode).toBe('jour-le-jour')
  })

  it('CONFIRM : remplace par la ligne serveur (drapeaux effacés)', () => {
    const state = r({ pending: true })
    const row: RotationState = { id: 'singleton', seed: 7, cursor: 1, mode: 'jour-le-jour', updated_at: 'srv' }
    const next = rotationStateReducer(state, { type: 'CONFIRM', row })
    expect(next.updated_at).toBe('srv')
    expect(next.cursor).toBe(1)
    expect(next.pending).toBeFalsy()
  })

  it('MARK_FAILED : pending:false, failed:true', () => {
    const next = rotationStateReducer(r({ pending: true }), { type: 'MARK_FAILED' })
    expect(next.pending).toBe(false)
    expect(next.failed).toBe(true)
  })

  it('RESTORE : revient au snapshot fourni (drapeaux effacés)', () => {
    const state = r({ cursor: 5, pending: true, failed: true })
    const snapshot: RotationState = { id: 'singleton', seed: 1234567, cursor: 2, mode: 'rotation-complete', updated_at: 'snap' }
    const next = rotationStateReducer(state, { type: 'RESTORE', row: snapshot })
    expect(next.cursor).toBe(2)
    expect(next.pending).toBeFalsy()
    expect(next.failed).toBeFalsy()
  })

  it('action inconnue → même référence (pur)', () => {
    const state = r()
    // @ts-expect-error type d'action invalide volontaire
    const next = rotationStateReducer(state, { type: 'NOPE' })
    expect(next).toBe(state)
  })
})

describe('reconcileRotationState — LWW une-ligne (AD-15/AD-16)', () => {
  it('écho (même updated_at) → état inchangé (AD-15)', () => {
    const state = r({ updated_at: '2026-06-24T10:00:00+00:00' })
    const echo: RotationState = { id: 'singleton', seed: 1, cursor: 9, mode: 'jour-le-jour', updated_at: '2026-06-24T10:00:00+00:00' }
    expect(reconcileRotationState(state, { eventType: 'UPDATE', new: echo })).toBe(state)
  })

  it('updated_at plus récent → appliqué (un autre poste a avancé/relancé)', () => {
    const state = r({ updated_at: '2026-06-24T10:00:00+00:00' })
    const incoming: RotationState = { id: 'singleton', seed: 55, cursor: 1, mode: 'jour-le-jour', updated_at: '2026-06-24T11:00:00+00:00' }
    expect(reconcileRotationState(state, { eventType: 'UPDATE', new: incoming })).toBe(incoming)
  })

  it('updated_at plus ancien → ignoré', () => {
    const state = r({ updated_at: '2026-06-24T12:00:00+00:00' })
    const stale: RotationState = { id: 'singleton', seed: 2, cursor: 0, mode: 'rotation-complete', updated_at: '2026-06-24T09:00:00+00:00' }
    expect(reconcileRotationState(state, { eventType: 'UPDATE', new: stale })).toBe(state)
  })

  it('INSERT (1ʳᵉ création par un autre client) → appliqué', () => {
    const state = r({ updated_at: '' })
    const incoming: RotationState = { id: 'singleton', seed: 3, cursor: 0, mode: 'rotation-complete', updated_at: '2026-06-24T11:00:00+00:00' }
    expect(reconcileRotationState(state, { eventType: 'INSERT', new: incoming })).toBe(incoming)
  })

  it('DELETE → ignoré (rotation_state n’est jamais supprimé)', () => {
    const state = r()
    expect(reconcileRotationState(state, { eventType: 'DELETE', old: { id: 'singleton' } })).toBe(state)
  })

  it('id ≠ singleton → ignoré', () => {
    const state = r()
    const incoming: RotationState = { id: 'autre', seed: 1, cursor: 0, mode: 'rotation-complete', updated_at: '2026-06-24T11:00:00+00:00' }
    expect(reconcileRotationState(state, { eventType: 'UPDATE', new: incoming })).toBe(state)
  })
})
