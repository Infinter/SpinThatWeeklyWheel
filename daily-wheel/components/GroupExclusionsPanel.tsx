'use client'

import { useState } from 'react'
import { useParticipants } from '@/lib/store/participants-store'
import { formatDateFr } from '@/lib/format/date-fr'

// Panneau repliable « Exclusions de groupe » (Story 3.1, UX-DR4/UX-DR5, FR6), monté dans la carte
// Options. UI pure : aucune écriture directe — tout passe par le store (AD-11). Tout en français (NFR4).
// Formulaire : jour de semaine + fréquence (toutes les N semaines) + date de référence + « ＋ Ajouter ».
// Liste de tags supprimables (✕) + badge de comptage. La validation (every_n ≥ 1, réf. sur le bon jour)
// est portée par le store (AC1/AC5) ; on affiche l'erreur renvoyée.

// Index 0 = Dimanche (parité legacy DAY_NAMES L636 / Date.getDay()).
const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

export function GroupExclusionsPanel() {
  const { groupExclusions, addGroupExclusion, removeGroupExclusion } = useParticipants()

  const [open, setOpen] = useState(false)
  const [dayOfWeek, setDayOfWeek] = useState(1) // lundi par défaut
  const [everyN, setEveryN] = useState(2) // toutes les 2 semaines (défaut legacy)
  const [refDate, setRefDate] = useState('')

  function onAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!refDate) return
    addGroupExclusion({ day_of_week: dayOfWeek, every_n: everyN, ref_date: refDate })
    // Reset de la date (le store gère la validation et les erreurs éventuelles).
    setRefDate('')
  }

  return (
    <div className="group-excl">
      <button
        type="button"
        className="group-excl-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={['group-excl-arrow', open ? 'open' : ''].filter(Boolean).join(' ')} aria-hidden="true">
          ▶
        </span>
        <span className="group-excl-toggle-label">Jours exclus (groupe)</span>
        {groupExclusions.length > 0 && (
          <span className="group-excl-toggle-badge">{groupExclusions.length}</span>
        )}
      </button>

      {open && (
        <div className="group-excl-panel">
          <div className="group-excl-panel-title">Exclusions récurrentes pour toute l’équipe</div>

          <form className="group-excl-form" onSubmit={onAdd}>
            <label htmlFor="excl-dow">Jour :</label>
            <select
              id="excl-dow"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              aria-label="Jour de semaine exclu"
            >
              {DAY_NAMES.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>

            <label htmlFor="excl-every">toutes les</label>
            <input
              id="excl-every"
              type="number"
              min={1}
              max={52}
              value={everyN}
              onChange={(e) => setEveryN(parseInt(e.target.value, 10))}
              aria-label="Périodicité en semaines"
            />
            <span className="group-excl-form-unit">semaine(s)</span>

            <label htmlFor="excl-ref">à partir du :</label>
            <input
              id="excl-ref"
              type="date"
              value={refDate}
              onChange={(e) => setRefDate(e.target.value)}
              aria-label="Date de référence"
            />

            <button type="submit">＋ Ajouter</button>
          </form>

          <div className="group-excl-tags">
            {groupExclusions.length === 0 ? (
              <span className="group-excl-empty">Aucune règle définie.</span>
            ) : (
              groupExclusions
                .slice()
                .sort((a, b) => a.ref_date.localeCompare(b.ref_date))
                .map((g) => {
                  const freq = g.every_n === 1 ? 'Chaque' : `1/${g.every_n}`
                  const label = `${freq} ${DAY_NAMES[g.day_of_week]} (réf. ${formatDateFr(g.ref_date)})`
                  return (
                    <span
                      key={g.id}
                      className={['group-excl-tag', g.pending ? 'pending' : '', g.failed ? 'failed' : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {label}{' '}
                      <button
                        type="button"
                        disabled={g.pending}
                        onClick={() => removeGroupExclusion(g.id)}
                        aria-label={`Supprimer la règle ${label}`}
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
