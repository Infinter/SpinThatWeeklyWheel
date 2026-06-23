import { supabasePublic } from '@/lib/supabase/client'
import { WriteError } from '@/lib/data/write-error'

// SEUL point de contact Supabase pour la table `settings` (AD-11). Patron SINGLETON / UPSERT
// (≠ les 5 tables-liste) : une ligne unique `id = 'singleton'` (convention spine « settings = upsert »).
// Lecture via la clé low-privilege (AD-7) ; écriture via le proxy serveur `/api/settings` (AD-7),
// JAMAIS client-direct. Taxonomie AD-17 partagée depuis `write-error.ts`. Feature NEUVE (FR9/FR10).

export type Setting = {
  id: string // toujours 'singleton'
  skip_weekends: boolean
  start_date: string | null // YMD local, nullable (pas de date de début explicite)
  // Timestamp sérialisé en chaîne ISO par PostgREST — JAMAIS typé `Date` (convention dates).
  updated_at: string
}

// La table est VIDE au départ (aucune ligne semée par la migration) → `maybeSingle()` renvoie `null`
// sans erreur. Le store matérialise alors un défaut (DEFAULT_SETTING) et la 1ʳᵉ écriture est un upsert.
export async function fetchSettings(): Promise<Setting | null> {
  const { data, error } = await supabasePublic
    .from('settings')
    .select('*')
    .eq('id', 'singleton')
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

// Patch PARTIEL : on n'envoie que les colonnes changées. Op UNIQUE `upsert` (≠ insert/delete) :
// settings ne se crée/supprime pas, il se met à jour (insert si absent, update sinon).
export type SettingWritePayload = {
  skip_weekends?: boolean
  start_date?: string | null
}

// Envoie un upsert au proxy serveur, gardé par la passphrase d'équipe (header x-team-passphrase).
// En cas d'échec, lève un `WriteError` typé selon la taxonomie (AD-17). Structure calquée sur
// `writeHoliday`, mais corps `{ op: 'upsert', data }` (l'id 'singleton' est forcé côté serveur).
export async function writeSettings(
  payload: SettingWritePayload,
  passphrase: string,
): Promise<unknown> {
  const res = await fetch('/api/settings', {
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
