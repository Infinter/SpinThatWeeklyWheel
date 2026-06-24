import type { Participant } from '@/lib/data/participants'
import type { Unavailability } from '@/lib/data/unavailabilities'
import type { GroupExclusion } from '@/lib/data/group-exclusions'
import type { Holiday } from '@/lib/data/holidays'
import type { TeamOffDay } from '@/lib/data/team-off-days'
import type { Setting } from '@/lib/data/settings'
import type { RotationState } from '@/lib/data/rotation-state'

// Réducteur de réconciliation PUR (Story 1.5, AC1/AC10 ; généralisé en Story 2.3, AC4).
// Applique un événement Realtime `postgres_changes` à la copie de travail locale
// (AD-4 : Supabase reste la source canonique).
//
// Invariants protégés par tests/reconcile.unit.test.ts (+ unavailabilities-reducer.unit.test.ts) :
//   - AD-15 : un écho de notre propre écriture (même `id` ET même `updated_at`) est ignoré.
//   - AD-16 : Last-Write-Wins ordonné par `updated_at` (chaîne ISO comparable lexicographiquement).
//
// AUCUNE dépendance React / Supabase / `Date` : fonction pure, testable sans réseau ni env.

// Événement minimal mappé depuis le payload `postgres_changes`
// (`payload.eventType` / `payload.new` / `payload.old`). Générique sur la forme de ligne `T`.
export type ChangeEvent<T> =
  | { eventType: 'INSERT'; new: T }
  | { eventType: 'UPDATE'; new: T }
  | { eventType: 'DELETE'; old: { id: string } }

// Réconciliation GÉNÉRIQUE par `id` (AD-15 dédup / AD-16 LWW). Toute ligne avec `id` + `updated_at`
// (chaîne comparable) est réconciliable : participants (1.5) ET indisponibilités (2.3).
export function reconcileById<T extends { id: string; updated_at: string }>(
  state: T[],
  event: ChangeEvent<T>,
): T[] {
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

      // AD-16 : Last-Write-Wins. L'entrant n'écrase que s'il est strictement plus récent.
      if (incoming.updated_at < local.updated_at) return state

      const next = state.slice()
      next[idx] = incoming
      return next
    }

    default:
      return state
  }
}

// ── Alias typés (non-régression + lisibilité des call-sites) ──────────────────
export type ParticipantChangeEvent = ChangeEvent<Participant>
export type UnavailabilityChangeEvent = ChangeEvent<Unavailability>
export type GroupExclusionChangeEvent = ChangeEvent<GroupExclusion>
export type HolidayChangeEvent = ChangeEvent<Holiday>
export type TeamOffDayChangeEvent = ChangeEvent<TeamOffDay>

// Conserve la signature historique (Story 1.5) : `tests/reconcile.unit.test.ts` reste vert.
export function reconcileParticipants(
  state: Participant[],
  event: ParticipantChangeEvent,
): Participant[] {
  return reconcileById(state, event)
}

export function reconcileUnavailabilities(
  state: Unavailability[],
  event: UnavailabilityChangeEvent,
): Unavailability[] {
  return reconcileById(state, event)
}

export function reconcileGroupExclusions(
  state: GroupExclusion[],
  event: GroupExclusionChangeEvent,
): GroupExclusion[] {
  return reconcileById(state, event)
}

export function reconcileHolidays(state: Holiday[], event: HolidayChangeEvent): Holiday[] {
  return reconcileById(state, event)
}

export function reconcileTeamOffDays(state: TeamOffDay[], event: TeamOffDayChangeEvent): TeamOffDay[] {
  return reconcileById(state, event)
}

// ── Réconciliation SCALAIRE des settings (Story 4.1) ──────────────────────────
// `settings` est une LIGNE UNIQUE (id='singleton'), pas une liste → on N'utilise PAS `reconcileById`
// (qui opère sur des tableaux). Mêmes invariants AD-15 (dédup écho par `updated_at`) / AD-16 (LWW).
export type SettingChangeEvent = ChangeEvent<Setting>

export function reconcileSetting(state: Setting, event: SettingChangeEvent): Setting {
  // settings n'est jamais supprimé → un DELETE éventuel est ignoré (on garde l'état courant).
  if (event.eventType === 'DELETE') return state
  const incoming = event.new
  if (!incoming || incoming.id !== 'singleton') return state
  // AD-15 : même updated_at → écho de notre propre écriture, déjà appliqué → ignorer.
  if (state.updated_at === incoming.updated_at) return state
  // AD-16 : Last-Write-Wins. L'entrant n'écrase que s'il est strictement plus récent.
  if (incoming.updated_at < state.updated_at) return state
  return incoming
}

// ── Réconciliation SCALAIRE de rotation_state (Story 5.6) ─────────────────────
// `rotation_state` est une LIGNE UNIQUE (id='singleton'), comme `settings` → patron identique à
// `reconcileSetting`. Mêmes invariants AD-15 (dédup écho par `updated_at`) / AD-16 (LWW serveur).
// Permet la synchro Realtime entre clients : si un poste relance la rotation (nouvelle graine/curseur),
// l'autre la voit via l'écho (le store recalcule alors le `schedule` depuis la graine reçue).
export type RotationStateChangeEvent = ChangeEvent<RotationState>

export function reconcileRotationState(
  state: RotationState,
  event: RotationStateChangeEvent,
): RotationState {
  // rotation_state n'est jamais supprimé → un DELETE éventuel est ignoré (on garde l'état courant).
  if (event.eventType === 'DELETE') return state
  const incoming = event.new
  if (!incoming || incoming.id !== 'singleton') return state
  // AD-15 : même updated_at → écho de notre propre écriture, déjà appliqué → ignorer.
  if (state.updated_at === incoming.updated_at) return state
  // AD-16 : Last-Write-Wins. L'entrant n'écrase que s'il est strictement plus récent.
  if (incoming.updated_at < state.updated_at) return state
  return incoming
}
