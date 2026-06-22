import type { Participant } from '@/lib/data/participants'
import { reconcileParticipants, type ParticipantChangeEvent } from '@/lib/store/reconcile'

// Réducteur OPTIMISTE pur de la copie de travail client (extrait de participants-store.tsx en Story 2.2).
// PUR : aucun import React/DOM/Supabase/`Date` ; testé sans réseau ni env (tests/participants-reducer.unit.test.ts).
// AD-4 : Supabase reste la source canonique ; ce réducteur ne porte que l'état de travail + les drapeaux optimistes.

// Une ligne du store = un Participant serveur + des drapeaux client-only :
//   pending : écriture optimiste en vol (AD-5) ; failed : dernière écriture échouée (retry possible, AD-17 transient).
export type StoreParticipant = Participant & { pending?: boolean; failed?: boolean }

export type Action =
  | { type: 'HYDRATE'; rows: Participant[] }
  | { type: 'REALTIME'; event: ParticipantChangeEvent }
  | { type: 'ADD_OPTIMISTIC'; tempId: string; name: string }
  | { type: 'SET_PENDING'; tempId: string }
  | { type: 'CONFIRM'; tempId: string; row: Participant }
  | { type: 'ROLLBACK'; tempId: string }
  | { type: 'MARK_FAILED'; tempId: string }
  // ── Mutations sur lignes confirmées (Story 2.2, AD-5) ──
  | { type: 'PATCH_OPTIMISTIC'; id: string; patch: Partial<Participant> } // toggle actif / renommage optimiste
  | { type: 'RESTORE'; row: Participant } // rollback d'un update OU restauration d'un delete échoué (upsert, drapeaux effacés)
  | { type: 'REMOVE'; id: string } // delete optimiste

export function participantsReducer(state: StoreParticipant[], action: Action): StoreParticipant[] {
  switch (action.type) {
    case 'HYDRATE':
      // Re-synchronise sur la source canonique (AD-4) : les drapeaux optimistes sont abandonnés.
      return action.rows
    case 'REALTIME':
      // Réconciliation pure (AD-15/AD-16) ; les StoreParticipant non touchés conservent leurs drapeaux.
      return reconcileParticipants(state, action.event) as StoreParticipant[]
    case 'ADD_OPTIMISTIC':
      return [
        ...state,
        { id: action.tempId, name: action.name, active: true, created_at: '', updated_at: '', pending: true },
      ]
    case 'SET_PENDING':
      return state.map((r) => (r.id === action.tempId ? { ...r, pending: true, failed: false } : r))
    case 'CONFIRM':
      // Remplace la ligne temp par la ligne serveur (id réel + updated_at réel) → l'écho Realtime sera dédupliqué (AD-15).
      return state.map((r) => (r.id === action.tempId ? action.row : r))
    case 'ROLLBACK':
      return state.filter((r) => r.id !== action.tempId)
    case 'MARK_FAILED':
      return state.map((r) => (r.id === action.tempId ? { ...r, pending: false, failed: true } : r))

    // ── Story 2.2 ────────────────────────────────────────────────────────────
    case 'PATCH_OPTIMISTIC': {
      // Toggle/rename optimiste : patch partiel + pending. Id absent → no-op (référence stable).
      if (!state.some((r) => r.id === action.id)) return state
      return state.map((r) =>
        r.id === action.id ? { ...r, ...action.patch, pending: true, failed: false } : r,
      )
    }
    case 'RESTORE': {
      // Upsert par id avec drapeaux client effacés : rollback d'un update (ligne présente)
      // ou restauration d'un delete échoué (ligne absente → ré-ajoutée en fin).
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
