'use client'

import { Fragment, useRef, useState } from 'react'
import { useParticipants } from '@/lib/store/participants-store'
import { parseNames } from '@/lib/store/parse-names'
import { PassphrasePrompt } from '@/components/PassphrasePrompt'
import { UnavailabilityPanel } from '@/components/UnavailabilityPanel'

// Carte « Participants » interactive (Story 2.1 + 2.2). Tout en français (NFR4), charte CSS existante.
// UI pure : aucune écriture directe — tout passe par le store (AD-11).
// Ajout MULTIPLE (`,`/`;`) + tableau Nom / Actif / Actions, colonnes Actif/Actions INTERACTIVES (2.2) :
// toggle actif, renommage inline, suppression confirmée.
export function ParticipantsCard() {
  const {
    participants,
    addParticipants,
    toggleActive,
    renameParticipant,
    deleteParticipant,
    retryParticipant,
    unavailabilities,
    error,
    clearError,
  } = useParticipants()
  const [value, setValue] = useState('')

  // État d'édition inline LOCAL au composant (jamais dans le store) — Story 2.2.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // Panneau d'indispos ouvert (un seul à la fois) — état LOCAL, jamais dans le store (Story 2.3).
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Évite qu'un blur déclenché par Échap ne committe le renommage annulé.
  const skipBlurRef = useRef(false)

  // Bouton actif uniquement si la saisie contient au moins un nom non vide après découpe (AC5 de 2.1).
  const hasNames = parseNames(value).length > 0

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hasNames) return
    addParticipants(value)
    setValue('') // champ vidé après ajout.
  }

  function startEdit(id: string, currentName: string) {
    skipBlurRef.current = false
    setEditingId(id)
    setDraft(currentName)
  }

  function cancelEdit() {
    skipBlurRef.current = true // le blur consécutif à l'unmount ne doit pas committer.
    setEditingId(null)
    setDraft('')
  }

  function commitEdit() {
    if (skipBlurRef.current) {
      skipBlurRef.current = false
      return
    }
    if (editingId === null) return
    renameParticipant(editingId, draft) // no-op si vide ou identique (géré par le store).
    setEditingId(null)
    setDraft('')
  }

  function onEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  function onDelete(id: string, name: string) {
    if (window.confirm(`Supprimer « ${name} » ? Ses indisponibilités seront aussi supprimées.`)) {
      deleteParticipant(id)
    }
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
        <p className="card-empty">Ajoute ton premier participant ci-dessus pour lancer la roue.</p>
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
            {participants.map((p) => {
              const indispoCount = unavailabilities.filter((u) => u.participant_id === p.id).length
              const expanded = expandedId === p.id
              return (
              <Fragment key={p.id}>
              <tr
                className={[
                  'participant-row',
                  p.active ? '' : 'inactif',
                  p.pending ? 'pending' : '',
                  p.failed ? 'failed' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <td className="participant-name">
                  {editingId === p.id ? (
                    <input
                      className="text-input rename-input"
                      type="text"
                      value={draft}
                      autoFocus
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onEditKeyDown}
                      onBlur={commitEdit}
                      aria-label={`Renommer ${p.name}`}
                    />
                  ) : (
                    p.name
                  )}
                </td>
                <td className="participant-active">
                  <input
                    type="checkbox"
                    role="switch"
                    className="toggle-active"
                    checked={p.active}
                    disabled={p.pending}
                    onChange={() => toggleActive(p.id)}
                    aria-label={`${p.active ? 'Désactiver' : 'Activer'} ${p.name}`}
                  />
                </td>
                <td className="participant-actions">
                  {p.failed ? (
                    <button
                      type="button"
                      className="btn-secondary btn-retry"
                      onClick={() => retryParticipant(p.id)}
                    >
                      Réessayer
                    </button>
                  ) : (
                    editingId !== p.id && (
                      <span className="row-actions">
                        <button
                          type="button"
                          className="btn-secondary btn-row"
                          aria-expanded={expanded}
                          onClick={() => setExpandedId(expanded ? null : p.id)}
                        >
                          Indispos
                          {indispoCount > 0 && <span className="indispo-badge">{indispoCount}</span>}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-row"
                          disabled={p.pending}
                          onClick={() => startEdit(p.id, p.name)}
                        >
                          Renommer
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-row btn-delete"
                          disabled={p.pending}
                          onClick={() => onDelete(p.id, p.name)}
                        >
                          Supprimer
                        </button>
                      </span>
                    )
                  )}
                </td>
              </tr>
              {expanded && (
                <tr className="indispo-row">
                  <td colSpan={3}>
                    <UnavailabilityPanel participantId={p.id} />
                  </td>
                </tr>
              )}
              </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
