'use client'

import { useEffect, useState } from 'react'
import { useParticipants } from '@/lib/store/participants-store'
import { computeStepStates, STEP_ORDER, STEP_LABELS, type StepKey } from '@/lib/ui/stepper'

// Parcours guidé COLLANT (Story 5.1, UX-DR8). Repère + ancre de défilement, PAS un wizard (AC-4) :
// aucune étape n'est verrouillée, toutes les surfaces restent accessibles. UI pure — l'état des étapes
// vient du helper pur `computeStepStates` ; aucune logique de planning ici (AD-1).

// Chaque étape ancre une surface de la page (ids posés dans app/page.tsx).
const surfaceId = (key: StepKey): string => `surface-${key}`

export function GuidedStepper() {
  const { participants, schedule } = useParticipants()
  const hasActiveParticipant = participants.some((p) => p.active === true) // ① (AC-5)
  const hasLaunchedSchedule = schedule !== null // ③ : rotation lancée (le schedule est éphémère, jamais remis à null) (AC-5)

  // Surface en vue (scroll-spy) → pastille active (AC-2). Défaut ① avant tout défilement.
  const [activeSurface, setActiveSurface] = useState<StepKey | null>('equipe')

  useEffect(() => {
    const els = STEP_ORDER.map((key) => document.getElementById(surfaceId(key))).filter(
      (el): el is HTMLElement => el !== null,
    )
    if (els.length === 0) return

    // On retient la fraction visible de chaque surface ; l'active est la plus visible (ordre doc en départage).
    const ratios = new Map<StepKey, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = e.target.id.replace('surface-', '') as StepKey
          if (e.isIntersecting) ratios.set(key, e.intersectionRatio)
          else ratios.delete(key)
        }
        let best: StepKey | null = null
        let bestRatio = -1
        for (const key of STEP_ORDER) {
          const r = ratios.get(key)
          if (r !== undefined && r > bestRatio) {
            bestRatio = r
            best = key
          }
        }
        if (best) setActiveSurface(best)
      },
      // Décale le haut sous le stepper collant et biaise vers la surface proche du sommet.
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-80px 0px -55% 0px' },
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const states = computeStepStates({ hasActiveParticipant, hasLaunchedSchedule, activeSurface })

  // Clic → défilement doux vers la surface (AC-3) ; saut direct sous prefers-reduced-motion (AC-9, UX-DR13).
  const goTo = (key: StepKey): void => {
    const el = document.getElementById(surfaceId(key))
    if (!el) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

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
            onClick={() => goTo(key)}
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
