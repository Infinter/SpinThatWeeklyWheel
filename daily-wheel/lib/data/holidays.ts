import { supabasePublic } from '@/lib/supabase/client'
import { WriteError } from '@/lib/data/write-error'

// SEUL point de contact Supabase pour la table `holidays` (AD-11). Copie structurelle de
// `group-exclusions.ts` : lecture via la clé low-privilege (AD-7), écriture via le proxy serveur
// `/api/holidays` (AD-7), JAMAIS client-direct. Taxonomie AD-17 partagée depuis `write-error.ts`.
// Feature NEUVE (FR7) — aucune parité legacy. Règle métier = unicité de `date` (contrainte DB).

export type Holiday = {
  id: string
  date: string // YMD (unique)
  label: string
  // Timestamp sérialisé en chaîne ISO par PostgREST — JAMAIS typé `Date` (convention dates).
  updated_at: string
}

export async function fetchHolidays(): Promise<Holiday[]> {
  const { data, error } = await supabasePublic.from('holidays').select('*')
  if (error) throw error
  return data ?? []
}

// PAS d'`update` : on ajoute et on supprime des jours fériés unitairement, jamais d'édition
// (epics.md#Story-3.2).
export type HolidayWriteOp = 'insert' | 'delete'
export type HolidayWritePayload = {
  id?: string
  data?: { date: string; label: string }
}

// Envoie une écriture au proxy serveur, gardée par la passphrase d'équipe (header x-team-passphrase).
// En cas d'échec, lève un `WriteError` typé selon la taxonomie (AD-17). Copie de `writeGroupExclusion`.
export async function writeHoliday(
  op: HolidayWriteOp,
  payload: HolidayWritePayload,
  passphrase: string,
): Promise<unknown> {
  const res = await fetch('/api/holidays', {
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
