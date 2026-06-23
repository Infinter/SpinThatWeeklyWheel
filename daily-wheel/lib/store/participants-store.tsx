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
} from '@/lib/data/participants'
import {
  fetchUnavailabilities,
  writeUnavailability,
  type Unavailability,
} from '@/lib/data/unavailabilities'
import {
  fetchGroupExclusions,
  writeGroupExclusion,
  type GroupExclusion,
} from '@/lib/data/group-exclusions'
import { type ChangeEvent } from '@/lib/store/reconcile'
import { participantsReducer, type StoreParticipant } from '@/lib/store/participants-reducer'
import { unavailabilitiesReducer, type StoreUnavailability } from '@/lib/store/unavailabilities-reducer'
import { groupExclusionsReducer, type StoreGroupExclusion } from '@/lib/store/group-exclusions-reducer'
import { isValidRange, isDuplicateDay, type DayOrRange } from '@/lib/domain/availability'
import { isValidEveryN, refDateMatchesDayOfWeek } from '@/lib/domain/team-availability'
import { parseNames } from '@/lib/store/parse-names'

// Store client de l'équipe (Story 1.5 → 2.3). UI → store → lib/data/ (AD-11) : aucun composant ne
// touche `supabase.from(...)` ni `fetch('/api/...')`. Le SEUL accès Supabase direct ici est
// l'ABONNEMENT Realtime de lecture via `supabasePublic` (AD-6/AD-7), désormais sur DEUX tables.
//
// Story 2.3 : le provider porte une 2ᵉ slice (indisponibilités). La machinerie d'écriture
// (`runWrite` + file passphrase) est rendue TABLE-AGNOSTIQUE — les specs portent leurs propres
// thunks — pour préserver l'invariant AD-8 : N mutations (participants ET indispos confondus)
// → UN SEUL prompt passphrase → rejeu groupé.

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

// Snapshots vers ligne serveur (sans pending/failed) pour les rollbacks RESTORE.
function toServerRow(p: StoreParticipant): Participant {
  return { id: p.id, name: p.name, active: p.active, created_at: p.created_at, updated_at: p.updated_at }
}
function toServerUnavailability(u: StoreUnavailability): Unavailability {
  return {
    id: u.id,
    participant_id: u.participant_id,
    kind: u.kind,
    date1: u.date1,
    date2: u.date2,
    updated_at: u.updated_at,
  }
}
function toServerGroupExclusion(g: StoreGroupExclusion): GroupExclusion {
  return {
    id: g.id,
    day_of_week: g.day_of_week,
    every_n: g.every_n,
    ref_date: g.ref_date,
    updated_at: g.updated_at,
  }
}

// Spécification d'une écriture serveur, TABLE-AGNOSTIQUE (Story 2.3) : porte ses propres thunks.
// Mise en file (passphrase) ou conservée pour le retry telle quelle ; `submit`/`retry` la rejouent.
type WriteSpec = {
  write: (passphrase: string) => Promise<unknown> // l'appel data (writeParticipant / writeUnavailability)
  onConfirm: (row: unknown) => void // succès : applique la ligne serveur (CONFIRM) ; delete → no-op
  rollback: () => void // annule l'optimiste (insert→ROLLBACK ; update/delete→RESTORE snapshot)
  onPending?: () => void // marque la ligne pending (SET_PENDING) ; absent pour un delete
  onFailed?: () => void // marque la ligne failed (MARK_FAILED) ; absent pour un delete
  onConflictRehydrate?: () => Promise<void> // 409 non-idempotent : re-hydrate depuis la source canonique
  retryKey?: string | null // clé failedWritesRef (retry) ; null pour un delete (pas de retry)
  deleteIdempotent?: boolean // delete : 409 « introuvable » = déjà supprimé ailleurs → succès idempotent (AD-16)
}

// Forme « optionnelle » des inputs d'une indispo, telle que fournie par l'UI.
type UnavailabilityInput = { kind: 'day' | 'range'; date1: string; date2: string | null }

// Inputs d'une règle d'exclusion de groupe, tels que fournis par l'UI.
type GroupExclusionInput = { day_of_week: number; every_n: number; ref_date: string }

// ── Contexte exposé ─────────────────────────────────────────────────────────
type StoreValue = {
  participants: StoreParticipant[]
  addParticipants: (raw: string) => void
  toggleActive: (id: string) => void
  renameParticipant: (id: string, newName: string) => void
  deleteParticipant: (id: string) => void
  retryParticipant: (id: string) => void
  unavailabilities: StoreUnavailability[]
  addUnavailability: (participantId: string, input: UnavailabilityInput) => void
  removeUnavailability: (id: string) => void
  retryUnavailability: (id: string) => void
  groupExclusions: StoreGroupExclusion[]
  addGroupExclusion: (input: GroupExclusionInput) => void
  removeGroupExclusion: (id: string) => void
  retryGroupExclusion: (id: string) => void
  error: string | null
  clearError: () => void
  passphraseNeeded: boolean
  submitPassphrase: (value: string) => void
  cancelPassphrase: () => void
}

const ParticipantsContext = createContext<StoreValue | null>(null)

export function ParticipantsStoreProvider({
  initial,
  initialUnavailabilities,
  initialGroupExclusions,
  children,
}: {
  initial: Participant[]
  initialUnavailabilities: Unavailability[]
  initialGroupExclusions: GroupExclusion[]
  children: ReactNode
}) {
  const [participants, dispatch] = useReducer(participantsReducer, initial as StoreParticipant[])
  const [unavailabilities, dispatchU] = useReducer(
    unavailabilitiesReducer,
    initialUnavailabilities as StoreUnavailability[],
  )
  const [groupExclusions, dispatchG] = useReducer(
    groupExclusionsReducer,
    initialGroupExclusions as StoreGroupExclusion[],
  )
  const [error, setError] = useState<string | null>(null)
  const [passphraseNeeded, setPassphraseNeeded] = useState(false)

  const seqRef = useRef(0) // ids temporaires d'insert participant (`temp:<n>`).
  const useqRef = useRef(0) // ids temporaires d'insert indispo (`utemp:<n>`).
  const gseqRef = useRef(0) // ids temporaires d'insert exclusion de groupe (`gtemp:<n>`).
  const writeSeqRef = useRef(0) // clés uniques de file passphrase (`w:<n>`).
  // Écritures en attente d'une passphrase (sans passphrase, ou re-prompt après 401) → rejouées après saisie (AC5).
  const pendingWritesRef = useRef<Map<string, WriteSpec>>(new Map())
  // Dernière écriture ÉCHOUÉE (transient) par retryKey → rejouée par retryParticipant/retryUnavailability (AC5).
  const failedWritesRef = useRef<Map<string, WriteSpec>>(new Map())
  // Miroirs d'état pour lire un snapshot de ligne hors closure.
  const stateRef = useRef(participants)
  const stateRefU = useRef(unavailabilities)
  const stateRefG = useRef(groupExclusions)
  useEffect(() => {
    stateRef.current = participants
  }, [participants])
  useEffect(() => {
    stateRefU.current = unavailabilities
  }, [unavailabilities])
  useEffect(() => {
    stateRefG.current = groupExclusions
  }, [groupExclusions])

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
        setError('Erreur inattendue lors de l’écriture. Réessayez.')
        return
      }
      // Taxonomie d'erreurs d'écriture (AD-17).
      switch (e.kind) {
        case 'auth': // 401 : passphrase invalide → effacer, re-prompt, rejouer après saisie (AC5).
          clearPassphrase()
          pendingWritesRef.current.set(writeKey, spec)
          spec.onPending?.()
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
          await spec.onConflictRehydrate?.()
          setError('Conflit détecté — état resynchronisé avec le serveur.')
          break
        case 'transient': // 5xx.
          if (spec.retryKey != null) {
            // insert/update : on garde l'optimiste + bouton « Réessayer » (rejoue l'op d'origine, AC5).
            spec.onFailed?.()
            failedWritesRef.current.set(spec.retryKey, spec)
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

  // ── Participants ────────────────────────────────────────────────────────────
  // Chemin INTERNE par nom : crée une ligne optimiste + déclenche l'insert (réutilisé par addParticipants).
  const addParticipant = useCallback(
    (rawName: string) => {
      const name = rawName.trim()
      if (!name) return // nom vide après trim → aucune écriture.
      const tempId = `temp:${seqRef.current++}`
      dispatch({ type: 'ADD_OPTIMISTIC', tempId, name })
      void runWrite({
        write: (pp) => writeParticipant('insert', { data: { name } }, pp),
        onPending: () => dispatch({ type: 'SET_PENDING', tempId }),
        onConfirm: (row) => dispatch({ type: 'CONFIRM', tempId, row: row as Participant }),
        onFailed: () => dispatch({ type: 'MARK_FAILED', tempId }),
        rollback: () => dispatch({ type: 'ROLLBACK', tempId }),
        onConflictRehydrate: async () => {
          try {
            dispatch({ type: 'HYDRATE', rows: await fetchParticipants() })
          } catch {
            // re-hydratation impossible : Realtime/reconnexion prendra le relais.
          }
        },
        retryKey: tempId,
      })
    },
    [runWrite],
  )

  // Point d'entrée PUBLIC (Story 2.1) : ajout multiple en une saisie (séparée par `,`/`;`).
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
        write: (pp) => writeParticipant('update', { id, data: { active: nextActive } }, pp),
        onPending: () => dispatch({ type: 'SET_PENDING', tempId: id }),
        onConfirm: (row) => dispatch({ type: 'CONFIRM', tempId: id, row: row as Participant }),
        onFailed: () => dispatch({ type: 'MARK_FAILED', tempId: id }),
        rollback: () => dispatch({ type: 'RESTORE', row: restore }),
        onConflictRehydrate: async () => {
          try {
            dispatch({ type: 'HYDRATE', rows: await fetchParticipants() })
          } catch {
            /* Realtime prendra le relais. */
          }
        },
        retryKey: id,
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
        write: (pp) => writeParticipant('update', { id, data: { name } }, pp),
        onPending: () => dispatch({ type: 'SET_PENDING', tempId: id }),
        onConfirm: (row) => dispatch({ type: 'CONFIRM', tempId: id, row: row as Participant }),
        onFailed: () => dispatch({ type: 'MARK_FAILED', tempId: id }),
        rollback: () => dispatch({ type: 'RESTORE', row: restore }),
        onConflictRehydrate: async () => {
          try {
            dispatch({ type: 'HYDRATE', rows: await fetchParticipants() })
          } catch {
            /* Realtime prendra le relais. */
          }
        },
        retryKey: id,
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
        write: (pp) => writeParticipant('delete', { id }, pp),
        onConfirm: () => {
          /* delete : la ligne est déjà retirée ; l'écho Realtime DELETE est un no-op (AD-15). */
        },
        rollback: () => dispatch({ type: 'RESTORE', row: restore }),
        deleteIdempotent: true,
        retryKey: null,
      })
    },
    [runWrite],
  )

  // Rejoue la dernière écriture ÉCHOUÉE (transient) d'une ligne participant — l'op D'ORIGINE (AC5).
  const retryParticipant = useCallback(
    (id: string) => {
      const spec = failedWritesRef.current.get(id)
      if (!spec) return
      failedWritesRef.current.delete(id)
      void runWrite(spec)
    },
    [runWrite],
  )

  // ── Indisponibilités (Story 2.3) ─────────────────────────────────────────────
  // Ajout (FR5) : validation cliente PURE d'abord (AC1) → si invalide, message FR + AUCUNE écriture.
  // Sinon optimiste ADD_OPTIMISTIC + insert serveur.
  const addUnavailability = useCallback(
    (participantId: string, input: UnavailabilityInput) => {
      const { kind, date1 } = input
      const date2 = kind === 'range' ? input.date2 : null
      if (!date1) {
        setError('Veuillez saisir une date.')
        return
      }
      if (kind === 'range') {
        if (!input.date2) {
          setError('Veuillez saisir la date de fin.')
          return
        }
        if (!isValidRange(date1, input.date2)) {
          setError('La date de fin doit être postérieure ou égale au début.')
          return
        }
      } else {
        // Jour : refuse un doublon (parité legacy). Les plages ne sont pas dédupliquées (AC1).
        const existing: DayOrRange[] = stateRefU.current.filter((u) => u.participant_id === participantId)
        if (isDuplicateDay(existing, { kind: 'day', date1 })) {
          setError('Ce jour est déjà ajouté.')
          return
        }
      }
      const tempId = `utemp:${useqRef.current++}`
      const row: Unavailability = {
        id: tempId,
        participant_id: participantId,
        kind,
        date1,
        date2,
        updated_at: '',
      }
      dispatchU({ type: 'ADD_OPTIMISTIC', tempId, row })
      void runWrite({
        write: (pp) =>
          writeUnavailability('insert', { data: { participant_id: participantId, kind, date1, date2 } }, pp),
        onPending: () => dispatchU({ type: 'SET_PENDING', id: tempId }),
        onConfirm: (r) => dispatchU({ type: 'CONFIRM', tempId, row: r as Unavailability }),
        onFailed: () => dispatchU({ type: 'MARK_FAILED', id: tempId }),
        rollback: () => dispatchU({ type: 'ROLLBACK', tempId }),
        onConflictRehydrate: async () => {
          try {
            dispatchU({ type: 'HYDRATE', rows: await fetchUnavailabilities() })
          } catch {
            /* Realtime prendra le relais. */
          }
        },
        retryKey: tempId,
      })
    },
    [runWrite],
  )

  // Suppression unitaire (✕) : snapshot AVANT REMOVE → restauration si échec (delete idempotent).
  const removeUnavailability = useCallback(
    (id: string) => {
      const snapshot = stateRefU.current.find((u) => u.id === id)
      if (!snapshot) return
      const restore = toServerUnavailability(snapshot)
      dispatchU({ type: 'REMOVE', id })
      void runWrite({
        write: (pp) => writeUnavailability('delete', { id }, pp),
        onConfirm: () => {
          /* déjà retiré ; l'écho Realtime DELETE est un no-op (AD-15). */
        },
        rollback: () => dispatchU({ type: 'RESTORE', row: restore }),
        deleteIdempotent: true,
        retryKey: null,
      })
    },
    [runWrite],
  )

  const retryUnavailability = useCallback(
    (id: string) => {
      const spec = failedWritesRef.current.get(id)
      if (!spec) return
      failedWritesRef.current.delete(id)
      void runWrite(spec)
    },
    [runWrite],
  )

  // ── Exclusions de groupe (Story 3.1) ─────────────────────────────────────────
  // Ajout (FR6) : validation cliente PURE d'abord (AC1) → si invalide, message FR + AUCUNE écriture.
  // Sinon optimiste ADD_OPTIMISTIC + insert serveur.
  const addGroupExclusion = useCallback(
    (input: GroupExclusionInput) => {
      const { day_of_week, every_n, ref_date } = input
      if (!ref_date) {
        setError('Veuillez saisir une date de référence.')
        return
      }
      if (!isValidEveryN(every_n)) {
        setError('La fréquence doit être un entier ≥ 1.')
        return
      }
      if (!refDateMatchesDayOfWeek(ref_date, day_of_week)) {
        setError('La date de référence doit tomber sur le jour de semaine choisi.')
        return
      }
      const tempId = `gtemp:${gseqRef.current++}`
      const row: GroupExclusion = { id: tempId, day_of_week, every_n, ref_date, updated_at: '' }
      dispatchG({ type: 'ADD_OPTIMISTIC', tempId, row })
      void runWrite({
        write: (pp) => writeGroupExclusion('insert', { data: { day_of_week, every_n, ref_date } }, pp),
        onPending: () => dispatchG({ type: 'SET_PENDING', id: tempId }),
        onConfirm: (r) => dispatchG({ type: 'CONFIRM', tempId, row: r as GroupExclusion }),
        onFailed: () => dispatchG({ type: 'MARK_FAILED', id: tempId }),
        rollback: () => dispatchG({ type: 'ROLLBACK', tempId }),
        onConflictRehydrate: async () => {
          try {
            dispatchG({ type: 'HYDRATE', rows: await fetchGroupExclusions() })
          } catch {
            /* Realtime prendra le relais. */
          }
        },
        retryKey: tempId,
      })
    },
    [runWrite],
  )

  // Suppression unitaire (✕) : snapshot AVANT REMOVE → restauration si échec (delete idempotent).
  const removeGroupExclusion = useCallback(
    (id: string) => {
      const snapshot = stateRefG.current.find((g) => g.id === id)
      if (!snapshot) return
      const restore = toServerGroupExclusion(snapshot)
      dispatchG({ type: 'REMOVE', id })
      void runWrite({
        write: (pp) => writeGroupExclusion('delete', { id }, pp),
        onConfirm: () => {
          /* déjà retiré ; l'écho Realtime DELETE est un no-op (AD-15). */
        },
        rollback: () => dispatchG({ type: 'RESTORE', row: restore }),
        deleteIdempotent: true,
        retryKey: null,
      })
    },
    [runWrite],
  )

  const retryGroupExclusion = useCallback(
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
      // Rejoue TOUTES les écritures en file (participants ET indispos) — un seul prompt pour N (AC5).
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

  // ── Abonnement Realtime participants + re-hydratation à chaque (re)connexion (AD-6) ──────
  useEffect(() => {
    const channel = supabasePublic
      .channel('participants-rt')
      .on<Participant>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants' },
        (payload) => {
          const event = mapChange<Participant>(payload)
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

  // ── 2ᵉ abonnement Realtime : indisponibilités (Story 2.3, AD-6) ──────────────
  useEffect(() => {
    const channel = supabasePublic
      .channel('unavailabilities-rt')
      .on<Unavailability>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'unavailabilities' },
        (payload) => {
          const event = mapChange<Unavailability>(payload)
          if (event) dispatchU({ type: 'REALTIME', event })
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          fetchUnavailabilities()
            .then((rows) => dispatchU({ type: 'HYDRATE', rows }))
            .catch(() => {
              /* refetch impossible : un prochain SUBSCRIBED réessaiera. */
            })
        }
      })

    return () => {
      void supabasePublic.removeChannel(channel)
    }
  }, [])

  // ── 3ᵉ abonnement Realtime : exclusions de groupe (Story 3.1, AD-6) ──────────
  useEffect(() => {
    const channel = supabasePublic
      .channel('group-exclusions-rt')
      .on<GroupExclusion>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_exclusions' },
        (payload) => {
          const event = mapChange<GroupExclusion>(payload)
          if (event) dispatchG({ type: 'REALTIME', event })
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          fetchGroupExclusions()
            .then((rows) => dispatchG({ type: 'HYDRATE', rows }))
            .catch(() => {
              /* refetch impossible : un prochain SUBSCRIBED réessaiera. */
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
    unavailabilities,
    addUnavailability,
    removeUnavailability,
    retryUnavailability,
    groupExclusions,
    addGroupExclusion,
    removeGroupExclusion,
    retryGroupExclusion,
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

// Mappe un payload `postgres_changes` vers l'événement minimal du réducteur pur (générique sur T).
function mapChange<T extends { id: string }>(payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Partial<T>
  old: Partial<T>
}): ChangeEvent<T> | null {
  if (payload.eventType === 'DELETE') {
    const id = payload.old?.id
    return typeof id === 'string' ? { eventType: 'DELETE', old: { id } } : null
  }
  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    return { eventType: payload.eventType, new: payload.new as T }
  }
  return null
}
