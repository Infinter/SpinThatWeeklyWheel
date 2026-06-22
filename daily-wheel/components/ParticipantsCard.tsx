'use client'

import { useState } from 'react'
import { useParticipants } from '@/lib/store/participants-store'
import { parseNames } from '@/lib/store/parse-names'
import { PassphrasePrompt } from '@/components/PassphrasePrompt'

// Carte « Participants » interactive (Story 2.1). Tout en français (NFR4), charte CSS existante.
// UI pure : aucune écriture directe — tout passe par le store (AD-11).
// Ajout MULTIPLE (`,`/`;`) + liste en tableau Nom / Actif / Actions.
// ⚠️ Toggle actif, renommage, suppression = Story 2.2 (hors-scope ici).
export function ParticipantsCard() {
  const { participants, addParticipants, retryParticipant, error, clearError } = useParticipants()
  const [value, setValue] = useState('')

  // Bouton actif uniquement si la saisie contient au moins un nom non vide après découpe (AC5).
  const hasNames = parseNames(value).length > 0

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hasNames) return
    addParticipants(value)
    setValue('') // champ vidé après ajout (AC5).
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
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Alice, Bob ; Chloé"
          aria-label="Noms des participants (séparés par une virgule ou un point-virgule)"
        />
        <button type="submit" disabled={!hasNames}>
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
        <table className="participant-table">
          <thead>
            <tr>
              <th scope="col">Nom</th>
              <th scope="col">Actif</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr
                key={p.id}
                className={[
                  'participant-row',
                  p.active ? '' : 'inactif',
                  p.pending ? 'pending' : '',
                  p.failed ? 'failed' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <td className="participant-name">{p.name}</td>
                {/* Indicateur lecture seule ; le toggle interactif arrive en Story 2.2. */}
                <td className="participant-active">
                  <span className={p.active ? 'badge-active' : 'badge-inactive'}>
                    {p.active ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="participant-actions">
                  {p.failed && (
                    <button
                      type="button"
                      className="btn-secondary btn-retry"
                      onClick={() => retryParticipant(p.id)}
                    >
                      Réessayer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
