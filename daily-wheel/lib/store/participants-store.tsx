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
import { fetchHolidays, writeHoliday, type Holiday } from '@/lib/data/holidays'
import { fetchTeamOffDays, writeTeamOffDay, type TeamOffDay } from '@/lib/data/team-off-days'
import {
  fetchSettings,
  writeSettings,
  type Setting,
  type SettingWritePayload,
} from '@/lib/data/settings'
import { type ChangeEvent } from '@/lib/store/reconcile'
import { participantsReducer, type StoreParticipant } from '@/lib/store/participants-reducer'
import { unavailabilitiesReducer, type StoreUnavailability } from '@/lib/store/unavailabilities-reducer'
import { groupExclusionsReducer, type StoreGroupExclusion } from '@/lib/store/group-exclusions-reducer'
import { holidaysReducer, type StoreHoliday } from '@/lib/store/holidays-reducer'
import { teamOffDaysReducer, type StoreTeamOffDay } from '@/lib/store/team-off-days-reducer'
import { settingsReducer, DEFAULT_SETTING, type StoreSetting } from '@/lib/store/settings-reducer'
import { isValidRange, isDuplicateDay, type DayOrRange } from '@/lib/domain/availability'
import { isValidEveryN, refDateMatchesDayOfWeek } from '@/lib/domain/team-availability'
import { parseNames } from '@/lib/store/parse-names'
import { useWriteQueue } from '@/lib/store/use-write-queue'

// Store client de l'équipe (Story 1.5 → 3.1). UI → store → lib/data/ (AD-11) : aucun composant ne
// touche `supabase.from(...)` ni `fetch('/api/...')`. Le SEUL accès Supabase direct ici est
// l'ABONNEMENT Realtime de lecture via `supabasePublic` (AD-6/AD-7), sur TROIS tables.
//
// Story 3.2 : la machinerie d'écriture (file passphrase + `runWrite` + taxonomie AD-17) est EXTRAITE
// dans `useWriteQueue()` ([[store-extraction-plan]]). Le provider ne garde que : les slices (reducers),
// les méthodes métier par table, les abonnements Realtime, et la valeur de contexte. La file reste
// TABLE-AGNOSTIQUE → un seul prompt passphrase pour N mutations toutes tables confondues (AD-8).

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
function toServerHoliday(h: StoreHoliday): Holiday {
  return { id: h.id, date: h.date, label: h.label, updated_at: h.updated_at }
}
function toServerTeamOffDay(o: StoreTeamOffDay): TeamOffDay {
  return { id: o.id, kind: o.kind, date1: o.date1, date2: o.date2, label: o.label, updated_at: o.updated_at }
}
function toServerSetting(s: StoreSetting): Setting {
  return { id: s.id, skip_weekends: s.skip_weekends, start_date: s.start_date, updated_at: s.updated_at }
}

// Forme « optionnelle » des inputs d'une indispo, telle que fournie par l'UI.
type UnavailabilityInput = { kind: 'day' | 'range'; date1: string; date2: string | null }

// Inputs d'une règle d'exclusion de groupe, tels que fournis par l'UI.
type GroupExclusionInput = { day_of_week: number; every_n: number; ref_date: string }

// Inputs d'un jour férié, tels que fournis par l'UI.
type HolidayInput = { date: string; label: string }

// Inputs d'un jour off d'équipe, tels que fournis par l'UI (libellé OPTIONNEL → trimé → null côté store).
type TeamOffDayInput = { kind: 'day' | 'range'; date1: string; date2: string | null; label: string }

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
  holidays: StoreHoliday[]
  addHoliday: (input: HolidayInput) => void
  removeHoliday: (id: string) => void
  retryHoliday: (id: string) => void
  teamOffDays: StoreTeamOffDay[]
  addTeamOffDay: (input: TeamOffDayInput) => void
  removeTeamOffDay: (id: string) => void
  retryTeamOffDay: (id: string) => void
  settings: StoreSetting
  setSkipWeekends: (value: boolean) => void
  setStartDate: (date: string) => void
  retrySettings: () => void
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
  initialHolidays,
  initialTeamOffDays,
  initialSettings,
  children,
}: {
  initial: Participant[]
  initialUnavailabilities: Unavailability[]
  initialGroupExclusions: GroupExclusion[]
  initialHolidays: Holiday[]
  initialTeamOffDays: TeamOffDay[]
  initialSettings: Setting | null
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
  const [holidays, dispatchH] = useReducer(holidaysReducer, initialHolidays as StoreHoliday[])
  const [teamOffDays, dispatchO] = useReducer(
    teamOffDaysReducer,
    initialTeamOffDays as StoreTeamOffDay[],
  )
  const [settings, dispatchS] = useReducer(
    settingsReducer,
    (initialSettings ?? DEFAULT_SETTING) as StoreSetting,
  )
  const [error, setError] = useState<string | null>(null)

  // File d'écriture partagée + passphrase (extraite en 3.2). TABLE-AGNOSTIQUE : un seul prompt pour N (AD-8).
  const { runWrite, retry, passphraseNeeded, submitPassphrase, cancelPassphrase } = useWriteQueue({ setError })

  const seqRef = useRef(0) // ids temporaires d'insert participant (`temp:<n>`).
  const useqRef = useRef(0) // ids temporaires d'insert indispo (`utemp:<n>`).
  const gseqRef = useRef(0) // ids temporaires d'insert exclusion de groupe (`gtemp:<n>`).
  const hseqRef = useRef(0) // ids temporaires d'insert jour férié (`htemp:<n>`).
  const oseqRef = useRef(0) // ids temporaires d'insert jour off (`otemp:<n>`).
  // Miroirs d'état pour lire un snapshot de ligne hors closure.
  const stateRef = useRef(participants)
  const stateRefU = useRef(unavailabilities)
  const stateRefG = useRef(groupExclusions)
  const stateRefH = useRef(holidays)
  const stateRefO = useRef(teamOffDays)
  const stateRefS = useRef(settings)
  useEffect(() => {
    stateRef.current = participants
  }, [participants])
  useEffect(() => {
    stateRefU.current = unavailabilities
  }, [unavailabilities])
  useEffect(() => {
    stateRefG.current = groupExclusions
  }, [groupExclusions])
  useEffect(() => {
    stateRefH.current = holidays
  }, [holidays])
  useEffect(() => {
    stateRefO.current = teamOffDays
  }, [teamOffDays])
  useEffect(() => {
    stateRefS.current = settings
  }, [settings])

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
  const retryParticipant = useCallback((id: string) => retry(id), [retry])

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

  const retryUnavailability = useCallback((id: string) => retry(id), [retry])

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

  const retryGroupExclusion = useCallback((id: string) => retry(id), [retry])

  // ── Jours fériés (Story 3.2) ──────────────────────────────────────────────────
  // Ajout (FR7) : validation cliente d'abord (date + libellé + doublon) → si invalide, message FR +
  // AUCUNE écriture. Sinon optimiste ADD_OPTIMISTIC + insert serveur. L'unicité de la date est aussi
  // garantie par la contrainte DB (23505 → 409 → re-hydratation), la DB restant l'autorité.
  const addHoliday = useCallback(
    (input: HolidayInput) => {
      const date = input.date
      const label = input.label.trim()
      if (!date) {
        setError('Veuillez saisir une date.')
        return
      }
      if (!label) {
        setError('Veuillez saisir un libellé.')
        return
      }
      if (stateRefH.current.some((h) => h.date === date)) {
        setError('Ce jour férié est déjà ajouté.')
        return
      }
      const tempId = `htemp:${hseqRef.current++}`
      const row: Holiday = { id: tempId, date, label, updated_at: '' }
      dispatchH({ type: 'ADD_OPTIMISTIC', tempId, row })
      void runWrite({
        write: (pp) => writeHoliday('insert', { data: { date, label } }, pp),
        onPending: () => dispatchH({ type: 'SET_PENDING', id: tempId }),
        onConfirm: (r) => dispatchH({ type: 'CONFIRM', tempId, row: r as Holiday }),
        onFailed: () => dispatchH({ type: 'MARK_FAILED', id: tempId }),
        rollback: () => dispatchH({ type: 'ROLLBACK', tempId }),
        onConflictRehydrate: async () => {
          try {
            dispatchH({ type: 'HYDRATE', rows: await fetchHolidays() })
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
  const removeHoliday = useCallback(
    (id: string) => {
      const snapshot = stateRefH.current.find((h) => h.id === id)
      if (!snapshot) return
      const restore = toServerHoliday(snapshot)
      dispatchH({ type: 'REMOVE', id })
      void runWrite({
        write: (pp) => writeHoliday('delete', { id }, pp),
        onConfirm: () => {
          /* déjà retiré ; l'écho Realtime DELETE est un no-op (AD-15). */
        },
        rollback: () => dispatchH({ type: 'RESTORE', row: restore }),
        deleteIdempotent: true,
        retryKey: null,
      })
    },
    [runWrite],
  )

  const retryHoliday = useCallback((id: string) => retry(id), [retry])

  // ── Jours off d'équipe (Story 3.3) ────────────────────────────────────────────
  // Ajout (FR8) : validation cliente PURE d'abord (AC5) → si invalide, message FR + AUCUNE écriture.
  // Sinon optimiste ADD_OPTIMISTIC + insert serveur. Libellé OPTIONNEL (trimé → null). PAS de dédup :
  // `team_off_days` n'a aucune contrainte d'unicité (≠ fériés/indispos-jour).
  const addTeamOffDay = useCallback(
    (input: TeamOffDayInput) => {
      const { kind, date1 } = input
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
      }
      const date2 = kind === 'range' ? input.date2 : null
      const label = input.label.trim() || null
      const tempId = `otemp:${oseqRef.current++}`
      const row: TeamOffDay = { id: tempId, kind, date1, date2, label, updated_at: '' }
      dispatchO({ type: 'ADD_OPTIMISTIC', tempId, row })
      void runWrite({
        write: (pp) => writeTeamOffDay('insert', { data: { kind, date1, date2, label } }, pp),
        onPending: () => dispatchO({ type: 'SET_PENDING', id: tempId }),
        onConfirm: (r) => dispatchO({ type: 'CONFIRM', tempId, row: r as TeamOffDay }),
        onFailed: () => dispatchO({ type: 'MARK_FAILED', id: tempId }),
        rollback: () => dispatchO({ type: 'ROLLBACK', tempId }),
        onConflictRehydrate: async () => {
          try {
            dispatchO({ type: 'HYDRATE', rows: await fetchTeamOffDays() })
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
  const removeTeamOffDay = useCallback(
    (id: string) => {
      const snapshot = stateRefO.current.find((o) => o.id === id)
      if (!snapshot) return
      const restore = toServerTeamOffDay(snapshot)
      dispatchO({ type: 'REMOVE', id })
      void runWrite({
        write: (pp) => writeTeamOffDay('delete', { id }, pp),
        onConfirm: () => {
          /* déjà retiré ; l'écho Realtime DELETE est un no-op (AD-15). */
        },
        rollback: () => dispatchO({ type: 'RESTORE', row: restore }),
        deleteIdempotent: true,
        retryKey: null,
      })
    },
    [runWrite],
  )

  const retryTeamOffDay = useCallback((id: string) => retry(id), [retry])

  // ── Settings (Story 4.1) — patron SCALAIRE / upsert ───────────────────────────
  // Mise à jour optimiste d'un patch partiel (FR9/FR10) : snapshot AVANT optimiste → RESTORE si échec.
  // Pas de tempId (id constant 'singleton') ; op upsert via la file partagée (un seul prompt — AD-8).
  const updateSettings = useCallback(
    (patch: SettingWritePayload) => {
      const snapshot = toServerSetting(stateRefS.current)
      dispatchS({ type: 'OPTIMISTIC', patch })
      void runWrite({
        write: (pp) => writeSettings(patch, pp),
        onConfirm: (r) => dispatchS({ type: 'CONFIRM', row: r as Setting }),
        onFailed: () => dispatchS({ type: 'MARK_FAILED' }),
        rollback: () => dispatchS({ type: 'RESTORE', row: snapshot }),
        onConflictRehydrate: async () => {
          try {
            dispatchS({ type: 'HYDRATE', row: await fetchSettings() })
          } catch {
            /* Realtime prendra le relais. */
          }
        },
        retryKey: 'settings',
      })
    },
    [runWrite],
  )

  const setSkipWeekends = useCallback(
    (value: boolean) => updateSettings({ skip_weekends: value }),
    [updateSettings],
  )
  const setStartDate = useCallback(
    (date: string) => updateSettings({ start_date: date }),
    [updateSettings],
  )
  const retrySettings = useCallback(() => retry('settings'), [retry])

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

  // ── 4ᵉ abonnement Realtime : jours fériés (Story 3.2, AD-6) ──────────────────
  useEffect(() => {
    const channel = supabasePublic
      .channel('holidays-rt')
      .on<Holiday>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'holidays' },
        (payload) => {
          const event = mapChange<Holiday>(payload)
          if (event) dispatchH({ type: 'REALTIME', event })
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          fetchHolidays()
            .then((rows) => dispatchH({ type: 'HYDRATE', rows }))
            .catch(() => {
              /* refetch impossible : un prochain SUBSCRIBED réessaiera. */
            })
        }
      })

    return () => {
      void supabasePublic.removeChannel(channel)
    }
  }, [])

  // ── 5ᵉ abonnement Realtime : jours off d'équipe (Story 3.3, AD-6) ────────────
  useEffect(() => {
    const channel = supabasePublic
      .channel('team-off-days-rt')
      .on<TeamOffDay>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_off_days' },
        (payload) => {
          const event = mapChange<TeamOffDay>(payload)
          if (event) dispatchO({ type: 'REALTIME', event })
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          fetchTeamOffDays()
            .then((rows) => dispatchO({ type: 'HYDRATE', rows }))
            .catch(() => {
              /* refetch impossible : un prochain SUBSCRIBED réessaiera. */
            })
        }
      })

    return () => {
      void supabasePublic.removeChannel(channel)
    }
  }, [])

  // ── 6ᵉ abonnement Realtime : settings (Story 4.1, AD-6) — ligne unique 'singleton' ──
  useEffect(() => {
    const channel = supabasePublic
      .channel('settings-rt')
      .on<Setting>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload) => {
          const event = mapChange<Setting>(payload)
          if (event) dispatchS({ type: 'REALTIME', event })
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          fetchSettings()
            .then((row) => dispatchS({ type: 'HYDRATE', row }))
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
    holidays,
    addHoliday,
    removeHoliday,
    retryHoliday,
    teamOffDays,
    addTeamOffDay,
    removeTeamOffDay,
    retryTeamOffDay,
    settings,
    setSkipWeekends,
    setStartDate,
    retrySettings,
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
