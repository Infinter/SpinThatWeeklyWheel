import { fetchParticipants, type Participant } from '@/lib/data/participants'
import { ParticipantsStoreProvider } from '@/lib/store/participants-store'
import { ParticipantsCard } from '@/components/ParticipantsCard'

// Rendu DYNAMIQUE (AC8) : l'état est live et partagé (FR13), pas de prérendu statique.
// `fetchParticipants()` (1.3) tourne aussi côté serveur (n'utilise que des NEXT_PUBLIC_*).
export const dynamic = 'force-dynamic'

export default async function Home() {
  // SSR de l'état initial → passé en `initial` au provider client (pas de flash de chargement).
  let initial: Participant[] = []
  try {
    initial = await fetchParticipants()
  } catch {
    // Fetch initial impossible : l'app reste utilisable ; Realtime + re-hydratation (AD-6) prendront le relais.
    initial = []
  }

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
        <ParticipantsStoreProvider initial={initial}>
          <ParticipantsCard />
        </ParticipantsStoreProvider>

        <section className="card" aria-labelledby="card-options">
          <h2 id="card-options" className="card-title">Options</h2>
          <p className="card-empty">Réglages du planning à venir.</p>
        </section>

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
