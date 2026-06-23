'use client'

import { useParticipants } from '@/lib/store/participants-store'
import { buildTimeline } from '@/lib/ui/timeline'
import { buildColorIndexMap, colorForIndex, initialOf } from '@/lib/ui/participant-colors'
import { isTeamOffDay, type TeamConstraints } from '@/lib/domain/team-availability'
import { weekdayShortFr, dayOfMonth, monthShortFr } from '@/lib/format/date-fr'

// Timeline visuelle (Story 5.3, FR12 revisité, UX-DR10). Présentation PURE du planning déjà calculé :
// remplace le tableau de 4.3 par une grille de cellules jour qui s'enroule sans scrollbar. AUCUNE
// logique de contrainte ici (AD-1/AD-3) — la classification week-end/bloqué est déléguée à la feuille
// pure `buildTimeline`, qui réutilise les prédicats du domaine. La couleur d'un animateur dérive de son
// index dans les ACTIFS (ordre du store) : la roue (5.4) réutilisera le même contrat (AC-6).
export function ScheduleTimeline() {
  const { schedule, participants, groupExclusions, holidays, teamOffDays, settings } = useParticipants()

  // Planning vide / non généré → la carte Résultat (4.3) affiche ses états vides hérités.
  if (!schedule || schedule.planning.length === 0) return null

  const colorIndexById = buildColorIndexMap(participants.filter((p) => p.active))

  // Mêmes contraintes que celles passées au domaine par `generate()` (participants-store.tsx:665-674).
  const constraints: TeamConstraints = {
    skipWeekends: settings.skip_weekends,
    groupExclusions: groupExclusions.map((g) => ({
      day_of_week: g.day_of_week,
      every_n: g.every_n,
      ref_date: g.ref_date,
    })),
    holidays: holidays.map((h) => ({ date: h.date })),
    teamOffDays: teamOffDays.map((o) => ({ kind: o.kind, date1: o.date1, date2: o.date2 })),
  }

  // Libellé d'un jour bloqué : le store PORTE le libellé saisi (le domaine ne reçoit que la date).
  // `undefined` → `buildTimeline` retombe sur le générique (« Férié » / « Jour off »).
  const blockedLabelFor = (date: string): string | undefined => {
    const h = holidays.find((x) => x.date === date)
    if (h) return h.label
    const off = teamOffDays.find((o) =>
      isTeamOffDay([{ kind: o.kind, date1: o.date1, date2: o.date2 }], date),
    )
    return off?.label ?? undefined
  }

  const cells = buildTimeline({
    planning: schedule.planning,
    constraints,
    colorIndexById,
    blockedLabelFor,
  })

  return (
    <div className="timeline" role="list" aria-label="Planning de la rotation">
      {cells.map((cell) => (
        <div
          key={cell.date}
          role="listitem"
          className={`day${cell.kind === 'weekend' ? ' weekend' : ''}${cell.kind === 'blocked' ? ' blocked' : ''}`}
        >
          <div className="dow">{weekdayShortFr(cell.date)}</div>
          <div className="dnum">{dayOfMonth(cell.date)}</div>
          <div className="mon">{monthShortFr(cell.date)}</div>
          {cell.kind === 'working' ? (
            <>
              {/* Pastille décorative (aria-hidden) : l'animateur est aussi nommé en clair → la couleur
                  n'est jamais le seul signal (UX-DR13). */}
              <div className="av-lg" aria-hidden="true" style={{ background: colorForIndex(cell.colorIndex) }}>
                {initialOf(cell.name)}
              </div>
              <div className="who">{cell.name}</div>
            </>
          ) : (
            <>
              <div className="badge">{cell.label}</div>
              <div className="skipnote">sauté</div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
