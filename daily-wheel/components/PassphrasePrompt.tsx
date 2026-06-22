'use client'

import { useState } from 'react'
import { useParticipants } from '@/lib/store/participants-store'

// Saisie de la passphrase d'équipe (AD-8). Affiché paresseusement par le store (au 1er besoin)
// ou après un 401. La valeur n'est JAMAIS rendue en clair (type="password") ni loggée.
export function PassphrasePrompt() {
  const { passphraseNeeded, submitPassphrase, cancelPassphrase } = useParticipants()
  const [value, setValue] = useState('')

  if (!passphraseNeeded) return null

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    submitPassphrase(value)
    setValue('')
  }

  function onCancel() {
    setValue('')
    cancelPassphrase()
  }

  return (
    <form className="passphrase-prompt" onSubmit={onSubmit}>
      <label className="passphrase-label" htmlFor="team-passphrase">
        Passphrase d’équipe requise pour modifier la liste
      </label>
      <div className="passphrase-row">
        <input
          id="team-passphrase"
          className="text-input"
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Passphrase"
          autoFocus
        />
        <button type="submit">Valider</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  )
}
