'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabasePublic } from '@/lib/supabase/client'
import {
  fetchParticipants,
  writeParticipant,
  WriteError,
  type Participant,
  type WriteOp,
  type WritePayload,
} from '@/lib/data/participants'
import { type ParticipantChangeEvent } from '@/lib/store/reconcile'
import { participantsReducer, type StoreParticipant } from '@/lib/store/participants-reducer'
import { parseNames } from '@/lib/store/parse-names'

// Store client de la tranche verticale « participants » (Story 1.5).
// UI → store → lib/data/ (AD-11) : aucun composant ne touche `supabase.from(...)` ni `fetch('/api/...')`.
// Le SEUL accès Supabase direct ici est l'ABONNEMENT Realtime de lecture via `supabasePublic` (AD-6/AD-7).

// Modèle d'état, type `Action` et `participantsReducer` (pur) : extraits dans
// `lib/store/participants-reducer.ts` (Story 2.2) → testés sans réseau ni env (AD-13).

// ── Passphrase (AD-8) : saisie dans l'UI, mémorisée en sessionStorage (onglet courant) ──────
// JAMAIS une variable NEXT_PUBLIC_ ; JAMAIS loggée ; effacée sur 401.
const PASSPHRASE_KEY = 'team-passphrase'
function readPassphrase(): string | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(PASSPHRASE_KEY)
}
function storePassphrase(value: string): void {
  if (typeof window !== 'undefined') window.sessionStorage.setItem(PASSPHRASE_KEY, value)
}
function clearPassphrase(): void {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(PASSPHRASE_KEY)
}

// Drapeau-snapshot vers ligne serveur (sans pending/failed) pour les rollbacks RESTORE (Story 2.2).
function toServerRow(p: StoreParticipant): Participant {
  return { id: p.id, name: p.name, active: p.active, created_at: p.created_at, updated_at: p.updated_at }
}

// Spécification d'une écriture serveur, consommée par le runWrite générique (insert/update/delete).
// Mise en file (passphrase) ou conservée pour le retry telle quelle ; `submit`/`retry` la rejouent (Story 2.2).
type WriteSpec = {
  optimisticId: string | null // ligne à marquer pending/failed (tempId pour insert, id pour update ; null pour delete)
  op: WriteOp
  payload: WritePayload
  rollback: () => void // annule l'optimiste (insert→ROLLBACK ; update/delete→RESTORE snapshot)
  onConfirm: (row: Participant) => void // succès : applique la ligne serveur (CONFIRM) ; delete → no-op
  deleteIdempotent?: boolean // delete : 409 « introuvable » = déjà supprimé ailleurs → succès idempotent (AD-16)
}

// ── Contexte exposé ─────────────────────────────────────────────────────────
type StoreValue = {
  participants: StoreParticipant[]
  addParticipants: (raw: string) => void
  toggleActive: (id: string) => void
  renameParticipant: (id: string, newName: string) => void
  deleteParticipant: (id: string) => void
  retryParticipant: (id: string) => void
  error: string | null
  clearError: () => void
  passphraseNeeded: boolean
  submitPassphrase: (value: string) => void
  cancelPassphrase: () => void
}

const ParticipantsContext = createContext<StoreValue | null>(null)

export function ParticipantsStoreProvider({
  initial,
  children,
}: {
  initial: Participant[]
  children: ReactNode
}) {
  const [participants, dispatch] = useReducer(participantsReducer, initial as StoreParticipant[])
  const [error, setError] = useState<string | null>(null)
  const [passphraseNeeded, setPassphraseNeeded] = useState(false)

  const seqRef = useRef(0) // ids temporaires d'insert (`temp:<n>`).
  const writeSeqRef = useRef(0) // clés uniques de file passphrase (`w:<n>`).
  // Écritures en attente d'une passphrase (sans passphrase, ou re-prompt après 401) → rejouées après saisie (AC5).
  const pendingWritesRef = useRef<Map<string, WriteSpec>>(new Map())
  // Dernière écriture ÉCHOUÉE (transient) par id de ligne → rejouée par `retryParticipant` (AC5).
  const failedWritesRef = useRef<Map<string, WriteSpec>>(new Map())
  // Miroir de l'état pour lire un snapshot de ligne hors closure (toggle/rename/delete/retry).
  const stateRef = useRef(participants)
  useEffect(() => {
    stateRef.current = participants
  }, [participants])

  // Écriture serveur GÉNÉRIQUE (insert/update/delete) portant la taxonomie d'erreurs AD-17.
  // Le caller a DÉJÀ appliqué l'optimiste (ADD_OPTIMISTIC / PATCH_OPTIMISTIC / REMOVE) et fourni le rollback.
  const runWrite = useCallback(async (spec: WriteSpec) => {
    const writeKey = `w:${writeSeqRef.current++}`
    const passphrase = readPassphrase()
    if (!passphrase) {
      // Demande paresseuse : on garde l'optimiste, on met l'écriture en file, on ouvre UN seul prompt (AC5).
      pendingWritesRef.current.set(writeKey, spec)
      setPassphraseNeeded(true)
      return
    }
    if (spec.optimisticId) dispatch({ type: 'SET_PENDING', tempId: spec.optimisticId })
    try {
      const row = (await writeParticipant(spec.op, spec.payload, passphrase)) as Participant
      if (spec.optimisticId) failedWritesRef.current.delete(spec.optimisticId)
      spec.onConfirm(row)
    } catch (e) {
      if (!(e instanceof WriteError)) {
        if (spec.optimisticId) {
          dispatch({ type: 'MARK_FAILED', tempId: spec.optimisticId })
          failedWritesRef.current.set(spec.optimisticId, spec)
        } else {
          spec.rollback()
        }
        setError('Erreur inattendue lors de l’écriture. Réessayez.')
        return
      }
      // Taxonomie d'erreurs d'écriture (AD-17).
      switch (e.kind) {
        case 'auth': // 401 : passphrase invalide → effacer, re-prompt, rejouer après saisie (AC5).
          clearPassphrase()
          pendingWritesRef.current.set(writeKey, spec)
          if (spec.optimisticId) dispatch({ type: 'SET_PENDING', tempId: spec.optimisticId })
          setPassphraseNeeded(true)
          break
        case 'validation': // 400 : rollback de l'optimiste + message.
          spec.rollback()
          setError(e.message)
          break
        case 'conflict': // 409.
          if (spec.deleteIdempotent) {
            // delete : ligne déjà absente côté serveur → déjà supprimée ailleurs = succès idempotent (AD-16).
            break
          }
          try {
            const rows = await fetchParticipants()
            dispatch({ type: 'HYDRATE', rows })
          } catch {
            // re-hydratation impossible : Realtime/reconnexion prendra le relais.
          }
          setError('Conflit détecté — état resynchronisé avec le serveur.')
          break
        case 'transient': // 5xx.
          if (spec.optimisticId) {
            // insert/update : on garde l'optimiste + bouton « Réessayer » (rejoue l'op d'origine, AC5).
            dispatch({ type: 'MARK_FAILED', tempId: spec.optimisticId })
            failedWritesRef.current.set(spec.optimisticId, spec)
            setError('Échec temporaire — vous pouvez réessayer.')
          } else {
            // delete : la ligne a déjà disparu → on la restaure et on invite à recommencer.
            spec.rollback()
            setError('Échec temporaire de la suppression — réessayez.')
          }
          break
      }
    }
  }, [])

  // Chemin INTERNE par nom : crée une ligne optimiste + déclenche l'insert (réutilisé par addParticipants).
  const addParticipant = useCallback(
    (rawName: string) => {
      const name = rawName.trim()
      if (!name) return // nom vide après trim → aucune écriture.
      const tempId = `temp:${seqRef.current++}`
      dispatch({ type: 'ADD_OPTIMISTIC', tempId, name })
      void runWrite({
        optimisticId: tempId,
        op: 'insert',
        payload: { data: { name } },
        rollback: () => dispatch({ type: 'ROLLBACK', tempId }),
        onConfirm: (row) => dispatch({ type: 'CONFIRM', tempId, row }),
      })
    },
    [runWrite],
  )

  // Point d'entrée PUBLIC (Story 2.1) : ajout multiple en une saisie (séparée par `,`/`;`).
  // parseNames découpe/trim/élimine les vides ; chaque nom suit le chemin optimiste mono-nom.
  // N noms sans passphrase → N écritures en file (pendingWritesRef) → UN seul prompt → replay groupé (AC2).
  const addParticipants = useCallback(
    (raw: string) => {
      for (const name of parseNames(raw)) addParticipant(name)
    },
    [addParticipant],
  )

  // Bascule actif/inactif (FR2) : optimiste (PATCH) + update patch partiel ; rollback = RESTORE du snapshot.
  const toggleActive = useCallback(
    (id: string) => {
      const snapshot = stateRef.current.find((r) => r.id === id)
      if (!snapshot) return
      const nextActive = !snapshot.active
      const restore = toServerRow(snapshot)
      dispatch({ type: 'PATCH_OPTIMISTIC', id, patch: { active: nextActive } })
      void runWrite({
        optimisticId: id,
        op: 'update',
        payload: { id, data: { active: nextActive } },
        rollback: () => dispatch({ type: 'RESTORE', row: restore }),
        onConfirm: (row) => dispatch({ type: 'CONFIRM', tempId: id, row }),
      })
    },
    [runWrite],
  )

  // Renommage inline (FR3, UX-DR3) : no-op si vide ou identique ; sinon optimiste + update.
  const renameParticipant = useCallback(
    (id: string, newName: string) => {
      const name = newName.trim()
      const snapshot = stateRef.current.find((r) => r.id === id)
      if (!snapshot) return
      if (name === '' || name === snapshot.name) return // aucune écriture.
      const restore = toServerRow(snapshot)
      dispatch({ type: 'PATCH_OPTIMISTIC', id, patch: { name } })
      void runWrite({
        optimisticId: id,
        op: 'update',
        payload: { id, data: { name } },
        rollback: () => dispatch({ type: 'RESTORE', row: restore }),
        onConfirm: (row) => dispatch({ type: 'CONFIRM', tempId: id, row }),
      })
    },
    [runWrite],
  )

  // Suppression (FR4) : la confirmation est demandée côté UI (AC6) ; ici optimiste REMOVE + delete serveur.
  // La suppression des indisponibilités liées est assurée par ON DELETE CASCADE au niveau DB (aucun code ici).
  const deleteParticipant = useCallback(
    (id: string) => {
      const snapshot = stateRef.current.find((r) => r.id === id)
      if (!snapshot) return
      const restore = toServerRow(snapshot)
      dispatch({ type: 'REMOVE', id })
      void runWrite({
        optimisticId: null,
        op: 'delete',
        payload: { id },
        rollback: () => dispatch({ type: 'RESTORE', row: restore }),
        onConfirm: () => {
          /* delete : la ligne est déjà retirée ; l'écho Realtime DELETE est un no-op (AD-15). */
        },
        deleteIdempotent: true,
      })
    },
    [runWrite],
  )

  // Rejoue la dernière écriture ÉCHOUÉE (transient) d'une ligne — l'op D'ORIGINE, pas un insert (AC5).
  const retryParticipant = useCallback(
    (id: string) => {
      const spec = failedWritesRef.current.get(id)
      if (!spec) return
      failedWritesRef.current.delete(id)
      void runWrite(spec)
    },
    [runWrite],
  )

  const submitPassphrase = useCallback(
    (value: string) => {
      const v = value.trim()
      if (!v) return
      storePassphrase(v)
      setPassphraseNeeded(false)
      // Rejoue TOUTES les écritures en file pendant l'absence de passphrase — un seul prompt pour N (AC5).
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

  const clearError = useCallback(() => setError(null), [])

  // ── Abonnement Realtime + re-hydratation à chaque (re)connexion (AD-6) ──────
  useEffect(() => {
    const channel = supabasePublic
      .channel('participants-rt')
      .on<Participant>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants' },
        (payload) => {
          const event = mapPayload(payload)
          if (event) dispatch({ type: 'REALTIME', event })
        },
      )
      .subscribe((status) => {
        // Abonnement initial ET reconnexions (les connexions publiques tombent ~24 h) :
        // on re-hydrate depuis la source canonique pour ne rien manquer (AD-4/AD-6).
        if (status === 'SUBSCRIBED') {
          fetchParticipants()
            .then((rows) => dispatch({ type: 'HYDRATE', rows }))
            .catch(() => {
              // refetch impossible : on garde l'état courant ; un prochain SUBSCRIBED réessaiera.
            })
        }
      })

    return () => {
      void supabasePublic.removeChannel(channel)
    }
  }, [])

  const value: StoreValue = {
    participants,
    addParticipants,
    toggleActive,
    renameParticipant,
    deleteParticipant,
    retryParticipant,
    error,
    clearError,
    passphraseNeeded,
    submitPassphrase,
    cancelPassphrase,
  }

  return <ParticipantsContext.Provider value={value}>{children}</ParticipantsContext.Provider>
}

export function useParticipants(): StoreValue {
  const ctx = useContext(ParticipantsContext)
  if (!ctx) throw new Error('useParticipants doit être utilisé dans <ParticipantsStoreProvider>.')
  return ctx
}

// Mappe un payload `postgres_changes` vers l'événement minimal du réducteur pur.
function mapPayload(payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Partial<Participant>
  old: Partial<Participant>
}): ParticipantChangeEvent | null {
  if (payload.eventType === 'DELETE') {
    const id = payload.old?.id
    return typeof id === 'string' ? { eventType: 'DELETE', old: { id } } : null
  }
  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    return { eventType: payload.eventType, new: payload.new as Participant }
  }
  return null
}
