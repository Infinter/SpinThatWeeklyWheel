'use client'

import { useParticipants } from '@/lib/store/participants-store'
import { formatDateFr } from '@/lib/format/date-fr'

// Carte Résultat (Story 4.3, FR12). UI pure : tout passe par le store (AD-11) — le bouton déclenche
// `generate()` (calcul client éphémère, Story 4.2), le rendu lit `schedule`. C'est l'ACTION PRINCIPALE
// de l'app (UX-DR1). 4.3 met en FORME le résultat brut produit par 4.2 : compteur en en-tête,
// dates longues FR, avertissement non-planifiés (raison GÉNÉRIQUE — le domaine ne fournit que {id,name},
// type ScheduleResult GELÉ/asserté par le golden), message explicite « aucun planifiable », responsive ≤520px.
// AUCUNE logique de contraintes ici (AD-1/AD-3) : on n'affiche que ce que le domaine a calculé.

// Capitalise l'initiale de la date longue FR (« mardi … » → « Mardi … ») — cosmétique, sans toucher date-fr.ts.
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function ScheduleResult() {
  const { schedule, generate, participants } = useParticipants()
  const activeCount = participants.filter((p) => p.active).length
  const canGenerate = activeCount > 0

  // Bloc d'avertissement « non planifiés » : raison GÉNÉRIQUE collective (pas de cause par personne —
  // le domaine renvoie {id,name}, et recalculer la cause côté UI dupliquerait isPersonUnavailable /
  // isTeamNonSessionDay hors du domaine, ce qu'AD-1/AD-3 interdisent). Réutilisé dans deux états.
  const unscheduledWarning =
    schedule && schedule.unscheduled.length > 0 ? (
      <div className="schedule-warning" role="status">
        <p className="schedule-warning-title">
          Non planifié{schedule.unscheduled.length > 1 ? 's' : ''} :{' '}
          {schedule.unscheduled.map((u) => u.name).join(', ')}
        </p>
        <p className="schedule-warning-reason">
          Ces participants n&apos;ont pas pu être placés : indisponibles sur la
          période, ou les placer aurait créé un jour sans animateur.
        </p>
      </div>
    ) : null

  return (
    <div className="schedule">
      <div className="schedule-actions">
        <button type="button" onClick={generate} disabled={!canGenerate}>
          🎲 Lancer la sélection
        </button>
        {!canGenerate && (
          <span className="card-empty">Ajoutez au moins un participant actif.</span>
        )}
      </div>

      {schedule === null ? (
        <p className="card-empty">
          Cliquez sur « Lancer la sélection » pour générer le planning.
        </p>
      ) : schedule.planning.length > 0 ? (
        <div className="schedule-result">
          <div className="schedule-header">
            <span className="schedule-header-label">Planning</span>
            <span className="schedule-count">
              {schedule.planning.length} session
              {schedule.planning.length > 1 ? 's' : ''}
            </span>
          </div>

          <table className="participant-table schedule-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Animateur</th>
              </tr>
            </thead>
            <tbody>
              {schedule.planning.map((row) => (
                <tr key={row.date}>
                  <td>{capitalize(formatDateFr(row.date))}</td>
                  <td>{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {unscheduledWarning}
        </div>
      ) : schedule.unscheduled.length > 0 ? (
        <div className="schedule-result">
          <p className="card-empty">Aucune session planifiée.</p>
          {unscheduledWarning}
        </div>
      ) : (
        <p className="card-empty">Aucun participant n&apos;a pu être planifié.</p>
      )}
    </div>
  )
}
