import { describe, it, expect } from 'vitest'
import { replayRotation, clampCursor, resolveReplayStartDate } from '@/lib/ui/rotation-resume'
import type { ScheduleInput } from '@/lib/domain/schedule'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe l'invariant de REJOUABILITÉ de la
// Story 5.6 (AC-5). La reprise d'une rotation « Jour le jour » s'appuie sur (graine + curseur) ; ce test
// prouve qu'à ENTRÉES IDENTIQUES, rejouer (seed, cursor) reproduit EXACTEMENT la même rotation et la
// même tranche révélée (déterminisme mulberry32, NFR7/AD-2). Aucun planning figé n'est stocké.

// Petite équipe sans contrainte d'équipe → chaque actif anime un jour ouvré consécutif. La date de début
// tombe un lundi (2026-06-22) ; skipWeekends=true par défaut côté store mais ici on n'impose rien de
// spécial : l'ordre exact dépend du seed, ce qui est précisément ce qu'on veut tester (reproductibilité).
function input(): ScheduleInput {
  return {
    participants: [
      { id: 'a', name: 'Alice', unavailabilities: [] },
      { id: 'b', name: 'Bob', unavailabilities: [] },
      { id: 'c', name: 'Chloé', unavailabilities: [] },
      { id: 'd', name: 'David', unavailabilities: [] },
    ],
    constraints: { skipWeekends: true },
    startDate: '2026-06-22', // lundi
  }
}

const SEED = 1234567

describe('replayRotation — déterminisme à graine constante (Story 5.6, AC-5)', () => {
  it('deux rejeux du même (input, seed) → planning STRICTEMENT identique (dates + id + nom + ordre)', () => {
    const a = replayRotation(input(), SEED)
    const b = replayRotation(input(), SEED)
    expect(b.planning).toEqual(a.planning)
    expect(b.unscheduled).toEqual(a.unscheduled)
    // Sanity : la petite équipe sans contrainte est entièrement planifiée.
    expect(a.planning.length).toBe(4)
  })

  it('la tranche révélée planning.slice(0, cursor) est identique après « reprise » (cursor = 0, mid, len)', () => {
    const original = replayRotation(input(), SEED)
    const len = original.planning.length
    for (const cursor of [0, 2, len]) {
      // « Reprise » = recalcul depuis (input, seed) puis tranche au curseur persisté.
      const resumed = replayRotation(input(), SEED)
      const revealed = resumed.planning.slice(0, clampCursor(cursor, len))
      expect(revealed).toEqual(original.planning.slice(0, cursor))
      // Les animateurs révélés (id+date) sont exactement ceux d'origine, dans le même ordre.
      expect(revealed.map((r) => `${r.date}:${r.participantId}`)).toEqual(
        original.planning.slice(0, cursor).map((r) => `${r.date}:${r.participantId}`),
      )
    }
  })

  it('un seed DIFFÉRENT peut produire une rotation différente (l’ordre dépend du seed)', () => {
    // Documentation : la reproductibilité est garantie par (input + seed). Changer le seed n’est PAS
    // garanti identique (et ne doit pas l’être). On vérifie juste que la fonction reste déterministe
    // par seed — pas que deux seeds diffèrent toujours (collision possible mais sans importance ici).
    const a = replayRotation(input(), SEED)
    const b = replayRotation(input(), SEED + 1)
    expect(a.planning.length).toBe(b.planning.length) // même population planifiée
    // Pas d'assertion d'inégalité stricte (un seed voisin pourrait coïncider) — invariant = déterminisme.
  })
})

describe('resolveReplayStartDate — ancrage persisté vs fallback (Story 5.17, AC-2/AC-4)', () => {
  it('ancre persistée présente → renvoyée (le planning ne glisse plus avec today)', () => {
    expect(resolveReplayStartDate('2026-06-26', '2026-06-29')).toBe('2026-06-26')
  })
  it('ancre persistée null → fallback (rotation antérieure au fix / colonne absente)', () => {
    expect(resolveReplayStartDate(null, '2026-06-29')).toBe('2026-06-29')
  })
  it('ancre persistée undefined → fallback (défensif, colonne non hydratée)', () => {
    expect(resolveReplayStartDate(undefined, '2026-06-29')).toBe('2026-06-29')
  })
  it('ancre persistée chaîne vide → fallback (valeur non significative)', () => {
    expect(resolveReplayStartDate('', '2026-06-29')).toBe('2026-06-29')
  })
})

describe('clampCursor — borne défensive [0, planningLen] (Story 5.6)', () => {
  it('curseur négatif → 0', () => expect(clampCursor(-3, 5)).toBe(0))
  it('curseur au-delà de la longueur → longueur', () => expect(clampCursor(99, 5)).toBe(5))
  it('NaN → 0', () => expect(clampCursor(Number.NaN, 5)).toBe(0))
  it('valeur valide inchangée', () => expect(clampCursor(3, 5)).toBe(3))
  it('tronque une valeur fractionnaire', () => expect(clampCursor(2.9, 5)).toBe(2))
  it('planningLen = 0 → 0', () => expect(clampCursor(4, 0)).toBe(0))
})
