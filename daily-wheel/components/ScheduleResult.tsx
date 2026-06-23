'use client'

import { useParticipants } from '@/lib/store/participants-store'
import { formatDateFr } from '@/lib/format/date-fr'

// Carte Résultat (Story 4.2, FR11/FR12 amorce). UI pure : tout passe par le store (AD-11) — le bouton
// déclenche `generate()` (calcul client éphémère), le rendu lit `schedule`. C'est l'ACTION PRINCIPALE
// de l'app (UX-DR1). RENDU MINIMAL volontaire : la présentation soignée (dates longues structurées,
// compteur en en-tête, avertissements avec raison, message « aucun planifiable », responsive ≤520px)
// est la Story 4.3 — ne pas sur-investir ici.

export function ScheduleResult() {
  const { schedule, generate, participants } = useParticipants()
  const activeCount = participants.filter((p) => p.active).length
  const canGenerate = activeCount > 0
  const count = schedule?.planning.length ?? 0

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
      ) : (
        <div className="schedule-result">
          <p className="schedule-count">
            {count} session{count > 1 ? 's' : ''} planifiée{count > 1 ? 's' : ''}
          </p>

          {count > 0 && (
            <table className="participant-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Animateur</th>
                </tr>
              </thead>
              <tbody>
                {schedule.planning.map((row) => (
                  <tr key={row.date}>
                    <td>{formatDateFr(row.date)}</td>
                    <td>{row.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {schedule.unscheduled.length > 0 && (
            <p className="schedule-unscheduled">
              Non planifié{schedule.unscheduled.length > 1 ? 's' : ''} :{' '}
              {schedule.unscheduled.map((u) => u.name).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
