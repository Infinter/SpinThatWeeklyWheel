import { supabasePublic } from '@/lib/supabase/client'
import { WriteError } from '@/lib/data/write-error'

// SEUL point de contact Supabase pour la table `group_exclusions` (AD-11). Copie structurelle
// de `unavailabilities.ts` : lecture via la clé low-privilege (AD-7), écriture via le proxy
// serveur `/api/group-exclusions` (AD-7), JAMAIS client-direct. Taxonomie AD-17 partagée
// importée depuis `write-error.ts`.

export type GroupExclusion = {
  id: string
  day_of_week: number // 0=dimanche … 6=samedi
  every_n: number // périodicité en semaines (≥ 1)
  ref_date: string // YMD
  // Timestamp sérialisé en chaîne ISO par PostgREST — JAMAIS typé `Date` (convention dates).
  updated_at: string
}

export async function fetchGroupExclusions(): Promise<GroupExclusion[]> {
  const { data, error } = await supabasePublic.from('group_exclusions').select('*')
  if (error) throw error
  return data ?? []
}

// PAS d'`update` : on ajoute et on supprime des règles unitairement, jamais d'édition
// (epics.md#Story-3.1 ; parité legacy qui n'édite pas une règle).
export type GroupExclusionWriteOp = 'insert' | 'delete'
export type GroupExclusionWritePayload = {
  id?: string
  data?: { day_of_week: number; every_n: number; ref_date: string }
}

// Envoie une écriture au proxy serveur, gardée par la passphrase d'équipe (header x-team-passphrase).
// En cas d'échec, lève un `WriteError` typé selon la taxonomie (AD-17). Copie de `writeUnavailability`.
export async function writeGroupExclusion(
  op: GroupExclusionWriteOp,
  payload: GroupExclusionWritePayload,
  passphrase: string,
): Promise<unknown> {
  const res = await fetch('/api/group-exclusions', {
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
