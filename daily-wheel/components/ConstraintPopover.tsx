'use client'

import { useEffect, useRef } from 'react'
import { UnavailabilityPanel } from '@/components/UnavailabilityPanel'

// Popover d'édition rapide des indisponibilités (Story 5.9, `constraint-popover`, UX-DR14, FR5).
// Réutilise TEL QUEL l'éditeur jour/plage existant (`UnavailabilityPanel`) — même éditeur qu'à l'étape
// ① Équipe. Ouvert depuis un chip du résumé d'équipe sans quitter la page ni perdre l'état du tirage
// (l'écriture passe par le store, optimiste, AD-5/AD-14). Voile LÉGER derrière : focalise sans masquer
// le tirage (DESIGN.md:166). Fermeture : Échap, clic extérieur (voile), bouton ✕. A11y (UX-DR13) :
// `role="dialog"` + `aria-labelledby`, focus déplacé dans le popover à l'ouverture et RENDU au chip
// déclencheur à la fermeture. Tout en français (NFR4).
export function ConstraintPopover({
  participantId,
  participantName,
  onClose,
}: {
  participantId: string
  participantName: string
  onClose: () => void
}) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  // Élément focalisé avant l'ouverture (le chip) : on lui rend le focus à la fermeture.
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  // Effet de FOCUS — montage/démontage UNIQUEMENT (`[]`) : capture le chip déclencheur, déplace le focus
  // dans le popover, et le restaure à la fermeture. Surtout PAS dépendant de `onClose` : un ré-rendu du
  // parent (ex. ajout d'indispo) ne doit pas re-déclencher le focus ni écraser l'élément à restaurer.
  useEffect(() => {
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null
    const card = cardRef.current
    const first = card?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    ;(first ?? card)?.focus()
    return () => {
      // Restaure le focus sur le chip déclencheur (s'il est toujours dans le DOM).
      restoreFocusRef.current?.focus?.()
    }
  }, [])

  // Effet ÉCHAP séparé : re-souscrit si `onClose` change (peu coûteux, sans effet de bord sur le focus).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const titleId = `constraint-popover-title-${participantId}`

  return (
    // Voile : un clic dessus (hors carte) ferme. Ne masque pas le tirage (opacité très faible en CSS).
    <div className="popover-scrim" onMouseDown={onClose}>
      <div
        ref={cardRef}
        className="constraint-popover"
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        // Empêche la propagation au voile : un clic DANS la carte ne ferme pas.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="popover-head">
          <span id={titleId} className="popover-title">
            Indispos de {participantName}
          </span>
          <button type="button" className="popover-close" aria-label="Fermer" onClick={onClose}>
            ✕
          </button>
        </div>
        <UnavailabilityPanel participantId={participantId} />
      </div>
    </div>
  )
}
