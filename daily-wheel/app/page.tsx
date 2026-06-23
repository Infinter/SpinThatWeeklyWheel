import { fetchParticipants, type Participant } from '@/lib/data/participants'
import { fetchUnavailabilities, type Unavailability } from '@/lib/data/unavailabilities'
import { fetchGroupExclusions, type GroupExclusion } from '@/lib/data/group-exclusions'
import { fetchHolidays, type Holiday } from '@/lib/data/holidays'
import { fetchTeamOffDays, type TeamOffDay } from '@/lib/data/team-off-days'
import { fetchSettings, type Setting } from '@/lib/data/settings'
import { ParticipantsStoreProvider } from '@/lib/store/participants-store'
import { ParticipantsCard } from '@/components/ParticipantsCard'
import { GenerationOptions } from '@/components/GenerationOptions'
import { GroupExclusionsPanel } from '@/components/GroupExclusionsPanel'
import { HolidaysPanel } from '@/components/HolidaysPanel'
import { TeamOffDaysPanel } from '@/components/TeamOffDaysPanel'

// Rendu DYNAMIQUE (AC8) : l'état est live et partagé (FR13), pas de prérendu statique.
// Les fetchs tournent aussi côté serveur (NEXT_PUBLIC_* seulement).
export const dynamic = 'force-dynamic'

export default async function Home() {
  // SSR de l'état initial → passé au provider client (pas de flash de chargement).
  // Les cinq fetchs en parallèle, INDÉPENDANTS : l'échec de l'un retombe sur [] sans perdre les autres
  // (Realtime + re-hydratation AD-6 prennent le relais).
  const [
    initial,
    initialUnavailabilities,
    initialGroupExclusions,
    initialHolidays,
    initialTeamOffDays,
    initialSettings,
  ] = await Promise.all([
    fetchParticipants().catch((): Participant[] => []),
    fetchUnavailabilities().catch((): Unavailability[] => []),
    fetchGroupExclusions().catch((): GroupExclusion[] => []),
    fetchHolidays().catch((): Holiday[] => []),
    fetchTeamOffDays().catch((): TeamOffDay[] => []),
    fetchSettings().catch((): Setting | null => null),
  ])

  return (
    <>
      <header className="app-header">
        <div className="app-header-icon" aria-hidden="true">
          🎲
        </div>
        <div className="app-header-text">
          <h1>Daily Wheel</h1>
          <p>
            Planificateur de Daily Scrum — ordre aléatoire, contraintes
            respectées
          </p>
        </div>
      </header>

      <main className="container">
        <ParticipantsStoreProvider
          initial={initial}
          initialUnavailabilities={initialUnavailabilities}
          initialGroupExclusions={initialGroupExclusions}
          initialHolidays={initialHolidays}
          initialTeamOffDays={initialTeamOffDays}
          initialSettings={initialSettings}
        >
          <ParticipantsCard />

          <section className="card" aria-labelledby="card-options">
            <h2 id="card-options" className="card-title">Options</h2>
            <GenerationOptions />
            <GroupExclusionsPanel />
            <HolidaysPanel />
            <TeamOffDaysPanel />
          </section>
        </ParticipantsStoreProvider>

        <section className="card" aria-labelledby="card-resultat">
          <h2 id="card-resultat" className="card-title">Résultat</h2>
          <p className="card-empty">
            Le planning généré s’affichera ici.
          </p>
        </section>
      </main>
    </>
  );
}
