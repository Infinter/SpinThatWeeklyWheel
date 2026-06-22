export default function Home() {
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
        <section className="card" aria-labelledby="card-participants">
          <h2 id="card-participants" className="card-title">Participants</h2>
          <p className="card-empty">Aucun participant pour le moment.</p>
        </section>

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
