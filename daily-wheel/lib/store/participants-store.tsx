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
import { reconcileParticipants, type ParticipantChangeEvent } from '@/lib/store/reconcile'

// Store client de la tranche verticale « participants » (Story 1.5).
// UI → store → lib/data/ (AD-11) : aucun composant ne touche `supabase.from(...)` ni `fetch('/api/...')`.
// Le SEUL accès Supabase direct ici est l'ABONNEMENT Realtime de lecture via `supabasePublic` (AD-6/AD-7).

// ── Modèle d'état ─────────────────────────────────────────────────────────
// Une ligne du store = un Participant serveur + des drapeaux client-only :
//   pending : écriture optimiste en vol (AD-5) ; failed : dernière écriture échouée (retry possible, AD-17 transient).
export type StoreParticipant = Participant & { pending?: boolean; failed?: boolean }

type Action =
  | { type: 'HYDRATE'; rows: Participant[] }
  | { type: 'REALTIME'; event: ParticipantChangeEvent }
  | { type: 'ADD_OPTIMISTIC'; tempId: string; name: string }
  | { type: 'SET_PENDING'; tempId: string }
  | { type: 'CONFIRM'; tempId: string; row: Participant }
  | { type: 'ROLLBACK'; tempId: string }
  | { type: 'MARK_FAILED'; tempId: string }

function reducer(state: StoreParticipant[], action: Action): StoreParticipant[] {
  switch (action.type) {
    case 'HYDRATE':
      // Re-synchronise sur la source canonique (AD-4) : les drapeaux optimistes sont abandonnés.
      return action.rows
    case 'REALTIME':
      // Réconciliation pure (AD-15/AD-16) ; les StoreParticipant non touchés conservent leurs drapeaux.
      return reconcileParticipants(state, action.event) as StoreParticipant[]
    case 'ADD_OPTIMISTIC':
      return [
        ...state,
        { id: action.tempId, name: action.name, active: true, created_at: '', updated_at: '', pending: true },
      ]
    case 'SET_PENDING':
      return state.map((r) => (r.id === action.tempId ? { ...r, pending: true, failed: false } : r))
    case 'CONFIRM':
      // Remplace la ligne temp par la ligne serveur (id réel + updated_at réel) → l'écho Realtime sera dédupliqué (AD-15).
      return state.map((r) => (r.id === action.tempId ? action.row : r))
    case 'ROLLBACK':
      return state.filter((r) => r.id !== action.tempId)
    case 'MARK_FAILED':
      return state.map((r) => (r.id === action.tempId ? { ...r, pending: false, failed: true } : r))
    default:
      return state
  }
}

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

// ── Contexte exposé ─────────────────────────────────────────────────────────
type StoreValue = {
  participants: StoreParticipant[]
  addParticipant: (name: string) => void
  retryParticipant: (tempId: string) => void
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
  const [participants, dispatch] = useReducer(reducer, initial as StoreParticipant[])
  const [error, setError] = useState<string | null>(null)
  const [passphraseNeeded, setPassphraseNeeded] = useState(false)

  const seqRef = useRef(0)
  // Écritures en attente d'une passphrase (1er ajout sans passphrase, ou re-prompt après 401) → rejouées après saisie.
  const pendingWritesRef = useRef<Map<string, { name: string }>>(new Map())
  // Miroir de l'état pour `retryParticipant` (lecture du nom hors closure, depuis un handler).
  const stateRef = useRef(participants)
  useEffect(() => {
    stateRef.current = participants
  }, [participants])

  // Exécute l'écriture serveur pour une ligne optimiste déjà présente dans le store.
  const runWrite = useCallback(async (tempId: string, name: string) => {
    const passphrase = readPassphrase()
    if (!passphrase) {
      // Demande paresseuse : on garde l'optimiste, on met l'écriture en file, on ouvre le prompt (AC5).
      pendingWritesRef.current.set(tempId, { name })
      setPassphraseNeeded(true)
      return
    }
    dispatch({ type: 'SET_PENDING', tempId })
    try {
      const row = (await writeParticipant('insert', { data: { name } }, passphrase)) as Participant
      pendingWritesRef.current.delete(tempId)
      dispatch({ type: 'CONFIRM', tempId, row })
    } catch (e) {
      if (!(e instanceof WriteError)) {
        dispatch({ type: 'MARK_FAILED', tempId })
        setError('Erreur inattendue lors de l’ajout. Réessayez.')
        return
      }
      // Consommation de la taxonomie d'erreurs (AD-17).
      switch (e.kind) {
        case 'auth': // 401 : passphrase invalide → effacer, re-prompt, rejouer après saisie (AC5).
          clearPassphrase()
          pendingWritesRef.current.set(tempId, { name })
          dispatch({ type: 'SET_PENDING', tempId })
          setPassphraseNeeded(true)
          break
        case 'validation': // 400 : rollback de l'optimiste + message.
          pendingWritesRef.current.delete(tempId)
          dispatch({ type: 'ROLLBACK', tempId })
          setError(e.message)
          break
        case 'conflict': // 409 : re-hydrater, l'état serveur fait autorité (AD-16).
          pendingWritesRef.current.delete(tempId)
          try {
            const rows = await fetchParticipants()
            dispatch({ type: 'HYDRATE', rows })
          } catch {
            // re-hydratation impossible : Realtime/reconnexion prendra le relais.
          }
          setError('Conflit détecté — état resynchronisé avec le serveur.')
          break
        case 'transient': // 5xx : on garde l'optimiste, bouton « réessayer ».
          dispatch({ type: 'MARK_FAILED', tempId })
          setError('Échec temporaire — vous pouvez réessayer.')
          break
      }
    }
  }, [])

  const addParticipant = useCallback(
    (rawName: string) => {
      const name = rawName.trim()
      if (!name) return // nom vide après trim → aucune écriture (AC3).
      const tempId = `temp:${seqRef.current++}`
      dispatch({ type: 'ADD_OPTIMISTIC', tempId, name })
      void runWrite(tempId, name)
    },
    [runWrite],
  )

  const retryParticipant = useCallback(
    (tempId: string) => {
      const row = stateRef.current.find((r) => r.id === tempId)
      if (!row) return
      void runWrite(tempId, row.name)
    },
    [runWrite],
  )

  const submitPassphrase = useCallback(
    (value: string) => {
      const v = value.trim()
      if (!v) return
      storePassphrase(v)
      setPassphraseNeeded(false)
      // Rejoue toutes les écritures mises en file pendant l'absence de passphrase (AC5).
      const queued = Array.from(pendingWritesRef.current.entries())
      pendingWritesRef.current.clear()
      for (const [tempId, { name }] of queued) void runWrite(tempId, name)
    },
    [runWrite],
  )

  const cancelPassphrase = useCallback(() => {
    setPassphraseNeeded(false)
    // Annulation : on rollback les optimistes en attente de passphrase.
    const queued = Array.from(pendingWritesRef.current.keys())
    pendingWritesRef.current.clear()
    for (const tempId of queued) dispatch({ type: 'ROLLBACK', tempId })
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
    addParticipant,
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
