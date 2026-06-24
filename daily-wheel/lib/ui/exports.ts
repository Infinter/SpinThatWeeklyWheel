// 5.7 — projection texte du planning (Slack / CSV). Le DOMAINE reste la source de vérité ; ce module ne
// fait que FORMATER le résultat déjà calculé (esprit AD-1 ; voisin de wheel.ts / timeline.ts /
// rotation-resume.ts / spin-mode.ts). PUR : aucun import React/DOM/Supabase ; importe uniquement le type
// `ScheduleRow` du domaine et les formatteurs de dates purs de `lib/format/date-fr`.
// « Exactement ce qui est copié » (UX-DR11) : ces chaînes SONT le contenu copié, à l'octet près.

import type { ScheduleRow } from '@/lib/domain/schedule'
import {
  weekdayShortFr,
  dayOfMonth,
  monthShortFr,
  dateLongNoWeekdayFr,
} from '@/lib/format/date-fr'

export type ExportFormat = 'slack' | 'csv'

// Message Slack (markdown). En-tête « semaine du {date longue du 1er jour} » + une ligne par session
// « • {jour} {num} {mois}  →  *{nom}* ». Séparateur EXACT « ␣␣→␣␣ » (mockup spin-rotation.html:597).
export function buildSlackExport(planning: ScheduleRow[]): string {
  const start = planning.length > 0 ? dateLongNoWeekdayFr(planning[0].date) : ''
  const head =
    `🎡 *Rotation Daily Scrum* — semaine du ${start}\n` +
    `_Chacun anime une fois ; jours fériés et week-ends sautés._\n\n`
  const lines = planning.map(
    (r) => `• ${weekdayShortFr(r.date)} ${dayOfMonth(r.date)} ${monthShortFr(r.date)}  →  *${r.name}*`,
  )
  return head + lines.join('\n')
}

// Échappement CSV RFC-4180 : un champ contenant `,`, `"` ou un saut de ligne est entouré de guillemets
// doubles, les guillemets internes étant doublés. Sinon le champ est rendu tel quel.
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

// CSV (dates ISO, pour Sheets/Excel). En-tête fixe `Date,Jour,Animateur` ; une ligne par session.
// `r.date` est utilisé TEL QUEL : c'est déjà une chaîne `YYYY-MM-DD` locale (convention dates) — surtout
// PAS de `new Date(...).toISOString()` (qui décalerait d'un jour selon le fuseau). Seul le nom peut
// nécessiter un échappement (prénom contenant une virgule / un guillemet).
export function buildCsvExport(planning: ScheduleRow[]): string {
  const rows = ['Date,Jour,Animateur']
  for (const r of planning) {
    rows.push(`${r.date},${weekdayShortFr(r.date)},${csvField(r.name)}`)
  }
  return rows.join('\n')
}
