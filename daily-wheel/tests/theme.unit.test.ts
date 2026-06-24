import { describe, it, expect } from 'vitest'
import { resolveInitialTheme } from '@/lib/ui/theme'

// Dark theme switchable (2026-06-24). `resolveInitialTheme` = cœur PUR du choix initial : un choix
// explicite mémorisé prime ; sinon on suit `prefers-color-scheme`. Aucun import React/DOM (testable node).
describe('resolveInitialTheme', () => {
  it('respecte le choix stocké « dark » (prime sur la préférence système)', () => {
    expect(resolveInitialTheme('dark', false)).toBe('dark')
  })
  it('respecte le choix stocké « light » (prime sur la préférence système)', () => {
    expect(resolveInitialTheme('light', true)).toBe('light')
  })
  it('sans choix stocké → suit prefers-color-scheme: dark', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark')
  })
  it('sans choix stocké → suit prefers-color-scheme: light (défaut)', () => {
    expect(resolveInitialTheme(null, false)).toBe('light')
  })
  it('valeur stockée invalide → repli sur la préférence système', () => {
    expect(resolveInitialTheme('bogus', true)).toBe('dark')
    expect(resolveInitialTheme('bogus', false)).toBe('light')
  })
})
