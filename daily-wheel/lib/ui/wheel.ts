// Géométrie + animation de la roue (Story 5.4). Feuille UI PURE (aucun React/DOM/canvas/Supabase) :
// le cœur testable de la roue, isolé pour être vérifié en env node (esprit AD-1), voisin de
// `lib/ui/timeline.ts` et `participant-colors.ts`.
//
// PRINCIPE DIRECTEUR (UX-DR9, sacré) : la roue RÉVÈLE le résultat déjà calculé par `generateSchedule`,
// elle ne tire RIEN. Le pointeur est fixe à 12h ; on CALCULE l'angle final qui amène sous lui le segment
// de l'animateur que l'EDF a désigné. Aucun `Math.random` ici : `turns` (cosmétique) est INJECTÉ par le
// composant. Les segments dérivent du `planning` (source de vérité du domaine) ⇒ animation ≡ planning.
//
// CONTRAT COULEUR PARTAGÉ : la couleur d'un segment vient de `colorIndexById` (index dans les ACTIFS,
// ordre du store) puis `colorForIndex` — EXACTEMENT le contrat posé par 5.3 (`participant-colors.ts`).
// Une personne garde donc sa couleur sur la roue, l'avatar et la timeline (AC-7). Rien n'est réécrit.

import type { ScheduleRow } from '@/lib/domain/schedule'

const TAU = Math.PI * 2

// Un segment de la roue : un animateur à révéler, avec sa couleur stable.
export type WheelSegment = { participantId: string; name: string; colorIndex: number }

// Segments de la roue = animateurs du planning, dans l'ordre chronologique (= ordre de révélation).
// Chacun apparaît une fois (invariant rotation one-shot du domaine) ⇒ la roue se vide exactement quand
// la rotation est complète (AC-3). Les non-planifiés ne sont PAS sur la roue (aucun slot à révéler).
export function buildWheelSegments(
  planning: ScheduleRow[],
  colorIndexById: ReadonlyMap<string, number>,
): WheelSegment[] {
  return planning.map((r) => ({
    participantId: r.participantId,
    name: r.name,
    colorIndex: colorIndexById.get(r.participantId) ?? 0,
  }))
}

// Angle (radians) d'un segment quand la roue porte `n` segments égaux. `n >= 1`.
export function segmentAngle(n: number): number {
  return TAU / n
}

// Easing ease-OUT cubique : départ rapide, ralentissement net en fin de course (mockup l. 467).
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

// Angle de roue FINAL qui amène le CENTRE du segment `targetIdx` sous le pointeur fixe à 12h (-π/2),
// en partant de `current`, après AU MOINS `turns` radians de rotation supplémentaire (sens horaire).
// Réplique la mécanique du mockup (spin-rotation.html:471-474). Le pointeur ne bouge pas : c'est la roue
// qui s'oriente vers le résultat EDF — elle ne choisit pas le gagnant (UX-DR9).
export function finalAngle(current: number, targetIdx: number, n: number, turns: number): number {
  const seg = segmentAngle(n)
  const desired = -Math.PI / 2 - (targetIdx + 0.5) * seg
  return current + turns + (((desired - (current % TAU)) + TAU * 2) % TAU)
}

// Segments encore présents sur la roue, en ordre d'AFFICHAGE stable (par colorIndex = ordre des actifs
// du store). On retire les `revealedCount` premiers animateurs (ordre chronologique) déjà révélés.
// L'ordre d'affichage étant indépendant de l'ordre de révélation, la roue garde une disposition fixe et
// s'arrête à des positions variées (théâtre), tout en se vidant à mesure des révélations (AC-3).
export function remainingSegments(segments: WheelSegment[], revealedCount: number): WheelSegment[] {
  const revealedIds = new Set(segments.slice(0, revealedCount).map((s) => s.participantId))
  return [...segments]
    .sort((a, b) => a.colorIndex - b.colorIndex)
    .filter((s) => !revealedIds.has(s.participantId))
}

// Index, DANS la liste des segments restants, de l'animateur ciblé (= planning[revealedCount]).
// -1 s'il n'y est pas (défensif). Sert à orienter la roue vers le bon segment après chaque retrait.
export function targetIndexInRemaining(
  remaining: WheelSegment[],
  targetParticipantId: string,
): number {
  return remaining.findIndex((s) => s.participantId === targetParticipantId)
}
