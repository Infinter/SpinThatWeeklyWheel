'use client'

import { useParticipants } from '@/lib/store/participants-store'
import { buildColorIndexMap, colorForIndex, initialOf } from '@/lib/ui/participant-colors'

// Résumé d'équipe cliquable (Story 5.9, `roster-chip`, UX-DR14). Une pilule par participant, présente à
// l'étape ③ Spin. Avatar = initiale + couleur STABLE partagée roue/timeline (contrat 5.3, actifs
// uniquement) ; inactifs grisés + prénom barré + « · inactif ». Cliquer un chip ouvre le popover
// d'indisponibilités du participant (`onOpen`). UI pure : aucune écriture directe (AD-11). Tout en
// français (NFR4).
export function RosterChips({ onOpen }: { onOpen: (participantId: string) => void }) {
  const { participants } = useParticipants()
  if (participants.length === 0) return null

  // Index de couleur des ACTIFS dans l'ordre du store = exactement la base partagée roue/timeline.
  const colorIndex = buildColorIndexMap(participants.filter((p) => p.active))

  return (
    <div className="roster" aria-label="Résumé d'équipe — édition rapide des indisponibilités">
      {participants.map((p) => {
        const idx = colorIndex.get(p.id)
        const isActive = idx !== undefined
        return (
          <button
            key={p.id}
            type="button"
            className={isActive ? 'chip' : 'chip out'}
            onClick={() => onOpen(p.id)}
            aria-label={`Modifier les indisponibilités de ${p.name}`}
          >
            <span
              className="chip-av"
              aria-hidden="true"
              style={{ background: isActive ? colorForIndex(idx) : 'var(--text-muted)' }}
            >
              {initialOf(p.name)}
            </span>
            <span className="chip-nm">{p.name}</span>
            {!isActive && <span className="chip-state">· inactif</span>}
          </button>
        )
      })}
    </div>
  )
}
