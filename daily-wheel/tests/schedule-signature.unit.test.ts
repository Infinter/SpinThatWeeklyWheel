import { describe, it, expect } from 'vitest'
import { scheduleSignature } from '@/lib/ui/schedule-signature'
import type { ScheduleInput } from '@/lib/domain/schedule'

// Story 5.9 — Détection PURE de péremption du planning (rerun-nudge).
// `scheduleSignature` produit une empreinte déterministe des ENTRÉES qui pilotent le tirage
// (= la forme `ScheduleInput` produite par `buildScheduleInput`). Le store compare la signature
// courante à celle figée au moment du dernier `generate()` ⇒ `scheduleStale`. Aucun import
// React/DOM/Supabase (esprit AD-1) : testable en env node.

// Fixture de base : 2 actifs, contraintes vides, date de départ fixe.
function baseInput(): ScheduleInput {
  return {
    participants: [
      { id: 'a', name: 'Alice', unavailabilities: [] },
      { id: 'b', name: 'Bob', unavailabilities: [] },
    ],
    constraints: {
      skipWeekends: false,
      groupExclusions: [],
      holidays: [],
      teamOffDays: [],
    },
    startDate: '2026-06-24',
  }
}

describe('scheduleSignature', () => {
  it('(a) renvoie la MÊME signature pour deux inputs identiques (déterministe)', () => {
    expect(scheduleSignature(baseInput())).toBe(scheduleSignature(baseInput()))
  })

  it('(b) change quand on AJOUTE une indisponibilité', () => {
    const before = scheduleSignature(baseInput())
    const after = baseInput()
    after.participants[0].unavailabilities.push({ kind: 'day', date1: '2026-06-25', date2: null })
    expect(scheduleSignature(after)).not.toBe(before)
  })

  it('(c) change quand on bascule skipWeekends', () => {
    const before = scheduleSignature(baseInput())
    const after = baseInput()
    after.constraints.skipWeekends = true
    expect(scheduleSignature(after)).not.toBe(before)
  })

  it('(d) change quand un participant actif disparaît (toggle actif → liste des actifs)', () => {
    const before = scheduleSignature(baseInput())
    const after = baseInput()
    after.participants = after.participants.slice(0, 1) // Bob désactivé ⇒ absent des actifs
    expect(scheduleSignature(after)).not.toBe(before)
  })

  it('(e1) change quand on ajoute un jour férié', () => {
    const before = scheduleSignature(baseInput())
    const after = baseInput()
    after.constraints.holidays!.push({ date: '2026-07-14' })
    expect(scheduleSignature(after)).not.toBe(before)
  })

  it('(e2) change quand on ajoute un jour off d’équipe', () => {
    const before = scheduleSignature(baseInput())
    const after = baseInput()
    after.constraints.teamOffDays!.push({ kind: 'day', date1: '2026-08-01', date2: null })
    expect(scheduleSignature(after)).not.toBe(before)
  })

  it('(e3) change quand on ajoute une exclusion de groupe', () => {
    const before = scheduleSignature(baseInput())
    const after = baseInput()
    after.constraints.groupExclusions!.push({ day_of_week: 5, every_n: 1, ref_date: '2026-06-24' })
    expect(scheduleSignature(after)).not.toBe(before)
  })

  it('(f) change quand la date de départ change (option)', () => {
    const before = scheduleSignature(baseInput())
    const after = baseInput()
    after.startDate = '2026-07-01'
    expect(scheduleSignature(after)).not.toBe(before)
  })
})
