'use client'

import { useParticipants } from '@/lib/store/participants-store'
import { resolveTodayStandup } from '@/lib/ui/today-standup'
import { buildColorIndexMap, colorForIndex, initialOf } from '@/lib/ui/participant-colors'
import { todayYMD, dateLongNoWeekdayFr } from '@/lib/format/date-fr'

// Bandeau « personne du jour » (spec-personne-du-jour-bandeau). PERSISTANT sous le header, visible sur
// les 3 étapes du parcours guidé : il « remonte » l'animateur du standup d'aujourd'hui sans ouvrir
// l'étape 3 ni parcourir la timeline. UI PURE : tout dérive du store (AD-11). La décision
// (« qui / à tirer / aucun ») vient du cœur pur `lib/ui/today-standup.ts`.
//
// SUSPENSE (5.4) respecté via le curseur PERSISTÉ `rotationCursor` (≠ curseur d'animation LOCAL de
// `ScheduleResult`, découplage volontaire : le bandeau reflète l'état révélé/persisté, sans lifting
// d'état). COULEUR : contrat partagé timeline/roue (index dans les ACTIFS, ordre du store). Pastille
// `aria-hidden` + nom en clair (UX-DR13) ; PAS de région `aria-live` (la région `.reveal` de
// `ScheduleResult` annonce déjà les révélations — éviter la double-annonce).

export function TodayStandupBanner() {
  const { schedule, rotationCursor, participants } = useParticipants()

  // Aucune rotation tirée → rien à remonter (bandeau absent).
  if (!schedule || schedule.planning.length === 0) return null

  const today = todayYMD()
  const dateLabel = dateLongNoWeekdayFr(today)
  const standup = resolveTodayStandup(schedule.planning, rotationCursor, today)

  if (standup.kind === 'revealed') {
    const colorIndexById = buildColorIndexMap(participants.filter((p) => p.active))
    const color = colorForIndex(colorIndexById.get(standup.participantId) ?? 0)
    return (
      <div className="today-banner is-revealed">
        <div className="tb-av" aria-hidden="true" style={{ background: color }}>
          {initialOf(standup.name)}
        </div>
        <div className="tb-text">
          <span className="tb-name">{standup.name}</span>
          <span className="tb-sub">{`anime le standup d'aujourd'hui · ${dateLabel}`}</span>
        </div>
      </div>
    )
  }

  if (standup.kind === 'pending') {
    return (
      <div className="today-banner is-pending">
        <div className="tb-av tb-av-muted" aria-hidden="true">🎡</div>
        <div className="tb-text">
          <span className="tb-name">{"Aujourd'hui : à tirer"}</span>
          <span className="tb-sub">{`Lance la roue pour révéler l'animateur · ${dateLabel}`}</span>
        </div>
      </div>
    )
  }

  // kind === 'none' : pas de session aujourd'hui (week-end / férié / jour off / hors période).
  return (
    <div className="today-banner is-none">
      <div className="tb-av tb-av-muted" aria-hidden="true">💤</div>
      <div className="tb-text">
        <span className="tb-name">{"Pas de standup aujourd'hui"}</span>
        <span className="tb-sub">{dateLabel}</span>
      </div>
    </div>
  )
}
