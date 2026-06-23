import { describe, it, expect } from 'vitest'
import {
  settingsReducer,
  DEFAULT_SETTING,
  type StoreSetting,
} from '@/lib/store/settings-reducer'
import { reconcileSetting } from '@/lib/store/reconcile'
import type { Setting } from '@/lib/data/settings'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe les invariants du réducteur
// SCALAIRE des settings (Story 4.1, AC4) — patron NEUF (état = objet unique, pas une liste ;
// op upsert, pas de tempId/rotation insert-delete). + reconcileSetting (LWW une-ligne, AD-15/AD-16).

function s(over: Partial<StoreSetting> = {}): StoreSetting {
  return {
    id: 'singleton',
    skip_weekends: true,
    start_date: null,
    updated_at: '2026-06-23T10:00:00+00:00',
    ...over,
  }
}

describe('settingsReducer — transitions optimistes scalaires (AD-5)', () => {
  it('HYDRATE avec une ligne serveur → la remplace (drapeaux effacés)', () => {
    const state = s({ skip_weekends: false, pending: true })
    const row: Setting = { id: 'singleton', skip_weekends: true, start_date: '2026-07-01', updated_at: 'x' }
    const next = settingsReducer(state, { type: 'HYDRATE', row })
    expect(next.skip_weekends).toBe(true)
    expect(next.start_date).toBe('2026-07-01')
    expect(next.pending).toBeFalsy()
  })

  it('HYDRATE avec null (table vide) → DEFAULT_SETTING', () => {
    const next = settingsReducer(s({ skip_weekends: false }), { type: 'HYDRATE', row: null })
    expect(next).toEqual(DEFAULT_SETTING)
    expect(next.skip_weekends).toBe(true)
    expect(next.start_date).toBeNull()
  })

  it('OPTIMISTIC : fusionne le patch + pending:true', () => {
    const next = settingsReducer(s(), { type: 'OPTIMISTIC', patch: { skip_weekends: false } })
    expect(next.skip_weekends).toBe(false)
    expect(next.pending).toBe(true)
    expect(next.failed).toBe(false)
  })

  it('OPTIMISTIC : patch start_date sans toucher skip_weekends', () => {
    const next = settingsReducer(s({ skip_weekends: false }), {
      type: 'OPTIMISTIC',
      patch: { start_date: '2026-07-01' },
    })
    expect(next.start_date).toBe('2026-07-01')
    expect(next.skip_weekends).toBe(false)
    expect(next.pending).toBe(true)
  })

  it('CONFIRM : remplace par la ligne serveur (drapeaux effacés)', () => {
    const state = s({ pending: true })
    const row: Setting = { id: 'singleton', skip_weekends: false, start_date: null, updated_at: 'srv' }
    const next = settingsReducer(state, { type: 'CONFIRM', row })
    expect(next.updated_at).toBe('srv')
    expect(next.skip_weekends).toBe(false)
    expect(next.pending).toBeFalsy()
  })

  it('MARK_FAILED : pending:false, failed:true', () => {
    const next = settingsReducer(s({ pending: true }), { type: 'MARK_FAILED' })
    expect(next.pending).toBe(false)
    expect(next.failed).toBe(true)
  })

  it('RESTORE : revient au snapshot fourni (drapeaux effacés)', () => {
    const state = s({ skip_weekends: false, pending: true, failed: true })
    const snapshot: Setting = { id: 'singleton', skip_weekends: true, start_date: null, updated_at: 'snap' }
    const next = settingsReducer(state, { type: 'RESTORE', row: snapshot })
    expect(next.skip_weekends).toBe(true)
    expect(next.pending).toBeFalsy()
    expect(next.failed).toBeFalsy()
  })

  it('action inconnue → même référence (pur)', () => {
    const state = s()
    // @ts-expect-error type d'action invalide volontaire
    const next = settingsReducer(state, { type: 'NOPE' })
    expect(next).toBe(state)
  })
})

describe('reconcileSetting — LWW une-ligne (AD-15/AD-16)', () => {
  it('écho (même updated_at) → état inchangé (AD-15)', () => {
    const state = s({ updated_at: '2026-06-23T10:00:00+00:00' })
    const echo: Setting = { id: 'singleton', skip_weekends: false, start_date: null, updated_at: '2026-06-23T10:00:00+00:00' }
    expect(reconcileSetting(state, { eventType: 'UPDATE', new: echo })).toBe(state)
  })

  it('updated_at plus récent → appliqué', () => {
    const state = s({ updated_at: '2026-06-23T10:00:00+00:00' })
    const incoming: Setting = { id: 'singleton', skip_weekends: false, start_date: '2026-07-01', updated_at: '2026-06-23T11:00:00+00:00' }
    expect(reconcileSetting(state, { eventType: 'UPDATE', new: incoming })).toBe(incoming)
  })

  it('updated_at plus ancien → ignoré', () => {
    const state = s({ updated_at: '2026-06-23T12:00:00+00:00' })
    const stale: Setting = { id: 'singleton', skip_weekends: false, start_date: null, updated_at: '2026-06-23T09:00:00+00:00' }
    expect(reconcileSetting(state, { eventType: 'UPDATE', new: stale })).toBe(state)
  })

  it('INSERT (1ʳᵉ création par un autre client) → appliqué', () => {
    const state = s({ updated_at: '' })
    const incoming: Setting = { id: 'singleton', skip_weekends: false, start_date: null, updated_at: '2026-06-23T11:00:00+00:00' }
    expect(reconcileSetting(state, { eventType: 'INSERT', new: incoming })).toBe(incoming)
  })

  it('DELETE → ignoré (settings n’est jamais supprimé)', () => {
    const state = s()
    expect(reconcileSetting(state, { eventType: 'DELETE', old: { id: 'singleton' } })).toBe(state)
  })

  it('id ≠ singleton → ignoré', () => {
    const state = s()
    const incoming: Setting = { id: 'autre', skip_weekends: false, start_date: null, updated_at: '2026-06-23T11:00:00+00:00' }
    expect(reconcileSetting(state, { eventType: 'UPDATE', new: incoming })).toBe(state)
  })
})
