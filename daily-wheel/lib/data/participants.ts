import { supabasePublic } from '@/lib/supabase/client'

// `lib/data/` est le SEUL point de contact Supabase (AD-11) : aucun composant/hook ne fait `.from(...)`.
// Lectures via la clé low-privilege (AD-7) ; les écritures passeront par `app/api/` (Story 1.4).

export type Participant = {
  id: string
  name: string
  active: boolean
  // Timestamps sérialisés en chaîne ISO par PostgREST — JAMAIS typés `Date`,
  // jamais convertis via new Date()/toISOString() (convention dates, AD-Consistency).
  created_at: string
  updated_at: string
}

export async function fetchParticipants(): Promise<Participant[]> {
  const { data, error } = await supabasePublic.from('participants').select('*')
  if (error) throw error
  return data ?? []
}

// ── Écritures : routées via le proxy serveur `/api/participants` (AD-7), JAMAIS client-direct.

// Classes d'erreur d'écriture (AD-17) — guident le futur traitement optimiste (1.5) :
//   auth       → re-prompt passphrase, pas de retry, pas de rollback silencieux
//   validation → rollback de l'optimiste
//   conflict   → re-hydrater puis ré-appliquer (AD-16)
//   transient  → retry possible
export type WriteErrorKind = 'auth' | 'validation' | 'conflict' | 'transient'

export class WriteError extends Error {
  readonly kind: WriteErrorKind
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'WriteError'
    this.status = status
    this.kind = writeErrorFromStatus(status)
  }
}

// Fonction PURE : mappe un statut HTTP vers une classe d'erreur (AD-17). Testée unitairement.
export function writeErrorFromStatus(status: number): WriteErrorKind {
  if (status === 401) return 'auth'
  if (status === 400) return 'validation'
  if (status === 409) return 'conflict'
  // 5xx et tout statut inattendu : prudence → transitoire (retry possible).
  return 'transient'
}

export type WriteOp = 'insert' | 'update' | 'delete'
export type WritePayload = { id?: string; data?: Partial<Pick<Participant, 'name' | 'active'>> }

// Envoie une écriture au proxy serveur, gardée par la passphrase d'équipe (header x-team-passphrase).
// En cas d'échec, lève un `WriteError` typé selon la taxonomie (AD-17).
export async function writeParticipant(
  op: WriteOp,
  payload: WritePayload,
  passphrase: string,
): Promise<unknown> {
  const res = await fetch('/api/participants', {
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
