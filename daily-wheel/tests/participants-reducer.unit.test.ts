import { describe, it, expect } from 'vitest'
import { participantsReducer, type StoreParticipant } from '@/lib/store/participants-reducer'
import type { Participant } from '@/lib/data/participants'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe les invariants du
// réducteur OPTIMISTE de la copie de travail client (Story 2.2, AC1/AC7).
// Transitions héritées (1.5/2.1) : ADD_OPTIMISTIC / SET_PENDING / CONFIRM / ROLLBACK / MARK_FAILED / HYDRATE.
// Nouvelles transitions (mutations sur lignes confirmées) : PATCH_OPTIMISTIC / RESTORE / REMOVE (AD-5).
// REALTIME délègue à reconcileParticipants (couvert par reconcile.unit) — non re-testé ici.

function p(over: Partial<StoreParticipant> = {}): StoreParticipant {
  return {
    id: 'p1',
    name: 'Alice',
    active: true,
    created_at: '2026-06-22T10:00:00+00:00',
    updated_at: '2026-06-22T10:00:00+00:00',
    ...over,
  }
}

describe('participantsReducer — transitions optimistes (AD-5)', () => {
  // ── Nouvelles transitions 2.2 ──────────────────────────────────────────────

  it('PATCH_OPTIMISTIC : toggle active → patch + pending:true, failed:false', () => {
    const state = [p({ id: 'p1', active: true, failed: true })]
    const next = participantsReducer(state, { type: 'PATCH_OPTIMISTIC', id: 'p1', patch: { active: false } })
    expect(next[0].active).toBe(false)
    expect(next[0].pending).toBe(true)
    expect(next[0].failed).toBe(false)
    expect(next[0].name).toBe('Alice') // patch partiel : le reste est conservé.
  })

  it('PATCH_OPTIMISTIC : renommage → patch du nom + pending', () => {
    const state = [p({ id: 'p1', name: 'Alice' })]
    const next = participantsReducer(state, { type: 'PATCH_OPTIMISTIC', id: 'p1', patch: { name: 'Alicia' } })
    expect(next[0].name).toBe('Alicia')
    expect(next[0].pending).toBe(true)
  })

  it('PATCH_OPTIMISTIC : id absent → état inchangé (même référence)', () => {
    const state = [p({ id: 'p1' })]
    const next = participantsReducer(state, { type: 'PATCH_OPTIMISTIC', id: 'zzz', patch: { name: 'X' } })
    expect(next).toBe(state)
  })

  it('RESTORE : ligne présente → remplacée par le snapshot, drapeaux client effacés (rollback update)', () => {
    const state = [p({ id: 'p1', name: 'Mauvais', active: false, pending: true, failed: true })]
    const snapshot = p({ id: 'p1', name: 'Alice', active: true }) // ligne serveur d'origine (sans drapeaux)
    const next = participantsReducer(state, { type: 'RESTORE', row: snapshot })
    expect(next).toHaveLength(1)
    expect(next[0].name).toBe('Alice')
    expect(next[0].active).toBe(true)
    expect(next[0].pending).toBeFalsy()
    expect(next[0].failed).toBeFalsy()
  })

  it('RESTORE : ligne absente → ré-ajoutée (restauration d’un delete échoué)', () => {
    const state = [p({ id: 'p1' })]
    const removed = p({ id: 'p2', name: 'Bob' })
    const next = participantsReducer(state, { type: 'RESTORE', row: removed })
    expect(next).toHaveLength(2)
    expect(next.find((r) => r.id === 'p2')?.name).toBe('Bob')
  })

  it('REMOVE : retire la ligne par id (delete optimiste)', () => {
    const state = [p({ id: 'p1' }), p({ id: 'p2', name: 'Bob' })]
    const next = participantsReducer(state, { type: 'REMOVE', id: 'p1' })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('p2')
  })

  it('REMOVE : id absent → état inchangé (même référence)', () => {
    const state = [p({ id: 'p1' })]
    const next = participantsReducer(state, { type: 'REMOVE', id: 'zzz' })
    expect(next).toBe(state)
  })

  // ── Non-régression des transitions héritées 1.5/2.1 ────────────────────────

  it('ADD_OPTIMISTIC : ajoute une ligne active:true + pending:true en fin', () => {
    const state = [p({ id: 'p1' })]
    const next = participantsReducer(state, { type: 'ADD_OPTIMISTIC', tempId: 'temp:0', name: 'Bob' })
    expect(next).toHaveLength(2)
    const added = next[1]
    expect(added.id).toBe('temp:0')
    expect(added.name).toBe('Bob')
    expect(added.active).toBe(true)
    expect(added.pending).toBe(true)
  })

  it('SET_PENDING : marque pending:true, failed:false', () => {
    const state = [p({ id: 'temp:0', failed: true })]
    const next = participantsReducer(state, { type: 'SET_PENDING', tempId: 'temp:0' })
    expect(next[0].pending).toBe(true)
    expect(next[0].failed).toBe(false)
  })

  it('CONFIRM : remplace la ligne temp par la ligne serveur (id + updated_at réels)', () => {
    const state = [p({ id: 'temp:0', name: 'Bob', pending: true })]
    const row = { id: 'real-uuid', name: 'Bob', active: true, created_at: 'x', updated_at: 'y' }
    const next = participantsReducer(state, { type: 'CONFIRM', tempId: 'temp:0', row })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('real-uuid')
    expect(next[0].pending).toBeFalsy()
  })

  it('ROLLBACK : retire la ligne temp (rollback insert)', () => {
    const state = [p({ id: 'p1' }), p({ id: 'temp:0', name: 'Bob' })]
    const next = participantsReducer(state, { type: 'ROLLBACK', tempId: 'temp:0' })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('p1')
  })

  it('MARK_FAILED : pending:false, failed:true', () => {
    const state = [p({ id: 'temp:0', pending: true })]
    const next = participantsReducer(state, { type: 'MARK_FAILED', tempId: 'temp:0' })
    expect(next[0].pending).toBe(false)
    expect(next[0].failed).toBe(true)
  })

  it('HYDRATE : remplace l’état par les lignes serveur (drapeaux optimistes abandonnés)', () => {
    const state = [p({ id: 'temp:0', pending: true })]
    const rows: Participant[] = [p({ id: 'p1', name: 'Alice' }), p({ id: 'p2', name: 'Bob' })]
    const next = participantsReducer(state, { type: 'HYDRATE', rows })
    expect(next).toHaveLength(2)
    expect(next.every((r) => !r.pending)).toBe(true)
  })

  it('est PUR : ne mute pas le tableau d’entrée', () => {
    const state = [p({ id: 'p1' })]
    const snapshot = JSON.stringify(state)
    participantsReducer(state, { type: 'PATCH_OPTIMISTIC', id: 'p1', patch: { active: false } })
    participantsReducer(state, { type: 'REMOVE', id: 'p1' })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
