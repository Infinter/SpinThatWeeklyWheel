import type { Unavailability } from '@/lib/data/unavailabilities'
import { reconcileUnavailabilities, type UnavailabilityChangeEvent } from '@/lib/store/reconcile'

// Réducteur OPTIMISTE pur des indisponibilités (Story 2.3, AC4) — modelé sur participants-reducer.ts.
// PUR : aucun import React/DOM/Supabase/`Date` ; testé sans réseau ni env (tests/unavailabilities-reducer.unit.test.ts).
// Cycle insert + delete UNIQUEMENT (pas de patch/update — épics.md#Story-2.3).
// AD-4 : Supabase reste la source canonique ; ce réducteur ne porte que l'état de travail + les drapeaux optimistes.

// Une ligne du store = une Unavailability serveur + des drapeaux client-only :
//   pending : écriture optimiste en vol (AD-5) ; failed : dernière écriture échouée (retry possible, AD-17 transient).
export type StoreUnavailability = Unavailability & { pending?: boolean; failed?: boolean }

export type Action =
  | { type: 'HYDRATE'; rows: Unavailability[] }
  | { type: 'REALTIME'; event: UnavailabilityChangeEvent }
  | { type: 'ADD_OPTIMISTIC'; tempId: string; row: Unavailability } // insert optimiste (id forcé = tempId)
  | { type: 'SET_PENDING'; id: string }
  | { type: 'CONFIRM'; tempId: string; row: Unavailability } // succès insert : remplace la ligne temp par la ligne serveur
  | { type: 'ROLLBACK'; tempId: string } // échec insert : retire la ligne temp
  | { type: 'MARK_FAILED'; id: string }
  | { type: 'RESTORE'; row: Unavailability } // restauration d'un delete échoué (upsert, drapeaux effacés)
  | { type: 'REMOVE'; id: string } // delete optimiste

export function unavailabilitiesReducer(
  state: StoreUnavailability[],
  action: Action,
): StoreUnavailability[] {
  switch (action.type) {
    case 'HYDRATE':
      // Re-synchronise sur la source canonique (AD-4) : les drapeaux optimistes sont abandonnés.
      return action.rows
    case 'REALTIME':
      // Réconciliation pure (AD-15/AD-16) ; les lignes non touchées conservent leurs drapeaux.
      return reconcileUnavailabilities(state, action.event) as StoreUnavailability[]
    case 'ADD_OPTIMISTIC':
      // Ligne optimiste : id = tempId, pending. La ligne serveur (id réel) arrivera au CONFIRM.
      return [...state, { ...action.row, id: action.tempId, pending: true, failed: false }]
    case 'SET_PENDING':
      return state.map((r) => (r.id === action.id ? { ...r, pending: true, failed: false } : r))
    case 'CONFIRM':
      // Remplace la ligne temp par la ligne serveur (id + updated_at réels) → l'écho Realtime sera dédupliqué (AD-15).
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
