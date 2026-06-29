import { supabasePublic } from '@/lib/supabase/client'
import { WriteError } from '@/lib/data/write-error'

// SEUL point de contact Supabase pour la table `rotation_state` (AD-11). Patron SINGLETON / UPSERT,
// calqué sur `lib/data/settings.ts` : une ligne unique `id = 'singleton'`. Lecture via la clé
// low-privilege (AD-7) ; écriture via le proxy serveur `/api/rotation_state` (AD-7/AD-14), gardé par la
// passphrase d'équipe (AD-8), JAMAIS client-direct. Taxonomie AD-17 partagée depuis `write-error.ts`.
// Story 5.6 (FR18, flag archi #2) : on persiste (graine + curseur + mode), pas le planning figé.

export type SpinMode = 'rotation-complete' | 'jour-le-jour'

export type RotationState = {
  id: string // toujours 'singleton'
  seed: number | null // null = aucune rotation tirée ; sinon entier uint32 (colonne bigint, JS-safe < 2^53)
  cursor: number // = revealedCount (jours déjà révélés)
  mode: SpinMode
  // Story 5.17 (fix décalage) : date d'ANCRAGE résolue du tirage (YMD text, anti-UTC). `null` = aucune
  // ancre persistée (rotation antérieure au fix / avant tout tirage) → le replay retombe sur le défaut.
  start_date: string | null
  // Timestamp sérialisé en chaîne ISO par PostgREST — JAMAIS typé `Date` (convention dates).
  updated_at: string
}

// La table est VIDE au départ (aucune ligne semée par la migration) → `maybeSingle()` renvoie `null`
// sans erreur. Le store matérialise alors un défaut (DEFAULT_ROTATION_STATE) et ne reprend AUCUNE
// rotation tant qu'aucun tirage n'a été persisté.
export async function fetchRotationState(): Promise<RotationState | null> {
  const { data, error } = await supabasePublic
    .from('rotation_state')
    .select('*')
    .eq('id', 'singleton')
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

// Patch PARTIEL : on n'envoie que les colonnes changées. Op UNIQUE `upsert` (≠ insert/delete) :
// rotation_state ne se crée/supprime pas, il se met à jour (insert si absent, update sinon).
export type RotationStateWritePayload = {
  seed?: number
  cursor?: number
  mode?: SpinMode
  start_date?: string // YMD ; date d'ancrage résolue du tirage (Story 5.17)
}

// Envoie un upsert au proxy serveur, gardé par la passphrase d'équipe (header x-team-passphrase).
// En cas d'échec, lève un `WriteError` typé selon la taxonomie (AD-17). Structure calquée sur
// `writeSettings` (corps `{ op: 'upsert', data }` ; l'id 'singleton' est forcé côté serveur).
export async function writeRotationState(
  payload: RotationStateWritePayload,
  passphrase: string,
): Promise<unknown> {
  const res = await fetch('/api/rotation_state', {
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
