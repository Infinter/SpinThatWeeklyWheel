// Détection de péremption du planning (Story 5.9, rerun-nudge). Helper PUR (aucun import
// React/DOM/Supabase, esprit AD-1) : isolé et testable en env node.
//
// PRINCIPE : la signature est une empreinte déterministe de l'EXACT ensemble d'entrées qui pilotent
// le tirage — la forme `ScheduleInput` produite par `buildScheduleInput` (participants ACTIFS + leurs
// indispos, contraintes d'équipe, date de départ). Le store fige cette signature au moment où le
// planning courant est produit (`signatureAtGenerate`), puis compare la signature COURANTE à chaque
// rendu : si elles diffèrent ET qu'un planning est affiché, `scheduleStale` est vrai ⇒ le nudge
// « Contraintes mises à jour — relancer la roue ? » apparaît (AC-4/AC-5).
//
// `buildScheduleInput` mappe déjà vers la forme domaine en éliminant le bruit non métier
// (`pending`/`failed`/`updated_at`) : sérialiser l'input suffit donc à ignorer un simple écho Realtime
// sans changement de contrainte. Comme l'input est reconstruit par le même code à chaque appel, l'ordre
// des clés et des tableaux est stable ⇒ `JSON.stringify` est une signature canonique et déterministe.

import type { ScheduleInput } from '@/lib/domain/schedule'

export function scheduleSignature(input: ScheduleInput): string {
  return JSON.stringify(input)
}
