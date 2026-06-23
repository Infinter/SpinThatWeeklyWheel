import type { GroupExclusion } from '@/lib/data/group-exclusions'
import { reconcileGroupExclusions, type GroupExclusionChangeEvent } from '@/lib/store/reconcile'

// Réducteur OPTIMISTE pur des exclusions de groupe (Story 3.1, AC4) — modelé sur
// unavailabilities-reducer.ts. PUR : aucun import React/DOM/Supabase/`Date` ; testé sans réseau
// ni env (tests/group-exclusions-reducer.unit.test.ts). Cycle insert + delete UNIQUEMENT
// (pas de patch/update — epics.md#Story-3.1).
// AD-4 : Supabase reste la source canonique ; ce réducteur ne porte que l'état de travail + drapeaux.

// Une ligne du store = une GroupExclusion serveur + des drapeaux client-only :
//   pending : écriture optimiste en vol (AD-5) ; failed : dernière écriture échouée (retry, AD-17 transient).
export type StoreGroupExclusion = GroupExclusion & { pending?: boolean; failed?: boolean }

export type Action =
  | { type: 'HYDRATE'; rows: GroupExclusion[] }
  | { type: 'REALTIME'; event: GroupExclusionChangeEvent }
  | { type: 'ADD_OPTIMISTIC'; tempId: string; row: GroupExclusion } // insert optimiste (id forcé = tempId)
  | { type: 'SET_PENDING'; id: string }
  | { type: 'CONFIRM'; tempId: string; row: GroupExclusion } // succès insert : remplace temp par ligne serveur
  | { type: 'ROLLBACK'; tempId: string } // échec insert : retire la ligne temp
  | { type: 'MARK_FAILED'; id: string }
  | { type: 'RESTORE'; row: GroupExclusion } // restauration d'un delete échoué (upsert, drapeaux effacés)
  | { type: 'REMOVE'; id: string } // delete optimiste

export function groupExclusionsReducer(
  state: StoreGroupExclusion[],
  action: Action,
): StoreGroupExclusion[] {
  switch (action.type) {
    case 'HYDRATE':
      // Re-synchronise sur la source canonique (AD-4) : les drapeaux optimistes sont abandonnés.
      return action.rows
    case 'REALTIME':
      // Réconciliation pure (AD-15/AD-16) ; les lignes non touchées conservent leurs drapeaux.
      return reconcileGroupExclusions(state, action.event) as StoreGroupExclusion[]
    case 'ADD_OPTIMISTIC':
      // Ligne optimiste : id = tempId, pending. La ligne serveur (id réel) arrivera au CONFIRM.
      return [...state, { ...action.row, id: action.tempId, pending: true, failed: false }]
    case 'SET_PENDING':
      return state.map((r) => (r.id === action.id ? { ...r, pending: true, failed: false } : r))
    case 'CONFIRM':
      // Remplace la ligne temp par la ligne serveur (id + updated_at réels) → écho Realtime dédupliqué (AD-15).
      return state.map((r) => (r.id === action.tempId ? action.row : r))
    case 'ROLLBACK':
      return state.filter((r) => r.id !== action.tempId)
    case 'MARK_FAILED':
      return state.map((r) => (r.id === action.id ? { ...r, pending: false, failed: true } : r))
    case 'RESTORE': {
      // Upsert par id avec drapeaux client effacés : restauration d'un delete échoué (ligne absente
      // → ré-ajoutée) ou remise à l'état serveur d'une ligne présente.
      const exists = state.some((r) => r.id === action.row.id)
      if (!exists) return [...state, action.row]
      return state.map((r) => (r.id === action.row.id ? action.row : r))
    }
    case 'REMOVE': {
      // Delete optimiste. Id absent → no-op (référence stable).
      const next = state.filter((r) => r.id !== action.id)
      return next.length === state.length ? state : next
    }
    default:
      return state
  }
}
