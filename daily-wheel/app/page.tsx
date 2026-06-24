import { fetchParticipants, type Participant } from '@/lib/data/participants'
import { fetchUnavailabilities, type Unavailability } from '@/lib/data/unavailabilities'
import { fetchGroupExclusions, type GroupExclusion } from '@/lib/data/group-exclusions'
import { fetchHolidays, type Holiday } from '@/lib/data/holidays'
import { fetchTeamOffDays, type TeamOffDay } from '@/lib/data/team-off-days'
import { fetchSettings, type Setting } from '@/lib/data/settings'
import { fetchRotationState, type RotationState } from '@/lib/data/rotation-state'
import { ParticipantsStoreProvider } from '@/lib/store/participants-store'
import { ParticipantsCard } from '@/components/ParticipantsCard'
import { GenerationOptions } from '@/components/GenerationOptions'
import { GroupExclusionsPanel } from '@/components/GroupExclusionsPanel'
import { HolidaysPanel } from '@/components/HolidaysPanel'
import { TeamOffDaysPanel } from '@/components/TeamOffDaysPanel'
import { ScheduleResult } from '@/components/ScheduleResult'
import { ProtectionBanner } from '@/components/ProtectionBanner'
import { GuidedStepper } from '@/components/GuidedStepper'
import { StepNavProvider, StepPanel } from '@/components/StepNav'
import { ThemeToggle } from '@/components/ThemeToggle'

// Rendu DYNAMIQUE (AC8) : l'état est live et partagé (FR13), pas de prérendu statique.
// Les fetchs tournent aussi côté serveur (NEXT_PUBLIC_* seulement).
export const dynamic = 'force-dynamic'

export default async function Home() {
  // SSR de l'état initial → passé au provider client (pas de flash de chargement).
  // Les sept fetchs en parallèle, INDÉPENDANTS : l'échec de l'un retombe sur []/null sans perdre les
  // autres (Realtime + re-hydratation AD-6 prennent le relais). rotation_state (5.6) = reprise au curseur.
  const [
    initial,
    initialUnavailabilities,
    initialGroupExclusions,
    initialHolidays,
    initialTeamOffDays,
    initialSettings,
    initialRotationState,
  ] = await Promise.all([
    fetchParticipants().catch((): Participant[] => []),
    fetchUnavailabilities().catch((): Unavailability[] => []),
    fetchGroupExclusions().catch((): GroupExclusion[] => []),
    fetchHolidays().catch((): Holiday[] => []),
    fetchTeamOffDays().catch((): TeamOffDay[] => []),
    fetchSettings().catch((): Setting | null => null),
    fetchRotationState().catch((): RotationState | null => null),
  ])

  return (
    // Provider étendu à TOUTE la page (Story 5.1) : le bandeau de protection et le stepper consomment le store.
    <ParticipantsStoreProvider
      initial={initial}
      initialUnavailabilities={initialUnavailabilities}
      initialGroupExclusions={initialGroupExclusions}
      initialHolidays={initialHolidays}
      initialTeamOffDays={initialTeamOffDays}
      initialSettings={initialSettings}
      initialRotationState={initialRotationState}
    >
      <header className="app-header">
        <div className="app-header-icon" aria-hidden="true">
          🎡
        </div>
        <div className="app-header-text">
          <h1>Daily Wheel</h1>
          <p>
            Planificateur de Daily Scrum — ordre aléatoire, contraintes
            respectées
          </p>
        </div>
        {/* Protection annoncée d'emblée (UX-DR8) ; saisie passphrase paresseuse inchangée. */}
        <ProtectionBanner />
        {/* Bascule clair/sombre (2026-06-24). */}
        <ThemeToggle />
      </header>

      {/* Parcours guidé COLLANT : 1 Équipe · 2 Contraintes · 3 Spin. Commutateur d'étapes : une seule
          surface visible à la fois (décision Solo 2026-06-24, déviation assumée du « pas un wizard »). */}
      <StepNavProvider>
        <GuidedStepper />

        <main className="container">
          {/* Une seule surface visible (StepPanel) ; les autres restent montées mais masquées. */}
          <StepPanel step="equipe">
            <div id="surface-equipe">
              <ParticipantsCard />
            </div>
          </StepPanel>

          <StepPanel step="contraintes">
            <section id="surface-contraintes" className="card" aria-labelledby="card-options">
              <h2 id="card-options" className="card-title">Options</h2>
              <GenerationOptions />
              <GroupExclusionsPanel />
              <HolidaysPanel />
              <TeamOffDaysPanel />
            </section>
          </StepPanel>

          {/* Carte Résultat DANS le provider : le bouton « Lancer » et l'affichage consomment le store. */}
          <StepPanel step="spin">
            <section id="surface-spin" className="card" aria-labelledby="card-resultat">
              <h2 id="card-resultat" className="card-title">Résultat</h2>
              <ScheduleResult />
            </section>
          </StepPanel>
        </main>
      </StepNavProvider>
    </ParticipantsStoreProvider>
  );
}
