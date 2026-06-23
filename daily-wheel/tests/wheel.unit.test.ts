import { describe, it, expect } from 'vitest'
import {
  buildWheelSegments,
  segmentAngle,
  easeOutCubic,
  finalAngle,
  targetIndexInRemaining,
  remainingSegments,
  type WheelSegment,
} from '@/lib/ui/wheel'
import { buildColorIndexMap, colorForIndex } from '@/lib/ui/participant-colors'
import type { ScheduleRow } from '@/lib/domain/schedule'

// Story 5.4 — cœur PUR de la roue (AC-10a-e). Aucun DOM/canvas/React : testable en env node (AD-1).
// La roue RÉVÈLE le résultat EDF (UX-DR9) — on prouve ici que l'angle final aligne le segment ciblé
// sous le pointeur fixe à 12h, sans aucun tirage aléatoire dans le cœur.

const TAU = Math.PI * 2
// Repli d'un angle dans [0, 2π).
const mod2pi = (a: number): number => ((a % TAU) + TAU) % TAU
const row = (date: string, participantId: string, name: string): ScheduleRow => ({ date, participantId, name })

describe('segmentAngle (Story 5.4, AC-10a)', () => {
  it('renvoie 2π/n', () => {
    expect(segmentAngle(4)).toBeCloseTo(TAU / 4, 10)
    expect(segmentAngle(8)).toBeCloseTo(TAU / 8, 10)
  })

  it('n=1 → un segment plein (2π)', () => {
    expect(segmentAngle(1)).toBeCloseTo(TAU, 10)
  })
})

describe('easeOutCubic (Story 5.4, AC-10c)', () => {
  it('vaut 0 en 0 et 1 en 1', () => {
    expect(easeOutCubic(0)).toBeCloseTo(0, 10)
    expect(easeOutCubic(1)).toBeCloseTo(1, 10)
  })

  it('est monotone croissant sur [0,1]', () => {
    let prev = -Infinity
    for (let i = 0; i <= 10; i++) {
      const v = easeOutCubic(i / 10)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('décélère (ease-OUT) : la 1re moitié couvre plus de la moitié du chemin', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })
})

describe('finalAngle (Story 5.4, AC-10b — révèle, ne tire pas)', () => {
  // Le pointeur est fixe à 12h (-π/2). Le centre du segment targetIdx doit s'y retrouver :
  // end + (targetIdx + 0.5)·seg + π/2 ≡ 0 (mod 2π).
  const aligned = (end: number, targetIdx: number, n: number): number => {
    const seg = TAU / n
    return mod2pi(end + (targetIdx + 0.5) * seg + Math.PI / 2)
  }

  it('aligne le centre du segment ciblé sous le pointeur 12h, pour divers targetIdx/n', () => {
    for (const n of [1, 2, 3, 5, 8]) {
      for (let target = 0; target < n; target++) {
        const end = finalAngle(0.123, target, n, 4 * TAU)
        const off = aligned(end, target, n)
        // Proche de 0 OU de 2π (équivalents modulo 2π).
        const dist = Math.min(off, TAU - off)
        expect(dist).toBeCloseTo(0, 9)
      }
    }
  })

  it('tourne vers l\'avant d\'au moins `turns` et de moins d\'un tour de plus', () => {
    const current = 1.0
    const turns = 5 * TAU
    const end = finalAngle(current, 2, 6, turns)
    expect(end).toBeGreaterThan(current)
    expect(end - current).toBeGreaterThanOrEqual(turns)
    expect(end - current).toBeLessThan(turns + TAU)
  })
})

describe('buildWheelSegments (Story 5.4, AC-10d)', () => {
  it('un segment par ligne du planning, dans l\'ordre, avec colorIndex correct', () => {
    const planning = [row('2026-06-22', 'p1', 'Alice'), row('2026-06-23', 'p2', 'Bob')]
    const colorIndexById = buildColorIndexMap([{ id: 'p1' }, { id: 'p2' }])
    const segs = buildWheelSegments(planning, colorIndexById)
    expect(segs).toEqual<WheelSegment[]>([
      { participantId: 'p1', name: 'Alice', colorIndex: 0 },
      { participantId: 'p2', name: 'Bob', colorIndex: 1 },
    ])
    // Cohérence avec le contrat couleur partagé 5.3.
    expect(colorForIndex(segs[0].colorIndex)).toBe('#0078d4')
    expect(colorForIndex(segs[1].colorIndex)).toBe('#38b2ac')
  })

  it('colorIndex inconnu → 0 (défensif)', () => {
    const segs = buildWheelSegments([row('2026-06-22', 'pX', 'Zoé')], new Map())
    expect(segs[0].colorIndex).toBe(0)
  })
})

describe('targetIndexInRemaining (Story 5.4, AC-10e)', () => {
  const seg = (id: string): WheelSegment => ({ participantId: id, name: id, colorIndex: 0 })

  it('trouve l\'index du participant ciblé dans les restants', () => {
    const remaining = [seg('p1'), seg('p2'), seg('p3')]
    expect(targetIndexInRemaining(remaining, 'p1')).toBe(0)
    expect(targetIndexInRemaining(remaining, 'p3')).toBe(2)
  })

  it('après retrait d\'un révélé, l\'index suit les restants', () => {
    const remaining = [seg('p2'), seg('p3')] // p1 déjà révélé/retiré
    expect(targetIndexInRemaining(remaining, 'p2')).toBe(0)
    expect(targetIndexInRemaining(remaining, 'p3')).toBe(1)
  })

  it('absent → -1', () => {
    expect(targetIndexInRemaining([seg('p1')], 'inconnu')).toBe(-1)
  })
})

describe('remainingSegments (Story 5.4, AC-3)', () => {
  // Ordre de révélation (chronologique) ≠ ordre d'affichage (par colorIndex). Ex. : 3e révélé en 1er
  // visuellement. On vérifie le retrait des révélés ET l'ordre d'affichage stable.
  const segs: WheelSegment[] = [
    { participantId: 'p1', name: 'Alice', colorIndex: 2 },
    { participantId: 'p2', name: 'Bob', colorIndex: 0 },
    { participantId: 'p3', name: 'Carol', colorIndex: 1 },
  ]

  it('revealedCount=0 → tous présents, triés par colorIndex (affichage stable)', () => {
    expect(remainingSegments(segs, 0).map((s) => s.participantId)).toEqual(['p2', 'p3', 'p1'])
  })

  it('retire les `revealedCount` premiers (ordre chronologique), garde le tri d\'affichage', () => {
    // p1 révélé (1er chronologique) → reste {p2,p3} affichés par colorIndex.
    expect(remainingSegments(segs, 1).map((s) => s.participantId)).toEqual(['p2', 'p3'])
    // p1,p2 révélés → reste {p3}.
    expect(remainingSegments(segs, 2).map((s) => s.participantId)).toEqual(['p3'])
  })

  it('revealedCount = total → roue vide', () => {
    expect(remainingSegments(segs, 3)).toEqual([])
  })
})
