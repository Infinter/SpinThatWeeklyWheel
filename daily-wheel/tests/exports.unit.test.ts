import { describe, it, expect } from 'vitest'
import { buildSlackExport, buildCsvExport } from '@/lib/ui/exports'
import type { ScheduleRow } from '@/lib/domain/schedule'

// Test UNITAIRE pur (aucun réseau, aucune variable d'env) : il fixe les FORMATS EXACTS d'export de la
// Story 5.7 (AC-7). Les builders sont des projections pures du planning — « exactement ce qui est copié »
// (UX-DR11) : on vérifie les chaînes OCTET POUR OCTET (séparateurs, en-têtes, ligne vide, échappement).
// Dates domaine = chaînes YYYY-MM-DD locales → le CSV « ISO » les réutilise telles quelles (jamais UTC).

// Lundi 22 juin 2026, mardi 23, mercredi 24 (dates civiles connues).
function rows(): ScheduleRow[] {
  return [
    { date: '2026-06-22', participantId: 'a', name: 'Alice' },
    { date: '2026-06-23', participantId: 'b', name: 'Bob' },
    { date: '2026-06-24', participantId: 'c', name: 'Chloé' },
  ]
}

describe('buildSlackExport — markdown EXACT (Story 5.7, AC-3/AC-7)', () => {
  it('en-tête (semaine du 1er jour, date longue) + ligne vide + une ligne par session', () => {
    const out = buildSlackExport(rows())
    expect(out).toBe(
      '🎡 *Rotation Daily Scrum* — semaine du 22 juin 2026\n' +
        '_Chacun anime une fois ; jours fériés et week-ends sautés._\n' +
        '\n' +
        '• lun 22 juin  →  *Alice*\n' +
        '• mar 23 juin  →  *Bob*\n' +
        '• mer 24 juin  →  *Chloé*',
    )
  })

  it('séparateur exact « ␣␣→␣␣ » (deux espaces de chaque côté)', () => {
    const out = buildSlackExport([{ date: '2026-06-22', participantId: 'a', name: 'Alice' }])
    expect(out.endsWith('• lun 22 juin  →  *Alice*')).toBe(true)
  })

  it('déterministe : mêmes entrées → même chaîne', () => {
    expect(buildSlackExport(rows())).toBe(buildSlackExport(rows()))
  })
})

describe('buildCsvExport — CSV EXACT, dates ISO, échappement RFC-4180 (Story 5.7, AC-4/AC-7)', () => {
  it('en-tête fixe + dates ISO = row.date + jour abrégé + nom', () => {
    const out = buildCsvExport(rows())
    expect(out).toBe(
      'Date,Jour,Animateur\n' +
        '2026-06-22,lun,Alice\n' +
        '2026-06-23,mar,Bob\n' +
        '2026-06-24,mer,Chloé',
    )
  })

  it('échappe un nom contenant une virgule (entre guillemets)', () => {
    const out = buildCsvExport([{ date: '2026-06-22', participantId: 'x', name: 'Du, Bois' }])
    expect(out).toBe('Date,Jour,Animateur\n2026-06-22,lun,"Du, Bois"')
  })

  it('échappe un nom contenant un guillemet (guillemets doublés)', () => {
    const out = buildCsvExport([{ date: '2026-06-22', participantId: 'x', name: 'Anne "A"' }])
    expect(out).toBe('Date,Jour,Animateur\n2026-06-22,lun,"Anne ""A"""')
  })

  it('une seule session', () => {
    const out = buildCsvExport([{ date: '2026-06-23', participantId: 'b', name: 'Bob' }])
    expect(out).toBe('Date,Jour,Animateur\n2026-06-23,mar,Bob')
  })

  it('déterministe : mêmes entrées → même chaîne', () => {
    expect(buildCsvExport(rows())).toBe(buildCsvExport(rows()))
  })
})
