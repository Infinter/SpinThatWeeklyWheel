import { supabasePublic } from '@/lib/supabase/client'
import { WriteError } from '@/lib/data/write-error'
import type { ConfirmedRollPayload } from '@/lib/ui/confirmed-roll'

// SEUL point de contact Supabase pour la table `confirmed_rolls` (AD-11). Journal d'audit MULTI-LIGNES
// (Story 5.10), calqué sur `lib/data/rotation-state.ts` pour l'écriture. Lecture via la clé low-privilege
// (AD-7) ; écriture via le proxy serveur `/api/confirmed_rolls` (AD-7/AD-14), gardé par la passphrase
// d'équipe (AD-8), JAMAIS client-direct. Taxonomie AD-17 partagée depuis `write-error.ts`.

// Ligne telle que renvoyée par PostgREST (confirmed_at = chaîne ISO, jamais typé `Date` — convention dates).
export type ConfirmedRoll = ConfirmedRollPayload & { confirmed_at: string }

// Lecture LECTURE-SEULE du journal. NON câblée à l'UI dans la Story 5.10 (journal passif) : utilisée par les
// tests d'intégration pour vérifier l'écriture round-trip. Triée par confirmed_at pour un ordre stable.
export async function fetchConfirmedRolls(): Promise<ConfirmedRoll[]> {
  const { data, error } = await supabasePublic
    .from('confirmed_rolls')
    .select('*')
    .order('confirmed_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as ConfirmedRoll[]
}

// Envoie un upsert au proxy serveur, gardé par la passphrase d'équipe (header x-team-passphrase). En cas
// d'échec, lève un `WriteError` typé selon la taxonomie (AD-17). Structure calquée sur `writeRotationState`
// (corps `{ op: 'upsert', data }`). La clé composite (seed,date) est résolue côté serveur (onConflict).
export async function writeConfirmedRoll(
  payload: ConfirmedRollPayload,
  passphrase: string,
): Promise<unknown> {
  const res = await fetch('/api/confirmed_rolls', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-team-passphrase': passphrase },
    body: JSON.stringify({ op: 'upsert', data: payload }),
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
