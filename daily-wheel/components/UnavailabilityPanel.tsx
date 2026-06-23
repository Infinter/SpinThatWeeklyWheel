'use client'

import { useState } from 'react'
import { useParticipants } from '@/lib/store/participants-store'
import { formatDateFr } from '@/lib/format/date-fr'

// Panneau repliable des indisponibilités d'UN participant (Story 2.3, UX-DR4/UX-DR6, FR5).
// UI pure : aucune écriture directe — tout passe par le store (AD-11). Tout en français (NFR4).
// Formulaire : type (Jour/Plage) + date1 (+ date2 si plage) + « ＋ Ajouter ». Liste de tags triés + ✕.
export function UnavailabilityPanel({ participantId }: { participantId: string }) {
  const { unavailabilities, addUnavailability, removeUnavailability } = useParticipants()

  const [kind, setKind] = useState<'day' | 'range'>('day')
  const [date1, setDate1] = useState('')
  const [date2, setDate2] = useState('')

  // Indispos de ce participant, triées par date1 (localeCompare — parité legacy L926).
  const rows = unavailabilities
    .filter((u) => u.participant_id === participantId)
    .slice()
    .sort((a, b) => a.date1.localeCompare(b.date1))

  function onAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!date1) return
    addUnavailability(participantId, { kind, date1, date2: kind === 'range' ? date2 : null })
    // Reset des inputs (le store gère la validation et les erreurs éventuelles).
    setDate1('')
    setDate2('')
  }

  return (
    <div className="indispo-panel">
      <div className="indispo-panel-title">Indisponibilités</div>

      <form className="indispo-form" onSubmit={onAdd}>
        <label htmlFor={`u-kind-${participantId}`}>Type :</label>
        <select
          id={`u-kind-${participantId}`}
          value={kind}
          onChange={(e) => setKind(e.target.value as 'day' | 'range')}
          aria-label="Type d’indisponibilité"
        >
          <option value="day">Jour</option>
          <option value="range">Plage</option>
        </select>

        <label htmlFor={`u-date1-${participantId}`}>{kind === 'range' ? 'Du :' : 'Date :'}</label>
        <input
          id={`u-date1-${participantId}`}
          type="date"
          value={date1}
          onChange={(e) => setDate1(e.target.value)}
          aria-label={kind === 'range' ? 'Date de début' : 'Date'}
        />

        {kind === 'range' && (
          <>
            <label htmlFor={`u-date2-${participantId}`}>au :</label>
            <input
              id={`u-date2-${participantId}`}
              type="date"
              value={date2}
              onChange={(e) => setDate2(e.target.value)}
              aria-label="Date de fin"
            />
          </>
        )}

        <button type="submit">＋ Ajouter</button>
      </form>

      <div className="indispo-tags">
        {rows.length === 0 ? (
          <span className="indispo-empty">Aucune indisponibilité enregistrée.</span>
        ) : (
          rows.map((u) => {
            const label =
              u.kind === 'day'
                ? formatDateFr(u.date1)
                : `${formatDateFr(u.date1)} → ${u.date2 ? formatDateFr(u.date2) : ''}`
            return (
              <span
                key={u.id}
                className={['indispo-tag', u.pending ? 'pending' : '', u.failed ? 'failed' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                {label}{' '}
                <button
                  type="button"
                  disabled={u.pending}
                  onClick={() => removeUnavailability(u.id)}
                  aria-label={`Supprimer l’indisponibilité ${label}`}
                >
                  ✕
                </button>
              </span>
            )
          })
        )}
      </div>
    </div>
  )
}
