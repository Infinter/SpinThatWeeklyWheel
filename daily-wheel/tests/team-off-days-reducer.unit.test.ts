import { describe, it, expect } from 'vitest'
import { teamOffDaysReducer, type StoreTeamOffDay } from '@/lib/store/team-off-days-reducer'
import { reconcileTeamOffDays } from '@/lib/store/reconcile'
import type { TeamOffDay } from '@/lib/data/team-off-days'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe les invariants du réducteur OPTIMISTE
// des jours off (Story 3.3, AC4/AC8) — cycle insert + delete (PAS d'update), calqué sur holidays-reducer.ts.
// + une poignée de cas reconcileTeamOffDays (câblage typé du générique reconcileById, AD-15/AD-16).
// Helper `o(over)` : une ligne JOUR par défaut ; les cas plage passent `kind: 'range'` + `date2`.

function o(over: Partial<StoreTeamOffDay> = {}): StoreTeamOffDay {
  return {
    id: 'o1',
    kind: 'day',
    date1: '2026-06-23',
    date2: null,
    label: null,
    updated_at: '2026-06-23T10:00:00+00:00',
    ...over,
  }
}

describe('teamOffDaysReducer — transitions optimistes (AD-5, insert + delete)', () => {
  it('ADD_OPTIMISTIC : ajoute une ligne pending:true avec id=tempId en fin', () => {
    const state = [o({ id: 'o1' })]
    const row = o({ id: 'ignored', kind: 'range', date1: '2026-07-01', date2: '2026-07-05', label: 'Pont' })
    const next = teamOffDaysReducer(state, { type: 'ADD_OPTIMISTIC', tempId: 'otemp:0', row })
    expect(next).toHaveLength(2)
    expect(next[1].id).toBe('otemp:0')
    expect(next[1].pending).toBe(true)
    expect(next[1].kind).toBe('range')
    expect(next[1].date2).toBe('2026-07-05')
    expect(next[1].label).toBe('Pont')
  })

  it('SET_PENDING : pending:true, failed:false par id', () => {
    const state = [o({ id: 'otemp:0', failed: true })]
    const next = teamOffDaysReducer(state, { type: 'SET_PENDING', id: 'otemp:0' })
    expect(next[0].pending).toBe(true)
    expect(next[0].failed).toBe(false)
  })

  it('CONFIRM : remplace la ligne tempId par la ligne serveur (id réel, drapeaux effacés)', () => {
    const state = [o({ id: 'otemp:0', pending: true })]
    const row: TeamOffDay = {
      id: 'real-uuid',
      kind: 'day',
      date1: '2026-06-23',
      date2: null,
      label: null,
      updated_at: '2026-06-23T11:00:00+00:00',
    }
    const next = teamOffDaysReducer(state, { type: 'CONFIRM', tempId: 'otemp:0', row })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('real-uuid')
    expect(next[0].pending).toBeFalsy()
  })

  it('ROLLBACK : retire la ligne tempId (rollback insert)', () => {
    const state = [o({ id: 'o1' }), o({ id: 'otemp:0' })]
    const next = teamOffDaysReducer(state, { type: 'ROLLBACK', tempId: 'otemp:0' })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('o1')
  })

  it('MARK_FAILED : pending:false, failed:true par id', () => {
    const state = [o({ id: 'otemp:0', pending: true })]
    const next = teamOffDaysReducer(state, { type: 'MARK_FAILED', id: 'otemp:0' })
    expect(next[0].pending).toBe(false)
    expect(next[0].failed).toBe(true)
  })

  it('REMOVE : retire la ligne par id (delete optimiste)', () => {
    const state = [o({ id: 'o1' }), o({ id: 'o2' })]
    const next = teamOffDaysReducer(state, { type: 'REMOVE', id: 'o1' })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('o2')
  })

  it('REMOVE : id absent → état inchangé (même référence)', () => {
    const state = [o({ id: 'o1' })]
    const next = teamOffDaysReducer(state, { type: 'REMOVE', id: 'zzz' })
    expect(next).toBe(state)
  })

  it('RESTORE : ligne absente → ré-ajoutée, drapeaux effacés (restauration d’un delete échoué)', () => {
    const state = [o({ id: 'o1' })]
    const removed: TeamOffDay = {
      id: 'o2',
      kind: 'range',
      date1: '2026-08-01',
      date2: '2026-08-15',
      label: 'Fermeture estivale',
      updated_at: '2026-06-23T10:00:00+00:00',
    }
    const next = teamOffDaysReducer(state, { type: 'RESTORE', row: removed })
    expect(next).toHaveLength(2)
    expect(next.find((r) => r.id === 'o2')?.label).toBe('Fermeture estivale')
  })

  it('RESTORE : ligne présente → remplacée par le snapshot, drapeaux effacés', () => {
    const state = [o({ id: 'o1', pending: true, failed: true })]
    const snapshot: TeamOffDay = {
      id: 'o1',
      kind: 'day',
      date1: '2026-06-23',
      date2: null,
      label: null,
      updated_at: '2026-06-23T10:00:00+00:00',
    }
    const next = teamOffDaysReducer(state, { type: 'RESTORE', row: snapshot })
    expect(next).toHaveLength(1)
    expect(next[0].pending).toBeFalsy()
    expect(next[0].failed).toBeFalsy()
  })

  it('HYDRATE : remplace l’état par les lignes serveur (drapeaux optimistes abandonnés)', () => {
    const state = [o({ id: 'otemp:0', pending: true })]
    const rows: TeamOffDay[] = [
      { id: 'o1', kind: 'day', date1: '2026-06-23', date2: null, label: null, updated_at: 'x' },
    ]
    const next = teamOffDaysReducer(state, { type: 'HYDRATE', rows })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('o1')
    expect(next.every((r) => !r.pending)).toBe(true)
  })

  it('est PUR : ne mute pas le tableau d’entrée', () => {
    const state = [o({ id: 'o1' })]
    const snapshot = JSON.stringify(state)
    teamOffDaysReducer(state, { type: 'REMOVE', id: 'o1' })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})

describe('REALTIME → reconcileTeamOffDays (câblage typé AD-15/AD-16)', () => {
  it('INSERT d’une ligne inconnue → upsert', () => {
    const state = [o({ id: 'o1' })]
    const incoming = o({ id: 'o2', kind: 'range', date1: '2026-07-01', date2: '2026-07-05' })
    const next = teamOffDaysReducer(state, {
      type: 'REALTIME',
      event: { eventType: 'INSERT', new: incoming },
    })
    expect(next).toHaveLength(2)
  })

  it('écho (même id + updated_at) → état inchangé (AD-15)', () => {
    const state = [o({ id: 'o1', updated_at: '2026-06-23T10:00:00+00:00' })]
    const echo = o({ id: 'o1', label: 'écrasé ?', updated_at: '2026-06-23T10:00:00+00:00' })
    const next = reconcileTeamOffDays(state, { eventType: 'UPDATE', new: echo })
    expect(next[0].label).toBeNull() // écho ignoré (la ligne locale, label null, est conservée)
  })

  it('DELETE → ligne retirée par id', () => {
    const state = [o({ id: 'o1' }), o({ id: 'o2' })]
    const next = teamOffDaysReducer(state, {
      type: 'REALTIME',
      event: { eventType: 'DELETE', old: { id: 'o1' } },
    })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('o2')
  })
})
