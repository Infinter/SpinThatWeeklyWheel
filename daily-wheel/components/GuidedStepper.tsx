'use client'

import { useParticipants } from '@/lib/store/participants-store'
import { useStepNav } from '@/components/StepNav'
import { computeStepStates, STEP_ORDER, STEP_LABELS } from '@/lib/ui/stepper'

// Parcours guidé COLLANT (Story 5.1, UX-DR8). COMMUTATEUR d'étapes (décision Solo 2026-06-24) : une
// seule surface visible à la fois, clic = bascule (plus de défilement). Navigation LIBRE — aucune étape
// verrouillée. UI pure : l'état des étapes vient du helper pur `computeStepStates` (aucune logique de
// planning ici, AD-1) ; l'étape active vient du contexte `StepNav`.

export function GuidedStepper() {
  const { participants, schedule } = useParticipants()
  const { activeStep, setActiveStep } = useStepNav()
  const hasActiveParticipant = participants.some((p) => p.active === true) // ① (AC-5)
  const hasLaunchedSchedule = schedule !== null // ③ : rotation lancée (le schedule est éphémère, jamais remis à null) (AC-5)

  // `activeSurface` du helper = étape sélectionnée (commutateur) → pastille active (AC-2).
  const states = computeStepStates({ hasActiveParticipant, hasLaunchedSchedule, activeSurface: activeStep })

  return (
    <nav className="stepper" aria-label="Étapes du réglage">
      {STEP_ORDER.map((key) => {
        const st = states[key]
        const className = `step${st.completed ? ' done' : ''}${st.active ? ' active' : ''}`
        return (
          <button
            key={key}
            type="button"
            className={className}
            aria-current={st.active ? 'step' : undefined}
            aria-label={`Aller à l'étape ${st.index} : ${STEP_LABELS[key]} — ${
              st.completed ? 'complétée' : 'à faire'
            }`}
            onClick={() => setActiveStep(key)}
          >
            <span className="num" aria-hidden="true">
              {st.glyph}
            </span>
            <span className="lbl">
              <span>Étape {st.index}</span>
              <b>{STEP_LABELS[key]}</b>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
