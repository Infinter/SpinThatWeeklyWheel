// Dark theme switchable (2026-06-24). Helper PUR (aucun import React/DOM/Supabase, esprit AD-1) : isolé
// et testable en env node. Le composant client `theme.tsx` et le script anti-flash de `layout.tsx`
// consomment ce calcul ; ils n'embarquent aucune règle de choix initial en dur.

export type Theme = 'light' | 'dark'

// Clé localStorage du choix explicite de l'utilisateur (partagée avec le script anti-flash de layout.tsx).
export const THEME_STORAGE_KEY = 'daily-wheel-theme'

// Choix initial : un thème explicitement mémorisé prime ; sinon on suit la préférence système.
export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored
  return prefersDark ? 'dark' : 'light'
}
