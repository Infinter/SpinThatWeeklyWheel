'use client'

import { useParticipants } from '@/lib/store/participants-store'

// Bandeau « protection annoncée » (Story 5.1, UX-DR8). Pilule discrète de la barre supérieure, visible
// dès le chargement : annonce que l'équipe est protégée et l'état de la session. UI PURE — lit `unlocked`
// du store (miroir lecture-seule de la passphrase en sessionStorage). N'AFFECTE PAS la saisie : celle-ci
// reste paresseuse via `.passphrase-prompt` (PassphrasePrompt), déclenchée au premier write.
export function ProtectionBanner() {
  const { unlocked } = useParticipants()
  return (
    <span className="lock">
      🔒 Équipe protégée · <b>{unlocked ? 'déverrouillée' : 'verrouillée'}</b>
    </span>
  )
}
