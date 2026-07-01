import { describe, it, expect } from 'vitest'
import { resolveTodayStandup } from '@/lib/ui/today-standup'
import type { ScheduleRow } from '@/lib/domain/schedule'

// spec-personne-du-jour-bandeau — résolution PURE « personne du jour ». Aucun DOM/React (env node).
// Ancrage calendaire (comme les tests 5.3) : 2026-06-22 lun, 23 mar, 24 mer ; 27 sam, 28 dim.

const row = (date: string, participantId: string, name: string): ScheduleRow => ({ date, participantId, name })
// planning = jours ouvrés attribués, chronologiques (indices de travail 0,1,2).
const plan = [row('2026-06-22', 'p1', 'Alice'), row('2026-06-23', 'p2', 'Bob'), row('2026-06-24', 'p3', 'Carol')]

describe('resolveTodayStandup (spec-personne-du-jour-bandeau)', () => {
  it('(a) jour ouvré DÉJÀ tiré (i < curseur) → revealed avec participantId/name', () => {
    // today = index 0, curseur 1 ⇒ révélé.
    expect(resolveTodayStandup(plan, 1, '2026-06-22')).toEqual({
      kind: 'revealed',
      participantId: 'p1',
      name: 'Alice',
    })
  })

  it('(b) jour ouvré PAS ENCORE tiré (i >= curseur) → pending (nom caché)', () => {
    // today = index 1, curseur 1 ⇒ pas encore révélé.
    expect(resolveTodayStandup(plan, 1, '2026-06-23')).toEqual({ kind: 'pending' })
  })

  it('(c) aujourd\'hui absent du planning (week-end) → none', () => {
    expect(resolveTodayStandup(plan, 3, '2026-06-27')).toEqual({ kind: 'none' })
  })

  it('(c-bis) aujourd\'hui hors période (avant le premier jour) → none', () => {
    expect(resolveTodayStandup(plan, 3, '2026-06-20')).toEqual({ kind: 'none' })
  })

  it('(d) planning vide → none', () => {
    expect(resolveTodayStandup([], 0, '2026-06-22')).toEqual({ kind: 'none' })
  })

  it('(e) curseur 0 → même le premier jour ouvré est pending', () => {
    expect(resolveTodayStandup(plan, 0, '2026-06-22')).toEqual({ kind: 'pending' })
  })

  it('(f) dernier jour ouvré tiré (i == curseur-1) → revealed', () => {
    expect(resolveTodayStandup(plan, 3, '2026-06-24')).toEqual({
      kind: 'revealed',
      participantId: 'p3',
      name: 'Carol',
    })
  })

  it('(g) borne : curseur supérieur à la longueur ne déborde pas → revealed', () => {
    expect(resolveTodayStandup(plan, 99, '2026-06-24')).toEqual({
      kind: 'revealed',
      participantId: 'p3',
      name: 'Carol',
    })
  })
})
