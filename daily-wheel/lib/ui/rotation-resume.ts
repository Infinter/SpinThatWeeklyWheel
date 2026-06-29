// 5.6 — reprise de rotation. Le DOMAINE reste la source de vérité (UX-DR9) : ce module ne fait que
// (re)dériver de façon DÉTERMINISTE le planning + borner le curseur à partir de (input, seed, cursor).
// PUR : aucun import React/DOM/Supabase (esprit AD-1 ; voisin de wheel.ts / timeline.ts / spin-mode.ts).
// La persistance stocke (graine + curseur), JAMAIS le planning figé : `generateSchedule` étant
// déterministe à seed donné (NFR7/AD-2), rejouer (input, seed) reproduit exactement la rotation, et la
// tranche `planning.slice(0, cursor)` redonne les jours déjà révélés.

import { generateSchedule, type ScheduleInput, type ScheduleResult } from '@/lib/domain/schedule'
import { createRng } from '@/lib/domain/rng'

// Recalcule le planning à partir d'une graine persistée (déterminisme NFR7/AD-2). Mêmes entrées + même
// seed ⇒ même résultat ; c'est ce qui permet de reprendre une rotation sans stocker le planning.
export function replayRotation(input: ScheduleInput, seed: number): ScheduleResult {
  return generateSchedule(input, createRng(seed))
}

// Borne défensive du curseur dans [0, planningLen] : un curseur persisté devenu incohérent (entrées
// changées entre deux sessions → planning plus court, valeur corrompue, NaN) ne déborde jamais.
export function clampCursor(cursor: number, planningLen: number): number {
  if (!Number.isFinite(cursor) || cursor < 0) return 0
  return Math.min(Math.trunc(cursor), planningLen)
}

// Story 5.17 (BUG FIX) — résout la date d'ANCRAGE du replay. Le bug : la rotation persistée ne figeait
// que le seed ; au replay, `startDate` retombait sur `todayYMD()`, ré-ancrant tout le planning sur le
// jour courant (les jours « glissaient »). On persiste désormais la date résolue au tirage dans
// `rotation_state.start_date` et on la rejoue ici. `persisted` PRIME ; on retombe sur `fallback`
// (= settings.start_date ?? todayYMD(), comportement 5.6) UNIQUEMENT si l'ancre est absente (null /
// undefined / chaîne vide) — rotation antérieure au fix ou colonne non encore hydratée (dégradation
// gracieuse, AC-4). PUR : aucune dépendance ; testé sans réseau.
export function resolveReplayStartDate(
  persisted: string | null | undefined,
  fallback: string,
): string {
  return persisted ? persisted : fallback
}
