# Deferred Work

## Deferred from: code review of 1-1-initialiser-application-nextjs-charte-existante (2026-06-22)

- AC2 — Texte d'état vide dans les cartes (placeholder « Aucun participant… » etc.) — sera probablement retiré via une prochaine US ; on attend que tout soit développé avant de trancher.

- Script lint `"lint": "eslint"` sans cible explicite dans `package.json:9` — fonctionne en pratique avec la flat config, mais fragile si ESLint change son comportement par défaut.
- Reset lien global trop large : `a { color: inherit; text-decoration: none }` dans `globals.css:42` — devient un problème dès que des liens inline sont ajoutés dans le contenu.
- `.gitignore` inner : `.env*` trop large, masquerait `.env.example` ou `.env.template` (`daily-wheel/.gitignore:34`).
- Pas de style `button:disabled` dans `globals.css` — aucun bouton dans le markup actuel ; à ajouter dès Story 2.
- Breakpoints responsives manquants entre 521–780px dans `globals.css:126` — à affiner au fil des stories.
- Pas de `prefers-color-scheme: dark` dans `globals.css` — dark mode hors-scope Story 1.1.
- Pas de headers de sécurité dans `next.config.ts:3` — à ajouter avant le déploiement production (Story 1.5 / Vercel).

## Deferred from: code review of spec-personne-du-jour-bandeau (2026-07-01)

- Contrat couleur PARTAGÉ vs roster périmé : si l'animateur du jour est désactivé/supprimé APRÈS le tirage, `buildColorIndexMap(active)` ne contient plus son id → la pastille retombe sur `colorForIndex(0)` (mauvaise couleur). Comportement IDENTIQUE dans `ScheduleTimeline` et `SpinWheel` — c'est le contrat couleur commun, pas une régression du bandeau. Atténué par le nudge de relance (5.9). À traiter globalement (bandeau + timeline + roue ensemble) si un jour on veut résoudre la couleur par id sur l'union actifs+plannifiés.
- `todayYMD()` n'est recalculé qu'au re-render : un onglet laissé ouvert au passage de minuit continue d'afficher « aujourd'hui = hier » jusqu'à une MAJ du store / navigation. Pattern app-wide (todayYMD partout) — à traiter globalement si besoin (timer de minuit ou revalidation).
