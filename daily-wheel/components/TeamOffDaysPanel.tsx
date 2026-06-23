'use client'

import { useState } from 'react'
import { useParticipants } from '@/lib/store/participants-store'
import { formatDateFr } from '@/lib/format/date-fr'

// Panneau repliable « Jours off d'équipe » (Story 3.3, UX-DR4/UX-DR5, FR8), monté dans la carte Options.
// Hybride de HolidaysPanel (toggle + badge + montage Options) et UnavailabilityPanel (bascule Jour/Plage).
// UI pure : aucune écriture directe — tout passe par le store (AD-11). Tout en français (NFR4).
// Formulaire : type (Jour/Plage) + date1 (+ date2 si plage) + libellé OPTIONNEL + « ＋ Ajouter ». Liste de
// tags supprimables (✕), triés par date1, + badge de comptage. La validation (date1 requis, plage
// date2 >= date1) est portée par le store (AC5) ; on affiche l'erreur renvoyée. Feature NEUVE (FR8).

export function TeamOffDaysPanel() {
  const { teamOffDays, addTeamOffDay, removeTeamOffDay } = useParticipants()

  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'day' | 'range'>('day')
  const [date1, setDate1] = useState('')
  const [date2, setDate2] = useState('')
  const [label, setLabel] = useState('')

  function onAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!date1) return
    addTeamOffDay({ kind, date1, date2: kind === 'range' ? date2 : null, label })
    // Reset des champs (le store gère la validation et les erreurs éventuelles ; le libellé est facultatif).
    setDate1('')
    setDate2('')
    setLabel('')
  }

  return (
    <div className="team-off">
      <button
        type="button"
        className="team-off-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={['team-off-arrow', open ? 'open' : ''].filter(Boolean).join(' ')} aria-hidden="true">
          ▶
        </span>
        <span className="team-off-toggle-label">Jours off d’équipe</span>
        {teamOffDays.length > 0 && <span className="team-off-toggle-badge">{teamOffDays.length}</span>}
      </button>

      {open && (
        <div className="team-off-panel">
          <div className="team-off-panel-title">Fermetures et ponts communs à toute l’équipe</div>

          <form className="team-off-form" onSubmit={onAdd}>
            <label htmlFor="team-off-kind">Type :</label>
            <select
              id="team-off-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'day' | 'range')}
              aria-label="Type de jour off"
            >
              <option value="day">Jour</option>
              <option value="range">Plage</option>
            </select>

            <label htmlFor="team-off-date1">{kind === 'range' ? 'Du :' : 'Date :'}</label>
            <input
              id="team-off-date1"
              type="date"
              value={date1}
              onChange={(e) => setDate1(e.target.value)}
              aria-label={kind === 'range' ? 'Date de début' : 'Date'}
            />

            {kind === 'range' && (
              <>
                <label htmlFor="team-off-date2">au :</label>
                <input
                  id="team-off-date2"
                  type="date"
                  value={date2}
                  onChange={(e) => setDate2(e.target.value)}
                  aria-label="Date de fin"
                />
              </>
            )}

            <input
              id="team-off-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Libellé optionnel (ex. Pont de l’Ascension)"
              aria-label="Libellé optionnel du jour off"
            />

            <button type="submit">＋ Ajouter</button>
          </form>

          <div className="team-off-tags">
            {teamOffDays.length === 0 ? (
              <span className="team-off-empty">Aucun jour off défini.</span>
            ) : (
              teamOffDays
                .slice()
                .sort((a, b) => a.date1.localeCompare(b.date1))
                .map((o) => {
                  const dates =
                    o.kind === 'day'
                      ? formatDateFr(o.date1)
                      : `${formatDateFr(o.date1)} → ${o.date2 ? formatDateFr(o.date2) : ''}`
                  const text = [dates, o.label].filter(Boolean).join(' — ')
                  return (
                    <span
                      key={o.id}
                      className={['team-off-tag', o.pending ? 'pending' : '', o.failed ? 'failed' : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {text}{' '}
                      <button
                        type="button"
                        disabled={o.pending}
                        onClick={() => removeTeamOffDay(o.id)}
                        aria-label={`Supprimer le jour off ${text}`}
                      >
                        ✕
                      </button>
                    </span>
                  )
                })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
