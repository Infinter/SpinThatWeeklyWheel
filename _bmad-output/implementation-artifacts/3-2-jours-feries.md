---
baseline_commit: c52983c
---

# Story 3.2: Jours fériés (nouveau)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want saisir manuellement des jours fériés (date + libellé) communs à toute l'équipe,
so that aucun animateur n'y soit planifié sans avoir à le renseigner par personne (FR7) — **2ᵉ story d'Epic 3 (contraintes d'équipe)**. Elle ouvre la **table `holidays`** (créée vide en 1.2) à l'écriture, **ajoute la branche `holidays`** au prédicat unique `isTeamNonSessionDay` (signature figée en 3.1 — AD-3), et ajoute une **4ᵉ table** au team store. C'est une **feature neuve** (FR7 « Nouveau ») : **aucune parité legacy** (rien dans `historique/Spin That Wheel v2.html`).

## Acceptance Criteria

> Ces AC décomposent les 5 critères de l'epic (epics.md#Story-3.2) en unités implémentables et testables. Le **cœur testable en CI sans secrets** (AD-13) est **double** : (a) le **sous-prédicat de domaine pur** `isHoliday` branché dans `isTeamNonSessionDay` (`lib/domain/team-availability.ts`) ; (b) le **réducteur optimiste pur** des jours fériés (`lib/store/holidays-reducer.ts`), calqué sur `group-exclusions-reducer.ts` (3.1). Les patterns d'écriture (`runWrite` table-agnostique, file passphrase, taxonomie AD-17, route proxy, allowlist serveur, `reconcileById<T>`) **existent déjà** (1.4 → 3.1) et sont **réutilisés**, pas réécrits.
>
> **✅ Décision d'architecture TRANCHÉE (Solo, 2026-06-23) : extraire `useWriteQueue()` MAINTENANT, en Task 1.** La mémoire projet [[store-extraction-plan]] enregistrait le plan : **extraire un hook partagé `useWriteQueue()` AVANT 3.2/3.3** (file + passphrase + `runWrite` + taxonomie), avant d'empiler une 4ᵉ (puis 5ᵉ) slice. **Confirmé** : AC5/Task 1 = extraction obligatoire (refactor à comportement strictement identique), puis la 4ᵉ slice consomme le hook extrait. **L'off-ramp « étendre en place » est écarté** — ne pas le suivre. Le **rename** `participants-store`→`team-store` reste **déféré** (churn d'imports sans valeur ; fichier et `useParticipants` conservés).

1. **Domaine pur : sous-prédicat `isHoliday` + câblage dans `isTeamNonSessionDay` (cœur testable — AD-3, AD-13, AC9).** Étendre `daily-wheel/lib/domain/team-availability.ts` (PUR, **feuille** : aucun import React/DOM/Supabase/`lib/data`/`lib/format` — état actuel respecté). **Ne PAS toucher la signature** ni les types (`TeamConstraints.holidays?: { date: string }[]` est **déjà déclaré** L33 depuis 3.1) :
   - Ajouter `export function isHoliday(holidays: { date: string }[], date: string): boolean` = `true` ssi `holidays.some(h => h.date === date)` (égalité stricte de chaînes YMD — les dates sont déjà normalisées `YYYY-MM-DD` local, aucune conversion `Date` requise). Liste vide → `false`.
   - **Brancher** dans `isTeamNonSessionDay` (L78-80) : `return isGroupExcluded(ctx.groupExclusions ?? [], date) || isHoliday(ctx.holidays ?? [], date)`. La branche `teamOffDays` (3.3) et `skipWeekends` (4.1) restent **non câblées** (à ajouter en `||` plus tard, sans toucher la signature).
   - **TDD rouge d'abord** : étendre `daily-wheel/tests/group-exclusions.unit.test.ts` (ou créer `daily-wheel/tests/holidays.unit.test.ts` — **préférer un fichier dédié** pour cohérence avec le découpage par table) avec un `import { isHoliday } from '@/lib/domain/team-availability'` (ROUGE car export absent), puis ajouter la fonction → VERT. Couvrir : `isHoliday` (vide→false ; date présente→true ; date absente→false ; ne matche pas une date « proche » différente) ; `isTeamNonSessionDay` **avec `holidays`** (jour férié fourni → **true** désormais ; combiné avec une exclusion de groupe → toujours true ; ctx sans `holidays` → délègue aux exclusions seules). **Les cas `isTeamNonSessionDay` de 3.1 qui passaient `holidays` "sans effet" doivent être révisés** : un test 3.1 affirmait qu'un `holidays` fourni n'avait **aucun** effet — ce n'est **plus vrai** en 3.2. Mettre à jour ce(s) cas pour refléter le câblage (chercher dans `group-exclusions.unit.test.ts` les assertions du type « holidays fournis = sans effet » et les corriger en « neutralise »).
   [Source: daily-wheel/lib/domain/team-availability.ts (signature `isTeamNonSessionDay` L78-80, `TeamConstraints.holidays` L33 déjà déclaré, `isGroupExcluded` L63-73 modèle de sous-prédicat pur) ; daily-wheel/tests/group-exclusions.unit.test.ts (bloc `isTeamNonSessionDay` ~L80-103 : assertions « sans effet » à réviser) ; ARCHITECTURE-SPINE.md#AD-3 (prédicat unique, signature figée, source de vérité du jour neutralisé branchée en 4.2) ; #AD-1 (domaine feuille) ; #AD-13 (tests purs CI)]

   > **Note d'altitude :** `holidays` étant un simple ensemble de dates, `isHoliday` n'a **pas besoin** d'arithmétique calendaire (`weekdayOf`/`dayNumber`) — comparaison de chaînes suffit (dates déjà en YMD local). Pas de validateur de récurrence ici (contrairement à 3.1). La **seule** règle métier est l'**unicité de la date** (validée client + contrainte DB) ; voir AC3/AC6.

2. **Type + couche data `holidays` (AD-7, AD-11, AD-14).** Créer `daily-wheel/lib/data/holidays.ts` (seul point de contact Supabase pour cette table — AD-11), **copie structurelle** de `lib/data/group-exclusions.ts` :
   - `export type Holiday = { id: string; date: string; label: string; updated_at: string }` (timestamps = chaînes ISO, **jamais** `Date`).
   - `fetchHolidays(): Promise<Holiday[]>` — lecture via clé low-privilege (`supabasePublic.from('holidays').select('*')`), `data ?? []` sur erreur, exactement comme `fetchGroupExclusions` (AD-7).
   - `export type HolidayWriteOp = 'insert' | 'delete'` (**pas d'`update`** : on ajoute et on supprime unitairement — epics.md#Story-3.2 ; pas d'édition).
   - `export type HolidayWritePayload = { id?: string; data?: { date: string; label: string } }`
   - `writeHoliday(op, payload, passphrase): Promise<unknown>` — `POST /api/holidays`, header `x-team-passphrase`, corps `{ op, ...payload }` ; lève un `WriteError` typé. **Importer `WriteError` depuis `@/lib/data/write-error`** (module partagé) — pas via `participants.ts`.
   [Source: daily-wheel/lib/data/group-exclusions.ts (intégralité L1-55 : type L9-16, fetch L18-22, ops L26-30, writeGroupExclusion L34-55 — modèle exact) ; daily-wheel/lib/data/write-error.ts (taxonomie AD-17 partagée) ; daily-wheel/supabase/migrations/20260622121017_init_schema.sql (table holidays L35-40 : `date date not null unique`, `label text not null`) ; ARCHITECTURE-SPINE.md#AD-7 ; #AD-11 ; #AD-14 ; #AD-17]

3. **Route proxy `/api/holidays` (AD-8, AD-9, AD-14).** Créer `daily-wheel/app/api/holidays/route.ts` — **mirroir exact** de `app/api/group-exclusions/route.ts`, adapté :
   - `runtime = 'nodejs'` ; garde passphrase `x-team-passphrase` via `safeEqual`/`timingSafeEqual` (AD-8), retour **avant** tout accès Supabase ; `mapDbError` **identique** (`23505`→409, `PGRST116`→409, sinon 500). **Le 409 sur `23505` couvre le doublon de date** (contrainte `holidays.date` unique).
   - Allowlist `const ALLOWED = ['date', 'label'] as const` (AD-14 : `id`/`updated_at` = serveur).
   - Ops : **`insert`** (`pickAllowed` → `.insert(picked).select().single()`) et **`delete`** (`id` requis ; `.delete().eq('id', id).select('id')` ; **409 si 0 ligne** — état périmé). **PAS d'op `update`** : renvoyer `400` si `op` n'est ni `insert` ni `delete`.
   - **Validation serveur défensive** (AD-17:400) avant insert (dernière ligne de défense) : `date` = chaîne non vide (format YMD `^\d{4}-\d{2}-\d{2}$` recommandé) ; `label` = chaîne **non vide** après trim (la colonne est `not null` ; un label vide est métier-invalide). *(La validation primaire est cliente AC6 ; le serveur reste la dernière ligne. L'unicité est garantie par la DB → 23505→409, pas besoin de la pré-vérifier côté serveur.)*
   - **Ne PAS** modifier les routes participants / unavailabilities / group-exclusions ni `lib/supabase/admin.ts`.
   [Source: daily-wheel/app/api/group-exclusions/route.ts (intégralité L1-121 — garde L73-79, `safeEqual` L25-30, `pickAllowed` L33-41, `mapDbError` L44-48, `validateInsert` L52-69 modèle, ops insert/delete L98-119, 409 si 0 ligne L102, rejet update L91) ; ARCHITECTURE-SPINE.md#AD-8 ; #AD-9 ; #AD-14 ; #AD-17]

4. **Réducteur optimiste pur des jours fériés + réconciliation Realtime (AD-5, AD-13, AC9).** Sur le modèle **exact** de `group-exclusions-reducer.ts` (3.1) :
   - Créer `daily-wheel/lib/store/holidays-reducer.ts` (PUR) : `export type StoreHoliday = Holiday & { pending?: boolean; failed?: boolean }`, `type Action`, `export function holidaysReducer(state, action)`. Transitions **identiques** (cycle **insert + delete**, pas de patch) : `HYDRATE { rows }` ; `REALTIME { event }` (délègue à `reconcileHolidays`) ; `ADD_OPTIMISTIC { tempId, row }` ; `SET_PENDING { id }` ; `CONFIRM { tempId, row }` ; `ROLLBACK { tempId }` ; `MARK_FAILED { id }` ; `RESTORE { row }` (upsert) ; `REMOVE { id }`. PUR : aucun import React/DOM/Supabase/`Date`. **Références stables** quand rien ne change (préserver `state` à l'identique sur no-op — cf. test de pureté 3.1).
   - **Réconciliation Realtime** : **réutiliser le générique `reconcileById<T>` existant** (`lib/store/reconcile.ts` — AD-15 dédup `id`+`updated_at`, AD-16 LWW lexicographique). Ajouter, sur le modèle des alias existants (L66-90) : `export type HolidayChangeEvent = ChangeEvent<Holiday>` + `export function reconcileHolidays(state: Holiday[], event: HolidayChangeEvent): Holiday[] { return reconcileById(state, event) }`, et l'import du type `Holiday`. **Aucune modif de la logique générique** — juste un alias typé de plus.
   - **TDD rouge d'abord** : `daily-wheel/tests/holidays-reducer.unit.test.ts` (import absent → ROUGE) couvrant les transitions + quelques cas `reconcileHolidays` (dédup écho `id`+`updated_at`, INSERT inconnu = upsert, DELETE, LWW déjà couvert par `reconcile.unit`). → VERT. Helper `h(over)` calqué sur le helper `g(over)` de `group-exclusions-reducer.unit.test.ts`.
   [Source: daily-wheel/lib/store/group-exclusions-reducer.ts (intégralité L1-63 : `StoreGroupExclusion` L12, `Action` L14-23, reducer L25-63 — modèle exact) ; daily-wheel/lib/store/reconcile.ts (`reconcileById<T>` L24-63 inchangé, `ChangeEvent<T>` L17-20, alias L66-90 modèle) ; daily-wheel/tests/group-exclusions-reducer.unit.test.ts (modèle test pur + helper `g`) ; ARCHITECTURE-SPINE.md#AD-5 ; #AD-13 ; #AD-15 ; #AD-16]

5. **Refactor préparatoire : extraire `useWriteQueue()` (file passphrase + `runWrite` + taxonomie AD-17), à comportement IDENTIQUE ([[store-extraction-plan]]).** *(Voir off-ramp en tête d'AC.)* Le provider porte aujourd'hui 3 slices + la machinerie d'écriture inline. Avant d'ajouter la 4ᵉ slice (puis 3.3, 4.1), **extraire la machinerie partagée** dans `daily-wheel/lib/store/use-write-queue.ts` :
   - Le hook `useWriteQueue({ setError }: { setError: (msg: string | null) => void })` encapsule **tout ce qui est table-agnostique** : `PASSPHRASE_KEY` + `readPassphrase`/`storePassphrase`/`clearPassphrase`, le type `WriteSpec` (exporté), `writeSeqRef`, `pendingWritesRef`, `failedWritesRef`, l'état `passphraseNeeded`, et les callbacks `runWrite(spec)`, `submitPassphrase(value)`, `cancelPassphrase()`. Il expose un `retry(key: string)` générique (lookup `failedWritesRef` + rejeu) que les `retryX` du provider appellent.
   - **Retour du hook** : `{ runWrite, retry, passphraseNeeded, submitPassphrase, cancelPassphrase }` (+ `WriteSpec` exporté du module). `setError` reste **propriété du provider** (la validation cliente des slices l'utilise aussi) → injecté en argument. `WriteError` est importé dans le hook (taxonomie AD-17).
   - **Le provider** (renommé `daily-wheel/lib/store/participants-store.tsx` **conservé** pour limiter le churn d'imports — voir note rename) consomme `const { runWrite, retry, passphraseNeeded, submitPassphrase, cancelPassphrase } = useWriteQueue({ setError })` et garde **uniquement** : les 4 `useReducer` (slices) + `stateRef*`, les méthodes métier par slice (`addParticipants`, `toggleActive`, …, `addHoliday`, `removeHoliday`), les `retryX` (délèguent à `retry(id)`), les abonnements Realtime, et la valeur de contexte.
   - **Invariant CRITIQUE — comportement byte-identique** : participants + indispos + exclusions doivent se comporter **exactement** comme avant (un seul prompt pour N mutations toutes tables confondues, AD-8 ; rollback/retry/conflict/idempotent-delete inchangés, AD-17/AD-16). Preuve : `lint` 0, `tsc` 0, `build` vert, **toutes** les suites unitaires existantes vertes (les reducers/domaine ne dépendent pas du store → restent vertes), et vérification manuelle des 3 chemins existants + intégration live si secrets présents.
   - **Note rename (optionnelle, déférable) :** [[store-extraction-plan]] évoque aussi renommer `participants-store` → `team-store` (`useParticipants` → `useTeam`). C'est un rename **cosmétique** touchant 4 imports (`page.tsx`, `ParticipantsCard`, `UnavailabilityPanel`, `GroupExclusionsPanel`). **Défaut recommandé : NE PAS renommer** dans cette story (churn sans valeur fonctionnelle ; l'extraction du hook est le vrai gain). Garder le nom de fichier et `useParticipants`. *(Si Solo veut le rename, l'isoler comme dernier sous-pas, après que tout soit vert.)*
   [Source: daily-wheel/lib/store/participants-store.tsx (passphrase helpers L47-59, `WriteSpec` L85-96, `runWrite` L176-235, refs L155-159, `submitPassphrase` L517-529, `cancelPassphrase` L531-537, `retryX` L348-357/L437-445/L507-515) ; [[store-extraction-plan]] ; ARCHITECTURE-SPINE.md#AD-8 ; #AD-17 ; #AD-16 ; 2-3-*.md (file table-agnostique)]

6. **Store : 4ᵉ slice jours fériés + 4ᵉ canal Realtime — toujours UN SEUL prompt passphrase (AD-8, AD-5, AD-17).** Étendre le provider (`participants-store.tsx`) avec la slice `holidays`, **consommant `useWriteQueue` (AC5)**. *(Off-ramp : si AC5 différé, consommer le `runWrite` inline existant — comportement identique.)*
   - **Slice** : `const [holidays, dispatchH] = useReducer(holidaysReducer, initialHolidays as StoreHoliday[])` + `stateRefH` (maintenu par `useEffect`, modèle `stateRefG` L163/L170-172) + `hseqRef` (ids temporaires `htemp:<n>`). Exposer dans `StoreValue` : `holidays: StoreHoliday[]`, `addHoliday(input: { date: string; label: string })`, `removeHoliday(id)`, `retryHoliday(id)`.
   - `addHoliday` : **valider d'abord** (client) → si invalide, `setError(message FR)` + **aucune écriture** :
     - `date` vide → « Veuillez saisir une date. »
     - `label` vide après trim → « Veuillez saisir un libellé. »
     - **doublon** : `stateRefH.current.some(h => h.date === date)` → « Ce jour férié est déjà ajouté. » *(pré-check client ; l'autorité reste la contrainte DB unique → 409 via `onConflictRehydrate` si une autre session a inséré la même date entre-temps.)*
     - Sinon : `tempId = 'htemp:<n>'`, `row: Holiday = { id: tempId, date, label: label.trim(), updated_at: '' }`, `dispatchH(ADD_OPTIMISTIC { tempId, row })`, puis `runWrite({ write: pp => writeHoliday('insert', { data: { date, label: label.trim() } }, pp), onPending: () => dispatchH(SET_PENDING{id:tempId}), onConfirm: r => dispatchH(CONFIRM{tempId, row: r as Holiday}), onFailed: () => dispatchH(MARK_FAILED{id:tempId}), rollback: () => dispatchH(ROLLBACK{tempId}), onConflictRehydrate: async () => { try { dispatchH(HYDRATE{rows: await fetchHolidays()}) } catch {} }, retryKey: tempId })`. (Calque exact d'`addGroupExclusion` L450-485.)
   - `removeHoliday(id)` : snapshot via `stateRefH` → `dispatchH(REMOVE{id})` → `runWrite({ write: pp => writeHoliday('delete', { id }, pp), onConfirm: () => {}, rollback: () => dispatchH(RESTORE{row: snapshot}), deleteIdempotent: true, retryKey: null })` (delete idempotent : 409 introuvable = succès — calque `removeGroupExclusion` L488-505). `toServerHoliday(h: StoreHoliday): Holiday` calqué sur `toServerGroupExclusion` L75-83.
   - `retryHoliday(id)` : délègue à `retry(id)` (AC5) — ou calque `retryGroupExclusion` L507-515 si AC5 différé.
   - **4ᵉ abonnement Realtime** : un canal `holidays-rt` sur `public.holidays` (event `*`) → `dispatchH(REALTIME{event})` via `mapChange<Holiday>(payload)` ; re-hydratation `fetchHolidays` → `dispatchH(HYDRATE)` au `SUBSCRIBED` (AD-6). Calque exact du canal `group-exclusions-rt` (L597-622).
   - **Invariant AD-8 préservé** : N mutations (participants + indispos + exclusions + **fériés** confondus) sans passphrase → UN seul prompt → rejeu groupé. La file est déjà op- et table-agnostique → accepte les specs fériés sans changement de contrat.
   [Source: daily-wheel/lib/store/participants-store.tsx (slice exclusions L145-148/L163/L170-172, `gseqRef` L154, `addGroupExclusion` L450-485, `removeGroupExclusion` L488-505, `retryGroupExclusion` L507-515, `toServerGroupExclusion` L75-83, canal `group-exclusions-rt` L597-622, `mapChange` L656-669, `StoreValue` L105-125, `value` L624-644, signature provider L129-139) ; ARCHITECTURE-SPINE.md#AD-5 ; #AD-6 ; #AD-8 ; #AD-17]

7. **UI : panneau repliable « Jours fériés » + badge, dans la carte Options (UX-DR4, UX-DR5, FR7, NFR4/NFR5).** Créer `daily-wheel/components/HolidaysPanel.tsx` (auto-contenu : toggle repliable + badge + formulaire + liste de tags) et le **monter dans la carte Options** (sous `<GroupExclusionsPanel />`) :
   - **Toggle + badge** (UX-DR4/UX-DR5) : bouton repliable « Jours fériés » avec flèche (`▶`/rotation à l'ouverture) et **badge de comptage** = `holidays.length` (masqué si 0). État d'ouverture **local** (`useState`, jamais dans le store). `aria-expanded` sur le bouton.
   - **Formulaire** : un `<input type="date">` (date) + un `<input type="text">` libellé (placeholder « Libellé (ex. Jour de l'An) ») + bouton « ＋ Ajouter ». Au clic / submit → `addHoliday({ date, label })` puis reset des deux champs. La validation (date + label requis, doublon) est portée par le store (AC6) → afficher l'erreur FR du store ; **ne PAS dupliquer** la logique de validation dans le composant.
   - **Liste des tags** : sous le formulaire, un jour férié par tag, **trié par `date` croissante** (`[...holidays].sort((a,b) => a.date.localeCompare(b.date))`), **supprimable** via ✕ → `removeHoliday(h.id)`. Label = `${formatDateFr(h.date)} — ${h.label}` (ex. « mercredi 1 janvier 2026 — Jour de l'An »). État vide : « Aucun jour férié défini. ». Désactiver le ✕ d'un tag `pending` ; classe `.failed` si `failed`.
   - Réutiliser `formatDateFr` de `@/lib/format/date-fr.ts` (parse **local**). **Tout en français** (NFR4), **charte CSS existante**, **sans dégradé**, lisible **≤ 520 px** (NFR5, UX-DR7). A11y (UX-DR6) : `<input>` natifs avec labels explicites, bouton toggle `aria-expanded`. Consomme `useParticipants()` (le team store) → rendu **dans** `<ParticipantsStoreProvider>`.
   [Source: daily-wheel/components/GroupExclusionsPanel.tsx (intégralité L1-127 : toggle+badge+`aria-expanded` L34-47, badge conditionnel L44-46, formulaire L53-90, tags triés+✕+`.filter(Boolean).join(' ')` L92-122, `disabled={pending}` L112, état vide L94, conso `useParticipants` L17 — modèle exact) ; daily-wheel/lib/format/date-fr.ts (`formatDateFr`/`parseYMD` locaux) ; docs/prd.md §3 (UX-DR4/5/6/7) ; ARCHITECTURE-SPINE.md#Consistency-Conventions (dates locales)]

8. **CSS panneau fériés responsive + montage Options + SSR hydration (AC7, AD-6).**
   - **CSS** : porter dans `daily-wheel/app/globals.css` un bloc `.holidays-*` calqué sur `.group-excl-*` (L369-473) : `.holidays-toggle` (+`:hover`), `.holidays-toggle-label`, `.holidays-toggle-badge`, `.holidays-arrow` (+`.open` rotation 90°), `.holidays-panel` (+`.open`), `.holidays-panel-title`, `.holidays-form` (+ `label`/`input`/`button`), `.holidays-tags`, `.holidays-tag` (+ `.pending`/`.failed` + bouton ✕), `.holidays-empty`. **Réutiliser les tokens existants** (`--primary`, `--primary-dark`, `--primary-light`, `--radius-sm`, `--card-bg`, `--text-muted` ; tokens `--excl-*`/`--indispo-*` si une couleur de tag est utile — **ne pas inventer** de `--holidays-*` sauf besoin réel). **Aucun dégradé** ; `≤ 520 px` : formulaire empilé, inputs pleine largeur (étendre le bloc media L475-503) ; `prefers-reduced-motion` (L505-508) déjà global. *(Alternative légitime : factoriser un jeu de classes génériques `.team-panel-*` partagé par exclusions + fériés + off — **hors-scope de cette story** sauf décision ; par défaut, dupliquer le bloc comme l'a fait 3.1.)*
   - **Montage Options + SSR** : `daily-wheel/app/page.tsx` — le provider **enveloppe déjà** la carte Options (lift fait en 3.1). Ajouter `fetchHolidays().catch((): Holiday[] => [])` au `Promise.all` (4ᵉ élément), passer `initialHolidays` au provider (adapter la signature : `{ initial, initialUnavailabilities, initialGroupExclusions, initialHolidays, children }`), et monter `<HolidaysPanel />` sous `<GroupExclusionsPanel />` dans la `<section className="card">` Options. Carte Résultat **inchangée** (hors provider).
   [Source: daily-wheel/app/globals.css (bloc `.group-excl-*` L369-473 modèle, tokens L1-26, media ≤520px L475-503, reduced-motion L505-508) ; daily-wheel/app/page.tsx (Promise.all L16-20, provider+Options L38-49, signature provider à étendre) ; daily-wheel/lib/store/participants-store.tsx (signature provider L129-139) ; ARCHITECTURE-SPINE.md#AD-6]

9. **Tests + non-régression globale (AD-13, NFR9).**
   - **Filet CI pur (obligatoire)** : `tests/holidays.unit.test.ts` (AC1) **et** `tests/holidays-reducer.unit.test.ts` (AC4) écrits **rouge → vert** ; **ajoutés à `test:unit`** dans `package.json` (liste explicite L14). **Réviser** le bloc `isTeamNonSessionDay` de `group-exclusions.unit.test.ts` (assertions « holidays sans effet » → « neutralise », AC1).
   - **Intégration live (optionnelle, gated)** : un `tests/holidays.write.integration.test.ts` calqué sur `group-exclusions.write.integration.test.ts` (insert férié → **doublon de date → 409** → delete → 409 re-delete ; validation serveur 400 sur date vide / label vide ; `update`→400 ; gate `SUPABASE_TEST_LIVE`) est **bienvenu mais non requis** pour le « vert » CI.
   - **Non-régression (NFR9)** : toutes les suites existantes restent **vertes** (`write-error`/`reconcile`/`parse-names`/`participants-reducer`/`availability`/`unavailabilities-reducer`/`group-exclusions`/`group-exclusions-reducer`) ; les chemins **participants + indispos + exclusions** conservent un comportement **identique** (l'extraction `useWriteQueue` + la 4ᵉ slice ne changent ni le contrat `WriteSpec` ni la file) ; `reconcileById<T>` et ses alias existants inchangés. `npm run lint` 0, `npx tsc --noEmit` 0, `npm run build` vert. Grep `.next/static` : **aucun** secret (`SUPABASE_SECRET_KEY`/`TEAM_PASSPHRASE`/`service_role` + valeur passphrase → 0).
   [Source: daily-wheel/package.json (`test:unit` L14, `test` L10, `test:realtime` L11) ; daily-wheel/tests/group-exclusions.write.integration.test.ts (modèle gated, helper `req` L13-17, gate `SUPABASE_TEST_LIVE` L8-9) ; daily-wheel/vitest.config.ts (gate, stub `server-only`) ; ARCHITECTURE-SPINE.md#AD-13 ; 3-1-*.md#AC8 (critère « vert »)]

## Tasks / Subtasks

> ⚠️ **Tout le code et toutes les commandes `npm` sont sous `daily-wheel/`** (variance structurelle héritée 1.1→3.1). Le workflow CI à la racine n'est **pas** touché par cette story.

- [x] **Tâche 1 — Refactor : extraire `useWriteQueue()` (comportement identique)** (AC: 5) — **OBLIGATOIRE (décision tranchée par Solo, off-ramp écarté)**
  - [x] Créer `daily-wheel/lib/store/use-write-queue.ts` : déplacer `PASSPHRASE_KEY`+helpers, `WriteSpec` (exporté), `writeSeqRef`/`pendingWritesRef`/`failedWritesRef`, `passphraseNeeded`, `runWrite`, `submitPassphrase`, `cancelPassphrase`, `retry(key)`. Signature `useWriteQueue({ setError })`.
  - [x] `participants-store.tsx` : consommer le hook ; garder slices + méthodes métier + `retryX`→`retry(id)` + canaux Realtime + value. `WriteError` importé dans le hook.
  - [x] **Ne PAS renommer** le fichier/`useParticipants` (défaut). Comportement identique vérifié : `lint` 0, `tsc` 0, 8 suites/108 tests verts (chemins participants/indispos/exclusions inchangés). `build` validé en Task 9.

- [x] **Tâche 2 — Domaine pur : `isHoliday` + câblage `isTeamNonSessionDay` (rouge → vert)** (AC: 1, 9)
  - [x] Écrit `daily-wheel/tests/holidays.unit.test.ts` (ROUGE confirmé : `isHoliday` absent) : `isHoliday` (vide/présent/absent/proche) ; `isTeamNonSessionDay` avec `holidays` (neutralise ; combiné exclusions ; ctx sans holidays délègue).
  - [x] `team-availability.ts` : `isHoliday` ajouté + branché en `||` dans `isTeamNonSessionDay`. **Signature/types inchangés.**
  - [x] **Révisé** l'assertion « holidays sans effet » de `group-exclusions.unit.test.ts` (→ « teamOffDays/skipWeekends sans effet », holidays renvoyé vers holidays.unit). VERT (32 tests).

- [x] **Tâche 3 — Data : type + `fetch`/`write` fériés** (AC: 2, 9)
  - [x] Créé `daily-wheel/lib/data/holidays.ts` : `Holiday`, `fetchHolidays`, `HolidayWriteOp`/`Payload` (insert+delete), `writeHoliday` (POST `/api/holidays`, `WriteError` depuis `@/lib/data/write-error`). Copie structurelle de `group-exclusions.ts`. `tsc` vert.

- [x] **Tâche 4 — Route proxy `/api/holidays`** (AC: 3)
  - [x] Créé `daily-wheel/app/api/holidays/route.ts` : mirroir route group-exclusions ; allowlist `['date','label']` ; ops `insert`/`delete` (rejet `update`→400) ; validation serveur (`date` YMD non vide, `label` non vide) ; 409 si delete 0 ligne ; `23505`→409 (doublon date) ; garde `timingSafeEqual` identique.
  - [x] Autres routes et `lib/supabase/` non touchées.

- [x] **Tâche 5 — Réducteur optimiste pur fériés + alias réconciliation (rouge → vert)** (AC: 4, 9)
  - [x] Ajouté `reconcileHolidays` (alias `reconcileById<Holiday>`) + `HolidayChangeEvent` + import `Holiday` dans `lib/store/reconcile.ts` (générique inchangé).
  - [x] Écrit `daily-wheel/tests/holidays-reducer.unit.test.ts` (ROUGE) : transitions + cas `reconcileHolidays`. Helper `h(over)`.
  - [x] Créé `daily-wheel/lib/store/holidays-reducer.ts` (`StoreHoliday`, `Action`, `holidaysReducer`). PUR. VERT (14 tests).

- [x] **Tâche 6 — Store : 4ᵉ slice fériés + 4ᵉ canal Realtime** (AC: 6, 9)
  - [x] `participants-store.tsx` : `useReducer(holidaysReducer)` + `stateRefH` + `hseqRef` + `toServerHoliday` ; `addHoliday` (valide date/label/doublon → message FR + aucune écriture si invalide ; sinon optimiste + insert), `removeHoliday` (REMOVE + delete idempotent), `retryHoliday`→`retry(id)`. Exposés dans `StoreValue` + `value`.
  - [x] 4ᵉ abonnement `holidays-rt` + re-hydratation `SUBSCRIBED` (AD-6) via `mapChange<Holiday>`. Signature provider + `initialHolidays`. **File/`runWrite` non modifiés** (consommés via `useWriteQueue`) → un seul prompt couvre 4 tables.

- [x] **Tâche 7 — UI : panneau repliable « Jours fériés » + badge** (AC: 7)
  - [x] Créé `daily-wheel/components/HolidaysPanel.tsx` (toggle `aria-expanded` + badge, `<input type=date>` + `<input type=text>` libellé + « ＋ Ajouter », tags triés par date `${formatDateFr(date)} — ${label}` + ✕, état vide « Aucun jour férié défini. », affichage erreur store, `pending` désactivé). Consomme `useParticipants()`. `formatDateFr` réutilisé.

- [x] **Tâche 8 — CSS + montage Options + SSR hydration** (AC: 8)
  - [x] Classes `.holidays-*` portées dans `app/globals.css` (charte, tokens existants, sans dégradé, formulaire empilé ≤520px, reduced-motion global).
  - [x] `app/page.tsx` : `fetchHolidays()` ajouté au `Promise.all` (`.catch(() => [])`) + `initialHolidays` au provider ; `<HolidaysPanel />` monté sous `<GroupExclusionsPanel />` dans Options. Signature `ParticipantsStoreProvider` adaptée. Carte Résultat inchangée.

- [x] **Tâche 9 — Scripts de test + non-régression** (AC: 9)
  - [x] `package.json` : `holidays.unit` + `holidays-reducer.unit` ajoutés à `test:unit`.
  - [x] `tests/holidays.write.integration.test.ts` gated écrit + **vert en live** (insert → doublon 409 → 400 date/label vides → update 400 → delete → 409).
  - [x] Non-régression : `npm run lint` 0, `npx tsc --noEmit` 0, `npm run test:unit` vert (10 suites/130), `npm test` vert (16 suites/144, **sans flake** Realtime cette fois), `npm run build` vert (`/api/holidays` enregistrée). Grep `.next/static` : 0 secret (noms + valeur passphrase).

## Dev Notes

### Contexte & périmètre
- **2ᵉ story d'Epic 3 (contraintes d'équipe)** : ouvre `holidays` (créée vide en 1.2) à l'écriture, **ajoute la branche `holidays`** au prédicat unique `isTeamNonSessionDay` (signature figée en 3.1, source AD-3, consommée en 4.2), et ajoute une **4ᵉ table** au team store. [Source: epics.md#Epic-3 ; #Story-3.2]
- **Feature NEUVE (FR7 « Nouveau ») — aucune parité legacy** : `grep -ni "ferie|férié|holiday" historique/` → **0 résultat**. On conçoit le comportement (date + libellé, unicité, tri par date) **sans** fixture legacy à mirrorer. Cela **diffère de 3.1** (qui mirrorait `isDateGroupExcluded`). [Source: historique/Spin That Wheel v2.html (grep vide) ; epics.md#FR7]
- **In-scope :** sous-prédicat pur `isHoliday` + câblage `isTeamNonSessionDay` ; couche data + route proxy `holidays` ; réducteur optimiste pur + alias réconciliation ; **extraction `useWriteQueue` (AC5, recommandé)** ; 4ᵉ slice store + 4ᵉ canal Realtime (un seul prompt) ; UI panneau repliable + badge dans Options ; CSS ; SSR hydration + montage.
- **Hors-scope :** **effet sur la génération du planning** → l'exclusion effective des jours fériés via `isTeamNonSessionDay` (boucle de génération + deadline EDF) est vérifiée en **Story 4.2** (epics.md#Story-3.2 : « l'absence d'animateur et l'absence de trou à la génération sont vérifiées en Story 4.2 »). On livre la **donnée + le prédicat testé**, pas la génération. **Jours off d'équipe** → 3.3 ; **week-ends** → 4.1. **Édition d'un férié** existant → non prévue (ajout/suppression unitaires). **Rename `team-store`** → optionnel/déféré (AC5). **Factorisation de classes CSS génériques** → hors-scope sauf décision.

### ⚠️ Variance structurelle héritée (CRITIQUE — rappel 1.1→3.1)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Tout le code, tous les `npm`, tout grep `.next/` → **depuis `daily-wheel/`**. [Source: 3-1-*.md#Variance-structurelle]
- État réel pertinent (sous `daily-wheel/`, vérifié au commit `c52983c`) — **réutiliser, ne pas casser** :
  - `supabase/migrations/20260622121017_init_schema.sql` : table `holidays` **DÉJÀ créée** (L35-40 : `id uuid PK default gen_random_uuid()`, `date date not null unique`, `label text not null`, `updated_at timestamptz default now()`), RLS **SELECT anon** (L76), **dans la publication realtime** (L88) + `REPLICA IDENTITY FULL` (L95). **Aucune migration à écrire.**
  - `lib/domain/team-availability.ts` : `isTeamNonSessionDay` (L78-80, branche exclusions seule), `TeamConstraints.holidays?: { date: string }[]` **déjà déclaré** (L33). Cette story **ajoute** `isHoliday` + le câble — **sans toucher la signature**.
  - `lib/data/group-exclusions.ts` + `lib/data/write-error.ts` : **modèles exacts** de la couche data (type + fetch + ops insert/delete + `WriteError` partagé).
  - `app/api/group-exclusions/route.ts` : **modèle exact** de la route (garde `timingSafeEqual`, `pickAllowed`, `mapDbError`, ops insert/delete, 409 si 0 ligne, `validateInsert`).
  - `lib/store/participants-store.tsx` : `runWrite`/`WriteSpec`/file passphrase **table-agnostiques** (2.3) ; `addGroupExclusion`/`removeGroupExclusion`/`retryGroupExclusion` (L450-515) + `toServerGroupExclusion` (L75-83) + canal `group-exclusions-rt` (L597-622) = **modèles** de la 4ᵉ slice. **AC5 extrait** cette machinerie dans `use-write-queue.ts`.
  - `lib/store/reconcile.ts` : `reconcileById<T>` + `ChangeEvent<T>` + alias (L66-90) → **réutiliser** (ajout d'un simple alias `reconcileHolidays`).
  - `lib/store/group-exclusions-reducer.ts` : **modèle exact** du réducteur pur (cycle insert+delete).
  - `components/GroupExclusionsPanel.tsx` : **modèle** du panneau repliable (form + tags triés + ✕ + état vide + a11y + désactivation `pending`). `components/PassphrasePrompt.tsx` : **inchangé** (déclenché par le store, couvre désormais 4 tables).
  - `lib/format/date-fr.ts` : `formatDateFr`/`parseYMD` **déjà créés** (parse **local**) → réutiliser, ne PAS recréer.
  - `app/globals.css` : tokens (L1-26), `.group-excl-*` (L369-473 modèle), media `≤520px` (L475-503), reduced-motion (L505-508) → réutiliser/étendre. **Pas de token `--holidays-*`** → réutiliser l'existant.
  - `app/page.tsx` : Server Component `force-dynamic`, `Promise.all` SSR (L16-20, 3 fetchs), provider enveloppant **déjà** `ParticipantsCard` **et** la carte Options (L38-49, lift fait en 3.1) → **ajouter** le 4ᵉ fetch, `initialHolidays`, et monter `<HolidaysPanel />` sous `<GroupExclusionsPanel />`.
  - `package.json` : `test:unit` = liste explicite (L14) → **y ajouter** les 2 nouveaux fichiers. **Aucune** lib d'état/UI/date (React + natifs) — **ne pas** ajouter de dépendance.
  - `vitest.config.ts` : alias `@`, stub `server-only`, gate `SUPABASE_TEST_LIVE` — **ne pas retoucher**.

### Décision d'architecture : extraction `useWriteQueue` AVANT la 4ᵉ slice (AC5)
- **Contexte.** [[store-extraction-plan]] (Solo, 2026-06-23, story 3.1) : on a **étendu en place** pour la 3ᵉ table (`group_exclusions`) — churn nul, machinerie prouvée — **en planifiant d'extraire un hook partagé `useWriteQueue()` AVANT 3.2/3.3** (qui ajoutent 2 slices de plus ; +`settings` en 4.1 → ~5 slices/canaux). On y est : **3.2 est le point d'extraction prévu.**
- **Recommandation (défaut de cette story).** Extraire `useWriteQueue` en **Task 1** (refactor à comportement strictement identique : la file/`runWrite`/taxonomie/passphrase sont déjà table-agnostiques → l'extraction est mécanique), **puis** ajouter la 4ᵉ slice qui le consomme. Bénéfice : provider allégé (slices + métier + Realtime seulement), 3.3/4.1 deviennent triviales.
- **Off-ramp (si Solo préfère).** **Étendre en place une 4ᵉ fois** (comme 3.1) et différer l'extraction à 3.3. Dans ce cas : sauter Task 1, et AC6 consomme le `runWrite` inline existant — **strictement le même résultat fonctionnel**, juste un provider plus lourd. *(Escalade : voir question en fin de story.)*
- **Rename `team-store` :** déféré par défaut (churn d'imports sans valeur fonctionnelle). Le fichier reste `participants-store.tsx`, l'export reste `useParticipants`.
- **Comportement byte-identique = invariant non négociable** quel que soit le choix : participants + indispos + exclusions inchangés (un seul prompt N→1, AD-8 ; rollback/retry/conflict/idempotent-delete, AD-17/AD-16).

### Décisions d'architecture qui cadrent cette story
- **AD-3 (source unique `isTeamNonSessionDay`)** : on **ajoute** la branche `holidays` (`|| isHoliday(ctx.holidays ?? [], date)`) sans toucher la signature `(date, ctx)`. `teamOffDays` (3.3) et `skipWeekends` (4.1) restent non câblés. L'intégration effective (génération + deadline EDF) = **Story 4.2**.
- **Unicité de date = règle métier centrale** : contrainte DB `holidays.date unique` → `23505` → `mapDbError` 409 → chemin `conflict` de `runWrite` (rehydrate). Pré-check client (`some(h => h.date === date)`) pour un message FR immédiat ; la **DB reste l'autorité**.
- **AD-5/AD-17 (optimiste + taxonomie)** : insert férié = `ADD_OPTIMISTIC` + `writeHoliday('insert')` ; delete = `REMOVE` + `writeHoliday('delete')` ; rollback/restore + classes auth/validation/conflict/transient **identiques** aux exclusions. Delete 409 « introuvable » = succès idempotent (AD-16).
- **AD-8 (passphrase)** : la file table-agnostique accepte les specs fériés → **un seul** prompt pour N mutations **toutes tables confondues** (participants + indispos + exclusions + fériés).
- **AD-14 (contrat d'écriture)** : `{ op, id?, data? }` + allowlist **serveur** `date,label`. Une route **par table** → `/api/holidays`. Pas d'`update`.
- **AD-15/AD-16 (réconciliation)** : `reconcileById<Holiday>` dédup `id`+`updated_at`, LWW lexicographique — identique aux autres tables.
- **AD-11/AD-7 (chemins asymétriques)** : lecture `holidays` via clé low-privilege (`fetchHolidays` + abonnement) ; écriture **uniquement** via `/api/holidays`. Aucun composant ne touche `supabase.from(...)` ni `fetch('/api/...')` — tout via le store → `lib/data/`.
- **AD-13 (CI pure)** : seuls `holidays.unit` + `holidays-reducer.unit` (+ existants) tournent en CI **sans secrets**. Store/route/UI/hook **non** unit-testés (cohérent 1.5→3.1 ; pas de RTL/jsdom — **ne pas** ajouter de dépendance) ; preuve = **vérification manuelle**.
- **Convention dates (CRITIQUE)** : tout en `YYYY-MM-DD` **local**. `<input type=date>` produit déjà du `YYYY-MM-DD`. `formatDateFr` parse en **local** (`new Date(y,m-1,d)`), jamais `new Date('YYYY-MM-DD')` (UTC → décalage). `isHoliday` = comparaison de **chaînes** YMD → aucun recours à `Date`.

### Previous Story Intelligence (3.1 / 2.3)
- **3.1 = patron direct.** `group-exclusions.*` (data, route, reducer, panel, tests) sont les **modèles structurels exacts** des `holidays.*`. Différences : (a) pas de récurrence → pas de `weekdayOf`/validateurs de fréquence ; (b) **pas de parité legacy** ; (c) 2 colonnes simples (`date`, `label`) ; (d) **unicité** au lieu de la validation « réf. tombe sur le jour ».
- **Test pur rouge→vert** : `group-exclusions.unit` / `group-exclusions-reducer.unit` = modèles. Reproduire pour `holidays`.
- **`isTeamNonSessionDay` change de comportement** : un test 3.1 affirmait que `holidays` fourni était « sans effet » — **à corriger** (c'est désormais neutralisant). Ne pas laisser ce test masquer une régression.
- **File passphrase table-agnostique** : les specs fériés s'y insèrent **sans changer le contrat** ; participants/indispos/exclusions restent **byte-identiques** (surtout après l'extraction AC5).
- **`retry` rejoue l'op d'origine** : `failedWritesRef` par clé ; `retryHoliday` rejoue le `WriteSpec` insert (le delete restaure la ligne, pas de retry).
- **Flake Realtime connu (1.3→3.1)** : 1er `npm test` peut timeouter sur le handshake puis passer au retry — transitoire, **pas** une régression. Avec un **4ᵉ** canal, surveiller mais ne pas « corriger » un flake de handshake.
- **CI Node 22.x** + Vercel `framework=nextjs` (`vercel.json`) : **ne pas** retoucher CI/Vercel.
- **Dépendances Epic 1/2/3.1 en review** (non `done`) mais commitées et fonctionnelles : construire dessus.
- **Push Git** : remote via alias SSH `github-perso` → `Infinter/SpinThatWeeklyWheel` (compte SoloOz). [Source: MEMORY:git-remote-push-setup]

### Points techniques (Next.js 16 / React 19 — janv. 2026)
- **Pas de nouvelle techno, aucune recherche web requise.** Stack figée (Next 16.2.x, React 19.2, supabase-js 2.108.x). Story 100 % domaine pur + data + route + store + UI + CSS, sur patterns existants.
- **`isHoliday` sans `Date`** : `holidays.some(h => h.date === date)` — comparaison de chaînes YMD. Déterministe, pur, sans timezone.
- **`<input type="date">`** : valeur native `YYYY-MM-DD`. **`<input type="text">`** : libellé trimé avant écriture. Pas de lib de date.
- **Snapshot avant optimiste** : pour `removeHoliday`, lire la ligne via `stateRefH.current.find(...)` **avant** `REMOVE` pour le `RESTORE`. `stateRefH` maintenu par `useEffect` (modèle `stateRefG` L163/L170-172).
- **Quatre canaux Realtime** : `participants-rt` + `unavailabilities-rt` + `group-exclusions-rt` (existants, inchangés) + `holidays-rt` (nouveau) ; chacun se re-hydrate au `SUBSCRIBED`. Dédup d'écho par `reconcileById`.

### Project Structure Notes
- Arborescence touchée (tout sous `daily-wheel/`) :
  ```
  lib/store/use-write-queue.ts                   # NEW (hook partagé file+passphrase+runWrite — AC5, si extraction retenue)
  lib/domain/team-availability.ts                # UPDATE (isHoliday + branche holidays dans isTeamNonSessionDay ; signature inchangée — AC1)
  lib/data/holidays.ts                           # NEW (type + fetch + write insert/delete — AC2)
  app/api/holidays/route.ts                      # NEW (proxy écriture insert/delete — AC3)
  lib/store/holidays-reducer.ts                  # NEW (réducteur optimiste PUR — AC4)
  lib/store/reconcile.ts                          # UPDATE léger (alias reconcileHolidays + HolidayChangeEvent — AC4, générique inchangé)
  lib/store/participants-store.tsx               # UPDATE (consomme useWriteQueue + 4ᵉ slice fériés + 4ᵉ canal RT — AC5/AC6)
  components/HolidaysPanel.tsx                   # NEW (panneau repliable Options — AC7)
  app/globals.css                                # UPDATE (classes .holidays-* — AC8)
  app/page.tsx                                   # UPDATE (fetchHolidays + initialHolidays + montage panneau — AC8)
  package.json                                   # UPDATE (holidays.unit + holidays-reducer.unit dans test:unit — AC9)
  tests/holidays.unit.test.ts                    # NEW (preuve domaine pur — AC1)
  tests/holidays-reducer.unit.test.ts            # NEW (preuve réducteur pur — AC4)
  tests/group-exclusions.unit.test.ts            # UPDATE (réviser assertions « holidays sans effet » — AC1)
  tests/holidays.write.integration.test.ts       # NEW optionnel gated (AC9)
  _bmad-output/.../sprint-status.yaml            # UPDATE (statut 3.2 ; géré par le workflow)
  ```
- **Inchangés (réutilisés)** : `app/api/{participants,unavailabilities,group-exclusions}/route.ts`, `lib/supabase/{client,admin}.ts`, `lib/data/{participants,unavailabilities,group-exclusions,write-error}.ts`, `lib/store/{parse-names,participants-reducer,unavailabilities-reducer,group-exclusions-reducer}.ts`, `lib/domain/availability.ts`, `lib/format/date-fr.ts`, `components/{ParticipantsCard,UnavailabilityPanel,GroupExclusionsPanel,PassphrasePrompt}.tsx`, `app/layout.tsx`, `next.config.ts`, `vercel.json`, `vitest.config.ts`, **migrations SQL** (table déjà créée). *(Note : `participants-store.tsx` est modifié par l'extraction AC5 mais son API publique `useParticipants`/`StoreValue` ne perd aucun membre — additive seulement.)*
- **Aucune migration DB** : `holidays` existe déjà avec RLS read-only, publication realtime + REPLICA IDENTITY FULL (init_schema.sql L35-40/L76/L88/L95).

### Testing standards (pour cette story)
- **TDD** : écrire `holidays.unit.test.ts` **avant** `isHoliday`, et `holidays-reducer.unit.test.ts` **avant** le réducteur (rouge → vert). Double filet automatique.
- **Périmètre testé automatiquement** : sous-prédicat de domaine + réducteur optimiste (purs, CI sans secrets). Store/route/UI/hook **non** unit-testés (cohérent 1.5→3.1). Preuve = **vérification manuelle** :
  - Ouvrir le panneau « Jours fériés » (badge 0) → ajouter (date + libellé) → tag « <date longue FR> — <libellé> » affiché, badge 1, **trié par date**, persistant après reload + autre navigateur (FR7/FR13).
  - Saisir une **date déjà présente** → refus (message FR, aucune écriture) ; libellé vide → refus ; date vide → refus.
  - Supprimer un férié (✕) → disparaît, absent après reload.
  - Ajouter **sans passphrase** → un seul prompt (même file que participants/indispos/exclusions) ; passphrase erronée (401) → re-prompt, optimiste préservé.
  - Échec transitoire (5xx) → rollback visible / restauration, action re-tentable.
  - **Non-régression manuelle** (surtout si extraction AC5) : ajouter/renommer/supprimer un participant, ajouter/supprimer une indispo, ajouter/supprimer une exclusion → comportement **identique** à avant.
- **Critère « vert »** : `npm run test:unit` vert (write-error + reconcile + parse-names + participants-reducer + availability + unavailabilities-reducer + group-exclusions + group-exclusions-reducer + **holidays** + **holidays-reducer** = 10 suites) ; `npm test` vert (flake Realtime vert au retry) ; `npm run lint` 0 ; `npx tsc --noEmit` 0 ; `npm run build` vert ; grep `.next/static` → 0 secret.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3 ; #Story-3.2 (5 critères, frontière 4.2) ; FR7 ; FR13 ; NFR4 ; NFR5 ; NFR9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-1 ; #AD-3 (isTeamNonSessionDay source unique, signature figée) ; #AD-5 ; #AD-6 ; #AD-7 ; #AD-8 ; #AD-9 ; #AD-11 ; #AD-13 ; #AD-14 ; #AD-15 ; #AD-16 ; #AD-17 ; #Consistency-Conventions (dates YMD locales) ; #Structural-Seed (api/holidays, lib/domain) ; #Modèle-de-données (table holidays : date unique, label)]
- [Source: docs/prd.md §3 (UX-DR4 panneaux repliables, UX-DR5 badges, UX-DR6 a11y, UX-DR7 ≤520px) ; §4 (modèle) ; FR7]
- [Source: _bmad-output/implementation-artifacts/3-1-exclusions-de-groupe-recurrentes.md (#AC1 domaine pur + signature `isTeamNonSessionDay` ; #AC2 data ; #AC3 route ; #AC4 réducteur + reconcileById<T> ; #AC5 store table-agnostique ; #AC6 panneau ; #AC7 CSS + lift provider ; #AC8 critère vert ; #Décision-de-design extraction provider)]
- [Source: daily-wheel/lib/domain/team-availability.ts (isTeamNonSessionDay L78-80, TeamConstraints.holidays L33, isGroupExcluded L63-73) ; daily-wheel/lib/data/group-exclusions.ts (modèle data) ; daily-wheel/lib/data/write-error.ts ; daily-wheel/app/api/group-exclusions/route.ts (route complète L1-121, modèle) ; daily-wheel/lib/store/participants-store.tsx (runWrite/WriteSpec/file L85-235, addGroupExclusion L450-485, removeGroupExclusion L488-505, retryGroupExclusion L507-515, toServerGroupExclusion L75-83, canal group-exclusions-rt L597-622, mapChange L656-669, StoreValue L105-125, provider L129-139) ; daily-wheel/lib/store/group-exclusions-reducer.ts ; daily-wheel/lib/store/reconcile.ts (reconcileById<T> + ChangeEvent<T> + alias L66-90) ; daily-wheel/components/GroupExclusionsPanel.tsx (panneau L1-127) ; daily-wheel/app/page.tsx (SSR L16-20, provider+Options L38-49) ; daily-wheel/app/globals.css (tokens L1-26, .group-excl-* L369-473, media L475-503, reduced-motion L505-508) ; daily-wheel/lib/format/date-fr.ts ; daily-wheel/supabase/migrations/20260622121017_init_schema.sql (holidays L35-40, RLS L76, realtime L88/L95) ; daily-wheel/package.json (test:unit L14) ; daily-wheel/vitest.config.ts]
- [Source: historique/Spin That Wheel v2.html (grep fériés → 0 résultat : FEATURE NEUVE, aucune parité)]
- [Source: MEMORY:store-extraction-plan (extraire useWriteQueue avant 3.2/3.3) ; MEMORY:git-remote-push-setup (remote github-perso → Infinter/SpinThatWeeklyWheel)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / create-story)

### Debug Log References

- TDD rouge confirmé pour les deux modules purs avant implémentation : `holidays.unit.test.ts` (6 échecs : `isHoliday` non exporté) puis `holidays-reducer.unit.test.ts` (`Cannot find module '@/lib/store/holidays-reducer'`).
- **Garde worktree inattendue en cours de session** (`bgIsolation`) après plusieurs éditions réussies en place ; la session étant lancée en mode « travail en place », opt-out posé dans `.claude/settings.json` (`"worktree": {"bgIsolation": "none"}`) pour rétablir l'édition en place — **changement d'environnement, hors code de la story**.
- `react-hooks/refs` a refusé l'écriture de ref pendant le render dans `use-write-queue.ts` (1ère version) ; corrigé en utilisant `setError` directement avec dépendance `[setError]` (setter useState stable → identité de `runWrite` inchangée). Lint repassé à 0.
- `npm test` : 16 suites / 144 tests verts **du premier coup** (pas de flake Realtime) ; intégration live exécutée (secrets en `.env.local`) : `holidays.write.integration` verte (insert → doublon 409 → 400 date vide → 400 label vide → update 400 → delete → 409).

### Completion Notes List

- **AC5 (Task 1) — Extraction `useWriteQueue()` (décision Solo).** `lib/store/use-write-queue.ts` (NEW) encapsule passphrase (read/store/clear), `WriteSpec` (exporté), `writeSeqRef`/`pendingWritesRef`/`failedWritesRef`, `passphraseNeeded`, `runWrite` (taxonomie AD-17), `submitPassphrase`, `cancelPassphrase`, `retry(key)`. `participants-store.tsx` le consomme via `useWriteQueue({ setError })` ; les `retryX` délèguent à `retry(id)`. **Comportement byte-identique** : tsc 0, lint 0, 8 suites/108 verts juste après l'extraction (chemins participants/indispos/exclusions inchangés). Rename `team-store` **déféré** (fichier + `useParticipants` conservés).
- **AC1** — `team-availability.ts` : `isHoliday(holidays, date)` (appartenance d'ensemble YMD, sans `Date`) + branche `|| isHoliday(ctx.holidays ?? [], date)` dans `isTeamNonSessionDay` (**signature/types inchangés** — `holidays` déjà déclaré en 3.1). `teamOffDays`/`skipWeekends` toujours non câblés (3.3/4.1). Test 3.1 « holidays sans effet » révisé. 10 tests purs (holidays.unit).
- **AC2** — `lib/data/holidays.ts` : `Holiday` (`date` unique, `label`), `fetchHolidays`, `writeHoliday` (`insert`/`delete`, pas d'`update`), `WriteError` partagé. Copie structurelle de `group-exclusions.ts`.
- **AC3** — `app/api/holidays/route.ts` : mirroir route group-exclusions, allowlist `date/label`, validation serveur (`date` YMD via regex, `label` non vide après trim), `23505`→409 (doublon date), 409 si delete 0 ligne, `update`→400. Autres routes et `lib/supabase/` non touchées.
- **AC4** — `reconcile.ts` : alias `reconcileHolidays` + `HolidayChangeEvent` + import `Holiday` (générique `reconcileById<T>` **inchangé**). `holidays-reducer.ts` pur (cycle insert+delete). 14 tests purs ; `reconcile.unit` reste vert.
- **AC6** — `participants-store.tsx` : 4ᵉ slice fériés (`useReducer` + `stateRefH` + `hseqRef` + `toServerHoliday`), `addHoliday` (valide date/label/doublon client → message FR + aucune écriture si invalide ; optimiste + insert sinon ; doublon DB = autorité via 23505→409→rehydrate), `removeHoliday` (REMOVE + delete idempotent), `retryHoliday` ; 4ᵉ canal `holidays-rt` + re-hydratation `SUBSCRIBED`. **Un seul prompt** couvre désormais les 4 tables.
- **AC7** — `HolidaysPanel.tsx` (toggle repliable `aria-expanded` + badge, `<input type=date>` + libellé texte, « ＋ Ajouter », tags triés par date `${formatDateFr(date)} — ${label}` + ✕, état vide « Aucun jour férié défini. », contrôles `pending` désactivés). `formatDateFr` réutilisé.
- **AC8** — CSS `.holidays-*` (charte bleue, sans dégradé, ≤520px empilé, tokens existants) ; `page.tsx` : `fetchHolidays` parallèle + `initialHolidays` ; `<HolidaysPanel />` monté sous `<GroupExclusionsPanel />` (provider enveloppait déjà Options depuis 3.1) ; carte Résultat inchangée.
- **AC9** — `test:unit` étendu (10 suites / 130 tests purs). `tests/holidays.write.integration.test.ts` gated écrit + vert en live. `lint` 0, `tsc` 0, `build` vert, `npm test` 16 suites / 144 tests, grep `.next/static` → **0 secret** (noms + valeur passphrase).
- **Hors-scope respecté** : aucun effet sur la génération du planning (branche `isHoliday` consommée en 4.2) ; aucune migration DB (table créée en 1.2) ; pas d'édition de férié (insert/delete unitaires) ; pas de rename `team-store`.
- **Feature NEUVE (FR7)** : aucune parité legacy (grep `historique/` vide), comportement conçu sur les patterns établis (data/route/reducer/store/panneau de 3.1).

### File List

**Nouveaux :**
- `daily-wheel/lib/store/use-write-queue.ts`
- `daily-wheel/lib/data/holidays.ts`
- `daily-wheel/app/api/holidays/route.ts`
- `daily-wheel/lib/store/holidays-reducer.ts`
- `daily-wheel/components/HolidaysPanel.tsx`
- `daily-wheel/tests/holidays.unit.test.ts`
- `daily-wheel/tests/holidays-reducer.unit.test.ts`
- `daily-wheel/tests/holidays.write.integration.test.ts`

**Modifiés :**
- `daily-wheel/lib/domain/team-availability.ts` (`isHoliday` + branche dans `isTeamNonSessionDay` ; signature inchangée)
- `daily-wheel/lib/store/reconcile.ts` (alias `reconcileHolidays` + `HolidayChangeEvent` ; générique inchangé)
- `daily-wheel/lib/store/participants-store.tsx` (consomme `useWriteQueue` + 4ᵉ slice fériés + 4ᵉ canal Realtime ; machinerie d'écriture extraite, comportement identique)
- `daily-wheel/components/` — (aucun composant existant modifié)
- `daily-wheel/app/page.tsx` (SSR `initialHolidays` + montage `<HolidaysPanel />`)
- `daily-wheel/app/globals.css` (classes `.holidays-*` + responsive ≤520px)
- `daily-wheel/package.json` (`test:unit` étendu : +2 suites)
- `daily-wheel/tests/group-exclusions.unit.test.ts` (assertion « holidays sans effet » révisée)
- `.claude/settings.json` (opt-out `worktree.bgIsolation=none` — ajustement d'environnement, hors code applicatif)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut 3.2)

### Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-06-23 | 0.1 | Story 3.2 contextée (Amelia/create-story) : prête pour dev. Branche `holidays` du prédicat unique AD-3 ; couche data + route proxy `holidays` ; réducteur optimiste pur + alias `reconcileHolidays` ; **extraction `useWriteQueue` recommandée (AC5)** + 4ᵉ slice store + 4ᵉ canal Realtime ; UI panneau repliable + badge dans Options ; CSS + SSR. Feature NEUVE (FR7) sans parité legacy. |
| 2026-06-23 | 1.0 | Story 3.2 implémentée (Amelia/dev-story). **Extraction `useWriteQueue()`** (refactor comportement identique, [[store-extraction-plan]]) ; `isHoliday` + branche dans `isTeamNonSessionDay` (signature AD-3 inchangée) ; couche data + route proxy `/api/holidays` (unicité date → 409) ; réducteur optimiste pur + alias `reconcileHolidays` ; 4ᵉ slice store + 4ᵉ canal Realtime (un seul prompt passphrase pour 4 tables) ; `HolidaysPanel` + CSS + SSR. 10 suites unitaires / 130 tests verts, `npm test` 16/144 (intégration live incluse, sans flake), lint/tsc/build verts, 0 secret. Statut → review. |
