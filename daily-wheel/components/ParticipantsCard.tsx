'use client'

import { useState } from 'react'
import { useParticipants } from '@/lib/store/participants-store'
import { PassphrasePrompt } from '@/components/PassphrasePrompt'

// Carte « Participants » interactive (Story 1.5, AC6). Tout en français (NFR4), charte CSS existante.
// UI pure : aucune écriture directe — tout passe par le store (AD-11).
export function ParticipantsCard() {
  const { participants, addParticipant, retryParticipant, error, clearError } = useParticipants()
  const [name, setName] = useState('')

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    addParticipant(trimmed)
    setName('') // champ vidé après ajout (AC6).
  }

  return (
    <section className="card" aria-labelledby="card-participants">
      <h2 id="card-participants" className="card-title">
        Participants
      </h2>

      <form className="participant-add" onSubmit={onSubmit}>
        <input
          className="text-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du participant"
          aria-label="Nom du participant"
        />
        <button type="submit" disabled={!name.trim()}>
          Ajouter
        </button>
      </form>

      <PassphrasePrompt />

      {error && (
        <p className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="btn-link" onClick={clearError}>
            Fermer
          </button>
        </p>
      )}

      {participants.length === 0 ? (
        <p className="card-empty">Aucun participant pour le moment.</p>
      ) : (
        <ul className="participant-list">
          {participants.map((p) => (
            <li
              key={p.id}
              className={[
                'participant-item',
                p.active ? '' : 'inactif',
                p.pending ? 'pending' : '',
                p.failed ? 'failed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="participant-name">{p.name}</span>
              {p.failed && (
                <button
                  type="button"
                  className="btn-secondary btn-retry"
                  onClick={() => retryParticipant(p.id)}
                >
                  Réessayer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
