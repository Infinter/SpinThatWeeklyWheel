---
baseline_commit: e6a4eb9
---

# Story 2.2: Activer/désactiver, renommer, supprimer un participant

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want basculer l'état actif, renommer et supprimer un participant,
so that je maintiens la liste de l'équipe à jour (FR2, FR3, FR4) — **deuxième story d'Epic 2**, qui rend **interactives** les colonnes Actif/Actions posées (en lecture seule) par 2.1, en **généralisant** la machinerie optimiste 1.5/2.1 (jusqu'ici insert-only) aux mutations **update/delete** sur des lignes déjà confirmées, **sans réécrire** `lib/data/` ni le proxy serveur (déjà prêts).

## Acceptance Criteria

> Ces AC décomposent les 5 critères de l'epic (epics.md#Story-2.2) en unités implémentables et testables. Le **cœur testable en CI sans secrets** (AD-13) est le **réducteur optimiste pur** : on l'extrait de `participants-store.tsx` vers un module pur `lib/store/participants-reducer.ts` (comme `reconcile.ts` l'est pour le Realtime) et on prouve ses nouvelles transitions (patch/restore/remove) en rouge→vert. Toute la couche d'écriture (`writeParticipant('update'|'delete', …)`, allowlist serveur `name,active`, `updated_at` serveur, taxonomie AD-17) **existe déjà depuis 1.4 et est réutilisée telle quelle**.

1. **Réducteur optimiste PUR extrait + nouvelles transitions (cœur testable — AD-13, AC7).** Extraire le `reducer` + le type `Action` de `participants-store.tsx` vers `lib/store/participants-reducer.ts` (export `participantsReducer`, `type Action`, `type StoreParticipant`). Les transitions existantes (`HYDRATE`/`REALTIME`/`ADD_OPTIMISTIC`/`SET_PENDING`/`CONFIRM`/`ROLLBACK`/`MARK_FAILED`) gardent une sémantique **identique** (non-régression 2.1). Ajouter 3 transitions pour les mutations sur lignes confirmées :
   - `PATCH_OPTIMISTIC { id, patch: Partial<Participant> }` → applique `patch` à la ligne `id` + `pending: true, failed: false` (toggle/rename optimistes).
   - `RESTORE { row: Participant }` → upsert par `id` : remplace la ligne si présente, sinon la ré-ajoute (en fin de liste), **drapeaux client effacés** (rollback d'un update ; restauration d'un delete échoué).
   - `REMOVE { id }` → retire la ligne `id` (delete optimiste). *(Distinct de `ROLLBACK` qui sert au rollback d'un insert ; même effet de filtrage mais intention différente — ne PAS fusionner pour la lisibilité.)*
   - Fonction **pure** : aucun import React/DOM/Supabase/`Date`. Conserve les invariants 1.5 (`CONFIRM` remplace par la ligne serveur ; références stables quand rien ne change, cf. modèle `reconcile.ts`).
   [Source: daily-wheel/lib/store/participants-store.tsx (reducer inline L41-66) ; daily-wheel/lib/store/reconcile.ts (modèle pur) ; ARCHITECTURE-SPINE.md#AD-13 ; #AD-5]

2. **Toggle actif/inactif (FR2, AD-5/AD-15/AD-17).** Dans `participants-store.tsx`, `toggleActive(id: string)` :
   - **Optimiste** : `PATCH_OPTIMISTIC { id, patch: { active: !current } }` (snapshot de l'`active` courant **avant** patch, lu via `stateRef`).
   - Écrit `writeParticipant('update', { id, data: { active: nextActive } }, passphrase)` (allowlist serveur `['name','active']` — AD-14). Au succès, `CONFIRM { tempId: id, row }` (la ligne serveur, `updated_at` réel → écho Realtime dédupliqué par `reconcile`, AD-15).
   - **Échec** selon AD-17 : `auth`(401) → re-prompt + rejeu après saisie ; `validation`(400) → `RESTORE` la ligne snapshot ; `conflict`(409) → re-hydrate (`fetchParticipants`) ; `transient`(5xx) → `MARK_FAILED` + bouton « Réessayer ».
   - Côté UI, un participant `!active` reste **visuellement distinct** (grisé/barré — classe `.participant-row.inactif` **déjà** stylée en 2.1). L'exclusion réelle du tirage est traitée en **Epic 4** (hors-scope ici ; le `active=false` persisté suffit).
   [Source: daily-wheel/app/api/participants/route.ts (op update, allowlist, updated_at serveur L96-105) ; daily-wheel/lib/data/participants.ts (writeParticipant/WriteError L43-77) ; daily-wheel/app/globals.css (.participant-row.inactif L209) ; ARCHITECTURE-SPINE.md#AD-5 ; #AD-15 ; #AD-17 ; epics.md#Story-2.2 (FR2)]

3. **Renommage inline (FR3, UX-DR3).** `renameParticipant(id, newName)` :
   - `const name = newName.trim()` ; si `name === ''` **ou** `name === ancien nom` → **no-op** (aucune écriture).
   - **Optimiste** : `PATCH_OPTIMISTIC { id, patch: { name } }` (snapshot de l'ancien nom avant) ; puis `writeParticipant('update', { id, data: { name } }, passphrase)`. Succès → `CONFIRM`. Échec → même taxonomie AD-17 qu'en AC2 (rollback `validation` = `RESTORE` ancien nom).
   - **Persistance immédiate** (UX-DR3) : pas de bouton « Enregistrer » global ; le commit se fait à la validation inline (AC6).
   - **Doublons autorisés** : aucune unicité sur `name` (cf. 2.1 ; seul `holidays.date` est unique) — ne PAS bloquer un nom déjà présent.
   [Source: daily-wheel/lib/data/participants.ts (WritePayload.data: name|active L52) ; 2-1-*.md#Dev-Notes (doublons autorisés) ; ARCHITECTURE-SPINE.md#AD-14 ; docs/prd.md §3 UX-DR3]

4. **Suppression avec confirmation + cascade (FR4, conventions).** `deleteParticipant(id)` :
   - **Confirmation requise AVANT action** (FR4) : déclenchée dans l'UI (AC6), pas dans le store. Si refusée → aucune mutation.
   - **Optimiste** : snapshot de la ligne (via `stateRef`) puis `REMOVE { id }`. Écrit `writeParticipant('delete', { id }, passphrase)` (corps `{ op:'delete', id }` — AD-14).
   - La suppression des **indisponibilités liées** est assurée par `ON DELETE CASCADE` au niveau **DB** (`unavailabilities.participant_id`) — **aucun code applicatif** ne supprime les indispos (elles n'existent pas encore : table créée en 1.2, alimentée en 2.3). Ne PAS implémenter de suppression manuelle d'indispos.
   - **Échec** AD-17 : `auth`(401) → re-prompt + rejeu ; `validation`(400) → `RESTORE` la ligne snapshot ; `transient`(5xx) → `RESTORE` la ligne snapshot + message « Réessayez » *(pas de bouton retry sur une ligne supprimée — la ligne réapparaît, l'utilisateur ré-agit)* ; **`conflict`(409) « introuvable » = déjà supprimé ailleurs → traiter comme SUCCÈS idempotent** (garder retiré, pas d'erreur). [Le proxy renvoie 409 si `delete` touche 0 ligne — route.ts L79.]
   - L'écho Realtime `DELETE` est un no-op (`reconcile` filtre par `id`, déjà absent — AD-15).
   [Source: daily-wheel/app/api/participants/route.ts (op delete, 409 si 0 ligne L75-81) ; ARCHITECTURE-SPINE.md#Consistency-Conventions (ON DELETE CASCADE) ; #AD-5 ; #AD-17 ; epics.md#Story-2.2 (FR4 + cascade) ; epics.md#Story-2.3 (indispos = 2.3)]

5. **Machinerie d'écriture généralisée — un seul prompt pour N mutations (AD-8, invariant 1.5/2.1).** La file `pendingWritesRef` de 1.5 est **insert-only** (`Map<tempId, {name}>`) ; la généraliser à des **descripteurs d'écriture op-agnostiques** sans casser le chemin insert :
   - Valeur de file = `{ run: () => Promise<void>; rollback: () => void }` (clé = `tempId` pour insert, ou `id` de ligne pour update/delete — collisions improbables à cette échelle ; si besoin, suffixer un compteur).
   - `runWrite` lit la passphrase ; **absente** → enfile le descripteur, ouvre **un seul** prompt (`setPassphraseNeeded(true)`), `return`. `submitPassphrase` rejoue **tous** les `run()` en file ; `cancelPassphrase` exécute tous les `rollback()` (insert → `ROLLBACK`/remove temp ; update → `RESTORE` snapshot ; delete → `RESTORE` snapshot).
   - **Invariant préservé** : N mutations déclenchées sans passphrase → N descripteurs en file → **UN** prompt → rejeu groupé (exactement le comportement multi-noms validé en 2.1, étendu aux update/delete).
   - `retryParticipant(id)` doit rejouer **l'op d'origine** (pas seulement un insert). Le `retryParticipant` actuel relit `row.name` et appelle le chemin insert — le **généraliser** : conserver le dernier descripteur échoué (`failed`) par `id` et le rejouer. **Ne PAS** laisser un retry sur un toggle/rename re-créer un insert.
   [Source: daily-wheel/lib/store/participants-store.tsx (pendingWritesRef/runWrite/submitPassphrase/cancelPassphrase/retryParticipant L107-218) ; ARCHITECTURE-SPINE.md#AD-8 ; 2-1-*.md#AC2 (un seul prompt pour N)]

6. **Contrôles UI dans le tableau (UX-DR1/DR3, NFR4/NFR5).** Rendre interactives les colonnes posées en 2.1 dans `components/ParticipantsCard.tsx` :
   - **Colonne Actif** : remplacer le badge lecture seule par un **toggle interactif** accessible — `<input type="checkbox" role="switch">` (a11y native + clavier) avec `aria-label` explicite (« Activer/Désactiver {nom} »), `checked={p.active}`, `onChange={() => toggleActive(p.id)}`. Conserver le rendu grisé/barré via `.inactif`.
   - **Colonne Nom** : édition **inline** (UX-DR3). Un clic sur « Renommer » (ou sur le nom) transforme la cellule en `<input className="text-input">` pré-rempli ; **Entrée** ou **blur** → `renameParticipant(p.id, value)` ; **Échap** → annule (restaure l'affichage, aucune écriture). État d'édition **local au composant** (`useState`, ex. `editingId`/`draft`) — ne PAS le mettre dans le store.
   - **Colonne Actions** : boutons **« Renommer »** et **« Supprimer »** (+ « Réessayer » sur ligne `failed`, conservé de 2.1). « Supprimer » ouvre une **confirmation** (`window.confirm('Supprimer « {nom} » ? Ses indisponibilités seront aussi supprimées.')` — acceptable, accessible, zéro dépendance) ; confirmé → `deleteParticipant(p.id)`.
   - Tout en **français** (NFR4), charte CSS existante (tokens `--primary`, `--radius-sm`, **sans dégradés**), lisible **≤ 520 px** (NFR5, UX-DR7). Les contrôles d'une ligne `pending` peuvent être désactivés pour éviter les doubles soumissions.
   [Source: daily-wheel/components/ParticipantsCard.tsx (table 2.1 L60-103) ; daily-wheel/components/PassphrasePrompt.tsx (déclenché par le store, inchangé) ; docs/prd.md §3 UX-DR1/DR3/DR7 ; epics.md#Story-2.2]

7. **Preuve de test — réducteur optimiste pur (rouge → vert).** `tests/participants-reducer.unit.test.ts` (pur, **sans réseau ni env**, enrôlé dans `npm test` ET ajouté à `test:unit`) couvre `participantsReducer` :
   - **Nouvelles transitions** : `PATCH_OPTIMISTIC` (patch partiel `active`/`name` + `pending:true,failed:false` ; ligne absente → no-op) ; `RESTORE` (remplace si présent, ré-ajoute si absent, drapeaux effacés) ; `REMOVE` (retire ; absent → no-op).
   - **Non-régression** des transitions héritées : `ADD_OPTIMISTIC`/`SET_PENDING`/`CONFIRM`/`ROLLBACK`/`MARK_FAILED`/`HYDRATE` conservent leur sémantique 2.1.
   - **Rouge d'abord** (module/actions absents → import échoue), puis **vert**.
   [Source: daily-wheel/tests/reconcile.unit.test.ts (modèle pur rouge→vert) ; ARCHITECTURE-SPINE.md#AD-13 ; 2-1-*.md#AC7]

8. **Non-régression globale (NFR9).** `parseNames`/`reconcile`/`write-error` restent verts ; le chemin **insert/ajout multiple** de 2.1 conserve un comportement **identique** ; l'état vide, le `<PassphrasePrompt />`, le bloc `error`, l'abonnement Realtime et la re-hydratation `SUBSCRIBED` sont **inchangés** dans leur sémantique (le reducer extrait est importé, pas réécrit). `npm run lint`/`tsc --noEmit`/`build` verts. [Source: 2-1-*.md#Testing-standards ; ARCHITECTURE-SPINE.md#AD-6]

## Tasks / Subtasks

> ⚠️ **Tout le code et toutes les commandes `npm` sont sous `daily-wheel/`** (variance structurelle héritée 1.1→2.1). Le workflow CI à la racine n'est **pas** touché par cette story.

- [x] **Tâche 1 — Extraire le réducteur pur + transitions optimistes + test rouge** (AC: 1, 7)
  - [x] Écrit d'abord `daily-wheel/tests/participants-reducer.unit.test.ts` (ROUGE confirmé : `Cannot find package '@/lib/store/participants-reducer'`) couvrant `PATCH_OPTIMISTIC`/`RESTORE`/`REMOVE` + non-régression des transitions héritées.
  - [x] Créé `daily-wheel/lib/store/participants-reducer.ts` : déplacé `type Action`, `type StoreParticipant`, `reducer` (export `participantsReducer`) depuis `participants-store.tsx`. Ajouté `PATCH_OPTIMISTIC`/`RESTORE`/`REMOVE`. Pur (aucun import React/DOM/Supabase/`Date`).
  - [x] Dans `participants-store.tsx` : importé `participantsReducer`/`StoreParticipant` ; branché `useReducer(participantsReducer, …)`. Sémantique inchangée pour les transitions existantes.
  - [x] VERT : `npm run test:unit` 38/38 (reducer 14 + parse-names 10 + reconcile 9 + write-error 5) puis `npm test` 46/46.

- [x] **Tâche 2 — Store : généraliser la machinerie d'écriture (insert + update + delete)** (AC: 2, 3, 4, 5)
  - [x] Généralisé la file passphrase → `Map<string, WriteSpec>` (clé unique `w:<n>`). `runWrite(spec: WriteSpec)` générique : lazy passphrase → enfile + un seul prompt ; `submitPassphrase` rejoue `runWrite(spec)` ; `cancelPassphrase` exécute `spec.rollback()`. **Chemin insert : comportement identique à 2.1.** *(Choix : la file stocke le `WriteSpec` directement plutôt qu'un thunk `run`, pour éviter une auto-référence de `runWrite` et un warning `exhaustive-deps`.)*
  - [x] Ajouté `toggleActive(id)`, `renameParticipant(id, newName)`, `deleteParticipant(id)` (snapshots via `stateRef` ; optimiste `PATCH_OPTIMISTIC`/`REMOVE` ; `writeParticipant('update'|'delete', …)` ; `CONFIRM`/rollback `RESTORE` selon AD-17). No-op rename (vide/identique). Delete 409 = succès idempotent (`deleteIdempotent`).
  - [x] Généralisé `retryParticipant(id)` : rejoue le dernier `WriteSpec` échoué (transient) conservé dans `failedWritesRef` par id → l'op d'origine, **plus jamais un re-insert parasite**. Exposé `toggleActive`/`renameParticipant`/`deleteParticipant` dans `StoreValue`.

- [x] **Tâche 3 — UI : toggle, renommage inline, suppression confirmée** (AC: 6)
  - [x] `ParticipantsCard.tsx` : colonne **Actif** = `<input type="checkbox" role="switch">` (`aria-label` nominatif, `onChange → toggleActive`, désactivée si `pending`). Colonne **Nom** = édition inline (`editingId`/`draft` locaux + `skipBlurRef` pour qu'Échap ne committe pas ; Entrée/blur → `renameParticipant` ; Échap → annule). Colonne **Actions** = « Renommer », « Supprimer » (`window.confirm` → `deleteParticipant`), « Réessayer » conservé sur ligne `failed`.
  - [x] État vide, bloc `error`, `<PassphrasePrompt />` inchangés. Contrôles désactivés sur ligne `pending` (anti double-soumission).

- [x] **Tâche 4 — CSS : contrôles tableau responsive** (AC: 6)
  - [x] Étendu `daily-wheel/app/globals.css` : toggle (switch) en charte primaire `:checked` (sans dégradé), `.rename-input` (occupe la cellule), `.row-actions`/`.btn-row`/`.btn-delete` compacts (réutilisent `.btn-secondary`). Badges `.badge-active`/`.badge-inactive` (2.1, devenus inutiles) retirés. **≤ 520 px** : Actions empilées, paddings réduits, pas de débordement.

- [x] **Tâche 5 — Scripts de test + non-régression** (AC: 7, 8)
  - [x] `package.json` : `tests/participants-reducer.unit.test.ts` ajouté à `test:unit`.
  - [x] Non-régression : `npm run lint` (0), `npx tsc --noEmit` (0), `npm test` **46/46** (intégration Realtime incluse, sans flake), `npm run build` (vert, `/` dynamique). Grep `.next/static` : aucun secret (`SUPABASE_SECRET_KEY`/`TEAM_PASSPHRASE`/`service_role` + valeur passphrase → 0). Dev Agent Record renseigné.

## Dev Notes

### Contexte & périmètre
- **Deuxième story d'Epic 2**. Étend 2.1 : rend **interactives** les colonnes Actif/Actions (jusqu'ici lecture seule). [Source: epics.md#Story-2.2 ; 2-1-*.md#Project-Structure-Notes (« cellules Actif/Actions prêtes à recevoir des contrôles »)]
- **In-scope :** toggle actif/inactif ; renommage inline ; suppression + confirmation ; **généralisation** de la machinerie optimiste aux update/delete ; extraction du réducteur pur + son test.
- **Hors-scope :** indisponibilités individuelles → **Story 2.3** (la cascade DB les couvrira automatiquement à la suppression, mais aucune UI/écriture d'indispo ici) ; exclusion réelle du tirage des inactifs → **Epic 4** (le `active=false` persisté suffit) ; Options/Résultat/génération → **Epic 4**.
- **Doublons de noms autorisés** : aucune unicité sur `participants.name`. Le renommage ne bloque PAS un nom déjà présent.

### ⚠️ Variance structurelle héritée (CRITIQUE — rappel 1.1→2.1)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Tout le code (`lib/`, `components/`, `app/`, `tests/`), tous les `npm`, tout grep `.next/` → **depuis `daily-wheel/`**. [Source: 2-1-*.md#Variance-structurelle]
- État réel pertinent (sous `daily-wheel/`, vérifié au commit `e6a4eb9`) — **réutiliser, ne pas casser** :
  - `lib/store/participants-store.tsx` (1.5/2.1) : provider `useReducer`, `addParticipants(raw)` (public), `addParticipant` (interne mono-nom), `runWrite` (passphrase paresseuse + AD-17, **insert-only**), `retryParticipant` (**insert-only** — relit `row.name`), `submitPassphrase`/`cancelPassphrase`, abonnement Realtime + re-hydratation `SUBSCRIBED`. **Fichier principal à étendre** (AC1/AC2/AC5). Le `reducer` inline (L41-66) est à **extraire** en module pur.
  - `lib/data/participants.ts` (1.3/1.4) : `writeParticipant(op, payload, passphrase)` **supporte déjà `'insert'|'update'|'delete'`** ; `WritePayload = { id?; data?: Partial<Pick<Participant,'name'|'active'>> }` — **déjà prêt pour 2.2, ne PAS modifier**. `WriteError`/`writeErrorFromStatus` (AD-17) réutilisés tels quels.
  - `app/api/participants/route.ts` (1.4) : ops `insert`/`update`/`delete` **déjà implémentées** ; `update` = patch partiel + `updated_at` serveur (L99-105) ; `delete` renvoie `{ id }`, **409 si 0 ligne** (L79) ; allowlist `['name','active']`. **Ne PAS modifier**, juste consommer via `writeParticipant`.
  - `lib/store/reconcile.ts` (1.5) : réducteur Realtime pur (UPDATE/DELETE déjà gérés, dédup `id`+`updated_at`, LWW) — **inchangé** ; **modèle** pour le test pur du réducteur optimiste.
  - `components/ParticipantsCard.tsx` (2.1) : table Nom/Actif/Actions avec badge lecture seule + « Réessayer ». **À rendre interactif** (AC6). `components/PassphrasePrompt.tsx` : **inchangé** (déclenché par le store).
  - `app/globals.css` (2.1) : `.participant-table`, `.participant-row.inactif|.pending|.failed`, `.badge-active|.badge-inactive`, `.btn-retry`, `.btn-secondary`, `.text-input`, media `≤520px`. **À étendre** (toggle, input inline, boutons Actions). Le grisé/barré `.inactif` est **déjà** prêt pour le toggle.
  - `app/page.tsx` (1.5) : Server Component, `force-dynamic`, SSR `initial` via `fetchParticipants()`, enveloppe `<ParticipantsStoreProvider>`. **Inchangé.**
  - `package.json` : `test` = `vitest run --no-file-parallelism` (ramasse tous les `*.test.ts`) ; `test:unit` liste explicite → **y ajouter** `participants-reducer.unit`. **Aucune lib d'état/UI** (React natif) — **ne pas** ajouter de dépendance.
  - `.env.local` (non commité) : 4 variables présentes. `vitest.config.ts` (alias `@`, stub `server-only`, gate live `SUPABASE_TEST_LIVE`) — **ne pas retoucher**.

### Décisions d'architecture qui cadrent cette story
- **AD-5 (optimiste + rollback)** : toggle/rename = `PATCH_OPTIMISTIC` + rollback `RESTORE` du snapshot ; delete = `REMOVE` + restore `RESTORE` du snapshot. Snapshots lus via `stateRef` **avant** la mutation optimiste.
- **AD-14 (contrat d'écriture)** : `update` = `{ op:'update', id, data:{…} }` (patch partiel, **uniquement** `name`/`active`) ; `delete` = `{ op:'delete', id }`. Allowlist appliquée **serveur** (rien d'autre à filtrer côté client).
- **AD-15 (ids serveur + dédup)** : succès update → `CONFIRM` remplace par la ligne serveur (`updated_at` réel) → l'écho Realtime UPDATE est dédupliqué (`reconcile`, match `id`+`updated_at`). Delete → l'écho DELETE est un no-op (ligne déjà retirée).
- **AD-16 (LWW)** : `conflict`(409) sur update → re-hydrater (`fetchParticipants` → `HYDRATE`), l'état serveur fait autorité. Sur **delete**, 409 « introuvable » = **déjà supprimé** → succès idempotent (ne pas re-hydrater inutilement, garder retiré).
- **AD-17 (taxonomie)** : `auth`/`validation`/`conflict`/`transient` mappés depuis le statut par `WriteError` (déjà fait dans `lib/data/`). Réutiliser le `switch (e.kind)` existant comme patron, adapté par op (rollback = `RESTORE` au lieu de `ROLLBACK`/remove pour update/delete).
- **AD-8 (passphrase)** : toute mutation exige la passphrase ; **un seul** prompt même pour N mutations en file (invariant 1.5/2.1 à préserver via la file généralisée — AC5).
- **AD-11/AD-7 (chemins asymétriques)** : la carte ne touche **ni** `supabase.from(...)` **ni** `fetch('/api/...')` — tout passe par le store → `lib/data/`. Aucune écriture client-direct.
- **AD-13 (CI tests purs)** : seul le **réducteur optimiste pur** est testé automatiquement (comme `reconcile`/`parseNames`) ; il roule en CI **sans secrets**. Le store et l'UI **ne sont pas** unit-testés (pas de RTL/jsdom — **ne pas** ajouter de dépendance) ; leur preuve est la **vérification manuelle**.

### Points techniques (Next.js 16 / React 19 — janv. 2026)
- **Pas de nouvelle techno** : story 100 % UI + store + une extraction de module pur. Stack figée (Next 16.2.9, React 19.2, supabase-js 2.108) — **aucune** recherche web ni mise à jour de dépendance requise.
- **Snapshot avant patch** : lire la valeur courante (`stateRef.current.find(r => r.id === id)`) **avant** de dispatcher `PATCH_OPTIMISTIC`/`REMOVE`, pour construire le `rollback`/`RESTORE`. `stateRef` est déjà maintenu à jour par le `useEffect` existant (L111-114).
- **Ordre d'affichage** : non canonique (cf. 2.1) — un `RESTORE` qui ré-ajoute en fin de liste est acceptable ; aucun tri d'affichage requis par l'AC 2.2. Ne pas modifier `fetchParticipants`.
- **Accessibilité** : toggle = `<input type="checkbox" role="switch">` avec `aria-label` nominatif ; focus visible conservé (tokens existants) ; `window.confirm` est lisible par lecteur d'écran. Édition inline : focus auto sur l'input, Échap pour annuler. Cible WCAG AA raisonnable (UX-DR6).
- **Anti double-soumission** : désactiver les contrôles d'une ligne `pending`. Toggle rapide A→B→A : chaque clic = une écriture optimiste indépendante ; LWW + `CONFIRM` convergent sur l'état serveur final.

### Previous Story Intelligence (2.1 / 1.5)
- **Pattern test pur** : `tests/reconcile.unit.test.ts` (rouge→vert, pur, CI-runnable) est le **modèle exact** pour `participants-reducer.unit.test.ts`.
- **Un seul prompt pour N écritures** : la file `pendingWritesRef` + `submitPassphrase` rejouant **toutes** les entrées gère déjà N mutations simultanées avec **un seul** prompt — à **généraliser** (descripteurs op-agnostiques) sans changer ce contrat.
- **`retryParticipant` est insert-only** (relit `row.name` → re-insert) : **piège** — un retry sur un toggle/rename échoué re-créerait un participant. Généraliser obligatoirement (AC5).
- **Flake Realtime connu (1.3→2.1)** : 1er `npm test` peut timeouter sur le handshake Realtime puis passer au retry isolé — transitoire connu, **pas** une régression. Ne pas « corriger ».
- **CI Node 22.x** : `@supabase/realtime-js` exige un WebSocket natif (absent Node 20) — déjà corrigé (`3a57a9b`). Vercel `framework=nextjs` forcé via `vercel.json` (`e6a4eb9`). **Ne pas** retoucher CI/Vercel.
- **Dépendance Epic 1 en review** : 1.2→1.5 sont **review** (non `done`) mais commités et fonctionnels ; 2.1 **review**. 2.2 construit dessus sans attendre la clôture ; signaler si une revue impose un changement de surface du store.
- **Push Git** : remote via alias SSH `github-perso` → `Infinter/SpinThatWeeklyWheel` (compte SoloOz). [Source: MEMORY:git-remote-push-setup]

### Project Structure Notes
- Arborescence touchée (tout sous `daily-wheel/`) :
  ```
  lib/store/participants-reducer.ts        # NEW (réducteur PUR extrait + PATCH/RESTORE/REMOVE — AC1)
  lib/store/participants-store.tsx         # UPDATE (toggle/rename/delete + machinerie généralisée — AC2/3/4/5)
  components/ParticipantsCard.tsx          # UPDATE (toggle + rename inline + delete confirmé — AC6)
  app/globals.css                          # UPDATE (styles toggle/input inline/boutons Actions — AC6)
  package.json                             # UPDATE (participants-reducer.unit dans test:unit — AC7)
  tests/participants-reducer.unit.test.ts  # NEW (preuve pure réducteur — AC7)
  _bmad-output/.../sprint-status.yaml      # UPDATE (statut 2.2 ; géré par le workflow)
  ```
- **Inchangés (réutilisés)** : `lib/data/participants.ts` (déjà update/delete-ready), `app/api/participants/route.ts` (déjà update/delete), `lib/store/reconcile.ts`, `lib/supabase/{client,admin}.ts`, `app/page.tsx`, `app/layout.tsx`, `components/PassphrasePrompt.tsx`, `next.config.ts`, `vercel.json`, `vitest.config.ts`, migrations SQL.
- **Répercussion 2.3** : la suppression cascade (FR4) prépare 2.3 ; le panneau repliable d'indispos s'ajoutera **par ligne** en 2.3 (prévoir une structure de ligne extensible, mais ne rien implémenter).

### Testing standards (pour cette story)
- **TDD** : écrire `participants-reducer.unit.test.ts` **avant** d'extraire/étendre le réducteur (rouge → vert). C'est le filet automatique de cette story.
- **Périmètre testé automatiquement** : le **réducteur optimiste pur** (AC7). Store et UI **non** unit-testés (cohérent 1.5/2.1 ; pas de RTL/jsdom — **ne pas** ajouter de dépendance). Preuve UI = **vérification manuelle** :
  - Toggle Actif → ligne grisée/barrée, état persistant après reload + autre navigateur (FR2/FR13).
  - Renommer inline (Entrée/blur) → nouveau nom persistant ; Échap → annule sans écriture ; nom vide/identique → no-op.
  - Supprimer → confirmation demandée ; après confirmation, ligne disparue et absente après reload (FR4) ; annuler la confirmation → rien.
  - Mutation **sans passphrase** → un seul prompt, rejeu après saisie ; passphrase erronée (401) → re-prompt, rollback préservé.
  - Échec transitoire (5xx) → rollback visible, action re-tentable.
- **Critère « vert »** : `npm test` vert (purs + live skippés-ou-verts ; flake Realtime vert au retry) ; `npm run lint` 0 ; `npx tsc --noEmit` 0 ; `npm run build` vert. `parse-names.unit`, `reconcile.unit`, `write-error.unit` restent verts (non-régression).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-2 ; #Story-2.2 ; #Story-2.3 (frontière indispos) ; FR2 ; FR3 ; FR4 ; NFR4 ; NFR5 ; NFR9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-5 ; #AD-7 ; #AD-8 ; #AD-11 ; #AD-13 ; #AD-14 ; #AD-15 ; #AD-16 ; #AD-17 ; #Consistency-Conventions (ON DELETE CASCADE, dates YMD)]
- [Source: _bmad-output/implementation-artifacts/2-1-ajout-multiple-et-liste-des-participants.md#AC2 ; #AC4 ; #AC7 ; #Dev-Notes (variance structurelle, doublons, file passphrase) ; #Project-Structure-Notes (cellules Actif/Actions extensibles) ; #Testing-standards]
- [Source: daily-wheel/lib/store/participants-store.tsx (reducer inline, runWrite, pendingWritesRef, retryParticipant, submitPassphrase) ; daily-wheel/lib/store/reconcile.ts ; daily-wheel/lib/data/participants.ts (writeParticipant update/delete-ready, WritePayload.id) ; daily-wheel/app/api/participants/route.ts (op update/delete, 409 si 0 ligne, allowlist) ; daily-wheel/components/ParticipantsCard.tsx ; daily-wheel/components/PassphrasePrompt.tsx ; daily-wheel/app/globals.css (.participant-row.inactif, badges, .text-input, .btn-secondary)]
- [Source: docs/prd.md §3 (UX-DR1/DR3/DR6/DR7) ; FR2 ; FR3 ; FR4 ; NFR4 ; NFR5]
- [Source: MEMORY:git-remote-push-setup (remote github-perso → Infinter/SpinThatWeeklyWheel)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia, dev-story workflow).

### Debug Log References

- **TDD réducteur** : `tests/participants-reducer.unit.test.ts` écrit d'abord → ROUGE (`Cannot find package '@/lib/store/participants-reducer'`) → module créé/extrait → VERT 14/14.
- **`exhaustive-deps`** : pour rejouer une écriture en file sans auto-référence de `runWrite` (qui aurait exigé `runWrite` dans ses propres deps → cycle), la file stocke le `WriteSpec` et c'est `submitPassphrase`/`retryParticipant` (dont les deps listent `runWrite`) qui rappellent `runWrite(spec)`. `runWrite` garde des deps `[]` (n'utilise que refs/imports/setters stables). Lint : 0.
- **Pas de flake Realtime cette fois** : `npm test` a passé 46/46 du premier coup (intégration read/write/realtime comprise). Le flake handshake connu (1.3→2.1) reste transitoire si réapparition au 1er run.

### Completion Notes List

**Résumé** — Colonnes Actif/Actions rendues **interactives** (toggle/renommage inline/suppression confirmée) en **généralisant** la machinerie optimiste 1.5/2.1 (jusqu'ici insert-only) aux update/delete, sans toucher `lib/data/` ni le proxy serveur (déjà update/delete-ready depuis 1.4).

**AC couverts**
- AC1/AC7 : réducteur optimiste **extrait** en module pur `lib/store/participants-reducer.ts` + 3 transitions (`PATCH_OPTIMISTIC`/`RESTORE`/`REMOVE`). 14 tests rouges→verts, dans `npm test` + `test:unit`. Transitions héritées (ADD/SET_PENDING/CONFIRM/ROLLBACK/MARK_FAILED/HYDRATE) sémantiquement inchangées (couvertes en non-régression).
- AC2 (FR2) : `toggleActive(id)` = `PATCH_OPTIMISTIC{active:!current}` + `writeParticipant('update',{id,data:{active}})` ; rollback `RESTORE`. Inactif visuellement distinct via `.participant-row.inactif` (déjà stylé). Exclusion du tirage = Epic 4.
- AC3 (FR3, UX-DR3) : `renameParticipant(id,newName)` no-op si vide/identique ; sinon `PATCH_OPTIMISTIC{name}` + update ; persistance immédiate (Entrée/blur). Doublons autorisés (pas de blocage).
- AC4 (FR4) : `deleteParticipant(id)` confirmation `window.confirm` côté UI ; `REMOVE` optimiste + `writeParticipant('delete',{id})` ; cascade indispos = `ON DELETE CASCADE` DB (aucun code) ; **409 « introuvable » = succès idempotent**.
- AC5 (AD-8/AD-17) : file passphrase op-agnostique (`Map<writeKey, WriteSpec>`) → **un seul prompt** pour N mutations, rejeu groupé via `submitPassphrase` ; `cancelPassphrase` exécute les rollbacks (insert→remove, update/delete→restore). `retryParticipant` rejoue l'op d'origine via `failedWritesRef`.
- AC6 : toggle switch a11y (`role="switch"`, `aria-label` nominatif), renommage inline (`skipBlurRef` empêche Échap de committer), suppression confirmée ; contrôles désactivés si `pending`.
- AC8 (NFR9) : `parse-names`/`reconcile`/`write-error` toujours verts ; chemin insert/ajout multiple inchangé ; Realtime/re-hydratation/PassphrasePrompt intacts.

**Validations**
- `npm run lint` : 0. `npx tsc --noEmit` : 0. `npm run build` : vert (`/` dynamique).
- `npm run test:unit` : **38/38** (write-error 5 + reconcile 9 + parse-names 10 + participants-reducer 14).
- `npm test` (avec `.env.local`) : **46/46** (7 fichiers, intégration read/write/realtime incluse, sans flake).
- Grep `.next/static` : `SUPABASE_SECRET_KEY`/`TEAM_PASSPHRASE`/`service_role` + valeur passphrase → **0**.

**Vérification UI manuelle recommandée** (non automatisée — pas de RTL/jsdom, cohérent 1.5/2.1) : toggle → ligne grisée/barrée, persistant après reload + autre navigateur ; renommer (Entrée/blur) → persistant, Échap → annule, vide/identique → no-op ; supprimer → confirmation, ligne disparue après reload ; mutation sans passphrase → un seul prompt + rejeu ; 401 → re-prompt + rollback préservé.

**⚠️ Hors-périmètre laissé tel quel** (intentionnel) : indisponibilités individuelles → Story 2.3 ; exclusion réelle des inactifs au tirage → Epic 4. `lib/data/participants.ts`, `app/api/participants/route.ts`, `lib/store/reconcile.ts`, `app/page.tsx`, Realtime : inchangés.

### File List

**Nouveaux (sous `daily-wheel/`)**
- `lib/store/participants-reducer.ts` — réducteur optimiste pur extrait + `PATCH_OPTIMISTIC`/`RESTORE`/`REMOVE` (AC1).
- `tests/participants-reducer.unit.test.ts` — preuve pure réducteur, 14 tests (AC7).

**Modifiés (sous `daily-wheel/`)**
- `lib/store/participants-store.tsx` — réducteur extrait ; `runWrite` générique (insert/update/delete) ; file passphrase op-agnostique ; `toggleActive`/`renameParticipant`/`deleteParticipant` ; `retryParticipant` généralisé (AC2/3/4/5).
- `components/ParticipantsCard.tsx` — toggle switch, renommage inline, suppression confirmée (AC6).
- `app/globals.css` — styles toggle/rename-input/boutons Actions + responsive ; badges 2.1 retirés (AC6).
- `package.json` — `participants-reducer.unit` ajouté à `test:unit` (AC7).

**Inchangés (réutilisés)** : `lib/data/participants.ts` (déjà update/delete-ready), `app/api/participants/route.ts`, `lib/store/reconcile.ts`, `lib/store/parse-names.ts`, `lib/supabase/{client,admin}.ts`, `app/page.tsx`, `app/layout.tsx`, `components/PassphrasePrompt.tsx`, `next.config.ts`, `vercel.json`, `vitest.config.ts`.

### Change Log

- 2026-06-22 — Story 2.2 implémentée (toggle actif / renommage inline / suppression confirmée). Réducteur optimiste extrait en module pur + 3 transitions (TDD 14/14) ; machinerie d'écriture généralisée insert→update/delete (un seul prompt pour N, retry de l'op d'origine, 409 delete idempotent) ; UI interactive. Statut → review. Tests : 38/38 purs, 46/46 complet (sans flake) ; lint/tsc/build verts ; 0 fuite de secret.
