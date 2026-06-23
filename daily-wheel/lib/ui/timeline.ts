// Projection TIMELINE (Story 5.3). Feuille de PRÉSENTATION PURE (aucun React/DOM/Supabase) : transforme
// le résultat du domaine en une bande de cellules jour, prête à rendre. Testable en env node (AD-1).
//
// POURQUOI ICI ET PAS DANS LE DOMAINE : `generateSchedule` ne renvoie que `{ planning, unscheduled }`
// (type GELÉ, asserté par le golden — interdiction de le modifier, parité NFR9 / AD-12). La timeline a
// besoin du flux JOUR-PAR-JOUR (ouvrés attribués + week-ends + bloqués « sautés ») : on le reconstruit
// ici en RÉUTILISANT les prédicats DÉJÀ exportés du domaine (anti-réinvention). On ne touche pas au
// domaine et on ne crée AUCUN nouveau prédicat.
//
// AD-3 PRÉSERVÉ : la décision canonique « ce jour est-il un slot ? » reste `isTeamNonSessionDay`
// (utilisée par `generateSchedule`). Ici, un jour de l'intervalle `[premier..dernier]` qui n'est PAS
// dans `planning` est DÉJÀ neutralisé (invariant no-hole, flowchart spine:284-310) ; on se contente
// d'en déduire un LIBELLÉ d'affichage via les sous-prédicats — c'est de la présentation, pas une
// seconde source de vérité.

import {
  isHoliday,
  isTeamOffDay,
  isGroupExcluded,
  isWeekend,
  addDays,
  type TeamConstraints,
} from '@/lib/domain/team-availability'
import type { ScheduleRow } from '@/lib/domain/schedule'

// Une cellule de la timeline. Quatre formes disjointes selon le type de jour.
// `pending` (Story 5.4) = jour ouvré PAS ENCORE révélé par la roue — son animateur reste un secret.
export type TimelineCell =
  | { date: string; kind: 'working'; participantId: string; name: string; colorIndex: number }
  | { date: string; kind: 'pending' }
  | { date: string; kind: 'weekend'; label: string; skipped: true }
  | { date: string; kind: 'blocked'; label: string; skipped: true }

export type BuildTimelineArgs = {
  /** Jours ouvrés attribués (source de vérité des cellules « working »). */
  planning: ScheduleRow[]
  /** Contraintes d'équipe (mêmes que celles passées au domaine) — pour classer les jours non planifiés. */
  constraints: TeamConstraints
  /** `id` → index de couleur (palette `wheel-segments`), partagé avec la roue 5.4. */
  colorIndexById: ReadonlyMap<string, number>
  /** Libellé saisi d'un jour férié / off (le store le porte ; le domaine ne reçoit que `{date}`). */
  blockedLabelFor?: (date: string) => string | undefined
  /**
   * Story 5.4 — nb de jours ouvrés DÉJÀ révélés par la roue (ordre chronologique). Les jours ouvrés
   * d'index de travail `>= revealedCount` sortent en cellules `pending` (« à tirer »). ABSENT ⇒ tout
   * est révélé (comportement 5.3 inchangé : la timeline statique affiche le planning complet).
   */
  revealedCount?: number
}

// Construit la bande de cellules du PREMIER au DERNIER jour planifié (inclus), sans trou. Planning vide
// → `[]` (le composant retombe alors sur les états vides hérités de 4.3).
export function buildTimeline(args: BuildTimelineArgs): TimelineCell[] {
  const { planning, constraints, colorIndexById, blockedLabelFor, revealedCount } = args
  if (planning.length === 0) return []

  // Index des jours ouvrés par date (la présence ici PRIME sur toute classification — défensif vs
  // contraintes modifiées après génération ; le cas « périmé » est géré par 5.9, pas par 5.3).
  const workingByDate = new Map(planning.map((r) => [r.date, r] as const))

  const first = planning[0].date
  const last = planning[planning.length - 1].date

  const cells: TimelineCell[] = []
  // Compteur d'index de travail : n'avance QUE sur les jours ouvrés (les week-ends/bloqués ne sont pas
  // « tirés » par la roue). Détermine si un jour ouvré est déjà révélé (`< revealedCount`) ou « pending ».
  let workIndex = 0
  let d = first
  while (d <= last) {
    const row = workingByDate.get(d)
    if (row) {
      const revealed = revealedCount === undefined || workIndex < revealedCount
      workIndex++
      if (revealed) {
        cells.push({
          date: d,
          kind: 'working',
          participantId: row.participantId,
          name: row.name,
          colorIndex: colorIndexById.get(row.participantId) ?? 0,
        })
      } else {
        // Jour ouvré pas encore révélé par la roue : placeholder « à tirer », animateur caché (AC-10f).
        cells.push({ date: d, kind: 'pending' })
      }
    } else {
      // Jour non planifié dans l'intervalle ⇒ nécessairement neutralisé (invariant no-hole). On en
      // déduit le LIBELLÉ par précédence : un libellé explicite (férié/off/exclusion) prime sur le
      // générique « WE ».
      if (isHoliday(constraints.holidays ?? [], d)) {
        cells.push({ date: d, kind: 'blocked', label: blockedLabelFor?.(d) ?? 'Férié', skipped: true })
      } else if (isTeamOffDay(constraints.teamOffDays ?? [], d)) {
        cells.push({ date: d, kind: 'blocked', label: blockedLabelFor?.(d) ?? 'Jour off', skipped: true })
      } else if (isGroupExcluded(constraints.groupExclusions ?? [], d)) {
        cells.push({ date: d, kind: 'blocked', label: 'Exclusion', skipped: true })
      } else if (isWeekend(d)) {
        cells.push({ date: d, kind: 'weekend', label: 'WE', skipped: true })
      } else {
        // Filet défensif : ne doit pas arriver (invariant no-hole). Cellule émise pour garder la
        // grille contiguë.
        cells.push({ date: d, kind: 'blocked', label: 'Jour neutralisé', skipped: true })
      }
    }
    d = addDays(d, 1)
  }

  return cells
}
