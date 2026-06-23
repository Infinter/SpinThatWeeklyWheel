import { describe, it, expect } from 'vitest'
import { holidaysReducer, type StoreHoliday } from '@/lib/store/holidays-reducer'
import { reconcileHolidays } from '@/lib/store/reconcile'
import type { Holiday } from '@/lib/data/holidays'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe les invariants du réducteur
// OPTIMISTE des jours fériés (Story 3.2, AC4/AC9) — cycle insert + delete (PAS d'update), calqué sur
// group-exclusions-reducer.ts. + une poignée de cas reconcileHolidays (câblage typé du générique
// reconcileById, AD-15/AD-16).

function h(over: Partial<StoreHoliday> = {}): StoreHoliday {
  return {
    id: 'h1',
    date: '2026-01-01',
    label: 'Jour de l’An',
    updated_at: '2026-06-22T10:00:00+00:00',
    ...over,
  }
}

describe('holidaysReducer — transitions optimistes (AD-5, insert + delete)', () => {
  it('ADD_OPTIMISTIC : ajoute une ligne pending:true avec id=tempId en fin', () => {
    const state = [h({ id: 'h1' })]
    const row = h({ id: 'ignored', date: '2026-05-01', label: 'Fête du Travail' })
    const next = holidaysReducer(state, { type: 'ADD_OPTIMISTIC', tempId: 'htemp:0', row })
    expect(next).toHaveLength(2)
    expect(next[1].id).toBe('htemp:0')
    expect(next[1].pending).toBe(true)
    expect(next[1].date).toBe('2026-05-01')
  })

  it('SET_PENDING : pending:true, failed:false par id', () => {
    const state = [h({ id: 'htemp:0', failed: true })]
    const next = holidaysReducer(state, { type: 'SET_PENDING', id: 'htemp:0' })
    expect(next[0].pending).toBe(true)
    expect(next[0].failed).toBe(false)
  })

  it('CONFIRM : remplace la ligne tempId par la ligne serveur (id réel, drapeaux effacés)', () => {
    const state = [h({ id: 'htemp:0', pending: true })]
    const row: Holiday = {
      id: 'real-uuid',
      date: '2026-01-01',
      label: 'Jour de l’An',
      updated_at: '2026-06-22T11:00:00+00:00',
    }
    const next = holidaysReducer(state, { type: 'CONFIRM', tempId: 'htemp:0', row })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('real-uuid')
    expect(next[0].pending).toBeFalsy()
  })

  it('ROLLBACK : retire la ligne tempId (rollback insert)', () => {
    const state = [h({ id: 'h1' }), h({ id: 'htemp:0' })]
    const next = holidaysReducer(state, { type: 'ROLLBACK', tempId: 'htemp:0' })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('h1')
  })

  it('MARK_FAILED : pending:false, failed:true par id', () => {
    const state = [h({ id: 'htemp:0', pending: true })]
    const next = holidaysReducer(state, { type: 'MARK_FAILED', id: 'htemp:0' })
    expect(next[0].pending).toBe(false)
    expect(next[0].failed).toBe(true)
  })

  it('REMOVE : retire la ligne par id (delete optimiste)', () => {
    const state = [h({ id: 'h1' }), h({ id: 'h2' })]
    const next = holidaysReducer(state, { type: 'REMOVE', id: 'h1' })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('h2')
  })

  it('REMOVE : id absent → état inchangé (même référence)', () => {
    const state = [h({ id: 'h1' })]
    const next = holidaysReducer(state, { type: 'REMOVE', id: 'zzz' })
    expect(next).toBe(state)
  })

  it('RESTORE : ligne absente → ré-ajoutée, drapeaux effacés (restauration d’un delete échoué)', () => {
    const state = [h({ id: 'h1' })]
    const removed: Holiday = {
      id: 'h2',
      date: '2026-05-08',
      label: 'Victoire 1945',
      updated_at: '2026-06-22T10:00:00+00:00',
    }
    const next = holidaysReducer(state, { type: 'RESTORE', row: removed })
    expect(next).toHaveLength(2)
    expect(next.find((r) => r.id === 'h2')?.label).toBe('Victoire 1945')
  })

  it('RESTORE : ligne présente → remplacée par le snapshot, drapeaux effacés', () => {
    const state = [h({ id: 'h1', pending: true, failed: true })]
    const snapshot: Holiday = {
      id: 'h1',
      date: '2026-01-01',
      label: 'Jour de l’An',
      updated_at: '2026-06-22T10:00:00+00:00',
    }
    const next = holidaysReducer(state, { type: 'RESTORE', row: snapshot })
    expect(next).toHaveLength(1)
    expect(next[0].pending).toBeFalsy()
    expect(next[0].failed).toBeFalsy()
  })

  it('HYDRATE : remplace l’état par les lignes serveur (drapeaux optimistes abandonnés)', () => {
    const state = [h({ id: 'htemp:0', pending: true })]
    const rows: Holiday[] = [
      { id: 'h1', date: '2026-01-01', label: 'Jour de l’An', updated_at: 'x' },
    ]
    const next = holidaysReducer(state, { type: 'HYDRATE', rows })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('h1')
    expect(next.every((r) => !r.pending)).toBe(true)
  })

  it('est PUR : ne mute pas le tableau d’entrée', () => {
    const state = [h({ id: 'h1' })]
    const snapshot = JSON.stringify(state)
    holidaysReducer(state, { type: 'REMOVE', id: 'h1' })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})

describe('REALTIME → reconcileHolidays (câblage typé AD-15/AD-16)', () => {
  it('INSERT d’une ligne inconnue → upsert', () => {
    const state = [h({ id: 'h1' })]
    const incoming = h({ id: 'h2', date: '2026-05-01' })
    const next = holidaysReducer(state, {
      type: 'REALTIME',
      event: { eventType: 'INSERT', new: incoming },
    })
    expect(next).toHaveLength(2)
  })

  it('écho (même id + updated_at) → état inchangé (AD-15)', () => {
    const state = [h({ id: 'h1', updated_at: '2026-06-22T10:00:00+00:00' })]
    const echo = h({ id: 'h1', label: 'écrasé ?', updated_at: '2026-06-22T10:00:00+00:00' })
    const next = reconcileHolidays(state, { eventType: 'UPDATE', new: echo })
    expect(next[0].label).toBe('Jour de l’An') // écho ignoré
  })

  it('DELETE → ligne retirée par id', () => {
    const state = [h({ id: 'h1' }), h({ id: 'h2' })]
    const next = holidaysReducer(state, {
      type: 'REALTIME',
      event: { eventType: 'DELETE', old: { id: 'h1' } },
    })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('h2')
  })
})
