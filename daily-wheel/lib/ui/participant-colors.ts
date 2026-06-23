// Attribution de couleur par participant (Story 5.3). Helper PUR (aucun import React/DOM/Supabase) :
// logique isolée, testable en env node (esprit AD-1), consommée par la timeline (`ScheduleTimeline`).
//
// CONTRAT PARTAGÉ timeline (5.3) ↔ roue (5.4) : la couleur d'une personne dérive de son INDEX dans la
// liste des participants ACTIFS (ordre du store — exactement la liste que `generate()` envoie au domaine,
// participants-store.tsx:656), modulo la palette `wheel-segments`. La roue (5.4) DOIT réutiliser cette
// même palette et la même base d'index ⇒ une personne garde sa couleur partout (AC-6, DESIGN.md:99).

// Palette `wheel-segments` autoritaire (DESIGN.md l. 24-32) : 8 couleurs stables et distinctes.
export const WHEEL_SEGMENT_COLORS = [
  '#0078d4', // bleu Microsoft
  '#38b2ac', // teal / accent
  '#7c5cff', // violet
  '#e8618c', // rose
  '#f59e0b', // ambre
  '#10b981', // émeraude
  '#3b82f6', // bleu vif
  '#ef4444', // rouge
] as const

// Couleur stable pour un index donné (rebouclage modulo la palette au-delà de 8 personnes).
export function colorForIndex(index: number): string {
  const n = WHEEL_SEGMENT_COLORS.length
  // Normalisation positive : robuste à un index négatif inattendu (défensif).
  return WHEEL_SEGMENT_COLORS[((index % n) + n) % n]
}

// Map `id` → index de position dans la liste des actifs (ordre du store). Base de l'attribution
// de couleur partagée timeline/roue. La liste reçue EST déjà l'ordre autoritaire (le composant passe
// `participants.filter((p) => p.active)`).
export function buildColorIndexMap(activeParticipants: { id: string }[]): Map<string, number> {
  return new Map(activeParticipants.map((p, i) => [p.id, i] as const))
}

// Initiale d'affichage d'un prénom (avatar) : première lettre en capitale. Tolère les espaces de tête.
export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase()
}
