// Résolution PURE « qui anime le standup d'aujourd'hui » (spec-personne-du-jour-bandeau). AUCUN import
// React/DOM/Supabase : logique isolée, testable en env node (esprit AD-1). Consommée par le composant
// client `TodayStandupBanner`.
//
// RESPECT DU SUSPENSE (5.4) : le nom du jour n'est révélé que si son jour ouvré a DÉJÀ été tiré, selon le
// curseur de révélation PERSISTÉ (`rotationCursor` du store). `planning` ne contient QUE les jours ouvrés
// attribués, en ordre chronologique : l'index d'un jour y EST son index de travail. Un jour d'index `i`
// est révélé ssi `i < revealedCount`. Si aujourd'hui n'est pas un jour ouvré planifié (week-end, férié,
// jour off, hors période), il n'y a pas de standup aujourd'hui (`none`).

import type { ScheduleRow } from '@/lib/domain/schedule'

export type TodayStandup =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'revealed'; participantId: string; name: string }

export function resolveTodayStandup(
  planning: ScheduleRow[],
  revealedCount: number,
  todayYmd: string,
): TodayStandup {
  const index = planning.findIndex((r) => r.date === todayYmd)
  if (index === -1) return { kind: 'none' }
  if (index < revealedCount) {
    const row = planning[index]
    return { kind: 'revealed', participantId: row.participantId, name: row.name }
  }
  return { kind: 'pending' }
}
