import { describe, it, expect } from 'vitest'
import { buildConfirmedRollPayload, validateConfirmedRoll } from '@/lib/ui/confirmed-roll'
import type { ScheduleRow } from '@/lib/domain/schedule'

// Story 5.10 — cœur PUR du journal d'audit `confirmed_rolls` (AC-9a). Aucun React/DOM/Supabase :
// testable en env node (esprit AD-1), voisin de `lib/ui/spin-mode.ts` / `lib/ui/exports.ts`.
// Ce module ne fait QUE : (1) mapper un ScheduleRow révélé + le seed courant vers le payload serveur
// (clé composite (seed,date)), (2) valider défensivement ce payload (réutilisé par la route, AD-17:400).
// Le `name`/`participant_id` sont des SNAPSHOTS dénormalisés (anti-drift, AC-3).

const ROW: ScheduleRow = { date: '2026-06-25', participantId: 'p-42', name: 'Salomé' }

describe('buildConfirmedRollPayload (Story 5.10, AC-2/AC-9a)', () => {
  it('mappe seed + ScheduleRow vers le payload serveur (participantId → participant_id)', () => {
    expect(buildConfirmedRollPayload(123456, ROW)).toEqual({
      seed: 123456,
      date: '2026-06-25',
      participant_id: 'p-42',
      name: 'Salomé',
    })
  })

  it('fige le name TEL QUEL (snapshot dénormalisé, AC-3 — pas de normalisation)', () => {
    const row: ScheduleRow = { date: '2026-07-01', participantId: 'p-1', name: '  Éric  ' }
    expect(buildConfirmedRollPayload(0, row).name).toBe('  Éric  ')
  })

  it('préserve seed = 0 (rotation valide, pas « aucune rotation »)', () => {
    expect(buildConfirmedRollPayload(0, ROW).seed).toBe(0)
  })
})

describe('validateConfirmedRoll (Story 5.10, AC-7/AC-9a — validation défensive serveur)', () => {
  it('null (valide) pour un payload bien formé', () => {
    expect(validateConfirmedRoll({ seed: 123456, date: '2026-06-25', participant_id: 'p-42', name: 'Salomé' })).toBeNull()
  })

  it('seed = 0 et seed = 2^32-1 sont valides (bornes uint32)', () => {
    expect(validateConfirmedRoll({ seed: 0, date: '2026-06-25', participant_id: 'p-1', name: 'A' })).toBeNull()
    expect(validateConfirmedRoll({ seed: 0xffffffff, date: '2026-06-25', participant_id: 'p-1', name: 'A' })).toBeNull()
  })

  it('rejette seed non entier / négatif / hors uint32', () => {
    expect(validateConfirmedRoll({ seed: 1.5, date: '2026-06-25', participant_id: 'p-1', name: 'A' })).not.toBeNull()
    expect(validateConfirmedRoll({ seed: -1, date: '2026-06-25', participant_id: 'p-1', name: 'A' })).not.toBeNull()
    expect(validateConfirmedRoll({ seed: 0x100000000, date: '2026-06-25', participant_id: 'p-1', name: 'A' })).not.toBeNull()
    expect(validateConfirmedRoll({ date: '2026-06-25', participant_id: 'p-1', name: 'A' })).not.toBeNull()
  })

  it('rejette date absente / vide / non-string / format non-YMD', () => {
    expect(validateConfirmedRoll({ seed: 1, date: '', participant_id: 'p-1', name: 'A' })).not.toBeNull()
    expect(validateConfirmedRoll({ seed: 1, participant_id: 'p-1', name: 'A' })).not.toBeNull()
    expect(validateConfirmedRoll({ seed: 1, date: 20260625, participant_id: 'p-1', name: 'A' })).not.toBeNull()
    // Chaîne non vide mais hors format YMD (date = composante de PK → ne doit pas devenir une clé corrompue).
    expect(validateConfirmedRoll({ seed: 1, date: 'not-a-date', participant_id: 'p-1', name: 'A' })).not.toBeNull()
    expect(validateConfirmedRoll({ seed: 1, date: '25/06/2026', participant_id: 'p-1', name: 'A' })).not.toBeNull()
  })

  it('rejette participant_id absent / vide', () => {
    expect(validateConfirmedRoll({ seed: 1, date: '2026-06-25', participant_id: '', name: 'A' })).not.toBeNull()
    expect(validateConfirmedRoll({ seed: 1, date: '2026-06-25', name: 'A' })).not.toBeNull()
  })

  it('rejette name absent / vide', () => {
    expect(validateConfirmedRoll({ seed: 1, date: '2026-06-25', participant_id: 'p-1', name: '' })).not.toBeNull()
    expect(validateConfirmedRoll({ seed: 1, date: '2026-06-25', participant_id: 'p-1' })).not.toBeNull()
  })
})
