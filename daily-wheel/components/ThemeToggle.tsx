'use client'

import { useTheme, setTheme } from '@/components/theme'

// Bouton de bascule clair/sombre (dark theme switchable, 2026-06-24). Affiche l'action à venir : 🌙 en
// thème clair (« passer en sombre »), ☀️ en thème sombre. `aria-pressed` reflète l'état sombre actif.
export function ThemeToggle() {
  const theme = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={dark}
      aria-label={dark ? 'Passer en thème clair' : 'Passer en thème sombre'}
      title={dark ? 'Thème clair' : 'Thème sombre'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      <span aria-hidden="true">{dark ? '☀️' : '🌙'}</span>
    </button>
  )
}
