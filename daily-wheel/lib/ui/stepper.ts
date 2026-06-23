// Helper PUR du parcours guidé (Story 5.1). AUCUN import React/DOM/Supabase : logique isolée et
// testable en env node (esprit AD-1). Les composants client (`GuidedStepper`) consomment ce calcul ;
// ils n'embarquent aucune règle de complétion en dur.

export type StepKey = 'equipe' | 'contraintes' | 'spin'

export type StepState = {
  key: StepKey
  index: 1 | 2 | 3
  completed: boolean
  active: boolean
  glyph: '✓' | '1' | '2' | '3'
}

export type StepStatesInput = {
  /** ① Équipe : ≥ 1 participant actif (AC-5). */
  hasActiveParticipant: boolean
  /** ③ Spin : une rotation a été lancée (planning généré au moins une fois) (AC-5). */
  hasLaunchedSchedule: boolean
  /** Surface actuellement en vue (scroll-spy) → pastille active (AC-2) ; `null` = aucune. */
  activeSurface: StepKey | null
}

// Ordre et libellés FIGÉS (microcopie EXPERIENCE.md) : 1 Équipe · 2 Contraintes · 3 Spin.
export const STEP_ORDER: readonly StepKey[] = ['equipe', 'contraintes', 'spin'] as const
export const STEP_LABELS: Record<StepKey, string> = {
  equipe: 'Équipe',
  contraintes: 'Contraintes',
  spin: 'Spin',
}
const STEP_INDEX: Record<StepKey, 1 | 2 | 3> = { equipe: 1, contraintes: 2, spin: 3 }

// Règles de complétion (AC-5) : ② Contraintes est TOUJOURS satisfaite (optionnelle).
function isCompleted(key: StepKey, input: StepStatesInput): boolean {
  switch (key) {
    case 'equipe':
      return input.hasActiveParticipant
    case 'contraintes':
      return true
    case 'spin':
      return input.hasLaunchedSchedule
  }
}

export function computeStepStates(input: StepStatesInput): Record<StepKey, StepState> {
  const out = {} as Record<StepKey, StepState>
  for (const key of STEP_ORDER) {
    const index = STEP_INDEX[key]
    const completed = isCompleted(key, input)
    out[key] = {
      key,
      index,
      completed,
      active: input.activeSurface === key,
      // Couleur jamais seul signal (UX-DR13) : ✓ si complétée, sinon le numéro de l'étape.
      glyph: completed ? '✓' : (String(index) as '1' | '2' | '3'),
    }
  }
  return out
}
