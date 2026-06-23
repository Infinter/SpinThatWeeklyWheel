import { describe, it, expect } from 'vitest'
import {
  groupExclusionsReducer,
  type StoreGroupExclusion,
} from '@/lib/store/group-exclusions-reducer'
import { reconcileGroupExclusions } from '@/lib/store/reconcile'
import type { GroupExclusion } from '@/lib/data/group-exclusions'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe les invariants du réducteur
// OPTIMISTE des exclusions de groupe (Story 3.1, AC4/AC8) — cycle insert + delete (PAS d'update),
// calqué sur unavailabilities-reducer.ts. + une poignée de cas reconcileGroupExclusions (câblage
// typé du générique reconcileById, AD-15/AD-16).

function g(over: Partial<StoreGroupExclusion> = {}): StoreGroupExclusion {
  return {
    id: 'g1',
    day_of_week: 2,
    every_n: 2,
    ref_date: '2026-06-23',
    updated_at: '2026-06-22T10:00:00+00:00',
    ...over,
  }
}

describe('groupExclusionsReducer — transitions optimistes (AD-5, insert + delete)', () => {
  it('ADD_OPTIMISTIC : ajoute une ligne pending:true avec id=tempId en fin', () => {
    const state = [g({ id: 'g1' })]
    const row = g({ id: 'ignored', day_of_week: 1, every_n: 1, ref_date: '2026-06-22' })
    const next = groupExclusionsReducer(state, { type: 'ADD_OPTIMISTIC', tempId: 'gtemp:0', row })
    expect(next).toHaveLength(2)
    expect(next[1].id).toBe('gtemp:0')
    expect(next[1].pending).toBe(true)
    expect(next[1].day_of_week).toBe(1)
  })

  it('SET_PENDING : pending:true, failed:false par id', () => {
    const state = [g({ id: 'gtemp:0', failed: true })]
    const next = groupExclusionsReducer(state, { type: 'SET_PENDING', id: 'gtemp:0' })
    expect(next[0].pending).toBe(true)
    expect(next[0].failed).toBe(false)
  })

  it('CONFIRM : remplace la ligne tempId par la ligne serveur (id réel, drapeaux effacés)', () => {
    const state = [g({ id: 'gtemp:0', pending: true })]
    const row: GroupExclusion = {
      id: 'real-uuid',
      day_of_week: 2,
      every_n: 2,
      ref_date: '2026-06-23',
      updated_at: '2026-06-22T11:00:00+00:00',
    }
    const next = groupExclusionsReducer(state, { type: 'CONFIRM', tempId: 'gtemp:0', row })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('real-uuid')
    expect(next[0].pending).toBeFalsy()
  })

  it('ROLLBACK : retire la ligne tempId (rollback insert)', () => {
    const state = [g({ id: 'g1' }), g({ id: 'gtemp:0' })]
    const next = groupExclusionsReducer(state, { type: 'ROLLBACK', tempId: 'gtemp:0' })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('g1')
  })

  it('MARK_FAILED : pending:false, failed:true par id', () => {
    const state = [g({ id: 'gtemp:0', pending: true })]
    const next = groupExclusionsReducer(state, { type: 'MARK_FAILED', id: 'gtemp:0' })
    expect(next[0].pending).toBe(false)
    expect(next[0].failed).toBe(true)
  })

  it('REMOVE : retire la ligne par id (delete optimiste)', () => {
    const state = [g({ id: 'g1' }), g({ id: 'g2' })]
    const next = groupExclusionsReducer(state, { type: 'REMOVE', id: 'g1' })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('g2')
  })

  it('REMOVE : id absent → état inchangé (même référence)', () => {
    const state = [g({ id: 'g1' })]
    const next = groupExclusionsReducer(state, { type: 'REMOVE', id: 'zzz' })
    expect(next).toBe(state)
  })

  it('RESTORE : ligne absente → ré-ajoutée, drapeaux effacés (restauration d’un delete échoué)', () => {
    const state = [g({ id: 'g1' })]
    const removed: GroupExclusion = {
      id: 'g2',
      day_of_week: 4,
      every_n: 1,
      ref_date: '2026-06-25',
      updated_at: '2026-06-22T10:00:00+00:00',
    }
    const next = groupExclusionsReducer(state, { type: 'RESTORE', row: removed })
    expect(next).toHaveLength(2)
    expect(next.find((r) => r.id === 'g2')?.day_of_week).toBe(4)
  })

  it('RESTORE : ligne présente → remplacée par le snapshot, drapeaux effacés', () => {
    const state = [g({ id: 'g1', pending: true, failed: true })]
    const snapshot: GroupExclusion = {
      id: 'g1',
      day_of_week: 2,
      every_n: 2,
      ref_date: '2026-06-23',
      updated_at: '2026-06-22T10:00:00+00:00',
    }
    const next = groupExclusionsReducer(state, { type: 'RESTORE', row: snapshot })
    expect(next).toHaveLength(1)
    expect(next[0].pending).toBeFalsy()
    expect(next[0].failed).toBeFalsy()
  })

  it('HYDRATE : remplace l’état par les lignes serveur (drapeaux optimistes abandonnés)', () => {
    const state = [g({ id: 'gtemp:0', pending: true })]
    const rows: GroupExclusion[] = [
      { id: 'g1', day_of_week: 2, every_n: 2, ref_date: '2026-06-23', updated_at: 'x' },
    ]
    const next = groupExclusionsReducer(state, { type: 'HYDRATE', rows })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('g1')
    expect(next.every((r) => !r.pending)).toBe(true)
  })

  it('est PUR : ne mute pas le tableau d’entrée', () => {
    const state = [g({ id: 'g1' })]
    const snapshot = JSON.stringify(state)
    groupExclusionsReducer(state, { type: 'REMOVE', id: 'g1' })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})

describe('REALTIME → reconcileGroupExclusions (câblage typé AD-15/AD-16)', () => {
  it('INSERT d’une ligne inconnue → upsert', () => {
    const state = [g({ id: 'g1' })]
    const incoming = g({ id: 'g2', ref_date: '2026-06-30' })
    const next = groupExclusionsReducer(state, {
      type: 'REALTIME',
      event: { eventType: 'INSERT', new: incoming },
    })
    expect(next).toHaveLength(2)
  })

  it('écho (même id + updated_at) → état inchangé (AD-15)', () => {
    const state = [g({ id: 'g1', updated_at: '2026-06-22T10:00:00+00:00' })]
    const echo = g({ id: 'g1', every_n: 9, updated_at: '2026-06-22T10:00:00+00:00' })
    const next = reconcileGroupExclusions(state, { eventType: 'UPDATE', new: echo })
    expect(next[0].every_n).toBe(2) // écho ignoré
  })

  it('DELETE → ligne retirée par id', () => {
    const state = [g({ id: 'g1' }), g({ id: 'g2' })]
    const next = groupExclusionsReducer(state, {
      type: 'REALTIME',
      event: { eventType: 'DELETE', old: { id: 'g1' } },
    })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('g2')
  })
})
