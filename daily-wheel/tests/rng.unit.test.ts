import { describe, it, expect } from 'vitest'
import { createRng } from '@/lib/domain/rng'

// Test UNITAIRE pur (Story 4.2, AC2) : le générateur pseudo-aléatoire seedable (mulberry32) est
// l'aléa INJECTÉ du domaine (AD-2). Aucun `Math.random()` à l'intérieur du domaine : même seed →
// même séquence (rejouabilité NFR7, parité golden AD-12). Interface `Rng = () => number` ∈ [0,1).

describe('createRng (mulberry32, déterministe et seedable)', () => {
  it('même seed → séquence IDENTIQUE (déterminisme NFR7)', () => {
    const a = createRng(12345)
    const b = createRng(12345)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('seeds différents → séquences DIFFÉRENTES', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  it('toutes les valeurs ∈ [0, 1)', () => {
    const r = createRng(987654321)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('avance à chaque appel (séquence non constante)', () => {
    const r = createRng(42)
    const v1 = r()
    const v2 = r()
    expect(v1).not.toBe(v2)
  })

  it('seed 0 est valide (pas de cas dégénéré)', () => {
    const r = createRng(0)
    const seq = Array.from({ length: 5 }, () => r())
    // 5 valeurs distinctes dans [0,1) — pas de blocage sur 0.
    expect(new Set(seq).size).toBe(5)
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
