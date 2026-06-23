---
baseline_commit: 7373841
---

# Story 2.3: Indisponibilités individuelles (jour isolé / plage)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want ajouter à un participant des indisponibilités en jour isolé ou en plage de dates, et les supprimer unitairement,
so that le planning évite de le désigner ces jours-là (FR5) — **troisième et dernière story d'Epic 2**, qui ouvre la **table `unavailabilities`** (créée vide en 1.2, vidée en cascade par 2.2) à l'écriture : un **panneau repliable par participant** (UX-DR4) pour ajouter/supprimer des indispos, un **badge de comptage** (UX-DR5), et le **prédicat pur `isPersonUnavailable`** (AD-3, AD-13) qui sera consommé par la génération en Story 4.2. C'est la **première story qui peuple `lib/domain/`** (aujourd'hui vide) et qui **généralise la machinerie d'écriture** du store des participants à une **seconde table**, sans dupliquer le prompt de passphrase.

## Acceptance Criteria

> Ces AC décomposent les 7 critères de l'epic (epics.md#Story-2.3) en unités implémentables et testables. Le **cœur testable en CI sans secrets** (AD-13) est **double** : (a) le **prédicat de domaine pur** `isPersonUnavailable` + les **validateurs purs** (`lib/domain/`, aujourd'hui vide) ; (b) le **réducteur optimiste pur** des indispos (`lib/store/unavailabilities-reducer.ts`), sur le modèle exact de `participants-reducer.ts` (2.2). Les patterns d'écriture (`runWrite` générique, file passphrase, taxonomie AD-17, route proxy, allowlist serveur) **existent déjà** (1.4 → 2.2) et sont **généralisés**, pas réécrits.

1. **Prédicat de domaine pur + validateurs purs (cœur testable — AD-3, AD-13, AC8).** Créer `daily-wheel/lib/domain/availability.ts` (PUR, **feuille** : aucun import React/DOM/Supabase/`Date`/`lib/data`). Le domaine définit son **propre type structurel minimal** (ne PAS importer le type de `lib/data` — AD-1/AD-11 : le domaine ne dépend de rien) :
   - `type DayOrRange = { kind: 'day' | 'range'; date1: string /*YMD*/; date2: string | null }`
   - `isPersonUnavailable(unavailabilities: DayOrRange[], date: string /*YMD*/): boolean` — `true` ssi une entrée matche : `kind==='day'` → `entry.date1 === date` ; `kind==='range'` → `entry.date1 <= date && date <= entry.date2` (**bornes incluses**, comparaison **lexicographique de chaînes YMD** — jamais `Date`). Parité exacte avec le legacy `isDateIndispo` (historique L640-645). Liste vide → `false`.
   - `isValidRange(date1: string, date2: string | null): boolean` — `false` si `date2` absent **ou** `date2 < date1` ; `true` sinon. **`date2 === date1` est VALIDE** (plage d'un jour ; le legacy refuse `d2 < d1`, pas `d2 === d1` — historique L901).
   - `isDuplicateDay(existing: DayOrRange[], candidate: { kind: 'day'; date1: string }): boolean` — `true` si `existing` contient déjà une entrée `kind==='day'` de même `date1` (parité legacy L904 ; **les plages ne sont PAS dédupliquées**).
   - **TDD rouge d'abord** : écrire `daily-wheel/tests/availability.unit.test.ts` (import `@/lib/domain/availability` → ROUGE car module absent), puis créer le module → VERT. Couvre : day match/no-match, range bornes incluses (début, fin, milieu, hors), liste vide, `isValidRange` (`d2<d1`→false, `d2===d1`→true, `d2>d1`→true, `d2` null→false), `isDuplicateDay` (jour présent→true, jour absent→false, plage de même date1→**false**).
   [Source: historique/Spin That Wheel v2.html (isDateIndispo L640-645, validation add L897-908) ; ARCHITECTURE-SPINE.md#AD-3 (signature `isPersonUnavailable(person,date)`, prédicat pur recevant ses contraintes en argument) ; #AD-1 (domaine = feuille, n'importe rien) ; #AD-13 (tests purs en CI) ; daily-wheel/lib/domain/ (vide, `.gitkeep` seul) ; daily-wheel/tests/reconcile.unit.test.ts (modèle test pur)]

   > **Note d'altitude (à trancher par le dev, choix par défaut documenté) :** `isPersonUnavailable` est LE prédicat de planification mandaté par AD-3 (consommé en 4.2) → sa place dans `lib/domain/` est non négociable. `isValidRange`/`isDuplicateDay` sont de la validation d'entrée ; on les co-localise dans le **même module pur** (un seul fichier testé en CI, cohérent AD-13). Si tu préfères les isoler dans `lib/store/unavailability-validation.ts`, c'est acceptable tant que le module reste pur et testé — mais ne les mets PAS dans `lib/data/` (la couche data ne porte pas de règles métier).

2. **Type + couche data `unavailabilities` (AD-7, AD-11, AD-14).** Créer `daily-wheel/lib/data/unavailabilities.ts` (seul point de contact Supabase pour cette table — AD-11) :
   - `export type Unavailability = { id: string; participant_id: string; kind: 'day' | 'range'; date1: string; date2: string | null; updated_at: string }` (timestamps = chaînes ISO, **jamais** `Date` — convention dates).
   - `fetchUnavailabilities(): Promise<Unavailability[]>` — lecture via la clé low-privilege (`supabasePublic.from('unavailabilities').select('*')`), exactement comme `fetchParticipants` (AD-7).
   - `export type UnavailabilityWriteOp = 'insert' | 'delete'` (**pas d'`update`** : on ajoute et on supprime unitairement, jamais d'édition — epics.md#Story-2.3).
   - `export type UnavailabilityWritePayload = { id?: string; data?: { participant_id: string; kind: 'day' | 'range'; date1: string; date2: string | null } }`
   - `writeUnavailability(op, payload, passphrase): Promise<unknown>` — `POST /api/unavailabilities`, header `x-team-passphrase`, corps `{ op, ...payload }` ; lève un `WriteError` typé en cas d'échec. **Copie structurelle exacte** de `writeParticipant` (lib/data/participants.ts L56-77), URL et payload adaptés.
   - **Réutiliser la taxonomie AD-17 partagée** : extraire `WriteError`, `writeErrorFromStatus`, `WriteErrorKind` de `participants.ts` vers un nouveau module `daily-wheel/lib/data/write-error.ts`, et **re-exporter depuis `participants.ts`** (non-régression : `participants-store.tsx` et le test `write-error.unit.test.ts` importent toujours `@/lib/data/participants`). `unavailabilities.ts` importe depuis `@/lib/data/write-error`. *(Éviter un import `unavailabilities → participants` : extraction = cohésion, pas de dépendance latérale.)*
   [Source: daily-wheel/lib/data/participants.ts (writeParticipant/WriteError/writeErrorFromStatus L29-77, fetchParticipants L16-20) ; daily-wheel/supabase/migrations/20260622121017_init_schema.sql (table unavailabilities L18-25) ; ARCHITECTURE-SPINE.md#AD-7 ; #AD-11 ; #AD-14 ; #AD-17 ; #Consistency-Conventions (dates YMD, jamais Date)]

3. **Route proxy `/api/unavailabilities` (AD-8, AD-9, AD-14).** Créer `daily-wheel/app/api/unavailabilities/route.ts` — **mirroir exact** de `app/api/participants/route.ts`, adapté :
   - `runtime = 'nodejs'`, garde passphrase `x-team-passphrase` en `timingSafeEqual` (AD-8), retour **avant** tout accès Supabase ; `mapDbError` identique (23505→409, PGRST116→409, sinon 500).
   - Allowlist `const ALLOWED = ['participant_id', 'kind', 'date1', 'date2'] as const` (AD-14 : `id`/`updated_at` = serveur).
   - Ops : **`insert`** (`pickAllowed` → `.insert(picked).select().single()` ; `id`/`updated_at` par défaut SQL) et **`delete`** (`id` requis ; `.delete().eq('id', id).select('id')` ; **409 si 0 ligne** — état périmé). **PAS d'op `update`** : renvoyer `400` si `op` n'est ni `insert` ni `delete`.
   - **Validation serveur défensive** (AD-17:400) avant insert : `kind` ∈ `{day,range}` ; `date1` chaîne non vide ; si `kind==='range'` → `date2` chaîne non vide **et** `date2 >= date1` ; si `kind==='day'` → forcer `date2 = null`. *(La validation primaire est cliente/pure AC1 ; le serveur reste la dernière ligne — un caller direct ne doit pas insérer une plage inversée.)*
   - **Ne PAS** modifier la route participants ni `lib/supabase/admin.ts`.
   [Source: daily-wheel/app/api/participants/route.ts (intégralité — garde, allowlist, mapDbError, ops insert/delete, 409 si 0 ligne L1-106) ; ARCHITECTURE-SPINE.md#AD-8 ; #AD-9 ; #AD-14 ; #AD-17]

4. **Réducteur optimiste pur des indispos + réconciliation Realtime (AD-5, AD-13, AC8).** Sur le modèle **exact** de 2.2 :
   - Créer `daily-wheel/lib/store/unavailabilities-reducer.ts` (PUR) : `type StoreUnavailability = Unavailability & { pending?: boolean; failed?: boolean }`, `type Action`, `unavailabilitiesReducer`. Transitions (cycle **insert + delete** uniquement — pas de patch) : `HYDRATE { rows }` ; `REALTIME { event }` (délègue à la réconciliation) ; `ADD_OPTIMISTIC { tempId, row }` (ajoute une ligne `pending:true` avec `id=tempId`) ; `SET_PENDING { id }` ; `CONFIRM { tempId, row }` (remplace la ligne `tempId` par la ligne serveur, drapeaux effacés) ; `ROLLBACK { tempId }` (retire la ligne temp — échec d'insert) ; `MARK_FAILED { id }` ; `RESTORE { row }` (upsert par `id`, drapeaux effacés — restauration d'un delete échoué) ; `REMOVE { id }` (delete optimiste). Pur : aucun import React/DOM/Supabase/`Date`. Références stables quand rien ne change (modèle `reconcile.ts`/`participants-reducer.ts`).
   - **Réconciliation Realtime** : **généraliser** `daily-wheel/lib/store/reconcile.ts` en un helper générique `reconcileById<T extends { id: string; updated_at: string }>(state, event)` portant les invariants AD-15 (dédup `id`+`updated_at`) / AD-16 (LWW lexicographique). Conserver `reconcileParticipants` comme **alias typé** (`= reconcileById<Participant>` ou wrapper) — **non-régression** de `tests/reconcile.unit.test.ts`. Ajouter `reconcileUnavailabilities` (alias `reconcileById<Unavailability>`) + le type d'événement `UnavailabilityChangeEvent` (INSERT/UPDATE/DELETE sur la forme `Unavailability`). *(Si la généralisation générique te paraît risquée pour le test existant, un fichier `unavailabilities-reconcile.ts` qui duplique la logique est acceptable — mais le générique est préféré : DRY + un seul invariant prouvé.)*
   - **TDD rouge d'abord** : `daily-wheel/tests/unavailabilities-reducer.unit.test.ts` (import absent → ROUGE) couvrant les nouvelles transitions + (si générique) une poignée de cas `reconcileUnavailabilities` (dédup écho, LWW, INSERT inconnu = upsert, DELETE). → VERT.
   [Source: daily-wheel/lib/store/participants-reducer.ts (modèle reducer pur) ; daily-wheel/lib/store/reconcile.ts (réconciliation pure AD-15/AD-16 L1-58) ; daily-wheel/tests/participants-reducer.unit.test.ts + reconcile.unit.test.ts (modèles) ; ARCHITECTURE-SPINE.md#AD-5 ; #AD-13 ; #AD-15 ; #AD-16]

5. **Store : généraliser `runWrite` table-agnostique + slice indispos — UN SEUL prompt pour les DEUX tables (AD-8, AD-5, AD-17).** Étendre `daily-wheel/lib/store/participants-store.tsx` (le provider centralise déjà la passphrase ; on évite ainsi un **second** prompt). **Décision clé de cette story** :
   - **Généraliser `WriteSpec` + `runWrite` pour qu'ils ne référencent plus `writeParticipant`/`fetchParticipants` en dur.** Le `WriteSpec` porte désormais ses propres thunks : `{ write: (passphrase: string) => Promise<unknown>; onConfirm: (row: unknown) => void; rollback: () => void; onPending?: () => void; onFailed?: () => void; onConflictRehydrate?: () => Promise<void>; retryKey?: string | null; deleteIdempotent?: boolean }`. `runWrite` appelle `spec.write(passphrase)` (au lieu de `writeParticipant(...)`), `spec.onPending?.()` (au lieu de `dispatch SET_PENDING`), `spec.onFailed?.()` + `failedWritesRef.set(spec.retryKey, spec)`, et en cas de `conflict` non-idempotent `await spec.onConflictRehydrate?.()`. **Le chemin participants reste fonctionnellement IDENTIQUE** : ses specs fournissent `write: (pp) => writeParticipant(op, payload, pp)`, `onPending: () => dispatch({type:'SET_PENDING',...})`, `onConflictRehydrate: async () => dispatch({type:'HYDRATE', rows: await fetchParticipants()})`, etc. (non-régression 2.1/2.2 — AC8). La file `pendingWritesRef`/`failedWritesRef`, le compteur `writeSeqRef`, `submit/cancelPassphrase`, la taxonomie AD-17 : **inchangés dans leur structure**, juste op-agnostiques.
   - **Ajouter la slice indispos** au même provider : `const [unavailabilities, dispatchU] = useReducer(unavailabilitiesReducer, initialUnavailabilities)` + `stateRefU`. Exposer dans `StoreValue` : `unavailabilities: StoreUnavailability[]`, `addUnavailability(participantId, input: { kind; date1; date2 })`, `removeUnavailability(id)`, `retryUnavailability(id)`.
     - `addUnavailability` : **valider d'abord** via AC1 (`isValidRange` pour une plage ; `isDuplicateDay` contre `stateRefU` filtré sur ce participant pour un jour) → si invalide, `setError(message FR)` + **aucune écriture**. Sinon : `tempId = 'utemp:<n>'`, `dispatchU(ADD_OPTIMISTIC { tempId, row })`, puis `runWrite({ write: pp => writeUnavailability('insert', { data:{ participant_id, kind, date1, date2 } }, pp), onPending: () => dispatchU(SET_PENDING{id:tempId}), onConfirm: row => dispatchU(CONFIRM{tempId, row}), onFailed: () => dispatchU(MARK_FAILED{id:tempId}), rollback: () => dispatchU(ROLLBACK{tempId}), onConflictRehydrate: async () => dispatchU(HYDRATE{rows: await fetchUnavailabilities()}), retryKey: tempId })`.
     - `removeUnavailability(id)` : snapshot via `stateRefU` → `dispatchU(REMOVE{id})` → `runWrite({ write: pp => writeUnavailability('delete', { id }, pp), rollback: () => dispatchU(RESTORE{row: snapshot}), onConfirm: () => {/* déjà retiré */}, deleteIdempotent: true, retryKey: null })` (delete = même logique que `deleteParticipant` : 409 introuvable = succès idempotent ; transient → `rollback` RESTORE).
   - **Second abonnement Realtime** : un canal `unavailabilities-rt` sur `public.unavailabilities` (event `*`) → `dispatchU(REALTIME{event})` ; re-hydratation `fetchUnavailabilities` → `dispatchU(HYDRATE)` au `SUBSCRIBED` (AD-6). `mapPayload` générique ou un second mappeur.
   - **Invariant AD-8 préservé et RENFORCÉ** : N mutations (participants **et** indispos confondus) sans passphrase → N specs en file → **UN seul** prompt → rejeu groupé. `cancelPassphrase` exécute tous les `rollback()`. (La file étant déjà op-agnostique depuis 2.2, elle accepte les specs indispos sans changement de contrat.)
   [Source: daily-wheel/lib/store/participants-store.tsx (runWrite/WriteSpec L52-169, file passphrase L91-96/271-291, Realtime L296-322, mapPayload L347-361) ; ARCHITECTURE-SPINE.md#AD-5 ; #AD-6 ; #AD-8 ; #AD-17 ; 2-2-*.md#AC5 (file op-agnostique)]

6. **UI : panneau repliable par participant + badge (UX-DR4, UX-DR5, FR5, NFR4/NFR5).** Créer `daily-wheel/components/UnavailabilityPanel.tsx` et le brancher dans `components/ParticipantsCard.tsx` :
   - **Toggle + badge dans la cellule Actions** : un bouton « Indispos » portant un **badge de comptage** (UX-DR5) = nombre d'indispos du participant (`unavailabilities.filter(u => u.participant_id === p.id).length`). État d'ouverture **local au composant** (`useState` `expandedId` — jamais dans le store, cohérent avec `editingId` de 2.2). `aria-expanded` sur le bouton.
   - **Ligne panneau repliable** (UX-DR4) : sous la ligne participant, une `<tr className="indispo-row"><td colSpan={3}><UnavailabilityPanel participantId={p.id} /></td></tr>` rendue **seulement** si `expandedId === p.id` (parité legacy `.indispo-row`/`.indispo-panel` — historique L859-940).
   - **`UnavailabilityPanel`** (consomme le store) : un `<select>` type (`Jour` / `Plage`), un `<input type="date">` `date1` (label « Date : » en jour, « Du : » en plage), un `<input type="date">` `date2` **affiché uniquement si plage** (label « au : »), un bouton « ＋ Ajouter ». Au clic → `addUnavailability(participantId, { kind, date1, date2: kind==='range' ? date2 : null })` puis reset des inputs. Sous le formulaire : la **liste des tags** triés par `date1` (`localeCompare`), label jour = date FR, plage = `date1 → date2` (formatage FR **local**, jamais UTC), chaque tag avec un bouton ✕ → `removeUnavailability(u.id)`. État vide : « Aucune indisponibilité enregistrée. ».
   - **Formatage des dates FR** : réutiliser/porter `formatDateFr` + `parseYMD` du legacy (parsing **local** — `new Date(y, m-1, d)`, jamais `new Date('YYYY-MM-DD')` qui interprète en UTC). Centraliser dans un petit util client (ex. `lib/format/date-fr.ts`) si absent. *(Vérifier d'abord s'il existe déjà un util de formatage de date dans le repo ; sinon le créer minimal.)*
   - **Tout en français** (NFR4), **charte CSS existante** (tokens `--indispo-*` **déjà présents** dans `globals.css` L18-21), **sans dégradé**, lisible **≤ 520 px** (NFR5, UX-DR7). Accessibilité (UX-DR6) : inputs `date` natifs (clavier + calendrier), `aria-label`/labels explicites, bouton toggle `aria-expanded`. Désactiver les contrôles d'une indispo `pending`.
   [Source: daily-wheel/components/ParticipantsCard.tsx (table + editingId local L114-198, cellule Actions L162-193) ; historique/Spin That Wheel v2.html (buildIndispoPanel L859-940, formatDateFr/parseYMD) ; docs/prd.md §3 (UX-DR4 panneaux repliables, UX-DR5 badges, UX-DR6 a11y, UX-DR7 ≤520px) ; ARCHITECTURE-SPINE.md#Consistency-Conventions (dates locales)]

7. **CSS : panneau indispos responsive + SSR hydration (AC6, AD-6).**
   - **CSS** : porter dans `daily-wheel/app/globals.css` les classes `.indispo-row`, `.indispo-panel`, `.indispo-panel-title`, `.indispo-form`, `.indispo-tags`, `.indispo-tag` (+ bouton ✕), `.indispo-empty`, `.indispo-badge` depuis le legacy (historique L379-440), **adaptées à la charte** : réutiliser `--indispo-bg/-border/-tag-bg/-tag-border` (déjà définis L18-21), `--radius-sm`, `--primary` ; **aucun dégradé** ; `≤ 520 px` : formulaire empilé, pas de débordement horizontal. Le `<select>`/`<input type=date>` suivent le style des champs existants.
   - **SSR hydration** : `daily-wheel/app/page.tsx` — `fetchUnavailabilities()` en parallèle de `fetchParticipants()` (try/catch → `[]` si échec, comme l'existant) et passer `initialUnavailabilities` au provider. Adapter la signature de `ParticipantsStoreProvider` (`{ initial, initialUnavailabilities, children }`).
   [Source: historique/Spin That Wheel v2.html (CSS indispo L379-440) ; daily-wheel/app/globals.css (tokens --indispo-* L18-21, media ≤520px) ; daily-wheel/app/page.tsx (pattern SSR initial L9-17, provider L35) ; ARCHITECTURE-SPINE.md#AD-6]

8. **Tests + non-régression globale (AD-13, NFR9).**
   - **Filet CI pur (obligatoire)** : `tests/availability.unit.test.ts` (AC1) **et** `tests/unavailabilities-reducer.unit.test.ts` (AC4) écrits **rouge → vert** ; **ajoutés à `test:unit`** dans `package.json` (et ramassés par `npm test`).
   - **Intégration live (optionnelle, gated)** : un `tests/unavailabilities.write.integration.test.ts` calqué sur `write.integration.test.ts` (insert puis delete via la route, gate `SUPABASE_TEST_LIVE`) est **bienvenu mais non requis** pour le « vert » CI (CI sans secrets — AD-13). Ne PAS bloquer dessus.
   - **Non-régression (NFR9)** : `participants-reducer`/`reconcile`/`parse-names`/`write-error` restent **verts** ; le chemin **participants** (insert multiple / toggle / rename / delete / retry) conserve un comportement **identique** (la généralisation de `runWrite` ne change pas sa sémantique observable) ; `reconcileParticipants` inchangé (alias). `npm run lint` 0, `npx tsc --noEmit` 0, `npm run build` vert. Grep `.next/static` : **aucun** secret (`SUPABASE_SECRET_KEY`/`TEAM_PASSPHRASE`/`service_role` + valeur passphrase → 0).
   [Source: daily-wheel/package.json (scripts test/test:unit) ; daily-wheel/tests/write.integration.test.ts (modèle intégration gated) ; daily-wheel/vitest.config.ts (gate SUPABASE_TEST_LIVE, stub server-only) ; ARCHITECTURE-SPINE.md#AD-13 ; 2-2-*.md#AC8 (critère « vert »)]

## Tasks / Subtasks

> ⚠️ **Tout le code et toutes les commandes `npm` sont sous `daily-wheel/`** (variance structurelle héritée 1.1→2.2). Le workflow CI à la racine n'est **pas** touché par cette story.

- [x] **Tâche 1 — Domaine pur : `isPersonUnavailable` + validateurs (rouge → vert)** (AC: 1, 8)
  - [x] Écrire d'abord `daily-wheel/tests/availability.unit.test.ts` (ROUGE attendu : `Cannot find package '@/lib/domain/availability'`) : day match/no-match, range bornes incluses (début/fin/milieu/hors), vide ; `isValidRange` (`d2<d1`→F, `d2===d1`→T, `d2>d1`→T, null→F) ; `isDuplicateDay` (jour présent→T, absent→F, plage même date1→F).
  - [x] Créer `daily-wheel/lib/domain/availability.ts` : type structurel local `DayOrRange`, `isPersonUnavailable`, `isValidRange`, `isDuplicateDay`. PUR (aucun import). Comparaisons YMD lexicographiques.
  - [x] VERT (18 tests).

- [x] **Tâche 2 — Data : type + `fetch`/`write` indispos + extraction taxonomie partagée** (AC: 2, 8)
  - [x] Extraire `WriteError`/`writeErrorFromStatus`/`WriteErrorKind` de `lib/data/participants.ts` → `daily-wheel/lib/data/write-error.ts` ; **re-exporter** depuis `participants.ts` (import local + `export {}` ; non-régression imports). `tests/write-error.unit.test.ts` pointé sur `@/lib/data/write-error`.
  - [x] Créer `daily-wheel/lib/data/unavailabilities.ts` : `Unavailability`, `fetchUnavailabilities`, `UnavailabilityWriteOp`/`Payload`, `writeUnavailability` (POST `/api/unavailabilities`). Copie structurelle de `participants.ts`.
  - [x] `npx tsc --noEmit` vert (re-export + nouveaux types) ; write-error.unit vert (5).

- [x] **Tâche 3 — Route proxy `/api/unavailabilities`** (AC: 3)
  - [x] Créer `daily-wheel/app/api/unavailabilities/route.ts` : mirroir de la route participants ; allowlist `['participant_id','kind','date1','date2']` ; ops `insert`/`delete` (rejet `update`→400) ; validation serveur défensive (kind ∈ day|range, range → date2 ≥ date1, day → date2 forcé null) ; 409 si delete 0 ligne ; garde passphrase identique.
  - [x] Ne PAS toucher la route participants ni `lib/supabase/` (vérifié : aucun de ces fichiers modifié).

- [x] **Tâche 4 — Réducteur optimiste pur indispos + réconciliation générique (rouge → vert)** (AC: 4, 8)
  - [x] (Réconciliation) Généralisé `lib/store/reconcile.ts` → `reconcileById<T extends {id;updated_at}>` ; `reconcileParticipants` en alias (non-régression `reconcile.unit` : 9 verts) ; ajouté `reconcileUnavailabilities` + `UnavailabilityChangeEvent` (+ `ChangeEvent<T>`).
  - [x] Écrit d'abord `daily-wheel/tests/unavailabilities-reducer.unit.test.ts` (ROUGE) : `ADD_OPTIMISTIC`/`CONFIRM`/`ROLLBACK`/`SET_PENDING`/`MARK_FAILED`/`RESTORE`/`REMOVE`/`HYDRATE` + 3 cas `reconcileUnavailabilities` (INSERT inconnu, écho dédup, DELETE).
  - [x] Créé `daily-wheel/lib/store/unavailabilities-reducer.ts` (`StoreUnavailability`, `Action`, `unavailabilitiesReducer`). PUR. → VERT (14 tests).

- [x] **Tâche 5 — Store : `runWrite` table-agnostique + slice indispos + 2ᵉ canal Realtime** (AC: 5, 8)
  - [x] Généralisé `WriteSpec` (thunks `write`/`onConfirm`/`rollback`/`onPending?`/`onFailed?`/`onConflictRehydrate?`/`retryKey`/`deleteIdempotent`) et `runWrite` ; **specs participants réécrites** pour fournir ces thunks **sans changer leur sémantique** (insert multiple / toggle / rename / delete / retry — vérifié via build + intégration live verte).
  - [x] Ajouté `useReducer(unavailabilitiesReducer)` + `stateRefU` ; `addUnavailability` (valide via AC1 : `isValidRange`/`isDuplicateDay` → message FR + aucune écriture si invalide, optimiste + insert sinon), `removeUnavailability` (optimiste REMOVE + delete idempotent), `retryUnavailability`. Exposés dans `StoreValue`.
  - [x] 2ᵉ abonnement Realtime `unavailabilities-rt` + re-hydratation `SUBSCRIBED` (AD-6). `mapChange<T>` générique. File passphrase op- ET table-agnostique → **un seul** prompt couvre les deux tables.

- [x] **Tâche 6 — UI : panneau repliable + badge** (AC: 6)
  - [x] Créé `daily-wheel/components/UnavailabilityPanel.tsx` (select type, `<input type=date>` date1 (+ date2 si plage), bouton « ＋ Ajouter », liste de tags triés `localeCompare` + ✕, état vide ; consomme le store). Formatage FR **local** via nouveau `lib/format/date-fr.ts` (`parseYMD`/`formatDateFr`).
  - [x] `ParticipantsCard.tsx` : bouton « Indispos » + **badge** de comptage dans Actions (`aria-expanded`, `expandedId` local) ; ligne `.indispo-row` repliable (`colSpan={3}`) rendue si ouverte. Contrôles désactivés si `pending`.

- [x] **Tâche 7 — CSS + SSR hydration** (AC: 7)
  - [x] Porté les classes `.indispo-*` + `.indispo-badge` dans `app/globals.css` (charte, tokens `--indispo-*`, sans dégradé, formulaire empilé ≤520px).
  - [x] `app/page.tsx` : `fetchParticipants()`/`fetchUnavailabilities()` en parallèle indépendants (`.catch(() => [])`) + `initialUnavailabilities` au provider ; signature `ParticipantsStoreProvider` adaptée (`{ initial, initialUnavailabilities, children }`).

- [x] **Tâche 8 — Scripts de test + non-régression** (AC: 8)
  - [x] `package.json` : `availability.unit` + `unavailabilities-reducer.unit` ajoutés à `test:unit`.
  - [x] `tests/unavailabilities.write.integration.test.ts` gated écrit (participant jetable → indispo jour/plage → validation inversée 400 → update 400 → delete + 409 → cascade) — **vert en live**.
  - [x] Non-régression : `npm run lint` 0, `npx tsc --noEmit` 0, `npm run test:unit` vert (6 suites / 70 tests : write-error + reconcile + parse-names + participants-reducer + **availability** + **unavailabilities-reducer**), `npm test` 79/80 (le 1 = flake handshake Realtime connu → **vert au retry** via `test:realtime`), `npm run build` vert. Grep `.next/static` : **0 secret** (noms + valeur passphrase).

## Dev Notes

### Contexte & périmètre
- **Troisième et dernière story d'Epic 2** : ouvre la table `unavailabilities` (créée vide en 1.2, vidée en cascade par la suppression participant de 2.2) à l'écriture, et **peuple `lib/domain/`** pour la première fois. [Source: epics.md#Story-2.3 ; 2-2-*.md#Project-Structure-Notes (« le panneau repliable d'indispos s'ajoutera par ligne en 2.3 »)]
- **In-scope :** prédicat pur `isPersonUnavailable` + validateurs (domaine) ; couche data + route proxy `unavailabilities` ; réducteur optimiste pur + réconciliation ; **généralisation du store à une 2ᵉ table (un seul prompt passphrase)** ; UI panneau repliable + badge ; CSS ; SSR hydration.
- **Hors-scope :** **effet sur la génération du planning** → la deadline EDF et l'exclusion effective des jours indispos sont vérifiées en **Story 4.2** (epics.md#Story-2.3 dernière clause : « l'effet sur la génération étant vérifié en Story 4.2 »). On livre la **donnée + le prédicat testé**, pas la génération. Contraintes d'équipe (fériés/off/exclusions de groupe) → **Epic 3**. Édition d'une indispo existante → **non prévue** (ajout/suppression unitaires seulement).

### ⚠️ Variance structurelle héritée (CRITIQUE — rappel 1.1→2.2)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Tout le code (`lib/`, `components/`, `app/`, `tests/`), tous les `npm`, tout grep `.next/` → **depuis `daily-wheel/`**. [Source: 2-2-*.md#Variance-structurelle]
- État réel pertinent (sous `daily-wheel/`, vérifié au commit `7373841`) — **réutiliser, ne pas casser** :
  - `lib/domain/` : **VIDE** (`.gitkeep` seul). Cette story crée le premier module (`availability.ts`).
  - `supabase/migrations/20260622121017_init_schema.sql` : table `unavailabilities` **DÉJÀ créée** (L18-25 : `id uuid PK`, `participant_id uuid FK ON DELETE CASCADE`, `kind text check(day|range)`, `date1 date not null`, `date2 date null`, `updated_at timestamptz default now()`), RLS **SELECT anon** (L74), **dans la publication realtime** (L86) + `REPLICA IDENTITY FULL` (L93). **Aucune migration à écrire.**
  - `lib/data/participants.ts` : `writeParticipant`/`WriteError`/`writeErrorFromStatus`/`fetchParticipants` = **modèles** ; `WriteError`&co à **extraire** vers `write-error.ts` + re-export.
  - `app/api/participants/route.ts` : **modèle exact** de la route (garde passphrase `timingSafeEqual`, `pickAllowed`, `mapDbError`, ops, 409 si 0 ligne).
  - `lib/store/participants-store.tsx` : `runWrite`/`WriteSpec` (op-agnostiques depuis 2.2) à **généraliser table-agnostiques** ; file `pendingWritesRef`/`failedWritesRef` + `submit/cancelPassphrase` **réutilisés** ; abonnement Realtime + re-hydratation `SUBSCRIBED` = **modèle** du 2ᵉ canal.
  - `lib/store/participants-reducer.ts` + `lib/store/reconcile.ts` : **modèles** du réducteur pur et de la réconciliation (à généraliser en `reconcileById<T>`).
  - `components/ParticipantsCard.tsx` : table + `editingId`/`skipBlurRef` (état UI local) ; cellule **Actions** où greffer le bouton « Indispos » + badge. `components/PassphrasePrompt.tsx` : **inchangé** (déclenché par le store, couvre les deux tables).
  - `app/globals.css` : tokens `--indispo-*` **déjà présents** (L18-21) ; classes `.indispo-*` **à porter** depuis le legacy. `.text-input`, `.btn-secondary`, media `≤520px` réutilisés.
  - `app/page.tsx` : Server Component `force-dynamic`, SSR `initial` ; **à étendre** (`initialUnavailabilities`).
  - `package.json` : `test:unit` = liste explicite → **y ajouter** `availability.unit` + `unavailabilities-reducer.unit`. **Aucune** lib d'état/UI/date (React + `<input type=date>` natifs) — **ne pas** ajouter de dépendance.
  - `vitest.config.ts` : alias `@`, stub `server-only`, gate `SUPABASE_TEST_LIVE` — **ne pas retoucher**.

### Décisions d'architecture qui cadrent cette story
- **AD-3 (deux prédicats, purs, args)** : `isPersonUnavailable(unavailabilities, date)` est le prédicat de personne. Le domaine est une **feuille** → il définit son **propre** type structurel (`DayOrRange`), n'importe **pas** `lib/data`. La branche dans `generateSchedule`/deadline EDF = **Story 4.2** (hors-scope ici).
- **AD-5/AD-17 (optimiste + taxonomie)** : insert indispo = `ADD_OPTIMISTIC` + `writeUnavailability('insert')` ; delete = `REMOVE` + `writeUnavailability('delete')` ; rollback/restore + classes `auth/validation/conflict/transient` exactement comme les participants. Delete 409 « introuvable » = **succès idempotent** (AD-16).
- **AD-8 (passphrase)** : la file op-agnostique de 2.2 accepte les specs indispos → **un seul** prompt pour N mutations **toutes tables confondues**. C'est l'argument décisif pour **étendre le provider participants** plutôt que créer un provider sibling (qui dupliquerait le prompt).
- **AD-14 (contrat d'écriture)** : `{ op, id?, data? }` + allowlist **serveur** `participant_id,kind,date1,date2`. Une route **par table** → `/api/unavailabilities` distincte.
- **AD-15/AD-16 (réconciliation)** : `reconcileById<T>` dédup `id`+`updated_at`, LWW lexicographique — identique aux participants ; l'écho de notre propre insert/delete est neutralisé.
- **AD-11/AD-7 (chemins asymétriques)** : lecture `unavailabilities` via clé low-privilege (`fetchUnavailabilities` + abonnement) ; écriture **uniquement** via `/api/unavailabilities`. Aucun composant ne touche `supabase.from(...)` ni `fetch('/api/...')` — tout via le store → `lib/data/`.
- **AD-13 (CI pure)** : seuls `availability.unit` + `unavailabilities-reducer.unit` (+ existants) tournent en CI **sans secrets**. Store, route, UI **non** unit-testés (pas de RTL/jsdom — **ne pas** ajouter de dépendance) ; preuve = **vérification manuelle**.
- **Convention dates (CRITIQUE)** : tout en `YYYY-MM-DD` **local**. `isPersonUnavailable` compare des **chaînes** (lexicographique = chronologique pour YMD). Le formatage FR (`formatDateFr`) parse en **local** (`new Date(y, m-1, d)`), **jamais** `new Date('YYYY-MM-DD')` (UTC → décalage d'un jour). `<input type=date>` produit déjà du `YYYY-MM-DD`.

### Décision de design à valider (signalée, non bloquante)
- **Où vit l'état indispos ?** → Recommandation : **étendre `ParticipantsStoreProvider`** (slice supplémentaire + `runWrite` table-agnostique), pour préserver l'invariant **un seul prompt passphrase** (AD-8) et réutiliser toute la machinerie AD-17. Le coût : `participants-store.tsx` grossit (conceptuellement un « team store »). Alternative déférée : extraire la machinerie file+passphrase dans un hook `useWriteQueue()` partagé — **plus propre mais plus de churn** ; à reconsidérer si une 3ᵉ/4ᵉ table (Epic 3 : exclusions/fériés/off) rend le provider trop lourd. Pour 2.3, on étend en place. *(Si tu juges que ça déséquilibre trop le store, escalade avant d'implémenter.)*

### Parité avec le legacy (historique/Spin That Wheel v2.html)
- `isDateIndispo(date, indispos)` (L640-645) = `isPersonUnavailable` : `day → date1===ymd` ; `range → ymd>=date1 && ymd<=date2` (**bornes incluses**).
- Validation add (L897-908) : `range` refuse `d2 < d1` (donc `d2===d1` **autorisé**) ; `day` refuse le **doublon** (`some(i.type==='day' && i.date1===d1)`, alerte « Ce jour est déjà ajouté. »). **Les plages ne sont pas dédupliquées.**
- Affichage (L920-940) : tags triés `date1.localeCompare` ; label jour = `formatDateFr(date1)`, plage = `formatDateFr(date1) → formatDateFr(date2)` ; ✕ pour supprimer ; état vide « Aucune indisponibilité enregistrée. ». Badge = nombre d'indispos.

### Previous Story Intelligence (2.2 / 2.1 / 1.5)
- **Pattern test pur** : `reconcile.unit.test.ts` / `participants-reducer.unit.test.ts` = modèles exacts (rouge→vert, pur, CI-runnable). Reproduire pour `availability` + `unavailabilities-reducer`.
- **File passphrase op-agnostique (2.2)** : `Map<writeKey, WriteSpec>` + `submitPassphrase` rejouant tout = **un seul prompt pour N**. La rendre **table-agnostique** est la suite naturelle (specs portant leurs thunks). Le chemin participants doit rester **byte-identique** en comportement.
- **`retry` rejoue l'op d'origine** : `failedWritesRef` par clé. Pour les indispos, `retryUnavailability` rejoue le `WriteSpec` insert conservé (le delete n'a pas de retry — il restaure la ligne, l'utilisateur ré-agit, cohérent `deleteParticipant`).
- **Flake Realtime connu (1.3→2.2)** : 1er `npm test` peut timeouter sur le handshake puis passer au retry — transitoire, **pas** une régression. Avec un **2ᵉ** canal, surveiller mais ne pas « corriger » un flake de handshake.
- **CI Node 22.x** (`@supabase/realtime-js` exige WebSocket natif) + Vercel `framework=nextjs` (`vercel.json`) : **ne pas** retoucher CI/Vercel (3a57a9b/e6a4eb9).
- **Dépendances Epic 1/2 en review** (non `done`) mais commitées et fonctionnelles : construire dessus ; signaler si une revue impose un changement de surface du store.
- **Push Git** : remote via alias SSH `github-perso` → `Infinter/SpinThatWeeklyWheel` (compte SoloOz). [Source: MEMORY:git-remote-push-setup]

### Points techniques (Next.js 16 / React 19 — janv. 2026)
- **Pas de nouvelle techno, aucune recherche web requise.** Stack figée (Next 16.2.x, React 19.2, supabase-js 2.108.x). Story 100 % domaine pur + data + route + store + UI + CSS, sur patterns existants.
- **`<input type="date">`** : valeur native `YYYY-MM-DD` (parfait pour le wire-format et la comparaison lexicographique). Pas de lib de date.
- **Snapshot avant optimiste** : pour `removeUnavailability`, lire la ligne via `stateRefU.current.find(...)` **avant** `REMOVE` pour construire le `RESTORE`. `stateRefU` maintenu par un `useEffect` (modèle `stateRef` participants L99-101).
- **Deux canaux Realtime** : `participants-rt` (existant, inchangé) + `unavailabilities-rt` (nouveau) ; chacun se re-hydrate au `SUBSCRIBED`. Dédup d'écho par `reconcileById`.

### Project Structure Notes
- Arborescence touchée (tout sous `daily-wheel/`) :
  ```
  lib/domain/availability.ts                    # NEW (isPersonUnavailable + validateurs PURS — AC1) — 1er module domaine
  lib/data/write-error.ts                        # NEW (taxonomie AD-17 extraite + re-export depuis participants.ts — AC2)
  lib/data/unavailabilities.ts                   # NEW (type + fetch + write — AC2)
  app/api/unavailabilities/route.ts              # NEW (proxy écriture insert/delete — AC3)
  lib/store/unavailabilities-reducer.ts          # NEW (réducteur optimiste PUR — AC4)
  lib/store/reconcile.ts                          # UPDATE (généralisé reconcileById<T> + reconcileUnavailabilities — AC4, non-régression reconcileParticipants)
  lib/store/participants-store.tsx               # UPDATE (runWrite table-agnostique + slice indispos + 2e canal RT — AC5)
  components/UnavailabilityPanel.tsx             # NEW (panneau repliable — AC6)
  components/ParticipantsCard.tsx                # UPDATE (bouton Indispos + badge + ligne repliable — AC6)
  lib/format/date-fr.ts                          # NEW si absent (formatDateFr/parseYMD local — AC6)
  app/globals.css                                # UPDATE (classes .indispo-* — AC7)
  app/page.tsx                                   # UPDATE (fetchUnavailabilities + initialUnavailabilities — AC7)
  lib/data/participants.ts                       # UPDATE léger (re-export write-error pour non-régression — AC2)
  package.json                                   # UPDATE (availability.unit + unavailabilities-reducer.unit dans test:unit — AC8)
  tests/availability.unit.test.ts                # NEW (preuve domaine pur — AC1)
  tests/unavailabilities-reducer.unit.test.ts    # NEW (preuve réducteur pur — AC4)
  tests/unavailabilities.write.integration.test.ts # NEW optionnel gated (AC8)
  tests/write-error.unit.test.ts                 # UPDATE import → @/lib/data/write-error (canonique ; ancien chemin reste valide via re-export)
  _bmad-output/.../sprint-status.yaml            # UPDATE (statut 2.3 ; géré par le workflow)
  ```
- **Inchangés (réutilisés)** : `app/api/participants/route.ts`, `lib/supabase/{client,admin}.ts`, `lib/store/parse-names.ts`, `components/PassphrasePrompt.tsx`, `app/layout.tsx`, `next.config.ts`, `vercel.json`, `vitest.config.ts`, **migrations SQL** (table déjà créée).
- **Aucune migration DB** : `unavailabilities` existe déjà avec FK CASCADE, RLS read-only, publication realtime + REPLICA IDENTITY FULL (init_schema.sql).

### Testing standards (pour cette story)
- **TDD** : écrire `availability.unit.test.ts` **avant** `lib/domain/availability.ts`, et `unavailabilities-reducer.unit.test.ts` **avant** le réducteur (rouge → vert). C'est le double filet automatique de la story.
- **Périmètre testé automatiquement** : prédicat de domaine + validateurs + réducteur optimiste (purs, CI sans secrets). Store/route/UI **non** unit-testés (cohérent 1.5→2.2 ; pas de RTL/jsdom). Preuve = **vérification manuelle** :
  - Ouvrir le panneau d'un participant (badge 0) → ajouter un **jour** → tag affiché, badge 1, persistant après reload + autre navigateur (FR5/FR13).
  - Ajouter une **plage** valide → tag « date1 → date2 » ; plage **date2 < date1** → refusée (message FR, aucune écriture) ; **jour doublon** → refusé.
  - Supprimer une indispo (✕) → disparaît, absente après reload.
  - Ajouter une indispo **sans passphrase** → un seul prompt (même file que les participants) ; passphrase erronée (401) → re-prompt, optimiste préservé.
  - Supprimer un **participant** ayant des indispos (2.2) → ses indispos disparaissent aussi (cascade DB) après reload.
  - Échec transitoire (5xx) → rollback visible / restauration, action re-tentable.
- **Critère « vert »** : `npm run test:unit` vert (write-error + reconcile + parse-names + participants-reducer + **availability** + **unavailabilities-reducer**) ; `npm test` vert (intégration ; flake Realtime vert au retry) ; `npm run lint` 0 ; `npx tsc --noEmit` 0 ; `npm run build` vert ; grep `.next/static` → 0 secret.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-2 ; #Story-2.3 (7 critères, frontière 4.2) ; FR5 ; FR13 ; NFR4 ; NFR5 ; NFR9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-1 ; #AD-3 ; #AD-5 ; #AD-6 ; #AD-7 ; #AD-8 ; #AD-9 ; #AD-11 ; #AD-13 ; #AD-14 ; #AD-15 ; #AD-16 ; #AD-17 ; #Consistency-Conventions (dates YMD locales, ON DELETE CASCADE) ; #Structural-Seed (api/unavailabilities, lib/domain) ; #Modèle-de-données (table unavailabilities)]
- [Source: docs/prd.md §3 (UX-DR4 panneaux repliables, UX-DR5 badges, UX-DR6 a11y, UX-DR7 ≤520px) ; §4 (modèle) ; FR5 ; Story 2.3 AC (panneau/jour/plage/badge/persistance)]
- [Source: _bmad-output/implementation-artifacts/2-2-*.md#AC5 (file passphrase op-agnostique) ; #AC1/AC7 (réducteur pur extrait, TDD) ; #Dev-Notes (variance structurelle, dates, cascade, flake Realtime, Node 22) ; #Project-Structure-Notes (panneau indispos prévu en 2.3)]
- [Source: daily-wheel/lib/data/participants.ts (writeParticipant/WriteError/writeErrorFromStatus/fetchParticipants L16-77) ; daily-wheel/app/api/participants/route.ts (route complète L1-106) ; daily-wheel/lib/store/participants-store.tsx (runWrite/WriteSpec/file passphrase/Realtime L52-361) ; daily-wheel/lib/store/participants-reducer.ts ; daily-wheel/lib/store/reconcile.ts (L1-58) ; daily-wheel/components/ParticipantsCard.tsx (L1-201) ; daily-wheel/app/page.tsx (SSR L1-53) ; daily-wheel/app/globals.css (tokens --indispo-* L18-21) ; daily-wheel/supabase/migrations/20260622121017_init_schema.sql (unavailabilities L18-25, RLS L74, realtime L86/L93) ; daily-wheel/package.json (test:unit) ; daily-wheel/vitest.config.ts]
- [Source: historique/Spin That Wheel v2.html (isDateIndispo L640-645 ; buildIndispoPanel + validation add L859-940 ; CSS .indispo-* L379-440 ; formatDateFr/parseYMD)]
- [Source: MEMORY:git-remote-push-setup (remote github-perso → Infinter/SpinThatWeeklyWheel)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev-story)

### Debug Log References

- TDD rouge confirmé pour les deux modules purs avant implémentation : `Cannot find package '@/lib/domain/availability'` puis `@/lib/store/unavailabilities-reducer`.
- `npm test` : 79/80 verts ; l'unique échec = `realtime.integration.test.ts` (timeout handshake 20 s, flake connu 1.3→2.2). Rejoué seul via `npm run test:realtime` → vert (890 ms). Pas une régression (teste le canal *participants*, comportement inchangé).
- Intégration live exécutée (secrets présents en `.env.local`) : `write.integration` + `unavailabilities.write.integration` verts.

### Completion Notes List

- **AC1** — `lib/domain/availability.ts` (FEUILLE, aucun import) : `isPersonUnavailable` (parité legacy `isDateIndispo`, bornes incluses, comparaison YMD lexicographique), `isValidRange` (`d2===d1` autorisé, `d2 null`/`d2<d1` refusés), `isDuplicateDay` (jour dédupliqué, plages non). 18 tests purs.
- **AC2** — Taxonomie AD-17 extraite dans `lib/data/write-error.ts` (import local + re-export depuis `participants.ts` → non-régression imports). `lib/data/unavailabilities.ts` : `Unavailability`, `fetchUnavailabilities`, `writeUnavailability` (`insert`/`delete`, pas d'`update`).
- **AC3** — `app/api/unavailabilities/route.ts` : mirroir route participants, allowlist `participant_id/kind/date1/date2`, validation serveur défensive (kind ∈ day|range, range → date2 ≥ date1, day → date2 forcé null), 409 si delete 0 ligne, `update` → 400.
- **AC4** — `reconcile.ts` généralisé en `reconcileById<T>` (+ `ChangeEvent<T>`, `reconcileParticipants`/`reconcileUnavailabilities` alias). `unavailabilities-reducer.ts` pur (cycle insert+delete). 14 tests purs ; `reconcile.unit` reste vert (9).
- **AC5** — `participants-store.tsx` : `WriteSpec`/`runWrite` table-agnostiques (specs portant `write`/`onConfirm`/`rollback`/`onPending?`/`onFailed?`/`onConflictRehydrate?`/`retryKey`/`deleteIdempotent`). Specs participants réécrites **sans changement de sémantique observable**. Slice indispos (`addUnavailability` valide d'abord via AC1, `removeUnavailability`, `retryUnavailability`) + 2ᵉ canal `unavailabilities-rt`. **Un seul prompt passphrase** couvre les deux tables (file inchangée).
- **AC6** — `UnavailabilityPanel.tsx` (select type, dates natives, tags triés + ✕, état vide, a11y `aria-label`/`aria-expanded`, contrôles `pending` désactivés) ; `ParticipantsCard.tsx` : bouton « Indispos » + badge + ligne repliable `colSpan={3}`. Formatage FR **local** (`lib/format/date-fr.ts`).
- **AC7** — CSS `.indispo-*`/`.indispo-badge` (charte, tokens existants, sans dégradé, ≤520px empilé) ; SSR `page.tsx` (`fetchUnavailabilities` parallèle + `initialUnavailabilities`).
- **AC8** — `test:unit` étendu (6 suites / 70 tests purs). `lint` 0, `tsc` 0, `build` vert, grep `.next/static` 0 secret.
- **Décision d'altitude tranchée** : validateurs co-localisés dans `availability.ts` (un seul module pur testé en CI) ; état indispos = slice du provider participants existant (préserve l'invariant AD-8 « un seul prompt »), conformément à la recommandation de la story.
- **Hors-scope respecté** : aucun effet sur la génération du planning (Story 4.2) ; aucune migration DB (table déjà créée en 1.2).

### File List

**Nouveaux :**
- `daily-wheel/lib/domain/availability.ts`
- `daily-wheel/lib/data/write-error.ts`
- `daily-wheel/lib/data/unavailabilities.ts`
- `daily-wheel/app/api/unavailabilities/route.ts`
- `daily-wheel/lib/store/unavailabilities-reducer.ts`
- `daily-wheel/lib/format/date-fr.ts`
- `daily-wheel/components/UnavailabilityPanel.tsx`
- `daily-wheel/tests/availability.unit.test.ts`
- `daily-wheel/tests/unavailabilities-reducer.unit.test.ts`
- `daily-wheel/tests/unavailabilities.write.integration.test.ts`

**Modifiés :**
- `daily-wheel/lib/data/participants.ts` (taxonomie AD-17 extraite → import local + re-export)
- `daily-wheel/lib/store/reconcile.ts` (généralisé `reconcileById<T>` + `ChangeEvent<T>` + alias)
- `daily-wheel/lib/store/participants-store.tsx` (`runWrite` table-agnostique + slice indispos + 2ᵉ canal RT)
- `daily-wheel/components/ParticipantsCard.tsx` (bouton « Indispos » + badge + ligne repliable)
- `daily-wheel/app/page.tsx` (SSR `initialUnavailabilities`)
- `daily-wheel/app/globals.css` (classes `.indispo-*` + `.indispo-badge`)
- `daily-wheel/package.json` (`test:unit` étendu)
- `daily-wheel/tests/write-error.unit.test.ts` (import → `@/lib/data/write-error`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut 2.3)

### Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-06-23 | 1.0 | Story 2.3 implémentée (Amelia/dev-story) : domaine pur `isPersonUnavailable` + validateurs, couche data + route proxy `unavailabilities`, réducteur optimiste pur + `reconcileById<T>` générique, store table-agnostique (un seul prompt passphrase, 2ᵉ canal Realtime), UI panneau repliable + badge, CSS + SSR. 6 suites unitaires / 70 tests verts, lint/tsc/build verts, 0 secret. Statut → review. |
