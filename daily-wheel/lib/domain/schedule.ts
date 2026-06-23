// Cœur de génération du planning (Story 4.2, FR11/FR14). FEUILLE PURE (AD-1) : n'importe que d'autres
// modules `lib/domain/` (purs) — AUCUN React/DOM/Supabase/`Date`/`lib/data`/`lib/store`. L'aléa est
// INJECTÉ (`rng`, AD-2) : aucun `Math.random()` ici. Toutes les dates sont des chaînes `YYYY-MM-DD`
// comparées lexicographiquement (== chronologiquement) ; l'itération se fait via `addDays` (entier
// civil), jamais via `Date` (convention dates).
//
// L'algorithme reproduit FIDÈLEMENT l'ancienne page (historique/Spin That Wheel v2.html, handler
// `selectButton` L994-1104 ; `getLastConsecAvailDay` L979-992) avec 4 différences VOULUES, toutes
// conformes à la spine :
//   1. Le « jour neutralisé » passe par l'UNIQUE prédicat `isTeamNonSessionDay` (week-ends + exclusions
//      + fériés + off), branché À LA FOIS dans la boucle de placement ET dans le calcul de deadline EDF
//      (`getLastConsecAvailDay`) — c'est la couture protégée par AD-3 (un prédicat unique, deux sites).
//   2. `rng` seedable au lieu de `Math.random()` (AD-2 / NFR7 — déterminisme + parité reproductible).
//   3. Itération YMD pure (`addDays`) au lieu de `Date.setDate` (AD-1 / convention dates).
//   4. Calendrier entier exact (days-from-civil) au lieu de `Math.round((t1-t2)/86400000)`.

import {
  isTeamNonSessionDay,
  addDays,
  addYears,
  type TeamConstraints,
} from '@/lib/domain/team-availability'
import { isPersonUnavailable, type DayOrRange } from '@/lib/domain/availability'
import type { Rng } from '@/lib/domain/rng'

// Flag archi #1 / NFR6 (Story 5.2) : l'horizon est ÉTENDU — la génération avance dans le calendrier
// (en sautant les jours neutralisés) jusqu'à placer tous les disponibles, SANS fenêtre fixe de 7 jours.
// La SEULE borne est ce plafond explicite et intentionnel `start + 1 an`, garde anti-boucle-infinie
// (NFR6), appliqué À L'IDENTIQUE sur les trois sites d'itération calendaire (phase 0, deadline EDF,
// placement). Valeur strictement inchangée vs 4.2 → parité legacy préservée (NFR9).
const HORIZON_LIMIT_YEARS = 1

// Un participant ACTIF candidat à la planification (le store ne fournit QUE les actifs, déjà mappés).
export type SchedulePerson = {
  id: string
  name: string
  unavailabilities: DayOrRange[]
}

// Entrée de la génération (forme domaine camelCase — le store mappe depuis le snake_case Supabase).
export type ScheduleInput = {
  participants: SchedulePerson[] // UNIQUEMENT les actifs
  constraints: TeamConstraints // { skipWeekends?, groupExclusions?, holidays?, teamOffDays? }
  startDate: string // YMD ; le défaut « aujourd'hui » est résolu côté store (settings.start_date ?? todayYMD())
}

// Une ligne du planning : un animateur unique désigné pour un jour ouvré valide.
export type ScheduleRow = {
  date: string // YMD
  participantId: string
  name: string
}

// Résultat : le planning (rotation one-shot) + les participants non planifiés (restants ou jamais plaçables).
export type ScheduleResult = {
  planning: ScheduleRow[]
  unscheduled: { id: string; name: string }[]
}

// Fisher-Yates DESCENDANT (parité legacy L607-611), mais avec l'aléa injecté `rng` au lieu de
// `Math.random`. Mute et renvoie le tableau (copie faite par l'appelant).
function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Dernier jour CONSÉCUTIF ouvré disponible pour `person` à partir de `fromDay` (deadline EDF).
// Parité legacy `getLastConsecAvailDay` L979-992. COUTURE AD-3 : utilise EXACTEMENT le même
// `isTeamNonSessionDay` que la boucle de placement → un jour neutralisé (week-end/exclusion/férié/off)
// est SAUTÉ (la fenêtre le franchit), il ne TERMINE PAS la fenêtre. Seule une indisponibilité
// INDIVIDUELLE de `person` ferme la fenêtre. Renvoie `null` si `person` est indispo dès `fromDay`.
function getLastConsecAvailDay(
  person: SchedulePerson,
  fromDay: string,
  constraints: TeamConstraints,
): string | null {
  let d = fromDay
  const lim = addYears(fromDay, HORIZON_LIMIT_YEARS)
  let last: string | null = null
  while (d <= lim) {
    if (isTeamNonSessionDay(d, constraints)) {
      d = addDays(d, 1)
      continue
    }
    if (isPersonUnavailable(person.unavailabilities, d)) break
    last = d
    d = addDays(d, 1)
  }
  return last
}

// Génère le planning : un animateur unique par jour ouvré valide, ordre initial aléatoire (rng),
// priorité EDF (fenêtre la plus tôt fermée d'abord, départage par l'ordre du tirage), aucun trou,
// rotation one-shot. Pur et déterministe à `rng` donné (NFR7).
export function generateSchedule(input: ScheduleInput, rng: Rng): ScheduleResult {
  const { participants, constraints, startDate } = input

  // Liste vide d'actifs → rien à planifier (défensif, pas de crash).
  if (participants.length === 0) {
    return { planning: [], unscheduled: [] }
  }

  // Tous indisponibles ce jour-là (testé sur TOUS les actifs, pas la queue) → jour ignoré, pas un trou.
  const allUnavailable = (date: string): boolean =>
    participants.every((p) => isPersonUnavailable(p.unavailabilities, date))

  // Phase 0 — avancer jusqu'au premier jour valide (parité legacy L1006-1013). Horizon depuis startDate.
  let start = startDate
  const lim0 = addYears(startDate, HORIZON_LIMIT_YEARS)
  while (start <= lim0) {
    if (isTeamNonSessionDay(start, constraints)) {
      start = addDays(start, 1)
      continue
    }
    if (allUnavailable(start)) {
      start = addDays(start, 1)
      continue
    }
    break
  }

  // Phase 1 — ordre initial aléatoire (parité legacy L1015-1019). `shuffleIdx` mémorise la position
  // initiale de chaque personne pour départager les égalités EDF (FR14).
  const order = shuffle([...participants], rng)
  const shuffleIdx = new Map(order.map((p, i) => [p.id, i] as const))

  // Phase 2 — placement EDF (parité legacy L1021-1065). `lim` part du PREMIER JOUR VALIDE (legacy L1023-1025).
  const planning: ScheduleRow[] = []
  const queue = [...order]
  let cur = start
  const lim = addYears(start, HORIZON_LIMIT_YEARS)

  while (queue.length > 0 && cur <= lim) {
    // 1) Jour neutralisé d'équipe → sauté (pas un trou).
    if (isTeamNonSessionDay(cur, constraints)) {
      cur = addDays(cur, 1)
      continue
    }
    // 2) Tous les actifs indisponibles ce jour → sauté (pas un trou).
    if (allUnavailable(cur)) {
      cur = addDays(cur, 1)
      continue
    }
    // 3) Candidats disponibles aujourd'hui parmi les restants.
    const avail = queue.filter((p) => !isPersonUnavailable(p.unavailabilities, cur))
    // 4) Aucun candidat dispo alors qu'il reste des gens en file → STOP : les placer ailleurs
    //    créerait un trou. Rotation one-shot, les restants seront « non planifiés ».
    if (avail.length === 0) break

    // 5) Tri EDF : fenêtre se fermant le plus tôt d'abord ; égalité départagée par l'ordre du tirage.
    avail.sort((a, b) => {
      const da = getLastConsecAvailDay(a, cur, constraints)
      const db = getLastConsecAvailDay(b, cur, constraints)
      if (da !== null && db !== null) {
        if (da !== db) return da < db ? -1 : 1
      } else if (da !== null) {
        return -1
      } else if (db !== null) {
        return 1
      }
      return shuffleIdx.get(a.id)! - shuffleIdx.get(b.id)!
    })

    const pick = avail[0]
    planning.push({ date: cur, participantId: pick.id, name: pick.name })
    queue.splice(queue.indexOf(pick), 1)
    cur = addDays(cur, 1)
  }

  // Non planifiés = actifs jamais placés (restants en file + jamais plaçables). Ordre = ordre d'entrée
  // (parité legacy L1095 : `active.filter`, pas l'ordre du tirage).
  const placed = new Set(planning.map((r) => r.participantId))
  const unscheduled = participants
    .filter((p) => !placed.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }))

  return { planning, unscheduled }
}
