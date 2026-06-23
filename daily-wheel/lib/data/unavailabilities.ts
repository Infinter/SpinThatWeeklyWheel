import { supabasePublic } from '@/lib/supabase/client'
import { WriteError } from '@/lib/data/write-error'

// SEUL point de contact Supabase pour la table `unavailabilities` (AD-11). Copie structurelle
// de `participants.ts` : lecture via la clé low-privilege (AD-7), écriture via le proxy serveur
// `/api/unavailabilities` (AD-7), JAMAIS client-direct. Importe la taxonomie AD-17 partagée
// depuis `write-error.ts` (pas de dépendance latérale vers `participants.ts`).

export type Unavailability = {
  id: string
  participant_id: string
  kind: 'day' | 'range'
  date1: string // YMD
  date2: string | null // YMD pour une plage ; null pour un jour
  // Timestamp sérialisé en chaîne ISO par PostgREST — JAMAIS typé `Date` (convention dates).
  updated_at: string
}

export async function fetchUnavailabilities(): Promise<Unavailability[]> {
  const { data, error } = await supabasePublic.from('unavailabilities').select('*')
  if (error) throw error
  return data ?? []
}

// PAS d'`update` : on ajoute et on supprime unitairement, jamais d'édition (epics.md#Story-2.3).
export type UnavailabilityWriteOp = 'insert' | 'delete'
export type UnavailabilityWritePayload = {
  id?: string
  data?: { participant_id: string; kind: 'day' | 'range'; date1: string; date2: string | null }
}

// Envoie une écriture au proxy serveur, gardée par la passphrase d'équipe (header x-team-passphrase).
// En cas d'échec, lève un `WriteError` typé selon la taxonomie (AD-17). Copie de `writeParticipant`.
export async function writeUnavailability(
  op: UnavailabilityWriteOp,
  payload: UnavailabilityWritePayload,
  passphrase: string,
): Promise<unknown> {
  const res = await fetch('/api/unavailabilities', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-team-passphrase': passphrase },
    body: JSON.stringify({ op, ...payload }),
  })
  if (!res.ok) {
    let message = `Échec d'écriture (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = String(body.error)
    } catch {
      // corps non-JSON : on garde le message générique.
    }
    throw new WriteError(res.status, message)
  }
  return res.json()
}
