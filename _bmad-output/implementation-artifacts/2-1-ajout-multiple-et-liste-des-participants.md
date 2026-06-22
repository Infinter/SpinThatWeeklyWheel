---
baseline_commit: 158bbcfc
---

# Story 2.1: Ajout multiple et liste des participants

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want ajouter plusieurs participants en une seule saisie (séparés par `,` ou `;`) et les voir dans un tableau Nom / Actif / Actions,
so that je configure l'équipe rapidement (FR1) — **première story d'Epic 2**, qui transforme l'ajout mono-nom + liste `<ul>` posés par la tranche verticale 1.5 en ajout multi-noms + tableau, **sans réécrire** la machinerie optimiste/passphrase/erreurs déjà prouvée.

## Acceptance Criteria

> Ces AC décomposent les 5 critères de l'epic (epics.md#Story-2.1) en unités implémentables et testables. Le **cœur testable** de cette story est un **parseur de noms pur** (`lib/store/parse-names.ts`), exactement comme `reconcile.ts` l'a été pour 1.5 — il roule en CI sans secrets (AD-13). Toute la couche d'écriture (optimiste, passphrase paresseuse, taxonomie d'erreurs AD-17) est **déjà en place depuis 1.5 et réutilisée telle quelle**.

1. **Parseur de noms PUR `lib/store/parse-names.ts` (cœur testable — FR1, AC7).** `parseNames(raw: string): string[]` :
   - Découpe la saisie sur **`,` ET `;`** (les deux séparateurs, mixables : `"Alice, Bob ; Chloé"`).
   - **Trim** chaque segment ; **élimine** les segments vides (espaces superflus et entrées vides ignorés — epics 2.1).
   - **Préserve l'ordre** de saisie.
   - **Ne déduplique PAS** : l'AC 2.1 n'interdit pas les noms en double (contrairement aux indispos/fériés des Epics 2.3/3.2). `"Alice, Alice"` → `["Alice", "Alice"]`.
   - Fonction **pure** : aucun import React / DOM / Supabase / `Date`. Exportée et testée unitairement **sans réseau ni env**.
   - Exemples : `"Alice, Bob ; Chloé"` → `["Alice","Bob","Chloé"]` ; `"  Alice  "` → `["Alice"]` ; `" , ; "` → `[]` ; `""` → `[]`.
   [Source: ARCHITECTURE-SPINE.md#AD-1 (esprit feuille pure) ; #AD-13 (tests purs CI) ; epics.md#Story-2.1 ; 1-5-*.md#AC1 (pattern reconcile pur)]

2. **`addParticipants(raw)` dans le store — réutilise la machinerie optimiste 1.5 (AD-5, AD-15, AD-17).** Nouveau point d'entrée **public** du store `lib/store/participants-store.tsx` :
   - Appelle `parseNames(raw)` ; si `[]` → **no-op** (aucune écriture).
   - Pour **chaque** nom retourné, déclenche le **chemin d'ajout optimiste existant** (1.5) : ligne `temp:<seq>` avec `active: true` + `pending`, puis `writeParticipant('insert', { data: { name } }, passphrase)`.
   - **Réutilise INTÉGRALEMENT** la passphrase paresseuse (file `pendingWritesRef` par `tempId`, **un seul** prompt même pour N noms, replay de toutes les écritures en file après saisie via `submitPassphrase`) et la taxonomie d'erreurs AD-17 (`auth`/`validation`/`conflict`/`transient`). **Ne pas réécrire** `runWrite`, `submitPassphrase`, `cancelPassphrase`, `retryParticipant`.
   - Le `addParticipant(name)` mono-nom de 1.5 devient le **chemin interne par nom** (privé) ; `addParticipants(raw)` est le point d'entrée que consomme la carte.
   [Source: 1-5-*.md#AC3 ; #AC4 ; #AC5 ; daily-wheel/lib/store/participants-store.tsx (runWrite/pendingWritesRef/addParticipant) ; ARCHITECTURE-SPINE.md#AD-5 ; #AD-15 ; #AD-17]

3. **Persistance multi-écritures via le proxy serveur (AD-14, AD-7).** Chaque nom parsé = **un** `POST /api/participants { op: 'insert', data: { name } }` via `writeParticipant` (1.4). Le serveur applique l'allowlist (`name`, `active`), génère `id`/`created_at`/`updated_at` (AD-15) et **retourne la ligne** → `CONFIRM` remplace la ligne temp → l'écho Realtime de ce `id`+`updated_at` est dédupliqué par `reconcileParticipants` (AD-15). Aucune écriture client-direct (AD-7/AD-11). `active = true` par défaut (défaut SQL + optimiste). [Source: daily-wheel/app/api/participants/route.ts ; ARCHITECTURE-SPINE.md#AD-7 ; #AD-14 ; #AD-15 ; epics.md#Story-2.1 (active=true par défaut)]

4. **Tableau Nom / Actif / Actions (UX-DR1).** La liste `<ul className="participant-list">` de 1.5 devient un **`<table>`** accessible à **3 colonnes** dans `components/ParticipantsCard.tsx` :
   - **Nom** : le nom ; conserve les états visuels 1.5 sur la ligne — `inactif` (grisé/barré) si `!active`, `pending` (opacité) si optimiste non confirmé, `failed` si échec.
   - **Actif** : indicateur **lecture seule** de `active` (badge/texte « Actif » / « Inactif »). ⚠️ **Le toggle interactif est Story 2.2 — NE PAS l'implémenter ici.**
   - **Actions** : héberge le bouton **« Réessayer »** des lignes `failed` (porté de 1.5). ⚠️ **Renommage / suppression = Story 2.2 — NE PAS les implémenter ici.**
   - En-têtes de colonnes explicites (`<th>` ; `scope="col"`). Tout en **français** (NFR4), charte CSS existante (tokens `--primary`, cartes, `--radius-sm`, **sans dégradés**), lisible **≤ 520 px** (NFR5, UX-DR7).
   [Source: epics.md#Story-2.1 (colonnes Nom/Actif/Actions) ; epics.md#Story-2.2 (frontière : toggle/rename/delete) ; 1-5-*.md#AC6 ; daily-wheel/components/ParticipantsCard.tsx ; docs/prd.md §3 UX-DR1/DR7]

5. **Formulaire d'ajout multi-noms.** L'`<input>` de la carte accepte **plusieurs noms** :
   - **Placeholder** indicatif du format multi : `Alice, Bob ; Chloé`.
   - Soumission au **clic** ET à la touche **Entrée** ; champ **vidé** après ajout (comportements 1.5 conservés).
   - Bouton « Ajouter » **désactivé** quand `parseNames(value).length === 0` (saisie vide ou uniquement séparateurs/espaces) — remplace le `!name.trim()` mono-nom de 1.5.
   - `onSubmit` → `addParticipants(value)` (AC2), puis vide le champ.
   [Source: epics.md#Story-2.1 (saisie + clic/Entrée) ; 1-5-*.md#AC6 ; daily-wheel/components/ParticipantsCard.tsx]

6. **État vide explicite conservé (UX-DR1).** Quand `participants.length === 0`, afficher « Aucun participant pour le moment. » (le `<table>` n'est pas rendu). Décision 1.5 de conserver l'état vide maintenue. [Source: 1-5-*.md#AC6 ; deferred-work.md (état vide conservé) ; docs/prd.md §3 UX-DR1]

7. **Preuve de test — parseur pur (rouge → vert).** `tests/parse-names.unit.test.ts` (pur, **sans réseau ni env**, enrôlé dans `npm test` ET ajouté à la cible `test:unit`) couvre `parseNames` :
   - Split sur `,`, sur `;`, et **mixte** `,`+`;` ; trim des segments ; **vides ignorés** (`"A,,B"`, `"A; ;B"`, séparateurs en tête/queue) ; **ordre préservé** ; only-séparateurs/espaces → `[]` ; chaîne vide → `[]` ; **doublons conservés**.
   - **Rouge d'abord** (fonction absente → import échoue), puis **vert**.
   [Source: ARCHITECTURE-SPINE.md#AD-13 ; 1-5-*.md#AC10 (pattern reconcile.unit) ; daily-wheel/tests/reconcile.unit.test.ts]

## Tasks / Subtasks

> ⚠️ **Tout le code et toutes les commandes `npm` sont sous `daily-wheel/`** (variance structurelle héritée 1.1→1.5). Le workflow CI à la racine n'est **pas** touché par cette story.

- [x] **Tâche 1 — Parseur de noms pur + test rouge** (AC: 1, 7)
  - [x] Écrire d'abord `daily-wheel/tests/parse-names.unit.test.ts` (ROUGE : fonction absente) couvrant split `,`/`;`/mixte, trim, vides ignorés, ordre préservé, only-séparateurs → `[]`, chaîne vide → `[]`, doublons conservés.
  - [x] Créer `daily-wheel/lib/store/parse-names.ts` : `export function parseNames(raw: string): string[]`. Implémentation pure (`raw.split(/[,;]/).map(s => s.trim()).filter(Boolean)`). Aucune dépendance React/DOM/Supabase/`Date`.
  - [x] VERT : `npm run test:unit` (10/10 parse-names) puis `npm test`.

- [x] **Tâche 2 — Store : `addParticipants(raw)` réutilisant la machinerie 1.5** (AC: 2, 3)
  - [x] Dans `daily-wheel/lib/store/participants-store.tsx` : importé `parseNames` ; ajouté `addParticipants(raw: string)` au `StoreValue` + au provider. Implémentation : `for (const name of parseNames(raw)) addParticipant(name)`. `parseNames` renvoie `[]` → no-op naturel.
  - [x] Conservé `addParticipant` (mono-nom) comme **chemin interne par nom** (crée `temp:<seq>`/`active:true`/`pending` + `runWrite`). `runWrite`, `submitPassphrase`, `cancelPassphrase`, `retryParticipant`, reducer, abonnement Realtime **inchangés**.
  - [x] `addParticipants` exposé dans le contexte ; `addParticipant` devenu interne (retiré du `StoreValue`, toujours utilisé par `addParticipants` et `retryParticipant` via `runWrite`).
  - [x] Multi-add **sans passphrase** : N appels → N `temp:<seq>` distincts en file `pendingWritesRef` → **un seul** prompt → `submitPassphrase` rejoue les N (garanti par la file Map de 1.5, inchangée).

- [x] **Tâche 3 — UI : formulaire multi-noms + tableau Nom/Actif/Actions** (AC: 4, 5, 6)
  - [x] `daily-wheel/components/ParticipantsCard.tsx` : `onSubmit` appelle `addParticipants(value)` ; bouton désactivé via `parseNames(value).length === 0` (`hasNames`) ; placeholder `Alice, Bob ; Chloé` ; submit clic+Entrée, champ vidé.
  - [x] Remplacé le `<ul>`/`<li>` par un `<table className="participant-table">` : `<thead>` `<th scope="col">` Nom/Actif/Actions ; une `<tr>` par participant. Cellule **Nom** = nom + classes d'état (`inactif`/`pending`/`failed` sur la `<tr>`) ; cellule **Actif** = badge lecture seule « Actif »/« Inactif » ; cellule **Actions** = bouton « Réessayer » si `p.failed`, sinon vide.
  - [x] État vide (`participants.length === 0` → message), bloc `error`, et `<PassphrasePrompt />` **inchangés**.
  - [x] ⚠️ Aucun toggle actif / renommage / suppression ajouté (réservé Story 2.2).

- [x] **Tâche 4 — CSS tableau responsive** (AC: 4)
  - [x] Étendu `daily-wheel/app/globals.css` : styles `.participant-table` (en-têtes uppercase, lignes, bordures via tokens) ; états migrés vers `.participant-row.inactif|.pending|.failed` ; badges `.badge-active`/`.badge-inactive` ; `.btn-retry` conservé. **Sans dégradés**, charte respectée.
  - [x] Lisibilité **≤ 520 px** : padding réduit dans la media query existante ; tableau à 3 colonnes courtes, pas de débordement horizontal de page. Aucune dépendance UI/Tailwind ajoutée.

- [x] **Tâche 5 — Scripts de test + non-régression** (AC: 7)
  - [x] `package.json` : `tests/parse-names.unit.test.ts` ajouté à la cible `test:unit` (le `npm test` global le ramasse aussi automatiquement).
  - [x] Non-régression : `npm run lint` (0 erreur), `npx tsc --noEmit` (0 erreur), `npm test` (31/32 — la 1 « échec » = flake handshake Realtime, vert au retry), `npm run build` (vert, `/` dynamique). `reconcile.unit` (9) et `write-error.unit` (5) toujours verts.
  - [x] Renseigné Dev Agent Record (File List, Completion Notes, Debug Log, Change Log) + cases cochées.

## Dev Notes

### Contexte & périmètre
- **Première story d'Epic 2** (« Participants & contraintes individuelles »). Epic 1 livré bout-en-bout (1.1 done ; 1.2→1.5 review). Cette story **étend** la tranche verticale 1.5, elle ne la refait pas. [Source: epics.md#Epic-2 ; sprint-status.yaml]
- **Scope strict — étendre l'existant, ne PAS anticiper 2.2/2.3 :**
  - **In-scope :** parseur de noms pur ; ajout **multi-noms** (`,`/`;`) ; **tableau** Nom/Actif/Actions ; placeholder + désactivation bouton ; état vide conservé.
  - **Hors-scope :** toggle actif/inactif **interactif**, renommage inline, suppression + confirmation → **Story 2.2** ; indisponibilités individuelles → **Story 2.3** ; Options/Résultat/génération → **Epic 4**. La colonne **Actif** affiche l'état mais **sans contrôle interactif** ; la colonne **Actions** n'héberge que « Réessayer » (1.5).
- **Doublons de noms autorisés** : aucune contrainte d'unicité sur `participants.name` (cf. modèle de données spine — seul `holidays.date` est unique). Ne PAS inventer de déduplication ni de blocage de doublon.

### ⚠️ Variance structurelle héritée (CRITIQUE — rappel 1.1→1.5)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Tout le code (`lib/`, `components/`, `app/`, `tests/`), tous les `npm`, et tout grep `.next/` → **depuis `daily-wheel/`**. [Source: 1-5-*.md#Variance-structurelle]
- État réel pertinent (sous `daily-wheel/`, vérifié au commit `158bbcf`) — **réutiliser, ne pas casser** :
  - `lib/store/participants-store.tsx` (1.5) : provider `useReducer`, hook `useParticipants()`, `addParticipant(name)` (mono, trim, optimiste), `runWrite` (passphrase paresseuse + AD-17), `retryParticipant`, `submitPassphrase`/`cancelPassphrase`, abonnement Realtime + re-hydratation `SUBSCRIBED`. **C'est le fichier principal à étendre** (AC2).
  - `lib/store/reconcile.ts` + `tests/reconcile.unit.test.ts` (1.5) : réducteur pur AD-15/AD-16 — **inchangé**, sert de **modèle** pour le test pur de cette story.
  - `lib/data/participants.ts` (1.3/1.4) : `fetchParticipants()`, `writeParticipant(op, payload, passphrase)`, `WriteError`/`WriteErrorKind`. `WritePayload.data` est déjà typé `Partial<Pick<Participant,'name'|'active'>>`. **Réutiliser tel quel, ne pas modifier.**
  - `app/api/participants/route.ts` (1.4) : proxy d'écriture ; `insert` **retourne la ligne** (`.select().single()`), allowlist `['name','active']`, `active=true` par défaut SQL. **Ne pas modifier**, juste le consommer via `writeParticipant`.
  - `components/ParticipantsCard.tsx` (1.5) : formulaire mono-nom + `<ul>`/`<li>` à **transformer** (form multi + table). `components/PassphrasePrompt.tsx` : **inchangé** (déclenché par le store).
  - `app/page.tsx` (1.5) : Server Component, `force-dynamic`, SSR `initial` via `fetchParticipants()`, enveloppe par `<ParticipantsStoreProvider>`. **Inchangé** (le provider reçoit déjà `initial`).
  - `app/globals.css` (1.5) : charte + classes `.participant-list`/`.participant-item`/`.participant-name`/`.inactif`/`.pending`/`.failed`/`.btn-retry`/`.text-input`/`.participant-add`/`.card-empty`. **À étendre** pour le tableau (les classes `<li>` peuvent être migrées vers `<tr>`/`<td>`).
  - `package.json` : `test` global = `vitest run --no-file-parallelism` (ramasse **tous** les `*.test.ts` → le nouveau test pur est inclus d'office) ; cible `test:unit` liste explicitement les fichiers → **y ajouter** `parse-names.unit`. **Aucune lib d'état/UI** (React natif uniquement) — **ne pas** ajouter de dépendance.
  - `.env.local` (non commité) contient déjà les 4 variables. `vitest.config.ts` (alias `@`, stub `server-only`, gate live via sentinel `SUPABASE_TEST_LIVE`) — **ne pas retoucher**.

### Décisions d'architecture qui cadrent cette story
- **AD-5 (optimiste + rollback)** : multi-add = N mutations optimistes indépendantes, chacune avec son rollback/retry selon AD-17. Pas de transaction multi-lignes (hors-scope, chaque insert est atomique côté serveur).
- **AD-7 / AD-11 (chemins asymétriques + `lib/data/` seul point Supabase)** : aucune écriture client-direct ; la carte **ne** touche **ni** `supabase.from(...)` **ni** `fetch('/api/...')` — tout passe par le store → `lib/data/`. Le parseur est pur (aucun accès données).
- **AD-13 (CI tests purs)** : le parseur pur est le **seul** ajout testé automatiquement (comme `reconcile` en 1.5) ; il roule en CI **sans secrets**. L'UI n'est **pas** unit-testée (pas de RTL/jsdom — **ne pas** ajouter de dépendance de test) ; sa preuve est la **vérification manuelle**.
- **AD-14 (contrat d'écriture)** : enveloppe `{ op:'insert', data:{ name } }` ; allowlist serveur `['name','active']`. Ne pas envoyer d'autres champs (ignorés de toute façon).
- **AD-15 (ids serveur + dédup)** : id temporaire optimiste → remplacé par la ligne serveur au `CONFIRM` → écho Realtime dédupliqué par `id`+`updated_at`. Invariant déjà protégé par `reconcile.unit` (1.5).

### Points techniques (Next.js 16 / React 19 — janv. 2026)
- **Pas de nouvelle techno** : Story 100 % UI + une fonction pure. Stack figée (Next 16.2.9, React 19.2, supabase-js 2.108) — **aucune** recherche web ni mise à jour de dépendance requise.
- **Batch de dispatchs** : N appels synchrones `addParticipant` dans la boucle de `addParticipants` → N `dispatch(ADD_OPTIMISTIC)` ; React 19 batche, l'état final contient les N lignes appendées **dans l'ordre** de saisie (le reducer fait `[...state, row]`). `seqRef.current++` garantit des `temp:<seq>` uniques.
- **Accessibilité tableau** : `<table>` avec `<caption>` optionnel (ou `aria-labelledby` sur la section déjà présent), `<th scope="col">`. Garder le focus visible (tokens existants). Cible WCAG AA raisonnable (UX-DR6).
- **Ordre d'affichage** : l'ordre du store = ordre d'append (optimiste) puis, après `HYDRATE`/`fetchParticipants`, l'ordre renvoyé par `select('*')` (non garanti par Postgres). Un tri d'affichage canonique **n'est pas requis** par l'AC 2.1 et **n'est pas dans le scope** ici — ne pas modifier `fetchParticipants`. (Si une instabilité d'ordre gêne plus tard, un tri se posera dans une story dédiée.)

### Previous Story Intelligence (1.5)
- **Pattern test pur** : `tests/reconcile.unit.test.ts` (rouge→vert, pur, CI-runnable) est le **modèle exact** pour `parse-names.unit.test.ts`. Réutiliser la **forme** (describe/it, pas de réseau/env).
- **Passphrase multi-écritures** : la file `pendingWritesRef` (Map par `tempId`) + `submitPassphrase` qui rejoue **toutes** les entrées gèrent déjà N ajouts simultanés avec **un seul** prompt — c'est précisément le cas multi-noms. Ne rien réarchitecturer.
- **Flake Realtime connu (1.3→1.5)** : 1er `test:realtime` peut timeouter puis passer au 2e run — transitoire connu, **pas** une régression. Ne pas « corriger ».
- **Dépendance Epic 1 en review** : 1.5 (et 1.2→1.4) sont en statut **review**, pas **done** — mais le code est **commité** (`158bbcf`) et fonctionnel. 2.1 construit dessus sans attendre la clôture formelle de la revue ; signaler si la revue 1.x impose un changement de surface du store.
- **Push Git** : remote via alias SSH `github-perso` → `Infinter/SpinThatWeeklyWheel` (compte SoloOz). [Source: MEMORY:git-remote-push-setup]

### Project Structure Notes
- Arborescence touchée (tout sous `daily-wheel/`) :
  ```
  lib/store/parse-names.ts            # NEW (parseur PUR — cœur AC1/AC7)
  lib/store/participants-store.tsx    # UPDATE (addParticipants réutilisant addParticipant/runWrite — AC2/AC3)
  components/ParticipantsCard.tsx     # UPDATE (form multi + table Nom/Actif/Actions — AC4/AC5/AC6)
  app/globals.css                     # UPDATE (styles tableau responsive — AC4)
  package.json                        # UPDATE (parse-names.unit dans test:unit — AC7)
  tests/parse-names.unit.test.ts      # NEW (preuve pure parseur — AC7)
  _bmad-output/.../sprint-status.yaml # UPDATE (statut 2.1 + epic-2 ; géré par le workflow)
  ```
- **Inchangés (réutilisés)** : `lib/store/reconcile.ts`, `lib/data/participants.ts`, `lib/supabase/{client,admin}.ts`, `app/api/participants/route.ts`, `app/page.tsx`, `app/layout.tsx`, `components/PassphrasePrompt.tsx`, `next.config.ts`, `vitest.config.ts`, migrations SQL.
- **Répercussion 2.2/2.3** : la colonne **Actif** (indicateur) et la colonne **Actions** posées ici seront rendues **interactives** en 2.2 (toggle/rename/delete) ; le panneau repliable d'indispos s'ajoutera en 2.3. Soigner une structure de table extensible (cellules Actif/Actions prêtes à recevoir des contrôles).

### Testing standards (pour cette story)
- **TDD** : écrire `parse-names.unit.test.ts` **avant** `parse-names.ts` (rouge → vert). C'est le filet automatique de cette story.
- **Périmètre testé automatiquement** : le **parseur pur** (AC7). Le store et l'UI ne sont **pas** unit-testés (cohérent avec 1.5 ; pas de RTL/jsdom — ne **pas** ajouter de dépendance). Preuve UI = **vérification manuelle** : saisir `« Alice, Bob ; Chloé »` → 3 lignes dans le tableau ; saisie vide/`« , ; »` → rien ajouté, bouton désactivé ; reload + autre navigateur → mêmes participants ; état vide quand liste vide.
- **Critère « vert »** : `npm test` vert (purs + live skippés-ou-verts) ; `npm run lint` 0 erreur ; `npx tsc --noEmit` 0 erreur ; `npm run build` vert. `reconcile.unit` et `write-error.unit` restent verts (non-régression).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-2 ; #Story-2.1 ; #Story-2.2 (frontière scope : toggle/rename/delete) ; FR1 ; NFR4 ; NFR5]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-1 ; #AD-5 ; #AD-7 ; #AD-11 ; #AD-13 ; #AD-14 ; #AD-15 ; #Consistency-Conventions ; #Structural-Seed (modèle participants, pas d'unicité name)]
- [Source: _bmad-output/implementation-artifacts/1-5-tranche-verticale-participants-deploiement-vercel.md#AC1 ; #AC3 ; #AC4 ; #AC5 ; #AC6 ; #AC10 ; #Dev-Notes (variance structurelle) ; #Testing-standards]
- [Source: daily-wheel/lib/store/participants-store.tsx (addParticipant/runWrite/pendingWritesRef/submitPassphrase) ; daily-wheel/lib/store/reconcile.ts ; daily-wheel/lib/data/participants.ts (writeParticipant/WriteError/WritePayload) ; daily-wheel/app/api/participants/route.ts (insert retourne la ligne, allowlist) ; daily-wheel/components/ParticipantsCard.tsx ; daily-wheel/app/globals.css ; daily-wheel/tests/reconcile.unit.test.ts]
- [Source: docs/prd.md §3 (UX-DR1/DR3/DR6/DR7) ; FR1 ; NFR4 ; NFR5]
- [Source: MEMORY:git-remote-push-setup (remote github-perso → Infinter/SpinThatWeeklyWheel)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia, dev-story workflow).

### Debug Log References

- **TDD parseur** : `tests/parse-names.unit.test.ts` écrit d'abord → ROUGE (`Cannot find package '@/lib/store/parse-names'`) → `lib/store/parse-names.ts` créé → VERT 10/10.
- **Flake Realtime connu (1.3→1.5)** : au 1er `npm test`, `tests/realtime.integration.test.ts` timeoute (20 s) sur le handshake puis passe au re-run isolé (`test:realtime` → ✓ en ~0,8 s). Transitoire confirmé, **pas** une régression de cette story (aucun fichier Realtime touché).

### Completion Notes List

**Résumé** — Ajout multiple de participants (`,`/`;`) + liste en tableau Nom/Actif/Actions, en **étendant** la tranche verticale 1.5 sans réécrire sa machinerie optimiste/passphrase/erreurs.

**AC couverts**
- AC1/AC7 : `parseNames` pur (split `,`/`;`, trim, vides ignorés, ordre préservé, doublons conservés) — 10 tests rouges→verts, enrôlés dans `npm test` + `test:unit`.
- AC2 : `addParticipants(raw)` = `for (const name of parseNames(raw)) addParticipant(name)` ; réutilise intégralement `runWrite`/`pendingWritesRef`/`submitPassphrase` (un seul prompt pour N noms) + taxonomie AD-17. `addParticipant` rétrogradé en chemin interne.
- AC3 : chaque nom = un `POST /api/participants {op:'insert',data:{name}}` via `writeParticipant` (1.4) ; `active=true` par défaut (optimiste + défaut SQL) ; CONFIRM remplace la temp → écho dédupliqué (AD-15). Aucune écriture client-direct (AD-7/AD-11).
- AC4 : `<table>` accessible 3 colonnes (`<th scope="col">`) ; Nom + états `inactif`/`pending`/`failed` ; Actif = badge lecture seule (toggle = 2.2) ; Actions = « Réessayer » sur échec (2.2 = rename/delete).
- AC5 : formulaire multi-noms, placeholder `Alice, Bob ; Chloé`, bouton désactivé via `parseNames(value).length === 0`, submit clic+Entrée, champ vidé.
- AC6 : état vide « Aucun participant pour le moment. » conservé (table non rendue si liste vide).

**Validations**
- `npm run lint` : 0 erreur. `npx tsc --noEmit` : 0 erreur. `npm run build` : vert (`/` = `ƒ Dynamic`).
- Tests purs (`test:unit`) : **24/24** (write-error 5 + reconcile 9 + parse-names 10).
- `npm test` (avec `.env.local`) : **31/32** ; le seul échec = flake handshake Realtime (vert au re-run `test:realtime`).
- Grep `.next/static` : `SUPABASE_SECRET_KEY`, `TEAM_PASSPHRASE`, `service_role` (noms ET valeurs) → **0**. Seul hit : le littéral `team-passphrase` (clé `sessionStorage`, inoffensif).

**Vérification UI manuelle recommandée** (non automatisée — pas de RTL/jsdom, cohérent avec 1.5) : saisir « Alice, Bob ; Chloé » → 3 lignes ; saisie vide/« , ; » → rien, bouton désactivé ; reload + autre navigateur → mêmes participants (FR13) ; doublons « Alice, Alice » → 2 lignes.

**⚠️ Hors-périmètre laissé tel quel** (intentionnel, scope 2.1) : toggle actif/rename/delete (Story 2.2), indispos (Story 2.3), Options/Résultat/génération (Epic 4). `lib/data/`, `app/api/`, `app/page.tsx`, Realtime, reducer : inchangés.

### File List

**Nouveaux (sous `daily-wheel/`)**
- `lib/store/parse-names.ts` — parseur de noms pur (AC1).
- `tests/parse-names.unit.test.ts` — preuve pure parseur, 10 tests (AC7).

**Modifiés (sous `daily-wheel/`)**
- `lib/store/participants-store.tsx` — `addParticipants(raw)` public réutilisant `addParticipant` interne ; import `parseNames` ; `StoreValue` mis à jour (AC2/AC3).
- `components/ParticipantsCard.tsx` — formulaire multi-noms + tableau Nom/Actif/Actions (AC4/AC5/AC6).
- `app/globals.css` — styles `.participant-table`/badges + états migrés sur `.participant-row` + responsive ≤520px (AC4).
- `package.json` — `parse-names.unit` ajouté à `test:unit` (AC7).

**Inchangés (réutilisés)** : `lib/store/reconcile.ts`, `lib/data/participants.ts`, `lib/supabase/{client,admin}.ts`, `app/api/participants/route.ts`, `app/page.tsx`, `app/layout.tsx`, `components/PassphrasePrompt.tsx`, `next.config.ts`, `vitest.config.ts`.

### Change Log

- 2026-06-22 — Story 2.1 implémentée (ajout multiple `,`/`;` + tableau Nom/Actif/Actions). Parseur pur `parseNames` (TDD 10/10) ; `addParticipants` réutilise la machinerie optimiste 1.5 ; UI liste→tableau. Statut → review. Tests : 24/24 purs, 31/32 full (flake Realtime vert au retry) ; build vert ; 0 fuite de secret.
