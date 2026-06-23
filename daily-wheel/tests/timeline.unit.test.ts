import { describe, it, expect } from 'vitest'
import { buildTimeline } from '@/lib/ui/timeline'
import {
  WHEEL_SEGMENT_COLORS,
  colorForIndex,
  buildColorIndexMap,
  initialOf,
} from '@/lib/ui/participant-colors'
import type { ScheduleRow } from '@/lib/domain/schedule'
import type { TeamConstraints } from '@/lib/domain/team-availability'

// Story 5.3 — projection PURE de la timeline + attribution de couleur (AC-11). Aucun DOM/React :
// testable en env node. Ancrage calendaire (confirmé par les tests 5.2) : 2026-06-22 = lundi,
// 24 = mercredi, 27 = samedi, 28 = dimanche, 29 = lundi.

// Fabriques de construction (conventions du repo : helpers en haut, dates YMD).
const row = (date: string, participantId: string, name: string): ScheduleRow => ({ date, participantId, name })
const ids = (...list: string[]): Map<string, number> => buildColorIndexMap(list.map((id) => ({ id })))

describe('buildTimeline (Story 5.3)', () => {
  it('(a) span : une cellule par jour de [premier..dernier] inclus, ordre chronologique, sans trou ni doublon', () => {
    const cells = buildTimeline({
      planning: [row('2026-06-22', 'p1', 'Alice'), row('2026-06-23', 'p2', 'Bob')],
      constraints: {},
      colorIndexById: ids('p1', 'p2'),
    })
    expect(cells.map((c) => c.date)).toEqual(['2026-06-22', '2026-06-23'])
  })

  it('(a-bis) span multi-semaines : remplit chaque jour entre premier et dernier', () => {
    const cells = buildTimeline({
      planning: [row('2026-06-26', 'p1', 'Alice'), row('2026-06-29', 'p2', 'Bob')],
      constraints: { skipWeekends: true },
      colorIndexById: ids('p1', 'p2'),
    })
    expect(cells.map((c) => c.date)).toEqual(['2026-06-26', '2026-06-27', '2026-06-28', '2026-06-29'])
  })

  it('(b) jour ouvré : cellule working portant participantId/name/colorIndex corrects', () => {
    const cells = buildTimeline({
      planning: [row('2026-06-22', 'p1', 'Alice'), row('2026-06-23', 'p2', 'Bob')],
      constraints: {},
      colorIndexById: ids('p1', 'p2'),
    })
    expect(cells[0]).toEqual({
      date: '2026-06-22',
      kind: 'working',
      participantId: 'p1',
      name: 'Alice',
      colorIndex: 0,
    })
    expect(cells[1]).toMatchObject({ kind: 'working', participantId: 'p2', colorIndex: 1 })
  })

  it('(c) week-end : samedi/dimanche intercalés → kind weekend, label « WE », skipped', () => {
    const cells = buildTimeline({
      planning: [row('2026-06-26', 'p1', 'Alice'), row('2026-06-29', 'p2', 'Bob')],
      constraints: { skipWeekends: true },
      colorIndexById: ids('p1', 'p2'),
    })
    const sat = cells.find((c) => c.date === '2026-06-27')!
    const sun = cells.find((c) => c.date === '2026-06-28')!
    expect(sat).toEqual({ date: '2026-06-27', kind: 'weekend', label: 'WE', skipped: true })
    expect(sun).toMatchObject({ kind: 'weekend', label: 'WE', skipped: true })
  })

  it('(d) férié intercalé → kind blocked, label « Férié », skipped', () => {
    const cells = buildTimeline({
      planning: [row('2026-06-23', 'p1', 'Alice'), row('2026-06-25', 'p2', 'Bob')],
      constraints: { holidays: [{ date: '2026-06-24' }] },
      colorIndexById: ids('p1', 'p2'),
    })
    expect(cells.find((c) => c.date === '2026-06-24')).toEqual({
      date: '2026-06-24',
      kind: 'blocked',
      label: 'Férié',
      skipped: true,
    })
  })

  it('(d) férié avec libellé saisi → le libellé du store prime', () => {
    const cells = buildTimeline({
      planning: [row('2026-06-23', 'p1', 'Alice'), row('2026-06-25', 'p2', 'Bob')],
      constraints: { holidays: [{ date: '2026-06-24' }] },
      colorIndexById: ids('p1', 'p2'),
      blockedLabelFor: (d) => (d === '2026-06-24' ? 'Fête de la Saint-Jean' : undefined),
    })
    expect(cells.find((c) => c.date === '2026-06-24')).toMatchObject({ label: 'Fête de la Saint-Jean' })
  })

  it('(d) jour off d\'équipe intercalé → kind blocked, label « Jour off »', () => {
    const cells = buildTimeline({
      planning: [row('2026-06-22', 'p1', 'Alice'), row('2026-06-24', 'p2', 'Bob')],
      constraints: { teamOffDays: [{ kind: 'day', date1: '2026-06-23', date2: null }] },
      colorIndexById: ids('p1', 'p2'),
    })
    expect(cells.find((c) => c.date === '2026-06-23')).toMatchObject({ kind: 'blocked', label: 'Jour off', skipped: true })
  })

  it('(d) exclusion de groupe intercalée → kind blocked, label « Exclusion »', () => {
    // 2026-06-23 = mardi (day_of_week 2). Règle hebdo (every_n 1) ancrée sur ce mardi.
    const cells = buildTimeline({
      planning: [row('2026-06-22', 'p1', 'Alice'), row('2026-06-24', 'p2', 'Bob')],
      constraints: { groupExclusions: [{ day_of_week: 2, every_n: 1, ref_date: '2026-06-23' }] },
      colorIndexById: ids('p1', 'p2'),
    })
    expect(cells.find((c) => c.date === '2026-06-23')).toMatchObject({ kind: 'blocked', label: 'Exclusion', skipped: true })
  })

  it('(d) précédence : un samedi ALSO férié → classé blocked « Férié », pas weekend « WE »', () => {
    // 2026-06-27 = samedi ET férié, skipWeekends actif.
    const cells = buildTimeline({
      planning: [row('2026-06-26', 'p1', 'Alice'), row('2026-06-29', 'p2', 'Bob')],
      constraints: { skipWeekends: true, holidays: [{ date: '2026-06-27' }] },
      colorIndexById: ids('p1', 'p2'),
    })
    expect(cells.find((c) => c.date === '2026-06-27')).toMatchObject({ kind: 'blocked', label: 'Férié' })
    // Le dimanche 28 (non férié) reste un week-end.
    expect(cells.find((c) => c.date === '2026-06-28')).toMatchObject({ kind: 'weekend', label: 'WE' })
  })

  it('(f) planning vide → []', () => {
    expect(buildTimeline({ planning: [], constraints: {}, colorIndexById: new Map() })).toEqual([])
  })

  it('présence dans planning PRIME sur la classification (défensif vs contraintes périmées)', () => {
    // 2026-06-24 est dans le planning ET marqué férié : la cellule reste « working ».
    const cells = buildTimeline({
      planning: [row('2026-06-24', 'p1', 'Alice')],
      constraints: { holidays: [{ date: '2026-06-24' }] } as TeamConstraints,
      colorIndexById: ids('p1'),
    })
    expect(cells).toHaveLength(1)
    expect(cells[0]).toMatchObject({ kind: 'working', participantId: 'p1' })
  })
})

describe('buildTimeline — révélation progressive (Story 5.4, AC-10f)', () => {
  // 2026-06-22=lun, 23=mar, 24=mer ouvrés ; week-ends/bloqués toujours rendus quel que soit revealedCount.
  const threeWorking = [
    row('2026-06-22', 'p1', 'Alice'),
    row('2026-06-23', 'p2', 'Bob'),
    row('2026-06-24', 'p3', 'Carol'),
  ]

  it('revealedCount absent ⇒ TOUT révélé (rétro-compat 5.3 : working partout)', () => {
    const cells = buildTimeline({ planning: threeWorking, constraints: {}, colorIndexById: ids('p1', 'p2', 'p3') })
    expect(cells.every((c) => c.kind === 'working')).toBe(true)
  })

  it('revealedCount = 0 ⇒ toutes les cellules ouvrées sont « pending » (sans exposer le nom)', () => {
    const cells = buildTimeline({
      planning: threeWorking,
      constraints: {},
      colorIndexById: ids('p1', 'p2', 'p3'),
      revealedCount: 0,
    })
    expect(cells.map((c) => c.kind)).toEqual(['pending', 'pending', 'pending'])
    // Le pending ne divulgue aucune info animateur.
    expect(cells[0]).toEqual({ date: '2026-06-22', kind: 'pending' })
  })

  it('revealedCount = 1 ⇒ 1re ouvrée working, reste pending', () => {
    const cells = buildTimeline({
      planning: threeWorking,
      constraints: {},
      colorIndexById: ids('p1', 'p2', 'p3'),
      revealedCount: 1,
    })
    expect(cells.map((c) => c.kind)).toEqual(['working', 'pending', 'pending'])
    expect(cells[0]).toMatchObject({ kind: 'working', participantId: 'p1', colorIndex: 0 })
  })

  it('revealedCount = nb ouvrés ⇒ toutes working', () => {
    const cells = buildTimeline({
      planning: threeWorking,
      constraints: {},
      colorIndexById: ids('p1', 'p2', 'p3'),
      revealedCount: 3,
    })
    expect(cells.map((c) => c.kind)).toEqual(['working', 'working', 'working'])
  })

  it('l\'index de révélation ne compte QUE les jours ouvrés (week-ends/bloqués toujours rendus)', () => {
    // p1 (ven 26), WE sam 27 + dim 28, p2 (lun 29). revealedCount=1 → seul le ven 26 est working.
    const cells = buildTimeline({
      planning: [row('2026-06-26', 'p1', 'Alice'), row('2026-06-29', 'p2', 'Bob')],
      constraints: { skipWeekends: true },
      colorIndexById: ids('p1', 'p2'),
      revealedCount: 1,
    })
    expect(cells.find((c) => c.date === '2026-06-26')).toMatchObject({ kind: 'working', participantId: 'p1' })
    expect(cells.find((c) => c.date === '2026-06-27')).toMatchObject({ kind: 'weekend' })
    expect(cells.find((c) => c.date === '2026-06-28')).toMatchObject({ kind: 'weekend' })
    expect(cells.find((c) => c.date === '2026-06-29')).toEqual({ date: '2026-06-29', kind: 'pending' })
  })
})

describe('participant-colors (Story 5.3, AC-6)', () => {
  it('(e) palette wheel-segments figée (8 couleurs)', () => {
    expect(WHEEL_SEGMENT_COLORS).toHaveLength(8)
    expect(WHEEL_SEGMENT_COLORS[0]).toBe('#0078d4')
    expect(WHEEL_SEGMENT_COLORS[1]).toBe('#38b2ac')
  })

  it('(e) colorForIndex déterministe et modulo 8', () => {
    expect(colorForIndex(0)).toBe('#0078d4')
    expect(colorForIndex(1)).toBe('#38b2ac')
    expect(colorForIndex(7)).toBe('#ef4444')
    expect(colorForIndex(8)).toBe('#0078d4') // rebouclage
    expect(colorForIndex(9)).toBe('#38b2ac')
  })

  it('(e) buildColorIndexMap : id → position dans l\'ordre des actifs', () => {
    const map = buildColorIndexMap([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(map.get('a')).toBe(0)
    expect(map.get('b')).toBe(1)
    expect(map.get('c')).toBe(2)
    expect(map.get('inconnu')).toBeUndefined()
  })

  it('initialOf : première lettre en capitale, tolère les espaces', () => {
    expect(initialOf('Alice')).toBe('A')
    expect(initialOf('  bob')).toBe('B')
  })
})
