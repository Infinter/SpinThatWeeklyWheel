import { supabasePublic } from '@/lib/supabase/client'
import { WriteError } from '@/lib/data/write-error'

// SEUL point de contact Supabase pour la table `team_off_days` (AD-11). Hybride de `unavailabilities.ts`
// (structure jour/plage `kind`/`date1`/`date2`) et `holidays.ts` (niveau-équipe + `label`). Lecture via la
// clé low-privilege (AD-7), écriture via le proxy serveur `/api/team-off-days` (AD-7), JAMAIS client-direct.
// Taxonomie AD-17 partagée depuis `write-error.ts`. Feature NEUVE (FR8) — aucune parité legacy.
// Différences vs holidays : `label` NULLABLE (≠ not null) et AUCUNE contrainte d'unicité (≠ date unique).

export type TeamOffDay = {
  id: string
  kind: 'day' | 'range'
  date1: string // YMD
  date2: string | null // YMD pour une plage ; null pour un jour
  label: string | null // libellé OPTIONNEL (colonne nullable)
  // Timestamp sérialisé en chaîne ISO par PostgREST — JAMAIS typé `Date` (convention dates).
  updated_at: string
}

export async function fetchTeamOffDays(): Promise<TeamOffDay[]> {
  const { data, error } = await supabasePublic.from('team_off_days').select('*')
  if (error) throw error
  return data ?? []
}

// PAS d'`update` : on ajoute et on supprime des jours off unitairement, jamais d'édition (epics.md#Story-3.3).
export type TeamOffDayWriteOp = 'insert' | 'delete'
export type TeamOffDayWritePayload = {
  id?: string
  data?: { kind: 'day' | 'range'; date1: string; date2: string | null; label: string | null }
}

// Envoie une écriture au proxy serveur, gardée par la passphrase d'équipe (header x-team-passphrase).
// En cas d'échec, lève un `WriteError` typé selon la taxonomie (AD-17). Copie de `writeUnavailability`.
export async function writeTeamOffDay(
  op: TeamOffDayWriteOp,
  payload: TeamOffDayWritePayload,
  passphrase: string,
): Promise<unknown> {
  const res = await fetch('/api/team-off-days', {
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
