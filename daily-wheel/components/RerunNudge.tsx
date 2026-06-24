'use client'

import { useParticipants } from '@/lib/store/participants-store'

// Bandeau de relance non destructif (Story 5.9, `rerun-nudge`, UX-DR14). Apparaît dès qu'une contrainte
// change alors qu'un planning est affiché (`scheduleStale`, dérivé du store) : l'ANCIEN planning reste
// affiché jusqu'à ce que l'utilisateur clique « Relancer » (jamais de réinitialisation silencieuse).
// « Relancer » = `generate()` (nouveau tirage avec les nouvelles contraintes) ⇒ `scheduleStale` repasse
// à false et le nudge disparaît. Non modal, ne recouvre jamais le planning (DESIGN.md:169). A11y :
// `role="status"` (annoncé), bouton focusable ; apparition douce désactivée sous reduced-motion (CSS).
export function RerunNudge() {
  const { scheduleStale, generate } = useParticipants()
  if (!scheduleStale) return null

  return (
    <div className="rerun-nudge" role="status">
      <span className="rerun-nudge-text">Contraintes mises à jour — relancer la roue&nbsp;?</span>
      <button type="button" onClick={generate}>
        Relancer
      </button>
    </div>
  )
}
