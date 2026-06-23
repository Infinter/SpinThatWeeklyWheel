import type { TeamOffDay } from '@/lib/data/team-off-days'
import { reconcileTeamOffDays, type TeamOffDayChangeEvent } from '@/lib/store/reconcile'

// Réducteur OPTIMISTE pur des jours off d'équipe (Story 3.3, AC4) — modelé sur holidays-reducer.ts.
// PUR : aucun import React/DOM/Supabase/`Date` ; testé sans réseau ni env (tests/team-off-days-reducer.unit.test.ts).
// Cycle insert + delete UNIQUEMENT (pas de patch/update — epics.md#Story-3.3).
// AD-4 : Supabase reste la source canonique ; ce réducteur ne porte que l'état de travail + drapeaux.

// Une ligne du store = un TeamOffDay serveur + des drapeaux client-only :
//   pending : écriture optimiste en vol (AD-5) ; failed : dernière écriture échouée (retry, AD-17 transient).
export type StoreTeamOffDay = TeamOffDay & { pending?: boolean; failed?: boolean }

export type Action =
  | { type: 'HYDRATE'; rows: TeamOffDay[] }
  | { type: 'REALTIME'; event: TeamOffDayChangeEvent }
  | { type: 'ADD_OPTIMISTIC'; tempId: string; row: TeamOffDay } // insert optimiste (id forcé = tempId)
  | { type: 'SET_PENDING'; id: string }
  | { type: 'CONFIRM'; tempId: string; row: TeamOffDay } // succès insert : remplace temp par ligne serveur
  | { type: 'ROLLBACK'; tempId: string } // échec insert : retire la ligne temp
  | { type: 'MARK_FAILED'; id: string }
  | { type: 'RESTORE'; row: TeamOffDay } // restauration d'un delete échoué (upsert, drapeaux effacés)
  | { type: 'REMOVE'; id: string } // delete optimiste

export function teamOffDaysReducer(state: StoreTeamOffDay[], action: Action): StoreTeamOffDay[] {
  switch (action.type) {
    case 'HYDRATE':
      // Re-synchronise sur la source canonique (AD-4) : les drapeaux optimistes sont abandonnés.
      return action.rows
    case 'REALTIME':
      // Réconciliation pure (AD-15/AD-16) ; les lignes non touchées conservent leurs drapeaux.
      return reconcileTeamOffDays(state, action.event) as StoreTeamOffDay[]
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
