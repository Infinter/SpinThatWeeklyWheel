'use client'

import { useSyncExternalStore } from 'react'
import { type Theme, THEME_STORAGE_KEY } from '@/lib/ui/theme'

// État de thème côté client (dark theme switchable, 2026-06-24). Source de vérité = l'attribut
// `data-theme` sur <html>, posé AVANT le 1er paint par le script anti-flash de `layout.tsx`. Pas de
// provider : un store-module + `useSyncExternalStore` suffit (même patron que la passphrase). `useTheme`
// est lisible n'importe où (toggle dans le header, roue au fond de l'arbre) sans prop drilling.

const listeners = new Set<() => void>()
function emit(): void {
  listeners.forEach((l) => l())
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}
// SSR : on rend 'light' par défaut (le script anti-flash corrige l'attribut avant l'hydratation ; le
// snapshot client lit l'attribut réel — pas de mismatch sur les couleurs, juste l'icône du toggle).
function getServerSnapshot(): Theme {
  return 'light'
}

// Applique + persiste le thème, puis notifie les abonnés (toggle, roue).
export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* localStorage indisponible (mode privé strict) : le thème reste appliqué pour la session. */
  }
  emit()
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
