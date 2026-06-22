import { describe, it, expect } from 'vitest'
import { reconcileParticipants } from '@/lib/store/reconcile'
import type { Participant } from '@/lib/data/participants'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe les invariants
// de réconciliation Realtime (AD-15 dédup écho ; AD-16 Last-Write-Wins ordonné serveur).
// C'est le vrai filet du cœur de la tranche verticale (Story 1.5, AC1/AC10).

function p(over: Partial<Participant> = {}): Participant {
  return {
    id: 'p1',
    name: 'Alice',
    active: true,
    created_at: '2026-06-22T10:00:00+00:00',
    updated_at: '2026-06-22T10:00:00+00:00',
    ...over,
  }
}

describe('reconcileParticipants (AD-15 dédup / AD-16 LWW)', () => {
  it('INSERT d’une ligne nouvelle → ajoutée', () => {
    const state = [p({ id: 'p1' })]
    const incoming = p({ id: 'p2', name: 'Bob' })
    const next = reconcileParticipants(state, { eventType: 'INSERT', new: incoming })
    expect(next).toHaveLength(2)
    expect(next.find((r) => r.id === 'p2')?.name).toBe('Bob')
  })

  it('INSERT d’un id déjà présent avec le MÊME updated_at → état inchangé (écho dédupliqué, AD-15)', () => {
    const local = p({ id: 'p1', name: 'Alice', updated_at: '2026-06-22T10:00:00+00:00' })
    const state = [local]
    // Même id ET même updated_at, mais champ différent : c'est un écho de notre propre écriture → ignoré.
    const echo = p({ id: 'p1', name: 'Alice-écho', updated_at: '2026-06-22T10:00:00+00:00' })
    const next = reconcileParticipants(state, { eventType: 'INSERT', new: echo })
    expect(next).toHaveLength(1)
    expect(next[0].name).toBe('Alice') // inchangé : l'écho n'écrase pas
  })

  it('UPDATE d’un id présent avec le MÊME updated_at → état inchangé (écho, AD-15)', () => {
    const state = [p({ id: 'p1', name: 'Alice', updated_at: '2026-06-22T10:00:00+00:00' })]
    const echo = p({ id: 'p1', name: 'Autre', updated_at: '2026-06-22T10:00:00+00:00' })
    const next = reconcileParticipants(state, { eventType: 'UPDATE', new: echo })
    expect(next[0].name).toBe('Alice')
  })

  it('UPDATE avec updated_at plus RÉCENT → ligne mise à jour (LWW, AD-16)', () => {
    const state = [p({ id: 'p1', name: 'Alice', updated_at: '2026-06-22T10:00:00+00:00' })]
    const newer = p({ id: 'p1', name: 'Alice 2', updated_at: '2026-06-22T11:00:00+00:00' })
    const next = reconcileParticipants(state, { eventType: 'UPDATE', new: newer })
    expect(next).toHaveLength(1)
    expect(next[0].name).toBe('Alice 2')
    expect(next[0].updated_at).toBe('2026-06-22T11:00:00+00:00')
  })

  it('UPDATE avec updated_at plus ANCIEN → ignoré (LWW, AD-16)', () => {
    const state = [p({ id: 'p1', name: 'Alice', updated_at: '2026-06-22T11:00:00+00:00' })]
    const older = p({ id: 'p1', name: 'Périmé', updated_at: '2026-06-22T10:00:00+00:00' })
    const next = reconcileParticipants(state, { eventType: 'UPDATE', new: older })
    expect(next[0].name).toBe('Alice') // l'entrant plus ancien n'écrase pas
  })

  it('UPDATE d’un id absent → upsert (ligne ajoutée)', () => {
    const state = [p({ id: 'p1' })]
    const incoming = p({ id: 'p2', name: 'Bob' })
    const next = reconcileParticipants(state, { eventType: 'UPDATE', new: incoming })
    expect(next).toHaveLength(2)
    expect(next.find((r) => r.id === 'p2')?.name).toBe('Bob')
  })

  it('DELETE → ligne retirée par id', () => {
    const state = [p({ id: 'p1' }), p({ id: 'p2', name: 'Bob' })]
    const next = reconcileParticipants(state, { eventType: 'DELETE', old: { id: 'p1' } })
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('p2')
  })

  it('DELETE d’un id absent → état inchangé', () => {
    const state = [p({ id: 'p1' })]
    const next = reconcileParticipants(state, { eventType: 'DELETE', old: { id: 'zzz' } })
    expect(next).toHaveLength(1)
  })

  it('est PUR : ne mute pas le tableau d’entrée', () => {
    const state = [p({ id: 'p1' })]
    const snapshot = JSON.stringify(state)
    reconcileParticipants(state, { eventType: 'INSERT', new: p({ id: 'p2' }) })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
