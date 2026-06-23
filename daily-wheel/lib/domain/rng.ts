// Aléa INJECTÉ et seedable du domaine (Story 4.2, AD-2). FEUILLE PURE : aucun import, et surtout
// AUCUN `Math.random()` (le tirage du seed aléatoire en prod vit dans le store, hors du domaine).
// Même seed → même séquence → rejouabilité (NFR7) et parité golden reproductible (AD-12).

// Contrat de l'aléa : une fonction sans argument renvoyant un flottant dans [0, 1)
// (compatible `Math.random`). `generateSchedule` la reçoit en paramètre — il n'en connaît rien d'autre.
export type Rng = () => number

// mulberry32 : générateur pseudo-aléatoire 32 bits déterministe (standard, rapide, bonne distribution).
// `Math.imul` est une multiplication entière 32 bits (opération ARITHMÉTIQUE, pas `Math.random`) —
// parfaitement déterministe. La division par 2^32 ramène la sortie dans [0, 1).
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
