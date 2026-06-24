'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { StepKey } from '@/lib/ui/stepper'

// Navigation par étapes « une à la fois » (décision Solo 2026-06-24, déviation assumée de la spec UX
// « pas un wizard ») : le stepper devient un COMMUTATEUR. Une seule surface est visible, les autres sont
// masquées (`hidden`) mais RESTENT MONTÉES → l'état local de l'étape Spin (révélation/roue/curseur) est
// préservé à la bascule. La navigation reste LIBRE : aucune étape n'est verrouillée. État purement UI.
type StepNavValue = { activeStep: StepKey; setActiveStep: (k: StepKey) => void }

const StepNavContext = createContext<StepNavValue | null>(null)

export function StepNavProvider({ children }: { children: ReactNode }) {
  const [activeStep, setActiveStep] = useState<StepKey>('equipe')
  return (
    <StepNavContext.Provider value={{ activeStep, setActiveStep }}>{children}</StepNavContext.Provider>
  )
}

export function useStepNav(): StepNavValue {
  const ctx = useContext(StepNavContext)
  if (!ctx) throw new Error('useStepNav doit être utilisé dans <StepNavProvider>')
  return ctx
}

// Enveloppe d'une surface : visible ssi c'est l'étape active. `hidden` (et non démontage) pour préserver
// l'état + sortir du tab order et de l'arbre d'accessibilité quand l'étape est inactive.
export function StepPanel({ step, children }: { step: StepKey; children: ReactNode }) {
  const { activeStep } = useStepNav()
  return (
    <div className="step-panel" hidden={activeStep !== step}>
      {children}
    </div>
  )
}
