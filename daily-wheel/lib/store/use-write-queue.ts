'use client'

import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { WriteError } from '@/lib/data/write-error'

// File d'écriture partagée du team store (extraite du provider en Story 3.2, [[store-extraction-plan]]).
// TABLE-AGNOSTIQUE (Story 2.3) : chaque `WriteSpec` porte ses propres thunks, donc la même file/passphrase
// sert participants + indispos + exclusions + fériés (+ futures tables) — UN SEUL prompt pour N mutations
// toutes tables confondues (AD-8). Comportement IDENTIQUE à l'inline d'origine ; seule l'enveloppe change.
//
// Le SEUL état métier qui reste hors de ce hook est `error` (propriété du provider, aussi utilisé par la
// validation cliente des slices) : il est injecté via `setError`.

// ── Passphrase (AD-8) : saisie dans l'UI, mémorisée en sessionStorage (onglet courant) ──────
// JAMAIS une variable NEXT_PUBLIC_ ; JAMAIS loggée ; effacée sur 401.
const PASSPHRASE_KEY = 'team-passphrase'
function readPassphrase(): string | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(PASSPHRASE_KEY)
}
function storePassphrase(value: string): void {
  if (typeof window !== 'undefined') window.sessionStorage.setItem(PASSPHRASE_KEY, value)
  emitPassphraseChange()
}
function clearPassphrase(): void {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(PASSPHRASE_KEY)
  emitPassphraseChange()
}

// ── État de protection annoncé (Story 5.1, UX-DR8) ───────────────────────────
// sessionStorage n'est pas observable en intra-onglet (l'event `storage` est cross-onglet seulement).
// Mini pub/sub : store/clear notifient → `useSyncExternalStore` resnapshote. Hydratation-safe via le
// snapshot serveur (`false`), donc PAS de mismatch ; au rechargement le snapshot client lit la session.
const passphraseListeners = new Set<() => void>()
function emitPassphraseChange(): void {
  for (const l of passphraseListeners) l()
}
function subscribePassphrase(cb: () => void): () => void {
  passphraseListeners.add(cb)
  return () => passphraseListeners.delete(cb)
}

// Spécification d'une écriture serveur, TABLE-AGNOSTIQUE (Story 2.3) : porte ses propres thunks.
// Mise en file (passphrase) ou conservée pour le retry telle quelle ; `submit`/`retry` la rejouent.
export type WriteSpec = {
  write: (passphrase: string) => Promise<unknown> // l'appel data (writeParticipant / writeUnavailability / …)
  onConfirm: (row: unknown) => void // succès : applique la ligne serveur (CONFIRM) ; delete → no-op
  rollback: () => void // annule l'optimiste (insert→ROLLBACK ; update/delete→RESTORE snapshot)
  onPending?: () => void // marque la ligne pending (SET_PENDING) ; absent pour un delete
  onFailed?: () => void // marque la ligne failed (MARK_FAILED) ; absent pour un delete
  onConflictRehydrate?: () => Promise<void> // 409 non-idempotent : re-hydrate depuis la source canonique
  retryKey?: string | null // clé failedWritesRef (retry) ; null pour un delete (pas de retry)
  deleteIdempotent?: boolean // delete : 409 « introuvable » = déjà supprimé ailleurs → succès idempotent (AD-16)
  // Écriture BEST-EFFORT (Story 5.6, « dégradation gracieuse ») : un échec ne lève PAS le bandeau d'erreur
  // global (la mécanique optimiste/rollback/retry reste appliquée). Utilisé par la persistance rotation_state :
  // la roue tourne et le planning s'affiche même si la sauvegarde (reprise après reload) échoue — inutile de
  // nagger l'utilisateur. Décision Solo 2026-06-24.
  silent?: boolean
}

export type WriteQueue = {
  runWrite: (spec: WriteSpec) => Promise<void>
  retry: (key: string) => void
  passphraseNeeded: boolean
  submitPassphrase: (value: string) => void
  cancelPassphrase: () => void
  // Miroir LECTURE-SEULE de la présence d'une passphrase en sessionStorage (Story 5.1, UX-DR8) :
  // `false` = verrouillée (aucune passphrase) ; `true` = déverrouillée. Réactif (storage non observable).
  unlocked: boolean
}

export function useWriteQueue({ setError }: { setError: (message: string | null) => void }): WriteQueue {
  const [passphraseNeeded, setPassphraseNeeded] = useState(false)
  // Déverrouillée ssi une passphrase est mémorisée. Snapshot serveur `false` → pas de mismatch d'hydratation ;
  // store/clear émettent → re-render. cancelPassphrase ne touche pas la session → l'état reste cohérent.
  const unlocked = useSyncExternalStore(
    subscribePassphrase,
    () => readPassphrase() !== null,
    () => false,
  )

  const writeSeqRef = useRef(0) // clés uniques de file passphrase (`w:<n>`).
  // Écritures en attente d'une passphrase (sans passphrase, ou re-prompt après 401) → rejouées après saisie (AC5).
  const pendingWritesRef = useRef<Map<string, WriteSpec>>(new Map())
  // Dernière écriture ÉCHOUÉE (transient) par retryKey → rejouée par retry() (AC5).
  const failedWritesRef = useRef<Map<string, WriteSpec>>(new Map())

  // `setError` est le setter useState du provider → identité STABLE entre renders. Le déclarer en dépendance
  // de `runWrite` est donc sans effet sur l'identité du callback (équivalent fonctionnel à l'inline d'origine).

  // Écriture serveur GÉNÉRIQUE et TABLE-AGNOSTIQUE portant la taxonomie d'erreurs AD-17.
  // Le caller a DÉJÀ appliqué l'optimiste et fourni write/onConfirm/rollback (+ thunks optionnels).
  const runWrite = useCallback(async (spec: WriteSpec) => {
    const writeKey = `w:${writeSeqRef.current++}`
    const passphrase = readPassphrase()
    if (!passphrase) {
      // Demande paresseuse : on garde l'optimiste, on met l'écriture en file, on ouvre UN seul prompt (AC5).
      pendingWritesRef.current.set(writeKey, spec)
      setPassphraseNeeded(true)
      return
    }
    spec.onPending?.()
    try {
      const row = await spec.write(passphrase)
      if (spec.retryKey != null) failedWritesRef.current.delete(spec.retryKey)
      spec.onConfirm(row)
    } catch (e) {
      if (!(e instanceof WriteError)) {
        if (spec.retryKey != null) {
          spec.onFailed?.()
          failedWritesRef.current.set(spec.retryKey, spec)
        } else {
          spec.rollback()
        }
        if (!spec.silent) setError('Erreur inattendue lors de l’écriture. Réessaie.')
        return
      }
      // Taxonomie d'erreurs d'écriture (AD-17).
      switch (e.kind) {
        case 'auth': // 401 : passphrase invalide → effacer (repasse « verrouillée », UX-DR8), re-prompt, rejouer (AC5).
          clearPassphrase()
          pendingWritesRef.current.set(writeKey, spec)
          spec.onPending?.()
          setPassphraseNeeded(true)
          break
        case 'validation': // 400 : rollback de l'optimiste + message.
          spec.rollback()
          if (!spec.silent) setError(e.message)
          break
        case 'conflict': // 409.
          if (spec.deleteIdempotent) {
            // delete : ligne déjà absente côté serveur → déjà supprimée ailleurs = succès idempotent (AD-16).
            break
          }
          await spec.onConflictRehydrate?.()
          if (!spec.silent) setError('Conflit détecté — état resynchronisé avec le serveur.')
          break
        case 'transient': // 5xx.
          if (spec.retryKey != null) {
            // insert/update : on garde l'optimiste + bouton « Réessayer » (rejoue l'op d'origine, AC5).
            spec.onFailed?.()
            failedWritesRef.current.set(spec.retryKey, spec)
            if (!spec.silent) setError('Échec temporaire — tu peux réessayer.')
          } else {
            // delete : la ligne a déjà disparu → on la restaure et on invite à recommencer.
            spec.rollback()
            if (!spec.silent) setError('Échec temporaire de la suppression — réessaie.')
          }
          break
      }
    }
  }, [setError])

  // Rejoue la dernière écriture ÉCHOUÉE (transient) d'une ligne — l'op D'ORIGINE (AC5).
  const retry = useCallback(
    (key: string) => {
      const spec = failedWritesRef.current.get(key)
      if (!spec) return
      failedWritesRef.current.delete(key)
      void runWrite(spec)
    },
    [runWrite],
  )

  const submitPassphrase = useCallback(
    (value: string) => {
      const v = value.trim()
      if (!v) return
      storePassphrase(v) // passe « déverrouillée » (UX-DR8) — validité réelle confirmée par le serveur au write.
      setPassphraseNeeded(false)
      // Rejoue TOUTES les écritures en file (toutes tables confondues) — un seul prompt pour N (AC5).
      const queued = Array.from(pendingWritesRef.current.values())
      pendingWritesRef.current.clear()
      for (const spec of queued) void runWrite(spec)
    },
    [runWrite],
  )

  const cancelPassphrase = useCallback(() => {
    setPassphraseNeeded(false)
    // Annulation : rollback de chaque optimiste en attente (insert→remove, update/delete→restore).
    const queued = Array.from(pendingWritesRef.current.values())
    pendingWritesRef.current.clear()
    for (const spec of queued) spec.rollback()
  }, [])

  return { runWrite, retry, passphraseNeeded, submitPassphrase, cancelPassphrase, unlocked }
}
