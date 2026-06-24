// Rythme & libellés des deux modes de tirage (Story 5.5, FR16/axe A). Feuille UI PURE (aucun
// React/DOM/Supabase) : le cœur testable de l'orchestration, isolé pour être vérifié en env node
// (esprit AD-1), voisin de `lib/ui/wheel.ts` et `lib/ui/timeline.ts`.
//
// PRINCIPE DIRECTEUR (UX-DR9, sacré) : `generateSchedule` reste la SOURCE DE VÉRITÉ ; ce module ne
// décide NI du planning NI du gagnant — il ne calcule que le RYTHME (faut-il enchaîner ?) et les
// LIBELLÉS du CTA à partir du mode et du curseur de révélation. La détection `prefers-reduced-motion`
// vit dans le composant `ScheduleResult` (pas ici : ce module ne lit jamais le DOM).
//
// Microcopie : libellés au mot près de la spec autoritaire (EXPERIENCE.md:61-75, mockup
// spin-rotation.html:299/514/534/537/555). Le mark 🎡 est utilisé dès 5.5 (le gel final reste 5.8).

// Le mode de révélation choisi via le sélecteur `role="tablist"` (AC-1).
export type SpinMode = 'rotation-complete' | 'jour-le-jour'

// Délai entre la fin d'un spin et le départ du suivant en mode « Rotation complète » (AC-3).
// Valeur figée du mockup (spin-rotation.html:519 → setTimeout(next, 600)).
export const CHAIN_DELAY_MS = 600

// La rotation est entièrement révélée. `planningLen === 0` ⇒ false (rien à révéler).
export function isRotationComplete(revealedCount: number, planningLen: number): boolean {
  return planningLen > 0 && revealedCount >= planningLen
}

// Faut-il déclencher automatiquement le jour suivant ? Vrai UNIQUEMENT en « Rotation complète » tant
// qu'il reste des jours. En « Jour le jour », jamais : un clic = un jour (AC-3/AC-4).
export function shouldChainNext(mode: SpinMode, revealedCount: number, planningLen: number): boolean {
  return mode === 'rotation-complete' && planningLen > 0 && revealedCount < planningLen
}

// Libellé EXACT du CTA selon le mode et l'avancement (AC-4/AC-5). Inclut le mark 🎡 (décision 5.5).
export function ctaLabelFor(mode: SpinMode, revealedCount: number, planningLen: number): string {
  const complete = isRotationComplete(revealedCount, planningLen)
  if (mode === 'rotation-complete') {
    return complete ? '🎡 Relancer la rotation' : '🎡 Lancer la roue'
  }
  // jour-le-jour
  if (complete) return '✓ Rotation complète'
  return revealedCount === 0 ? '🎡 Tirer le premier jour' : '🎡 Tirer le jour suivant'
}

// CTA désactivé : pendant une animation/enchaînement (busy) OU état terminal « Jour le jour »
// (« ✓ Rotation complète » n'est plus actionnable). En « Rotation complète », le bouton reste
// actionnable une fois complet pour permettre « Relancer la rotation » (AC-5/AC-9e).
export function isCtaDisabled(
  mode: SpinMode,
  revealedCount: number,
  planningLen: number,
  busy: boolean,
): boolean {
  if (busy) return true
  return mode === 'jour-le-jour' && isRotationComplete(revealedCount, planningLen)
}
