import type { RotationState, RotationStateWritePayload } from '@/lib/data/rotation-state'
import { reconcileRotationState, type RotationStateChangeEvent } from '@/lib/store/reconcile'

// Réducteur OPTIMISTE pur de rotation_state (Story 5.6) — patron SCALAIRE identique à `settings-reducer`
// (≠ les 6 réducteurs-liste). PUR : aucun import React/DOM/Supabase/`Date` ; testé sans réseau ni env
// (tests/rotation-state-reducer.unit.test.ts). État = UN objet (la ligne 'singleton'), cycle upsert
// (OPTIMISTIC → CONFIRM | RESTORE). AD-4 : Supabase reste la source canonique.

// Le store = un RotationState serveur + des drapeaux client-only :
//   pending : écriture optimiste en vol (AD-5) ; failed : dernière écriture échouée (retry, AD-17 transient).
export type StoreRotationState = RotationState & { pending?: boolean; failed?: boolean }

// Défaut quand la table est VIDE (migration ne sème aucune ligne). `seed: null` = « aucune rotation
// tirée » : le store ne reprend une rotation au montage QUE si seed n'est pas null. `updated_at: ''`
// < toute date réelle → la 1ʳᵉ écriture (upsert) gagne le LWW.
export const DEFAULT_ROTATION_STATE: RotationState = {
  id: 'singleton',
  seed: null,
  cursor: 0,
  mode: 'rotation-complete',
  start_date: null, // aucune ancre tant qu'aucune rotation n'est tirée (Story 5.17)
  updated_at: '',
}

export type Action =
  | { type: 'HYDRATE'; row: RotationState | null } // re-synchro source canonique ; null (table vide) → défaut
  | { type: 'REALTIME'; event: RotationStateChangeEvent }
  | { type: 'OPTIMISTIC'; patch: RotationStateWritePayload } // mise à jour optimiste locale (fusion du patch)
  | { type: 'CONFIRM'; row: RotationState } // succès upsert : ligne serveur autoritaire, drapeaux effacés
  | { type: 'MARK_FAILED' }
  | { type: 'RESTORE'; row: RotationState } // rollback vers le snapshot pré-optimiste

export function rotationStateReducer(
  state: StoreRotationState,
  action: Action,
): StoreRotationState {
  switch (action.type) {
    case 'HYDRATE':
      // Source canonique (AD-4) : les drapeaux optimistes sont abandonnés. Table vide → défaut.
      return action.row ? { ...action.row } : DEFAULT_ROTATION_STATE
    case 'REALTIME':
      // Réconciliation pure (AD-15/AD-16). reconcileRotationState renvoie `state` à l'identique sur no-op.
      return reconcileRotationState(state, action.event) as StoreRotationState
    case 'OPTIMISTIC':
      return { ...state, ...action.patch, pending: true, failed: false }
    case 'CONFIRM':
      return { ...action.row }
    case 'MARK_FAILED':
      return { ...state, pending: false, failed: true }
    case 'RESTORE':
      return { ...action.row }
    default:
      return state
  }
}
