// Taxonomie d'erreurs d'écriture PARTAGÉE (AD-17) — extraite de `participants.ts` (Story 2.3)
// pour être réutilisée par `unavailabilities.ts` SANS créer de dépendance latérale entre tables.
// `participants.ts` re-exporte ces symboles (non-régression des imports existants).
//
// Classes d'erreur d'écriture (AD-17) — guident le traitement optimiste (Story 1.5/2.2/2.3) :
//   auth       → re-prompt passphrase, pas de retry, pas de rollback silencieux
//   validation → rollback de l'optimiste
//   conflict   → re-hydrater puis ré-appliquer (AD-16)
//   transient  → retry possible
export type WriteErrorKind = 'auth' | 'validation' | 'conflict' | 'transient'

export class WriteError extends Error {
  readonly kind: WriteErrorKind
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'WriteError'
    this.status = status
    this.kind = writeErrorFromStatus(status)
  }
}

// Fonction PURE : mappe un statut HTTP vers une classe d'erreur (AD-17). Testée unitairement.
export function writeErrorFromStatus(status: number): WriteErrorKind {
  if (status === 401) return 'auth'
  if (status === 400) return 'validation'
  if (status === 409) return 'conflict'
  // 5xx et tout statut inattendu : prudence → transitoire (retry possible).
  return 'transient'
}
