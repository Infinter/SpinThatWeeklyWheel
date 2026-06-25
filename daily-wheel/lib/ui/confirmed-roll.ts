// Cœur PUR du journal d'audit `confirmed_rolls` (Story 5.10). Feuille UI PURE (aucun React/DOM/Supabase) :
// le mapping + la validation du payload, isolés pour être vérifiés en env node (esprit AD-1), voisins de
// `lib/ui/spin-mode.ts` et `lib/ui/exports.ts`.
//
// CONTRAT (échange Solo 2026-06-25) : à la VALIDATION d'un slot (révélation), on enregistre le roll dans
// un journal d'audit PASSIF. Clé composite (seed, date) ⇒ idempotent par génération, append au re-roll.
// `name`/`participant_id` sont des SNAPSHOTS dénormalisés (anti-drift, AC-3) : figés tels quels, le journal
// survit au renommage/suppression du participant. Ce module ne décide RIEN du planning (source de vérité =
// le domaine) ni de l'affichage (recompute-from-seed inchangé, 5.6 AC-2) : il ne fait que projeter.

import type { ScheduleRow } from '@/lib/domain/schedule'

const UINT32_MAX = 0xffffffff

// Payload serveur (colonnes en snake_case, allowlist de la route /api/confirmed_rolls). `confirmed_at` est
// posé SERVEUR, jamais ici. `seed` est la graine de la rotation entière (partagée par toutes ses lignes).
export type ConfirmedRollPayload = {
  seed: number
  date: string
  participant_id: string
  name: string
}

// Projette le seed courant + un ScheduleRow révélé vers le payload serveur (participantId → participant_id).
// AUCUNE normalisation : `name` est figé tel quel (snapshot, AC-3).
export function buildConfirmedRollPayload(seed: number, row: ScheduleRow): ConfirmedRollPayload {
  return { seed, date: row.date, participant_id: row.participantId, name: row.name }
}

// Validation DÉFENSIVE (AD-17:400) réutilisée par la Route Handler : un caller direct ne doit pas écrire
// une ligne invalide. `seed` = entier uint32 ; `date`/`participant_id`/`name` = chaînes non vides.
// Renvoie un message d'erreur, ou `null` si tout est valide.
export function validateConfirmedRoll(picked: Record<string, unknown>): string | null {
  const s = picked.seed
  if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > UINT32_MAX) {
    return 'seed doit être un entier dans [0, 2^32-1]'
  }
  if (typeof picked.date !== 'string' || picked.date.length === 0) {
    return 'date doit être une chaîne YMD non vide'
  }
  if (typeof picked.participant_id !== 'string' || picked.participant_id.length === 0) {
    return 'participant_id doit être une chaîne non vide'
  }
  if (typeof picked.name !== 'string' || picked.name.length === 0) {
    return 'name doit être une chaîne non vide'
  }
  return null
}
