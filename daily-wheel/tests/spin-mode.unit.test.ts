import { describe, it, expect } from 'vitest'
import {
  CHAIN_DELAY_MS,
  isRotationComplete,
  shouldChainNext,
  ctaLabelFor,
  isCtaDisabled,
  type SpinMode,
} from '@/lib/ui/spin-mode'

// Story 5.5 — cœur PUR du rythme/des libellés des deux modes (AC-9). Aucun React/DOM/Supabase : testable
// en env node (esprit AD-1), voisin de `lib/ui/wheel.ts` et `lib/ui/timeline.ts`. Ce module ne décide QUE
// du mode/curseur → libellé/booléens ; il ne touche jamais au planning (source de vérité = le domaine,
// UX-DR9). La détection prefers-reduced-motion reste dans le composant (pas ici).

const ROTATION: SpinMode = 'rotation-complete'
const JOUR: SpinMode = 'jour-le-jour'

describe('CHAIN_DELAY_MS (Story 5.5, AC-9d)', () => {
  it('vaut 600 ms — valeur figée du mockup (spin-rotation.html:519)', () => {
    expect(CHAIN_DELAY_MS).toBe(600)
  })
})

describe('isRotationComplete (Story 5.5, AC-9b)', () => {
  it('false quand il reste des jours à révéler', () => {
    expect(isRotationComplete(0, 6)).toBe(false)
    expect(isRotationComplete(5, 6)).toBe(false)
  })

  it('true quand tout est révélé', () => {
    expect(isRotationComplete(6, 6)).toBe(true)
    expect(isRotationComplete(7, 6)).toBe(true) // défensif : ne descend jamais en dessous
  })

  it('false quand aucun planning (planningLen = 0)', () => {
    expect(isRotationComplete(0, 0)).toBe(false)
  })
})

describe('shouldChainNext (Story 5.5, AC-9c)', () => {
  it('mode « Rotation complète » : true tant qu\'il reste des jours', () => {
    expect(shouldChainNext(ROTATION, 0, 6)).toBe(true)
    expect(shouldChainNext(ROTATION, 5, 6)).toBe(true)
  })

  it('mode « Rotation complète » : false une fois complet', () => {
    expect(shouldChainNext(ROTATION, 6, 6)).toBe(false)
  })

  it('mode « Jour le jour » : toujours false (un clic = un jour, pas d\'enchaînement)', () => {
    expect(shouldChainNext(JOUR, 0, 6)).toBe(false)
    expect(shouldChainNext(JOUR, 3, 6)).toBe(false)
    expect(shouldChainNext(JOUR, 6, 6)).toBe(false)
  })

  it('planningLen = 0 : false (rien à enchaîner)', () => {
    expect(shouldChainNext(ROTATION, 0, 0)).toBe(false)
  })
})

describe('ctaLabelFor (Story 5.5, AC-9a — libellés au mot près)', () => {
  it('mode « Rotation complète » : Lancer → (en cours) → Relancer', () => {
    expect(ctaLabelFor(ROTATION, 0, 6)).toBe('🎡 Lancer la roue') // rien révélé — gel microcopie 5.8 (UX-DR12)
    expect(ctaLabelFor(ROTATION, 3, 6)).toBe('🎡 Lancer la roue') // en cours (bouton désactivé)
    expect(ctaLabelFor(ROTATION, 6, 6)).toBe('🎡 Relancer la rotation') // terminé — « Relancer la rotation » conservé (UX)
  })

  it('mode « Jour le jour » : premier → suivant → ✓ complète', () => {
    expect(ctaLabelFor(JOUR, 0, 6)).toBe('🎡 Tirer le premier jour')
    expect(ctaLabelFor(JOUR, 1, 6)).toBe('🎡 Tirer le jour suivant')
    expect(ctaLabelFor(JOUR, 5, 6)).toBe('🎡 Tirer le jour suivant')
    expect(ctaLabelFor(JOUR, 6, 6)).toBe('✓ Rotation complète')
  })
})

describe('isCtaDisabled (Story 5.5, AC-9e)', () => {
  it('désactivé pendant une animation/enchaînement (busy) — les deux modes', () => {
    expect(isCtaDisabled(ROTATION, 2, 6, true)).toBe(true)
    expect(isCtaDisabled(JOUR, 2, 6, true)).toBe(true)
  })

  it('« Jour le jour » terminé (sans busy) → désactivé (état « ✓ Rotation complète »)', () => {
    expect(isCtaDisabled(JOUR, 6, 6, false)).toBe(true)
  })

  it('« Rotation complète » terminé (sans busy) → actionnable (« Relancer »)', () => {
    expect(isCtaDisabled(ROTATION, 6, 6, false)).toBe(false)
  })

  it('en cours sans busy (cas jour le jour entre deux clics) → actionnable', () => {
    expect(isCtaDisabled(JOUR, 3, 6, false)).toBe(false)
    expect(isCtaDisabled(ROTATION, 0, 6, false)).toBe(false)
  })
})
