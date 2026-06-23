import type { Setting, SettingWritePayload } from '@/lib/data/settings'
import { reconcileSetting, type SettingChangeEvent } from '@/lib/store/reconcile'

// Réducteur OPTIMISTE pur des settings (Story 4.1, AC4) — patron SCALAIRE (≠ les 6 réducteurs-liste).
// PUR : aucun import React/DOM/Supabase/`Date` ; testé sans réseau ni env (tests/settings-reducer.unit.test.ts).
// État = UN objet (la ligne 'singleton'), pas un tableau → pas de tempId, pas de ROLLBACK-par-temp,
// cycle upsert (OPTIMISTIC → CONFIRM | RESTORE). AD-4 : Supabase reste la source canonique.

// Le store = un Setting serveur + des drapeaux client-only :
//   pending : écriture optimiste en vol (AD-5) ; failed : dernière écriture échouée (retry, AD-17 transient).
export type StoreSetting = Setting & { pending?: boolean; failed?: boolean }

// Défaut métier quand la table est VIDE (migration ne sème aucune ligne). `start_date: null` → le
// « aujourd'hui » est un défaut d'AFFICHAGE (UI), non persisté tant que l'utilisateur ne choisit pas.
export const DEFAULT_SETTING: Setting = {
  id: 'singleton',
  skip_weekends: true,
  start_date: null,
  updated_at: '',
}

export type Action =
  | { type: 'HYDRATE'; row: Setting | null } // re-synchro source canonique ; null (table vide) → défaut
  | { type: 'REALTIME'; event: SettingChangeEvent }
  | { type: 'OPTIMISTIC'; patch: SettingWritePayload } // mise à jour optimiste locale (fusion du patch)
  | { type: 'CONFIRM'; row: Setting } // succès upsert : ligne serveur autoritaire, drapeaux effacés
  | { type: 'MARK_FAILED' }
  | { type: 'RESTORE'; row: Setting } // rollback vers le snapshot pré-optimiste

export function settingsReducer(state: StoreSetting, action: Action): StoreSetting {
  switch (action.type) {
    case 'HYDRATE':
      // Source canonique (AD-4) : les drapeaux optimistes sont abandonnés. Table vide → défaut.
      return action.row ? { ...action.row } : DEFAULT_SETTING
    case 'REALTIME':
      // Réconciliation pure (AD-15/AD-16). reconcileSetting renvoie `state` à l'identique sur no-op.
      return reconcileSetting(state, action.event) as StoreSetting
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
