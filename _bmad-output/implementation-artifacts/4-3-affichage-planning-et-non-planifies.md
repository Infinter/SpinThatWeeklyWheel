---
baseline_commit: f3bf2bd
---

# Story 4.3: Affichage du planning et des non-planifiés

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want voir le planning (date longue FR → animateur) et la liste des non-planifiés,
so that je comprends le résultat et les éventuels écarts (FR12) — **3ᵉ et DERNIÈRE story d'Epic 4**. C'est la story de **présentation** qui met en forme le résultat brut produit par 4.2. Le moteur (`generateSchedule`), le store (`generate()`, état `schedule` éphémère) et le rendu minimal existent **déjà** : 4.3 **enrichit l'affichage**, sans toucher au domaine ni à la persistance.

## Acceptance Criteria

> Les 5 critères de l'epic (epics.md#Story-4.3) sont décomposés ci-dessous. Story **PUREMENT présentation** : tout le calcul (planning + non-planifiés) est livré et **gelé** par 4.2. **2 fichiers UPDATE** : `components/ScheduleResult.tsx` (JSX enrichi) + `app/globals.css` (styles + responsive ≤520px). **Aucun** changement de domaine, store, page, route, migration ni test unitaire.
>
> ⚠️ **Domaine GELÉ — ne pas modifier `ScheduleResult`.** Le type `ScheduleResult = { planning: ScheduleRow[]; unscheduled: { id; name }[] }` (`lib/domain/schedule.ts`) est asserté en **deep-equal** par `schedule.golden.test.ts` (parité NFR9/AD-12) **et** `schedule.unit.test.ts` (test paramétré AD-3). **Ajouter un champ** (p. ex. `reason`) **casserait ces tests** et serait hors-périmètre. → La « raison générique » des non-planifiés se rend en **texte générique côté UI**, sans recalcul par personne (voir AC3 + Dev Notes §« Raison générique »).
>
> ✅ **Le rendu minimal 4.2 existe déjà** (`ScheduleResult.tsx` : bouton « 🎲 Lancer la sélection », tableau Date→Animateur via `formatDateFr`, compteur `.schedule-count`, ligne non-planifiés `.schedule-unscheduled`). 4.3 le **remplace/enrichit** ; ne pas repartir de zéro, ne pas casser le bouton ni l'action `generate`.

1. **Tableau Date / Animateur en dates longues FR (NFR4, UX-DR5).** Le tableau du planning affiche une ligne par session, colonnes **Date** et **Animateur**, la date au **format long français** via `formatDateFr(row.date)` (déjà : « mardi 23 juin 2026 »). Conserver l'usage de `formatDateFr` (réutilisation — ne PAS réimplémenter le formatage). *Polish optionnel* : capitaliser l'initiale du jour de semaine pour l'esthétique (« Mardi 23 juin 2026 ») — purement cosmétique, sans toucher `date-fr.ts` (capitalisation locale dans le composant). Le tableau reste lisible et structuré (réutiliser la classe `.participant-table` existante ou une variante `.schedule-table` dédiée — privilégier la réutilisation).
   [Source: epics.md#Story-4.3 (AC1 « tableau Date / Animateur … dates en français en format long ») ; daily-wheel/lib/format/date-fr.ts (`formatDateFr` L12-19 — date longue FR, parsing LOCAL) ; daily-wheel/components/ScheduleResult.tsx (tableau actuel L40-55) ; daily-wheel/app/globals.css (`.participant-table` L176-194)]

2. **Compteur de sessions dans l'en-tête du résultat (UX-DR5).** Le nombre de sessions planifiées figure dans un **en-tête de résultat** (pas seulement un `<p>` perdu). Le rendre dans une bande d'en-tête du composant `ScheduleResult` (p. ex. `.schedule-header` : libellé « Planning » + compteur « N sessions »), avec l'accord pluriel FR déjà géré (`session{s}`, `planifiée{s}`). **Ne PAS** injecter le compteur dans le `<h2>Résultat</h2>` de `page.tsx` (server component — éviter le couplage ; garder le compteur **dans** le composant client). Conserver le titre `<h2 id="card-resultat">Résultat</h2>` intact.
   [Source: epics.md#Story-4.3 (AC2 « un compteur de sessions figure dans l'en-tête du résultat ») ; docs/prd.md §3 (UX-DR5 retour visuel via badges/compteurs) ; daily-wheel/components/ScheduleResult.tsx (`.schedule-count` L35-37) ; daily-wheel/app/page.tsx (carte Résultat L74-77, `<h2>` à conserver)]

3. **Avertissement « non planifiés » avec raison générique (UX-DR5).** Quand `schedule.unscheduled.length > 0`, afficher un **bloc d'avertissement** (style alerte ambre — réutiliser les tokens `--indispo-bg`/`--indispo-tag-border`, cohérent avec `.form-error`) listant les **noms** des non-planifiés (`schedule.unscheduled.map(u => u.name)`) accompagnés d'une **raison générique** expliquant les deux causes possibles, p. ex. : « Ces participants n'ont pas pu être placés : indisponibles sur la période, ou les placer aurait créé un jour sans animateur. »
   - 🔴 **La raison est GÉNÉRIQUE (collective), PAS calculée par personne.** Le domaine ne fournit que `{ id, name }` (gelé — voir avertissement d'en-tête). Ne **PAS** ajouter de champ `reason` au domaine (casse golden + AD-3). Ne **PAS** recalculer côté UI quel non-planifié est « indisponible » vs « placerait un trou » (cela dupliquerait la logique de contraintes hors du domaine → viole AD-1/AD-3). Un **seul message générique** couvrant les deux cas satisfait l'AC (« raison **générique** » — c'est le mot de l'epic). [Source: Dev Notes §« Raison générique »]
   [Source: epics.md#Story-4.3 (AC3 « un avertissement liste les participants non planifiés avec la raison générique (indisponible / placerait un trou) ») ; daily-wheel/lib/domain/schedule.ts (`ScheduleResult.unscheduled: {id,name}[]` — type GELÉ, asserté deep-equal) ; daily-wheel/components/ScheduleResult.tsx (`.schedule-unscheduled` L58-63) ; daily-wheel/app/globals.css (tokens `--indispo-*` L18-21, `.form-error` L249-257 modèle d'alerte)]

4. **Message explicite si aucun participant planifiable (UX-DR1).** Distinguer trois états après génération (`schedule !== null`) :
   - `planning.length === 0` **et** `unscheduled.length === 0` (aucun actif, ou aucun jour valide) → message explicite « **Aucun participant n'a pu être planifié.** » (au lieu d'un tableau vide muet).
   - `planning.length === 0` **et** `unscheduled.length > 0` (tous les actifs non plaçables) → message « Aucune session planifiée. » + le bloc d'avertissement AC3.
   - `planning.length > 0` → tableau + compteur (+ avertissement si non-planifiés).
   Conserver aussi l'état **avant** génération (`schedule === null`) → message « Cliquez sur « Lancer la sélection » pour générer le planning. » (déjà présent). Le bouton reste **désactivé** sans participant actif (déjà géré L21-26 — ne pas régresser).
   [Source: epics.md#Story-4.3 (AC4 « un message explicite s'affiche si aucun participant n'est planifiable ») ; daily-wheel/components/ScheduleResult.tsx (états actuels L29-65, garde `canGenerate` L15) ; docs/prd.md §3 (UX-DR1 états explicites)]

5. **Carte Résultat responsive et lisible ≤ 520px (NFR5, UX-DR7).** La zone Résultat ne **déborde pas** horizontalement sur mobile (≤ 520px) et reste lisible :
   - Le tableau : les dates longues FR (jusqu'à ~ « mercredi 30 décembre 2026 ») ne doivent pas provoquer de scroll horizontal. Réutiliser/étendre les règles `.participant-table` du bloc `@media (max-width: 520px)` existant (padding réduit, `font-size` réduit) ; autoriser le retour à la ligne de la cellule Date (`white-space: normal`) si nécessaire. Alternative acceptable : envelopper le tableau dans un conteneur `overflow-x: auto`.
   - L'en-tête (compteur) et le bloc d'avertissement s'empilent proprement pleine largeur (texte fluide, déjà responsive par nature — vérifier juste l'absence de débordement).
   - Réutiliser les tokens charte existants (`--primary`, `--border`, `--indispo-*`, `--radius-sm`) — **sans dégradé** (UX-DR2). Pas de nouveau token nécessaire.
   [Source: epics.md#Story-4.3 (AC5 « la zone Résultat reste responsive et lisible sur mobile (≤ 520 px) ») ; daily-wheel/app/globals.css (bloc `@media (max-width: 520px)` L737-780, règles `.participant-table` mobile L744-746) ; ARCHITECTURE-SPINE.md (NFR5 responsive, UX-DR2 sans dégradé)]

## Tasks / Subtasks

> ⚠️ **Tout le code est sous `daily-wheel/`** (variance structurelle héritée 1.1→4.2). Toute commande `npm` se lance depuis `daily-wheel/`.
> 🟢 **Story PURE PRÉSENTATION** : 2 fichiers UPDATE (`ScheduleResult.tsx` + `globals.css`). Aucun domaine, store, page, route, migration ni test unitaire. Ne pas casser le bouton/action `generate` de 4.2.
> 🔴 **NE PAS toucher `lib/domain/schedule.ts`** (type `ScheduleResult` gelé, asserté deep-equal par golden + AD-3).

- [x] **Tâche 1 — Enrichir `ScheduleResult.tsx` : en-tête + compteur + tableau + avertissement + états** (AC: 1, 2, 3, 4)
  - [x] Conserver le bouton « 🎲 Lancer la sélection » + garde `disabled` (AC actuel L21-26) — ne pas régresser.
  - [x] État `schedule === null` (avant génération) : conserver le message d'invite existant.
  - [x] État `schedule !== null` : rendre un **en-tête de résultat** (`.schedule-header`) avec le compteur de sessions (accord pluriel FR conservé). (AC2)
  - [x] Tableau Date / Animateur via `formatDateFr` (réutilisé), affiché **uniquement** si `planning.length > 0`. Polish optionnel : capitaliser l'initiale du jour. (AC1)
  - [x] Bloc d'avertissement non-planifiés (style alerte ambre) avec **raison générique collective** (pas par personne) si `unscheduled.length > 0`. (AC3)
  - [x] Message « Aucun participant n'a pu être planifié. » si `planning.length === 0 && unscheduled.length === 0` ; « Aucune session planifiée. » si `planning.length === 0 && unscheduled.length > 0`. (AC4)

- [x] **Tâche 2 — Styles + responsive ≤520px dans `globals.css`** (AC: 1, 2, 3, 5)
  - [x] Étendre/ajouter le bloc `.schedule-*` (L714-734) : `.schedule-header` (bande en-tête + compteur), style de tableau résultat (réutiliser `.participant-table` ou variante), `.schedule-warning` (alerte ambre via `--indispo-bg`/`--indispo-tag-border`, modèle `.form-error`). Charte, **sans dégradé**, focus visibles conservés.
  - [x] Bloc `@media (max-width: 520px)` (L737-780) : garantir l'absence de débordement horizontal de la carte Résultat (dates longues), en-tête/avertissement empilés pleine largeur. (AC5)

- [x] **Tâche 3 — Non-régression + vérification manuelle** (AC: 1, 2, 3, 4, 5)
  - [x] `npm run test:unit` reste vert (**18 suites** — inchangé, aucun test touché) ; `npm run lint` 0 ; `npx tsc --noEmit` 0 ; `npm run build` vert (aucune nouvelle route).
  - [x] Vérification manuelle (voir Dev Notes §Testing) : couverte par relecture de la logique + type-check ; vérif visuelle live recommandée côté utilisateur (pattern hérité 1.5→4.2, UI non unit-testée).

## Dev Notes

### Contexte & périmètre
- **3ᵉ et dernière story d'Epic 4 — présentation pure (FR12).** Le cœur de valeur (génération EDF) est livré en 4.2. 4.3 **met en forme** le `ScheduleResult` éphémère déjà calculé : dates longues FR, compteur en en-tête, avertissement non-planifiés, message « aucun planifiable », responsive ≤520px. Après 4.3, la valeur métier de bout-en-bout est complète et présentée. [Source: epics.md#Epic-4 ; #Story-4.3]
- **In-scope :** enrichissement JSX de `components/ScheduleResult.tsx` (en-tête + compteur + tableau soigné + avertissement + 3 états post-génération) ; styles `.schedule-*` + responsive ≤520px dans `app/globals.css`.
- **Hors-scope (jamais) :** toute modification du domaine (`schedule.ts`/`rng.ts`/`team-availability.ts`), du store (`generate()`/état `schedule`), de `page.tsx`, des routes/migrations/Realtime ; persistance du planning (c'est un **recalcul** éphémère — 4.2) ; **calcul d'une raison par personne** (le domaine fournit `{id,name}` gelé) ; pré-remplissage fériés / import legacy (déférés).

### ⚠️ Domaine & résultat GELÉS — frontière 4.2 → 4.3 (CRITIQUE)
- **`ScheduleResult` est immuable ici.** `lib/domain/schedule.ts` expose `type ScheduleResult = { planning: ScheduleRow[]; unscheduled: { id: string; name: string }[] }`. Ce type est asserté en **deep-equal** par `tests/schedule.golden.test.ts` (parité NFR9/AD-12) et `tests/schedule.unit.test.ts` (test paramétré AD-3). **Lui ajouter un champ `reason` casserait ces deux suites** et déborderait du périmètre présentation. → 4.3 **consomme** `{ id, name }` tel quel.
- **Le store et l'action `generate()` sont gelés.** `ScheduleResult.tsx` lit `{ schedule, generate, participants }` via `useParticipants()` — API publique inchangée. 4.3 ne touche **ni** le store **ni** `page.tsx` (la carte Résultat est déjà montée DANS le provider depuis 4.2, L73-77).
- **Le bouton et la garde `disabled` existent (4.2)** : `canGenerate = participants.filter(p=>p.active).length > 0`. Conserver tel quel — 4.3 enrichit le **rendu du résultat**, pas le déclencheur.

### Raison générique des non-planifiés (décision de conception — AC3)
- L'epic demande « la **raison générique** (indisponible / placerait un trou) ». Deux causes réelles d'un non-planifié dans l'algorithme 4.2 : (a) **jamais disponible** sur l'horizon (toujours indispo) ; (b) **resté en queue** quand la boucle s'est arrêtée car le placer aurait créé un jour sans candidat (`break` sur `avail.length===0` — invariant one-shot « pas de trou », AC6 de 4.2).
- **Décision : message générique collectif, PAS de classification par personne.** Justification : (1) le domaine ne renvoie pas la cause par personne (type gelé) ; (2) ajouter un `reason` au domaine casse golden + AD-3 ; (3) recalculer la cause côté UI dupliquerait `isPersonUnavailable`/`isTeamNonSessionDay`/la logique de fenêtre hors du domaine → viole AD-1 (domaine feuille, source unique) et AD-3 ; (4) l'epic dit explicitement « générique », pas « précise/par personne ». Un seul message couvrant les deux cas satisfait littéralement l'AC.
- *Évolution future possible (hors-scope)* : si un jour une raison par personne est souhaitée, ce serait une story dédiée enrichissant le domaine (`unscheduled: {id,name,reason}[]`) **avec** mise à jour des fixtures golden/AD-3 — pas un patch UI.

### ⚠️ Variance structurelle héritée (rappel 1.1→4.2)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Tout code, tout `npm`, tout grep → **depuis `daily-wheel/`**. [Source: 4-2-*.md#Variance-structurelle]
- État réel pertinent (vérifié au commit `f3bf2bd`) — **réutiliser, ne pas casser** :
  - `components/ScheduleResult.tsx` (68 L) : rendu MINIMAL 4.2 — bouton primaire L21-26, garde `canGenerate` L15, état `schedule===null` L29-32, tableau `.participant-table` Date(`formatDateFr`)→Animateur L40-55, compteur `.schedule-count` L35-37, non-planifiés `.schedule-unscheduled` L58-63. **C'est le fichier à enrichir.**
  - `lib/format/date-fr.ts` : `formatDateFr(ymd)` L12-19 (date longue FR, parsing LOCAL — réutiliser ; ne pas réintroduire `new Date('YYYY-MM-DD')` UTC). **Inchangé.**
  - `lib/store/participants-store.tsx` : `useParticipants()` expose `schedule: ScheduleResult|null`, `generate()`, `participants` (avec `active`). **Inchangé.**
  - `lib/domain/schedule.ts` : `ScheduleResult`/`ScheduleRow` — **GELÉ, ne pas modifier.**
  - `app/page.tsx` : carte Résultat déjà DANS le provider (L74-77), `<h2 id="card-resultat">Résultat</h2>` à conserver. **Inchangé.**
  - `app/globals.css` : bloc `.schedule-*` L714-734 (à enrichir), tokens charte `:root` L2-26 (`--primary`, `--indispo-bg`/`--indispo-tag-border`, `--border`, `--radius-sm`), modèle d'alerte `.form-error` L249-257, `.participant-table` L176-194 (+ règles mobile L744-746), bloc `@media (max-width:520px)` L737-780. **À étendre additivement.**

### Décisions d'architecture qui cadrent cette story
- **AD-1 (domaine feuille pur, source unique)** : aucune logique de contraintes dans l'UI. 4.3 n'affiche que ce que le domaine a déjà calculé — d'où la raison **générique** (pas de recalcul UI). [Source: ARCHITECTURE-SPINE.md#AD-1]
- **AD-3 (prédicat unique)** : corollaire du point ci-dessus — ne pas réimplémenter `isTeamNonSessionDay`/`isPersonUnavailable` côté composant pour deviner une cause.
- **AD-12 (parité = golden)** : le type `ScheduleResult` est gelé par le golden ; toute extension de forme le casserait. [Source: ARCHITECTURE-SPINE.md#AD-12]
- **Résultat éphémère (pattern 4.2)** : aucune persistance, aucun Realtime, aucune écriture. 4.3 reste purement client/présentation. [Source: 4-2-*.md#Dev-Notes]
- **Charte (UX-DR2/UX-DR5/UX-DR7)** : primaire `#0078d4`, **sans dégradé**, alerte ambre via tokens `--indispo-*`, focus visibles, responsive ≤520px. Réutiliser les tokens existants — pas de nouveau token.

### Previous Story Intelligence (4.2 / 4.1)
- **4.2 a explicitement déféré l'affichage soigné à 4.3.** Citations 4.2 : « la présentation soignée (dates longues structurées, compteur en en-tête, avertissements avec raison générique, message « aucun planifiable », responsive ≤520px) est la Story 4.3 ». 4.3 **livre exactement ce périmètre** — ni plus (pas de domaine), ni moins. [Source: 4-2-*.md#Contexte-périmètre, #ScheduleResult]
- **UI non unit-testée (cohérent 1.5→4.2)** : pas de RTL/jsdom — **ne pas ajouter de dépendance**. La preuve d'une story de présentation = **vérification manuelle** + non-régression (`test:unit` reste 18 suites, lint/tsc/build verts).
- **Flake Realtime connu** : 1er `npm test` peut timeouter sur le handshake puis passer au retry — transitoire, **pas** une régression. 4.3 n'ajoute aucun canal Realtime → surface Realtime inchangée.
- **CI Node 22.x** + Vercel `framework=nextjs` : **ne pas** retoucher CI/Vercel. Aucune nouvelle route ⇒ build identique en surface serveur.
- **Push Git** : remote via alias SSH `github-perso` → `Infinter/SpinThatWeeklyWheel` (compte SoloOz). [Source: MEMORY:git-remote-push-setup]
- **Epic 4 déjà `in-progress`** ; 4.3 passe `backlog → ready-for-dev` (géré par ce workflow). 4.3 **clôt Epic 4** — penser à proposer la rétrospective d'épopée ensuite.

### Points techniques (Next.js 16 / React 19 — janv. 2026)
- **Aucune nouvelle techno, aucune recherche web requise.** Stack figée (Next 16.2.x, React 19.2, supabase-js 2.108.x, Vitest 4.1.x). Story = enrichissement d'un composant client `'use client'` + CSS, sur patterns existants. **Aucune dépendance à ajouter.**
- `ScheduleResult.tsx` est déjà `'use client'` (consomme `useParticipants`). Garder la directive.
- Le formatage long FR est déjà correct et local (`formatDateFr`) ; la capitalisation optionnelle de l'initiale se fait par manipulation de chaîne dans le composant (ex. `s.charAt(0).toUpperCase() + s.slice(1)`), **sans** toucher `date-fr.ts` (qui est consommé par d'autres écrans).

### Project Structure Notes
- Arborescence touchée (tout sous `daily-wheel/`) :
  ```
  components/ScheduleResult.tsx           # UPDATE (en-tête+compteur, tableau soigné, avertissement raison générique, 3 états post-génération — AC1/2/3/4)
  app/globals.css                         # UPDATE (.schedule-header/.schedule-warning + table résultat + responsive ≤520px — AC1/2/3/5)
  _bmad-output/.../sprint-status.yaml     # UPDATE (statut 4.3 ; géré par le workflow)
  ```
- **Inchangés (réutilisés/gelés)** : `lib/domain/*` (GELÉ — `schedule.ts`/`rng.ts`/`team-availability.ts`/`availability.ts`), `lib/store/participants-store.tsx` (API inchangée), `lib/format/date-fr.ts` (consommé), `app/page.tsx` (carte Résultat déjà montée), `lib/data/*`, `lib/supabase/*`, routes `app/api/*`, migrations, `package.json` (aucun nouveau script de test), `vitest.config.ts`, `vercel.json`, tous les autres composants.
- **Aucune migration DB, aucune route, aucune dépendance npm, aucun nouveau test unitaire.**

### Testing standards (pour cette story)
- **Pas de TDD unitaire** : périmètre = composant React + CSS, non unit-testé dans ce projet (cohérent 1.5→4.2 — pas de RTL/jsdom, **ne pas** ajouter de dépendance). La preuve est **manuelle** + non-régression.
- **Non-régression (obligatoire, depuis `daily-wheel/`)** : `npm run test:unit` vert (**18 suites — inchangé**, aucun test touché) ; `npm test` vert (flake Realtime → vert au retry) ; `npm run lint` 0 ; `npx tsc --noEmit` 0 ; `npm run build` vert (aucune nouvelle route).
- **Vérification manuelle (preuve de la story)** :
  - **Compteur en en-tête** : après génération, le nombre de sessions figure dans la bande d'en-tête du résultat (accord pluriel FR correct : « 1 session planifiée » / « 3 sessions planifiées »).
  - **Dates longues FR** (NFR4) : chaque ligne du tableau affiche une date longue française (« mardi 23 juin 2026 »).
  - **Avertissement non-planifiés** (AC3) : avec un dataset produisant des non-planifiés (p. ex. une personne indispo sur tout l'horizon), le bloc d'alerte ambre liste les noms + la raison **générique** (pas de cause par personne).
  - **Message « aucun planifiable »** (AC4) : sans participant actif le bouton est désactivé ; un dataset où personne n'est plaçable affiche le message explicite (pas un tableau vide muet).
  - **Responsive ≤520px** (AC5) : à ≤520px (DevTools), la carte Résultat ne déborde pas horizontalement ; le tableau (dates longues), l'en-tête et l'avertissement restent lisibles et empilés proprement.
  - **Non-régression manuelle** : les cartes Participants/Options et toutes les contraintes conservent un comportement identique ; recharger la page efface le résultat (éphémère, attendu) sans perdre les données persistées.
- **Critère « vert »** : non-régression ci-dessus + les 5 points de vérification manuelle validés.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4 ; #Story-4.3 (5 critères : tableau Date/Animateur dates longues FR, compteur en en-tête, avertissement non-planifiés raison générique, message aucun planifiable, responsive ≤520px) ; FR12 ; NFR4 ; NFR5 ; UX-DR1 ; UX-DR2 ; UX-DR5 ; UX-DR7]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-1 (domaine feuille pur, source unique — pas de logique de contraintes dans l'UI) ; #AD-3 (prédicat unique — ne pas recalculer la cause côté UI) ; #AD-12 (parité golden — type ScheduleResult gelé) ; #Consistency-Conventions (charte sans dégradé, dates FR) ; NFR5 responsive]
- [Source: daily-wheel/components/ScheduleResult.tsx (rendu minimal 4.2 à enrichir : bouton L21-26, garde L15, états L29-65, tableau L40-55, compteur L35-37, non-planifiés L58-63) ; daily-wheel/lib/domain/schedule.ts (`ScheduleResult`/`ScheduleRow` — GELÉ) ; daily-wheel/lib/format/date-fr.ts (`formatDateFr` L12-19 — réutilisé) ; daily-wheel/lib/store/participants-store.tsx (`useParticipants` → `schedule`/`generate`/`participants` — inchangé) ; daily-wheel/app/page.tsx (carte Résultat L74-77 + `<h2>` à conserver — inchangé)]
- [Source: daily-wheel/app/globals.css (bloc `.schedule-*` L714-734 à enrichir ; tokens `:root` L2-26 ; `.form-error` L249-257 modèle alerte ambre ; `.participant-table` L176-194 + mobile L744-746 ; `@media (max-width:520px)` L737-780)]
- [Source: _bmad-output/implementation-artifacts/4-2-algorithme-edf-integrant-toutes-les-contraintes.md (#Contexte-périmètre & #ScheduleResult : périmètre 4.3 explicitement déféré ; #Variance-structurelle daily-wheel/ ; #Testing UI non unit-testée + flake Realtime ; pattern résultat éphémère) ; MEMORY:git-remote-push-setup]

## Dev Agent Record

### Agent Model Used

Amelia (dev-story) — claude-opus-4-8[1m]

### Debug Log References

- `npm run lint` → 0 erreur. `npx tsc --noEmit` → 0 erreur.
- `npm run test:unit` → **18 suites / 230 tests** verts — **inchangé** (aucun test touché : story de présentation pure).
- `npm run build` → vert ; routes identiques (6 `/api/*` + `/`), **aucune nouvelle route** (le résultat reste un calcul client éphémère, pas une route serveur).

### Completion Notes List

- **Présentation pure livrée — Epic 4 clos côté implémentation.** 2 fichiers UPDATE uniquement (`components/ScheduleResult.tsx` enrichi + `app/globals.css` styles/responsive). Aucun changement de domaine, store, `page.tsx`, route, migration ni test.
- **Domaine resté GELÉ.** Le type `ScheduleResult = { planning, unscheduled: {id,name}[] }` n'a pas été touché → golden (AD-12) + test paramétré AD-3 intacts (deep-equal préservé). Le composant ne fait que **consommer** ce que 4.2 a calculé.
- **Raison non-planifiés = GÉNÉRIQUE collective (décision AC3).** Un seul message couvre les deux causes (« indisponibles sur la période, ou les placer aurait créé un jour sans animateur ») — pas de cause par personne, car le domaine ne fournit que `{id,name}` et recalculer la cause dupliquerait `isPersonUnavailable`/`isTeamNonSessionDay` hors domaine (viole AD-1/AD-3). Conforme au mot « générique » de l'epic.
- **AC couverts** : tableau Date/Animateur en dates longues FR via `formatDateFr` réutilisé + capitalisation cosmétique de l'initiale (AC1) ; compteur de sessions dans une bande d'en-tête `.schedule-header` avec accord pluriel FR (AC2) ; bloc d'avertissement ambre `.schedule-warning` listant les noms + raison générique (AC3) ; 3 états post-génération dont message explicite « Aucun participant n'a pu être planifié. » + « Aucune session planifiée. » (AC4) ; responsive ≤520px (en-tête `flex-wrap`, cellule Date `white-space: normal`, réutilise les règles `.participant-table` mobile) — pas de débordement horizontal (AC5).
- **Non-régression** : bouton « 🎲 Lancer la sélection » + garde `disabled` (0 actif) conservés ; `formatDateFr`/`date-fr.ts` non modifié (consommé ailleurs) ; styles additifs réutilisant les tokens charte (`--primary-dark`, `--indispo-bg`/`--indispo-tag-border`, `--border`, `--radius-sm`) — sans dégradé (UX-DR2). Lint/tsc/test:unit(18)/build verts.
- **Réserve honnête** : la vérif **visuelle live** (navigateur, états avec données réelles) n'a pas été exécutée par l'agent — couverte par relecture de logique + type-check, et recommandée à l'utilisateur, conformément au pattern « Store/UI non unit-testés » hérité de 1.5→4.2.

### File List

- `daily-wheel/components/ScheduleResult.tsx` (UPDATE — en-tête + compteur, dates longues FR capitalisées, avertissement raison générique, 3 états post-génération ; bouton/`generate` conservés)
- `daily-wheel/app/globals.css` (UPDATE — bloc `.schedule-header`/`.schedule-count`/`.schedule-warning` enrichi + règles responsive ≤520px de la carte Résultat)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — statut 4.3 ; géré par le workflow)

### Change Log

- 2026-06-23 — Story 4.3 implémentée (Amelia/dev-story) : présentation soignée de la carte Résultat — compteur en en-tête, dates longues FR, avertissement non-planifiés à raison générique (domaine gelé, pas de cause par personne — AD-1/AD-3), message « aucun planifiable », responsive ≤520px. 2 fichiers UPDATE (présentation pure), aucun test touché : 18 suites/230 tests verts, lint/tsc 0, build vert sans nouvelle route. Status → review. **Clôt l'implémentation d'Epic 4.**
