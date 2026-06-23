import { describe, it, expect } from 'vitest'
import { generateSchedule, type ScheduleInput } from '@/lib/domain/schedule'
import { createRng } from '@/lib/domain/rng'

// Test GOLDEN de PARITÉ (NFR9, AD-12) — PÉRIMÈTRE LEGACY STRICT : uniquement les contraintes
// présentes dans l'ancienne page (« Spin That Wheel v2.html ») → week-ends, exclusions de groupe,
// indisponibilités individuelles. `holidays: []` et `teamOffDays: []` (extensions hors legacy,
// testées séparément dans schedule.unit.test.ts). Dans ce périmètre, `isTeamNonSessionDay` se réduit
// EXACTEMENT à `weekend | groupExclusion` — équivalent au legacy.
//
// PARITÉ ALGORITHMIQUE, PAS REJEU D'OUTPUT : le shuffle legacy utilisait `Math.random()` NON-seedable
// → il n'existe pas d'« output legacy figé » à rejouer. Le fixture est donc conçu avec des DEADLINES
// EDF DISTINCTES sur tous les jours contendus : l'ordre est alors entièrement déterminé par la
// priorité EDF (la plus tôt fermée d'abord), INDÉPENDAMMENT du tirage initial. L'attendu est dérivé
// À LA MAIN en appliquant les règles legacy (pseudo-code story 4.2 §Référence de parité), et le seed
// fixe ne sert qu'à satisfaire l'API. NFR9 est satisfait SSI ce test passe (AD-12).
//
// Ancrage : 2026-06-22 lun, 23 mar, 24 mer, 25 jeu, 26 ven, 27 sam, 28 dim, 29 lun, 30 mar.
// Contraintes du fixture : skipWeekends=true + exclusion de TOUS les mercredis (ref 2026-06-24).
// Jours ouvrés valides : 06-22, 06-23, (24 mer exclu), 06-25, 06-26, (27/28 week-end), 06-29, 06-30, …
//
// Indispos individuelles (pour fabriquer des deadlines distinctes depuis le 22) :
//   Alice : indispo dès le 23  → fenêtre depuis 22 = {22}                  → deadline 06-22 (la + tôt)
//   Bob   : indispo dès le 25  → fenêtre depuis 22 = {22,23}               → deadline 06-23
//   Chloé : indispo dès le 26  → fenêtre depuis 22 = {22,23,25}            → deadline 06-25
//   David : aucune indispo     → fenêtre depuis 22 = lointaine             → deadline ~horizon
//
// Dérivation manuelle (legacy) :
//   - Phase 0 : 06-22 valide (lun, pas d'exclusion, pas tous indispo) → start = 06-22.
//   - 06-22 : dispo {Alice,Bob,Chloé,David}. Deadlines 22<23<25<loin → PICK Alice.
//   - 06-23 : dispo {Bob,Chloé,David} (Alice placée). Deadlines depuis 23 : Bob{23}=23, Chloé{23,25}=25,
//             David loin → PICK Bob.
//   - 06-24 : mercredi exclu → sauté.
//   - 06-25 : dispo {Chloé,David} (Bob indispo dès 25). Deadlines depuis 25 : Chloé{25}=25, David loin → PICK Chloé.
//   - 06-26 : dispo {David}. → PICK David. File vide → fin.
//   ⇒ planning = [22 Alice, 23 Bob, 25 Chloé, 26 David] ; aucun non planifié.

const LEGACY_FIXTURE: ScheduleInput = {
  participants: [
    { id: 'a', name: 'Alice', unavailabilities: [{ kind: 'range', date1: '2026-06-23', date2: '2026-12-31' }] },
    { id: 'b', name: 'Bob', unavailabilities: [{ kind: 'range', date1: '2026-06-25', date2: '2026-12-31' }] },
    { id: 'c', name: 'Chloé', unavailabilities: [{ kind: 'range', date1: '2026-06-26', date2: '2026-12-31' }] },
    { id: 'd', name: 'David', unavailabilities: [] },
  ],
  constraints: {
    skipWeekends: true,
    groupExclusions: [{ day_of_week: 3, every_n: 1, ref_date: '2026-06-24' }], // tous les mercredis
    holidays: [], // périmètre legacy : pas de fériés
    teamOffDays: [], // périmètre legacy : pas de jours off
  },
  startDate: '2026-06-22',
}

const SEED = 42 // arbitraire : l'ordre est déterminé par l'EDF (deadlines distinctes), pas par le tirage.

describe('GOLDEN — parité legacy (NFR9, périmètre week-ends + exclusions + indispos)', () => {
  it('reproduit le planning attendu dérivé des règles de l’ancienne page', () => {
    const { planning, unscheduled } = generateSchedule(LEGACY_FIXTURE, createRng(SEED))

    expect(planning).toEqual([
      { date: '2026-06-22', participantId: 'a', name: 'Alice' },
      { date: '2026-06-23', participantId: 'b', name: 'Bob' },
      { date: '2026-06-25', participantId: 'c', name: 'Chloé' },
      { date: '2026-06-26', participantId: 'd', name: 'David' },
    ])
    expect(unscheduled).toEqual([])
  })

  it('parité indépendante du seed (l’ordre est déterminé par l’EDF, pas par le tirage)', () => {
    // Mêmes règles legacy → même planning quel que soit le seed (deadlines distinctes ⇒ aucun tie-break).
    for (const s of [1, 2, 7, 99, 12345]) {
      const { planning } = generateSchedule(LEGACY_FIXTURE, createRng(s))
      expect(planning.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Chloé', 'David'])
    }
  })
})
