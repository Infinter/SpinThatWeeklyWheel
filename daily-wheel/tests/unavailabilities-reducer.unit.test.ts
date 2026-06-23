import { describe, it, expect } from 'vitest'
import {
  unavailabilitiesReducer,
  type StoreUnavailability,
} from '@/lib/store/unavailabilities-reducer'
import { reconcileUnavailabilities } from '@/lib/store/reconcile'
import type { Unavailability } from '@/lib/data/unavailabilities'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe les invariants du réducteur
// OPTIMISTE des indisponibilités (Story 2.3, AC4/AC8) — cycle insert + delete (PAS d'update).
// + une poignée de cas reconcileUnavailabilities (le générique reconcileById est déjà couvert par
// reconcile.unit ; on vérifie ici le câblage typé indispos).

function u(over: Partial<StoreUnavailability> = {}): StoreUnavailability {
  return {
    id: 'iu1',
    participant_id: 'p1',
    kind: 'day',
    date1: '2026-06-23',
    date2: null,
    updated_at: '2026-06-22T10:00:00+00:00',
    ...over,
  }
}

describe('unavailabilitiesReducer — transitions optimistes (AD-5, insert + delete)', () => {
  it('ADD_OPTIMISTIC : ajoute une ligne pending:true avec id=tempId en fin', () => {
    const state = [u({ id: 'iu1' })]
    const row = u({ id: 'ignored', participant_id: 'p2', kind: 'range', date1: '2026-07-01', date2: '2026-07-05' })
    const next = unavailabilitiesReducer(state, { type: 'ADD_OPTIMISTIC', tempId: 'utemp:0', row })
    expect(next).toHaveLength(2)
    const added = next[1]
    expect(added.id).toBe('utemp:0')
    expect(added.pending).toBe(true)
    expect(added.kind).toBe('range')
    expect(added.date2).toBe('2026-07-05')
  })

  it('SET_PENDING : marque pending:true, failed:false par id', () => {
    const state = [u({ id: 'utemp:0', failed: true })]
    const next = unavailabilitiesReducer(state, { type: 'SET_PENDING', id: 'utemp:0' })
    expect(next[0].pending).toBe(true)
    expect(next[0].failed).toBe(false)
  })

  it('CONFIRM : remplace la ligne tempId par la ligne serveur (id réel, drapeaux effacés)', () => {
    const state = [u({ id: 'utemp:0', pending: true })]
    const row: Unavailability = {
      id: 'real-uuid',
      participant_id: 'p1',
      kind: 'day',
      date1: '2026-06-23',
      date2: null,
      updated_at: '2026-06-22T11:00:00+00:00',
    }
    const next = unavailabilitiesReducer(state, { type: 'CONFIRM', tempId: 'utemp:0', row })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('real-uuid')
    expect(next[0].pending).toBeFalsy()
  })

  it('ROLLBACK : retire la ligne tempId (rollback insert)', () => {
    const state = [u({ id: 'iu1' }), u({ id: 'utemp:0' })]
    const next = unavailabilitiesReducer(state, { type: 'ROLLBACK', tempId: 'utemp:0' })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('iu1')
  })

  it('MARK_FAILED : pending:false, failed:true par id', () => {
    const state = [u({ id: 'utemp:0', pending: true })]
    const next = unavailabilitiesReducer(state, { type: 'MARK_FAILED', id: 'utemp:0' })
    expect(next[0].pending).toBe(false)
    expect(next[0].failed).toBe(true)
  })

  it('REMOVE : retire la ligne par id (delete optimiste)', () => {
    const state = [u({ id: 'iu1' }), u({ id: 'iu2' })]
    const next = unavailabilitiesReducer(state, { type: 'REMOVE', id: 'iu1' })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('iu2')
  })

  it('REMOVE : id absent → état inchangé (même référence)', () => {
    const state = [u({ id: 'iu1' })]
    const next = unavailabilitiesReducer(state, { type: 'REMOVE', id: 'zzz' })
    expect(next).toBe(state)
  })

  it('RESTORE : ligne absente → ré-ajoutée, drapeaux effacés (restauration d’un delete échoué)', () => {
    const state = [u({ id: 'iu1' })]
    const removed: Unavailability = {
      id: 'iu2',
      participant_id: 'p1',
      kind: 'day',
      date1: '2026-06-24',
      date2: null,
      updated_at: '2026-06-22T10:00:00+00:00',
    }
    const next = unavailabilitiesReducer(state, { type: 'RESTORE', row: removed })
    expect(next).toHaveLength(2)
    expect(next.find((r) => r.id === 'iu2')?.date1).toBe('2026-06-24')
  })

  it('RESTORE : ligne présente → remplacée par le snapshot, drapeaux effacés', () => {
    const state = [u({ id: 'iu1', pending: true, failed: true })]
    const snapshot: Unavailability = {
      id: 'iu1',
      participant_id: 'p1',
      kind: 'day',
      date1: '2026-06-23',
      date2: null,
      updated_at: '2026-06-22T10:00:00+00:00',
    }
    const next = unavailabilitiesReducer(state, { type: 'RESTORE', row: snapshot })
    expect(next).toHaveLength(1)
    expect(next[0].pending).toBeFalsy()
    expect(next[0].failed).toBeFalsy()
  })

  it('HYDRATE : remplace l’état par les lignes serveur (drapeaux optimistes abandonnés)', () => {
    const state = [u({ id: 'utemp:0', pending: true })]
    const rows: Unavailability[] = [
      { id: 'iu1', participant_id: 'p1', kind: 'day', date1: '2026-06-23', date2: null, updated_at: 'x' },
    ]
    const next = unavailabilitiesReducer(state, { type: 'HYDRATE', rows })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('iu1')
    expect(next.every((r) => !r.pending)).toBe(true)
  })

  it('est PUR : ne mute pas le tableau d’entrée', () => {
    const state = [u({ id: 'iu1' })]
    const snapshot = JSON.stringify(state)
    unavailabilitiesReducer(state, { type: 'REMOVE', id: 'iu1' })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})

describe('REALTIME → reconcileUnavailabilities (câblage typé AD-15/AD-16)', () => {
  it('INSERT d’une ligne inconnue → upsert', () => {
    const state = [u({ id: 'iu1' })]
    const incoming = u({ id: 'iu2', date1: '2026-06-24' })
    const next = unavailabilitiesReducer(state, { type: 'REALTIME', event: { eventType: 'INSERT', new: incoming } })
    expect(next).toHaveLength(2)
  })

  it('écho (même id + updated_at) → état inchangé (AD-15)', () => {
    const state = [u({ id: 'iu1', updated_at: '2026-06-22T10:00:00+00:00' })]
    const echo = u({ id: 'iu1', date1: '2026-12-31', updated_at: '2026-06-22T10:00:00+00:00' })
    const next = reconcileUnavailabilities(state, { eventType: 'UPDATE', new: echo })
    expect(next[0].date1).toBe('2026-06-23') // écho ignoré
  })

  it('DELETE → ligne retirée par id', () => {
    const state = [u({ id: 'iu1' }), u({ id: 'iu2' })]
    const next = unavailabilitiesReducer(state, { type: 'REALTIME', event: { eventType: 'DELETE', old: { id: 'iu1' } } })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('iu2')
  })
})
