// Parseur de noms pour l'ajout multiple de participants (Story 2.1, FR1).
// PUR : aucun import React / DOM / Supabase / Date — testé unitairement, exécutable en CI sans secrets (AD-13).
//
// Découpe une saisie libre sur `,` ET `;` (mixables), trim chaque segment, élimine les vides,
// préserve l'ordre. Ne déduplique PAS : les doublons de noms sont autorisés en 2.1.
//   parseNames('Alice, Bob ; Chloé') -> ['Alice', 'Bob', 'Chloé']
//   parseNames(' , ; ')              -> []
export function parseNames(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
}
