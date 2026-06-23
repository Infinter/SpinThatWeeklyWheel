'use client'

import { useParticipants } from '@/lib/store/participants-store'
import { todayYMD } from '@/lib/format/date-fr'

// Options de génération PRIMAIRES (Story 4.1, FR9/FR10) — bloc NON repliable en tête de la carte
// Options (≠ les panneaux repliables de contraintes avancées UX-DR4). UI pure : aucune écriture
// directe, tout passe par le store (AD-11). Édition inline persistée immédiatement (UX-DR3, pas de
// bouton « Enregistrer »). Tout en français (NFR4).
//
// « Ignorer les week-ends » (défaut activé) → settings.skip_weekends. « Date de début » (défaut =
// aujourd'hui à l'affichage) → settings.start_date. La persistance est optimiste avec réconciliation
// (AD-5) ; l'état `pending` rend le bloc discrètement atténué.

export function GenerationOptions() {
  const { settings, setSkipWeekends, setStartDate } = useParticipants()

  return (
    <div className={['gen-options', settings.pending ? 'pending' : ''].filter(Boolean).join(' ')}>
      <label className="gen-options-row">
        <input
          type="checkbox"
          checked={settings.skip_weekends}
          onChange={(e) => setSkipWeekends(e.target.checked)}
        />
        <span>Ignorer les week-ends</span>
      </label>

      <div className="gen-options-row">
        <label htmlFor="gen-start-date">Date de début :</label>
        <input
          id="gen-start-date"
          type="date"
          value={settings.start_date ?? todayYMD()}
          onChange={(e) => setStartDate(e.target.value)}
          aria-label="Date de début du planning"
        />
      </div>
    </div>
  )
}
