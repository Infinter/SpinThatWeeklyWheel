import type { Participant } from '@/lib/data/participants'

// Réducteur de réconciliation PUR (Story 1.5, AC1/AC10). Applique un événement Realtime
// `postgres_changes` à la copie de travail locale (AD-4 : Supabase reste la source canonique).
//
// Invariants protégés par tests/reconcile.unit.test.ts :
//   - AD-15 : un écho de notre propre écriture (même `id` ET même `updated_at`) est ignoré.
//   - AD-16 : Last-Write-Wins ordonné par `updated_at` (chaîne ISO comparable lexicographiquement).
//
// AUCUNE dépendance React / Supabase / `Date` : fonction pure, testable sans réseau ni env.

// Événement minimal mappé depuis le payload `postgres_changes`
// (`payload.eventType` / `payload.new` / `payload.old`).
export type ParticipantChangeEvent =
  | { eventType: 'INSERT'; new: Participant }
  | { eventType: 'UPDATE'; new: Participant }
  | { eventType: 'DELETE'; old: { id: string } }

export function reconcileParticipants(
  state: Participant[],
  event: ParticipantChangeEvent,
): Participant[] {
  switch (event.eventType) {
    case 'DELETE': {
      const id = event.old?.id
      if (!id) return state
      const next = state.filter((row) => row.id !== id)
      // Pas de changement → on conserve la même référence (évite un re-render inutile).
      return next.length === state.length ? state : next
    }

    case 'INSERT':
    case 'UPDATE': {
      const incoming = event.new
      if (!incoming) return state

      const idx = state.findIndex((row) => row.id === incoming.id)

      // Ligne inconnue → upsert (ajout). Couvre aussi un UPDATE arrivé avant l'INSERT.
      if (idx === -1) return [...state, incoming]

      const local = state[idx]

      // AD-15 : même id ET même updated_at → écho de notre propre écriture, déjà appliqué → ignorer.
      if (local.updated_at === incoming.updated_at) return state

      // AD-16 : Last-Write-Wins. L'entrant n'écrase que s'il est ≥ au local (ici : strictement plus récent).
      if (incoming.updated_at < local.updated_at) return state

      const next = state.slice()
      next[idx] = incoming
      return next
    }

    default:
      return state
  }
}
