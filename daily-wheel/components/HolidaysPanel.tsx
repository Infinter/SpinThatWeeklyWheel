'use client'

import { useState } from 'react'
import { useParticipants } from '@/lib/store/participants-store'
import { formatDateFr } from '@/lib/format/date-fr'

// Panneau repliable « Jours fériés » (Story 3.2, UX-DR4/UX-DR5, FR7), monté dans la carte Options.
// UI pure : aucune écriture directe — tout passe par le store (AD-11). Tout en français (NFR4).
// Formulaire : date + libellé + « ＋ Ajouter ». Liste de tags supprimables (✕), triés par date, + badge
// de comptage. La validation (date + libellé requis, doublon de date) est portée par le store (AC6) ;
// on affiche l'erreur renvoyée. Feature NEUVE (FR7) — aucune parité legacy.

export function HolidaysPanel() {
  const { holidays, addHoliday, removeHoliday } = useParticipants()

  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [label, setLabel] = useState('')

  function onAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!date || !label.trim()) return
    addHoliday({ date, label })
    // Reset des champs (le store gère la validation et les erreurs éventuelles).
    setDate('')
    setLabel('')
  }

  return (
    <div className="holidays">
      <button
        type="button"
        className="holidays-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={['holidays-arrow', open ? 'open' : ''].filter(Boolean).join(' ')} aria-hidden="true">
          ▶
        </span>
        <span className="holidays-toggle-label">Jours fériés</span>
        {holidays.length > 0 && <span className="holidays-toggle-badge">{holidays.length}</span>}
      </button>

      {open && (
        <div className="holidays-panel">
          <div className="holidays-panel-title">Jours fériés communs à toute l’équipe</div>

          <form className="holidays-form" onSubmit={onAdd}>
            <label htmlFor="holiday-date">Date :</label>
            <input
              id="holiday-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date du jour férié"
            />

            <label htmlFor="holiday-label">Libellé :</label>
            <input
              id="holiday-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex. Jour de l’An"
              aria-label="Libellé du jour férié"
            />

            <button type="submit">＋ Ajouter</button>
          </form>

          <div className="holidays-tags">
            {holidays.length === 0 ? (
              <span className="holidays-empty">Aucun jour férié — ajoute-en un si la rotation en croise.</span>
            ) : (
              holidays
                .slice()
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((h) => {
                  const text = `${formatDateFr(h.date)} — ${h.label}`
                  return (
                    <span
                      key={h.id}
                      className={['holidays-tag', h.pending ? 'pending' : '', h.failed ? 'failed' : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {text}{' '}
                      <button
                        type="button"
                        disabled={h.pending}
                        onClick={() => removeHoliday(h.id)}
                        aria-label={`Supprimer le jour férié ${text}`}
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
