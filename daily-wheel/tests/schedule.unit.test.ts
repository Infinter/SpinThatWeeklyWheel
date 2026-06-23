import { describe, it, expect } from 'vitest'
import { generateSchedule, type ScheduleInput, type SchedulePerson } from '@/lib/domain/schedule'
import type { TeamConstraints } from '@/lib/domain/team-availability'
import type { DayOrRange } from '@/lib/domain/availability'
import { createRng } from '@/lib/domain/rng'

// Tests UNITAIRES purs (Story 4.2) — mécaniques de génération + COUTURE AD-3 (test paramétré
// « même prédicat aux deux sites ») + extension fériés/off ↔ deadline + déterminisme (NFR7).
// La PARITÉ legacy (NFR9) est prouvée séparément dans `schedule.golden.test.ts` (périmètre legacy strict).
// Ancrage calendaire : 2026-06-22 = lundi … 2026-06-26 = vendredi, 2026-06-27 = samedi, 2026-06-28 = dimanche.

const person = (id: string, name: string, unavailabilities: DayOrRange[] = []): SchedulePerson => ({
  id,
  name,
  unavailabilities,
})
const day = (d: string): DayOrRange => ({ kind: 'day', date1: d, date2: null })
const range = (d1: string, d2: string): DayOrRange => ({ kind: 'range', date1: d1, date2: d2 })
const rng1 = () => createRng(1)

// ───────────────────────────────────────────────────────────────────────────────────────────
// COUTURE AD-3 — test PARAMÉTRÉ : la boucle de placement ET le calcul de deadline EDF utilisent le
// MÊME `isTeamNonSessionDay`. Pour chaque type de neutralisation, on monte un cas à 2 personnes où :
//   (a) effet BOUCLE   : le jour neutralisé D ne reçoit AUCUN animateur (sauté, pas un trou) ;
//   (b) effet DEADLINE : X a une indispo individuelle PILE sur D, Y est indispo juste APRÈS D.
//       Si le calcul de deadline neutralisait correctement D (fenêtre qui FRANCHIT D), la fenêtre de X
//       file loin (X jamais bloqué) tandis que celle de Y se ferme tôt → Y est placé EN PREMIER.
//       Si le calcul de deadline utilisait un prédicat DIVERGENT (D non neutralisé), il rencontrerait
//       l'indispo individuelle de X sur D et TRONQUERAIT la fenêtre de X à D-1 → X placé en premier.
//   ⇒ asserter `planning[0].name === 'Y'` prouve que les DEUX sites partagent le prédicat (AD-3).
// Layout commun (types « jour ouvré ») : cur=lun 22, D=mer 24, Y indispo dès ven 26. skipWeekends=false.
// ───────────────────────────────────────────────────────────────────────────────────────────

type Ad3Case = {
  label: string
  D: string
  start: string
  constraints: TeamConstraints
  xUnavail: DayOrRange[] // X indispo PILE sur D
  yUnavail: DayOrRange[] // Y indispo juste après D
}

const AD3_CASES: Ad3Case[] = [
  {
    label: 'exclusion de groupe (mercredi)',
    D: '2026-06-24',
    start: '2026-06-22',
    constraints: {
      skipWeekends: false,
      groupExclusions: [{ day_of_week: 3, every_n: 1, ref_date: '2026-06-24' }],
    },
    xUnavail: [day('2026-06-24')],
    yUnavail: [range('2026-06-26', '2026-12-31')],
  },
  {
    label: 'jour férié',
    D: '2026-06-24',
    start: '2026-06-22',
    constraints: { skipWeekends: false, holidays: [{ date: '2026-06-24' }] },
    xUnavail: [day('2026-06-24')],
    yUnavail: [range('2026-06-26', '2026-12-31')],
  },
  {
    label: 'jour off d’équipe',
    D: '2026-06-24',
    start: '2026-06-22',
    constraints: { skipWeekends: false, teamOffDays: [day('2026-06-24')] },
    xUnavail: [day('2026-06-24')],
    yUnavail: [range('2026-06-26', '2026-12-31')],
  },
  {
    // Week-end : D = samedi 27. cur = jeudi 25. Y indispo dès lundi 29 (D+2, le dimanche 28 est aussi neutralisé).
    label: 'week-end (samedi, skipWeekends actif)',
    D: '2026-06-27',
    start: '2026-06-25',
    constraints: { skipWeekends: true },
    xUnavail: [day('2026-06-27')],
    yUnavail: [range('2026-06-29', '2026-12-31')],
  },
]

describe('AD-3 — boucle de placement ET deadline EDF partagent isTeamNonSessionDay (test paramétré)', () => {
  for (const c of AD3_CASES) {
    const input: ScheduleInput = {
      participants: [person('x', 'X', c.xUnavail), person('y', 'Y', c.yUnavail)],
      constraints: c.constraints,
      startDate: c.start,
    }

    it(`${c.label} — (a) effet BOUCLE : aucun animateur le jour neutralisé, pas de trou`, () => {
      const { planning, unscheduled } = generateSchedule(input, rng1())
      expect(planning.some((r) => r.date === c.D)).toBe(false) // D neutralisé → sauté
      expect(planning).toHaveLength(2) // X et Y placés malgré le saut (pas de trou)
      expect(unscheduled).toHaveLength(0)
    })

    it(`${c.label} — (b) effet DEADLINE : la fenêtre EDF franchit D → Y placé en premier`, () => {
      const { planning } = generateSchedule(input, rng1())
      // Si le calcul de deadline n'avait pas neutralisé D (prédicat divergent), X serait placé en premier.
      expect(planning[0]?.name).toBe('Y')
    })
  }
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// EXTENSION (hors legacy, AD-12) — fériés / jours off interagissent avec la deadline EDF. Distinct
// de la parité. On vérifie qu'un jour férié (puis un jour off, puis une plage off) AU MILIEU d'une
// fenêtre est neutralisé (pas d'animateur, pas de trou) et que la fenêtre le franchit.
// ───────────────────────────────────────────────────────────────────────────────────────────

describe('Extension : fériés / jours off neutralisent un jour ET sont franchis par la deadline', () => {
  it('jour férié au milieu d’une stretch : sauté, pas de trou, suite placée', () => {
    const input: ScheduleInput = {
      participants: [person('a', 'A'), person('b', 'B'), person('c', 'C')],
      constraints: { skipWeekends: false, holidays: [{ date: '2026-06-23' }] },
      startDate: '2026-06-22',
    }
    const { planning, unscheduled } = generateSchedule(input, rng1())
    expect(planning.some((r) => r.date === '2026-06-23')).toBe(false) // férié sauté
    expect(planning).toHaveLength(3) // 3 placés sur lun 22, mer 24, jeu 25 (mar 23 férié)
    expect(planning.map((r) => r.date)).toEqual(['2026-06-22', '2026-06-24', '2026-06-25'])
    expect(unscheduled).toHaveLength(0)
  })

  it('plage off d’équipe : tous les jours de la plage sautés, pas de trou', () => {
    const input: ScheduleInput = {
      participants: [person('a', 'A'), person('b', 'B')],
      constraints: {
        skipWeekends: false,
        teamOffDays: [range('2026-06-23', '2026-06-24')], // mar+mer off
      },
      startDate: '2026-06-22',
    }
    const { planning } = generateSchedule(input, rng1())
    expect(planning.map((r) => r.date)).toEqual(['2026-06-22', '2026-06-25']) // lun puis jeu
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// DÉTERMINISME (NFR7) — même seed → résultat identique ; le seed influence l'ordre du tirage (FR14).
// ───────────────────────────────────────────────────────────────────────────────────────────

describe('Déterminisme (NFR7) et influence du seed (FR14)', () => {
  const fivePeople: SchedulePerson[] = ['a', 'b', 'c', 'd', 'e'].map((id) =>
    person(id, id.toUpperCase()),
  )
  const input: ScheduleInput = {
    participants: fivePeople,
    constraints: { skipWeekends: false },
    startDate: '2026-06-22',
  }

  it('même seed → résultat strictement identique', () => {
    const r1 = generateSchedule(input, createRng(777))
    const r2 = generateSchedule(input, createRng(777))
    expect(r1).toEqual(r2)
  })

  it('le seed influence l’ordre initial (au moins 2 ordres distincts sur 8 seeds)', () => {
    // Toutes les deadlines sont égales (aucune contrainte/indispo) → l'ordre dépend UNIQUEMENT du tirage.
    const firstPicks = new Set(
      Array.from({ length: 8 }, (_, i) => generateSchedule(input, createRng(i + 1)).planning[0]?.name),
    )
    expect(firstPicks.size).toBeGreaterThan(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// MÉCANIQUES de base.
// ───────────────────────────────────────────────────────────────────────────────────────────

describe('Mécaniques de génération', () => {
  it('rotation one-shot : un seul participant → placé UNE seule fois', () => {
    const input: ScheduleInput = {
      participants: [person('a', 'A')],
      constraints: { skipWeekends: false },
      startDate: '2026-06-22',
    }
    const { planning, unscheduled } = generateSchedule(input, rng1())
    expect(planning).toHaveLength(1)
    expect(planning[0]).toEqual({ date: '2026-06-22', participantId: 'a', name: 'A' })
    expect(unscheduled).toHaveLength(0)
  })

  it('jour où TOUS les actifs sont indisponibles → sauté (pas un trou)', () => {
    const input: ScheduleInput = {
      participants: [
        person('a', 'A', [day('2026-06-23')]),
        person('b', 'B', [day('2026-06-23')]),
      ],
      constraints: { skipWeekends: false },
      startDate: '2026-06-22',
    }
    const { planning } = generateSchedule(input, rng1())
    expect(planning.some((r) => r.date === '2026-06-23')).toBe(false) // tous indispo le 23 → sauté
    expect(planning.map((r) => r.date)).toEqual(['2026-06-22', '2026-06-24'])
  })

  it('aucun candidat dispo pour les restants → break, restant non planifié (pas de trou)', () => {
    const input: ScheduleInput = {
      participants: [
        person('a', 'A'),
        person('b', 'B', [range('2026-06-22', '2026-12-31')]), // B indispo tout l'horizon
      ],
      constraints: { skipWeekends: false },
      startDate: '2026-06-22',
    }
    const { planning, unscheduled } = generateSchedule(input, rng1())
    expect(planning).toHaveLength(1)
    expect(planning[0].name).toBe('A')
    expect(unscheduled).toEqual([{ id: 'b', name: 'B' }])
  })

  it('startDate sur un jour neutralisé → phase 0 avance au premier jour valide', () => {
    const input: ScheduleInput = {
      participants: [person('a', 'A')],
      constraints: { skipWeekends: false, holidays: [{ date: '2026-06-22' }] },
      startDate: '2026-06-22', // férié → la génération démarre le 23
    }
    const { planning } = generateSchedule(input, rng1())
    expect(planning[0].date).toBe('2026-06-23')
  })

  it('liste d’actifs vide → planning et non-planifiés vides (pas de crash)', () => {
    const input: ScheduleInput = {
      participants: [],
      constraints: { skipWeekends: true },
      startDate: '2026-06-22',
    }
    expect(generateSchedule(input, rng1())).toEqual({ planning: [], unscheduled: [] })
  })

  it('perf (NFR6) : 50 participants sur un horizon réaliste termine sans explosion', () => {
    const many = Array.from({ length: 50 }, (_, i) => person(`p${i}`, `P${i}`))
    const input: ScheduleInput = {
      participants: many,
      constraints: { skipWeekends: true },
      startDate: '2026-06-22',
    }
    const { planning, unscheduled } = generateSchedule(input, rng1())
    // 50 personnes, rotation one-shot → 50 placées (assez de jours ouvrés sur l'horizon).
    expect(planning).toHaveLength(50)
    expect(unscheduled).toHaveLength(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// STORY 5.2 — HORIZON ÉTENDU & INVARIANT « nb sessions = nb disponibles » (EXPERIENCE.md:46-55).
// Ces tests VERROUILLENT la règle de rotation déjà implémentée en 4.2 : un jour ouvré par disponible,
// jours bloqués (week-end/férié/off/tous-indispo) SAUTÉS et JAMAIS comptés, horizon qui déborde
// sur les semaines suivantes SANS fenêtre fixe de 7 jours (preuve directe du flag archi #1).
// Ancrage étendu : 06-29 lun, 06-30 mar, 07-01 mer, 07-02 jeu, 07-03 ven, 07-04 sam, 07-05 dim.
// ───────────────────────────────────────────────────────────────────────────────────────────

describe('5.2 — horizon étendu & invariant nb sessions = nb dispos', () => {
  // T2 / AC-2, 7a — cas nominal : N actifs tous disponibles → N sessions, chacun EXACTEMENT une fois.
  it('(a) nb sessions == nb disponibles : 6 actifs tous dispos → 6 sessions, aucun doublon, rien de non-planifié', () => {
    const actifs: SchedulePerson[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
      person(id, id.toUpperCase()),
    )
    const input: ScheduleInput = {
      participants: actifs,
      constraints: { skipWeekends: false },
      startDate: '2026-06-22',
    }
    const { planning, unscheduled } = generateSchedule(input, rng1())

    expect(planning).toHaveLength(6) // un jour ouvré par disponible
    expect(unscheduled).toHaveLength(0)
    // Chaque actif apparaît EXACTEMENT une fois (rotation one-shot, pas de doublon).
    const placedIds = planning.map((r) => r.participantId)
    expect(new Set(placedIds).size).toBe(6)
    expect(new Set(placedIds)).toEqual(new Set(actifs.map((p) => p.id)))
  })

  // T2 (variante) — un « inactif » ne consomme PAS de place : il est filtré CÔTÉ STORE, jamais reçu
  // par le domaine. On modélise donc directement les 6 actifs reçus ; le 7e (inactif) n'existe pas ici.
  // L'invariant nb=nb porte sur les ACTIFS reçus (la frontière domaine/store, Dev Notes §sémantique).
  it('(a-bis) un inactif filtré en amont ne consomme pas de place : domaine reçoit 6 actifs → 6 sessions', () => {
    const actifsRecus: SchedulePerson[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
      person(id, id.toUpperCase()),
    )
    // (le participant « inactif » g — désactivé — est exclu par le store et n'apparaît pas ci-dessus)
    const input: ScheduleInput = {
      participants: actifsRecus,
      constraints: { skipWeekends: false },
      startDate: '2026-06-22',
    }
    const { planning, unscheduled } = generateSchedule(input, rng1())
    expect(planning).toHaveLength(6)
    expect(unscheduled).toHaveLength(0)
  })

  // T3 / AC-3, 7b — un férié ET un week-end intercalés ne sont PAS comptés comme slots.
  it('(b) férié + week-end intercalés sont sautés et jamais comptés : sessions sur les seuls jours ouvrés valides', () => {
    const actifs: SchedulePerson[] = ['a', 'b', 'c', 'd'].map((id) => person(id, id.toUpperCase()))
    const input: ScheduleInput = {
      participants: actifs,
      constraints: { skipWeekends: true, holidays: [{ date: '2026-06-24' }] }, // mer 24 férié
      startDate: '2026-06-22',
    }
    const { planning, unscheduled } = generateSchedule(input, rng1())

    expect(planning).toHaveLength(4) // total = nb dispos (les jours bloqués n'ont PAS consommé de place)
    expect(unscheduled).toHaveLength(0)
    // Dates précises : lun 22, mar 23, (mer 24 férié sauté), jeu 25, ven 26. (sam 27 / dim 28 hors champ)
    expect(planning.map((r) => r.date)).toEqual([
      '2026-06-22',
      '2026-06-23',
      '2026-06-25',
      '2026-06-26',
    ])
    // Aucune session sur le férié ni sur le week-end.
    const dates = planning.map((r) => r.date)
    expect(dates).not.toContain('2026-06-24') // férié
    expect(dates).not.toContain('2026-06-27') // samedi
    expect(dates).not.toContain('2026-06-28') // dimanche
  })

  // T4 / AC-4, 7c — CŒUR DE LA STORY : l'horizon déborde sur ≥ 2 semaines et place TOUT LE MONDE.
  // Preuve directe du flag archi #1 : aucune coupure à 7 jours / fin de semaine courante.
  it('(c) débordement multi-semaines : 8 dispos placés au-delà de la semaine 1 (aucune borne à 7 jours)', () => {
    const actifs: SchedulePerson[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) =>
      person(id, id.toUpperCase()),
    )
    const input: ScheduleInput = {
      participants: actifs,
      constraints: { skipWeekends: true },
      startDate: '2026-06-22',
    }
    const { planning, unscheduled } = generateSchedule(input, rng1())

    expect(planning).toHaveLength(8) // tout le monde placé
    expect(unscheduled).toHaveLength(0)
    // Jours ouvrés : lun 22 → ven 26 (5), [we], lun 29, mar 30, mer 07-01 (3) = 8.
    expect(planning.map((r) => r.date)).toEqual([
      '2026-06-22',
      '2026-06-23',
      '2026-06-24',
      '2026-06-25',
      '2026-06-26',
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
    ])
    // La dernière session tombe ≥ 7 jours après startDate (06-22 + 7 = 06-29) → l'horizon a bien débordé.
    const lastDate = planning[planning.length - 1].date
    expect(lastDate >= '2026-06-29').toBe(true) // YMD comparé lexicographiquement == chronologiquement
    expect(lastDate).toBe('2026-07-01')
  })

  // T4 (variante) — un férié intercalé repousse encore l'horizon : tout le monde reste placé.
  it('(c-bis) un férié en semaine 1 repousse l’horizon : les 8 dispos restent tous placés', () => {
    const actifs: SchedulePerson[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) =>
      person(id, id.toUpperCase()),
    )
    const input: ScheduleInput = {
      participants: actifs,
      constraints: { skipWeekends: true, holidays: [{ date: '2026-06-25' }] }, // jeu 25 férié
      startDate: '2026-06-22',
    }
    const { planning, unscheduled } = generateSchedule(input, rng1())

    expect(planning).toHaveLength(8)
    expect(unscheduled).toHaveLength(0)
    // lun 22, mar 23, mer 24, (jeu 25 férié), ven 26, [we], lun 29, mar 30, mer 07-01, jeu 07-02.
    expect(planning.map((r) => r.date)).toEqual([
      '2026-06-22',
      '2026-06-23',
      '2026-06-24',
      '2026-06-26',
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
    ])
    expect(planning[planning.length - 1].date >= '2026-06-29').toBe(true)
  })

  // T5 / AC-5, 7d — déterminisme à seed donné SUR le scénario multi-semaines T4 (NFR7).
  it('(d) déterminisme multi-semaines : même seed → planning strictement identique', () => {
    const actifs: SchedulePerson[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) =>
      person(id, id.toUpperCase()),
    )
    const input: ScheduleInput = {
      participants: actifs,
      constraints: { skipWeekends: true },
      startDate: '2026-06-22',
    }
    const r1 = generateSchedule(input, createRng(2026))
    const r2 = generateSchedule(input, createRng(2026))
    expect(r1).toEqual(r2)
    expect(r1.planning).toHaveLength(8)
  })
})
