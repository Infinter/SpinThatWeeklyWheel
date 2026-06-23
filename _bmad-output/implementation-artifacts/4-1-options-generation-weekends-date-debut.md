---
baseline_commit: 316e198
---

# Story 4.1: Options de génération (week-ends, date de début)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want régler « ignorer les week-ends » et la date de début,
so that je cadre la période du planning (FR9, FR10) — **1ʳᵉ story d'Epic 4 (génération & affichage)**. Elle ouvre la **table `settings`** (créée vide en 1.2) à l'écriture selon le **patron SINGLETON / upsert** (≠ les 5 tables-liste insert/delete livrées en 1.5→3.3), **câble la DERNIÈRE branche `skipWeekends`** dans le prédicat unique `isTeamNonSessionDay` (signature figée en 3.1 — AD-3 ; après cette story le prédicat est **complet**), et ajoute une **6ᵉ slice** au team store. C'est une **feature neuve** (FR9/FR10) : pas de fixture de parité ici (la parité legacy est prouvée en 4.2 via le test golden, qui consommera ces réglages).

## Acceptance Criteria

> Ces AC décomposent les 4 critères de l'epic (epics.md#Story-4.1) en unités implémentables et testables. La story a **deux faces** :
> - **(A) Domaine pur (week-ends)** : ajouter `isWeekend(date)` et **câbler** `ctx.skipWeekends && isWeekend(date)` dans `isTeamNonSessionDay`. C'est le **cœur testable en CI sans secrets** (AD-13) côté contraintes — même rythme que 3.1/3.2/3.3 (chaque story ajoutait sa branche + un test pur). Après 4.1, **les 4 branches sont câblées** ; la signature `(date, ctx)` reste **inchangée**. L'**effet à la génération** (boucle + deadline EDF) reste **Story 4.2**.
> - **(B) Persistance `settings` (singleton/upsert)** : `settings` est une **ligne unique** `id = 'singleton'` écrite par **upsert** (conventions spine — « jamais d'insert multiple »). C'est un **patron NEUF** par rapport aux 5 slices existantes : **état scalaire** (un objet, pas une liste), **pas de tempId / pas de rotation insert-delete**, **un seul `op: 'upsert'`** (≠ `insert`/`delete`), réducteur **scalaire**, et réconciliation Realtime **LWW sur une seule ligne** (pas `reconcileById<T>` qui opère sur des listes). Le réducteur scalaire pur `settingsReducer` est le **2ᵉ cœur testable en CI** (AD-13).
>
> ⚠️ **La table `settings` est VIDE au départ** : la migration crée la table avec des `default` (`skip_weekends=true`, `start_date=null`) **mais n'insère aucune ligne**. Donc `fetchSettings()` renvoie **`null`** tant que personne n'a écrit → le store **matérialise un défaut** `{ skip_weekends:true, start_date:null }`, et la **1ʳᵉ écriture est un upsert** (insert si absent, update sinon). Le « défaut = aujourd'hui » de la date de début est un **défaut d'AFFICHAGE** (UI : `start_date ?? todayYMD()`), **non persisté** tant que l'utilisateur ne choisit pas de date.
>
> ✅ **Tous les patterns d'écriture transverses existent déjà** (`useWriteQueue`, route proxy gardée passphrase, allowlist serveur, `mapChange<T>`, taxonomie `WriteError`) et sont **réutilisés** — la file `useWriteQueue` est **table- ET op-agnostique** (extraite en 3.2). Aucun refactor préparatoire. Le seul vrai NEUF est la **forme scalaire** (reducer + reconcile + slice + route upsert).

1. **Domaine pur : `isWeekend` + câblage `skipWeekends` dans `isTeamNonSessionDay` (cœur testable — AD-3, AD-13).** Étendre `daily-wheel/lib/domain/team-availability.ts` (PUR, **feuille** : aucun import React/DOM/Supabase/`lib/data`/`lib/format` — état actuel respecté). **Ne PAS toucher la signature** `isTeamNonSessionDay(date, ctx)` ni le type `TeamConstraints` (`skipWeekends?: boolean` est **déjà déclaré** L31 depuis 3.1) :
   - Ajouter `export function isWeekend(date: string): boolean { const dow = weekdayOf(date); return dow === 0 || dow === 6 }` (**RÉUTILISER `weekdayOf`** L50-53 déjà présent et testé : `0=dimanche`, `6=samedi`). **Ne PAS réimplémenter** le calcul calendaire ni introduire `Date`.
   - **Brancher** dans `isTeamNonSessionDay` (L93-99) en **première** condition : `return (ctx.skipWeekends === true && isWeekend(date)) || isGroupExcluded(...) || isHoliday(...) || isTeamOffDay(...)`. La branche week-end est **conditionnelle** (`ctx.skipWeekends === true`) — c'est la différence avec les 3 autres branches (toujours actives) : un week-end n'est neutralisé **que si l'option est active**. Après cette story, **les 4 branches sont câblées** → le prédicat est complet.
   - **Mettre à jour les commentaires** du fichier qui annoncent « seule 4.1 (week-ends) ajoutera sa branche » (en-tête L7-9, L27-29, L90-92) → constater que les 4 branches sont désormais câblées et la signature inchangée.
   - **TDD rouge d'abord** : créer `daily-wheel/tests/weekends.unit.test.ts` (préférer un fichier dédié, cohérence avec le découpage par feature) avec `import { isWeekend, isTeamNonSessionDay } from '@/lib/domain/team-availability'` (ROUGE car `isWeekend` absent), puis ajouter la fonction + le câblage → VERT. Couvrir : `isWeekend` (samedi `2026-06-27`→true ; dimanche `2026-06-28`→true ; lundi `2026-06-22`→false ; vendredi `2026-06-26`→false) ; `isTeamNonSessionDay` branche week-end (`skipWeekends:true` + samedi → **true** ; `skipWeekends:false` + samedi → **false** ; `skipWeekends` **absent** + samedi → **false** ; samedi avec `skipWeekends:true` **combiné** à une exclusion/férié → toujours true ; **jour ouvré** `2026-06-23` mardi + `skipWeekends:true` → délègue aux autres branches, false si rien d'autre).
   - **CRITIQUE — réviser un test existant** : `tests/group-exclusions.unit.test.ts` L93-97 affirme « skipWeekends fourni n'a AUCUN effet (branche 4.1 non câblée) » (samedi `2026-06-27` + `skipWeekends:true` → attendu `false`). Cette assertion **devient FAUSSE** : avec la branche câblée, ce cas renvoie désormais **true**. **La réviser** : retirer ce `it(...)` de `group-exclusions.unit.test.ts` (sa couverture week-end est déplacée dans `weekends.unit.test.ts`) **et** ajuster le titre du `describe` L80 (« 3.1 = branche exclusions de groupe seulement ») qui n'est plus exact — le rendre neutre (ex. « source unique des 4 branches d'équipe »). Ne **pas** laisser ce test masquer/inverser la régression.
   [Source: daily-wheel/lib/domain/team-availability.ts (signature `isTeamNonSessionDay` L93-99, `TeamConstraints.skipWeekends` L31 déjà déclaré, `weekdayOf` L50-53 à RÉUTILISER, `isHoliday` L78-80 / `isTeamOffDay` L86-88 modèles de sous-prédicat, commentaires L7-9/L27-29/L90-92 à mettre à jour) ; daily-wheel/tests/group-exclusions.unit.test.ts (assertion à réviser L93-97, titre describe L80) ; daily-wheel/tests/team-off-days.unit.test.ts + tests/holidays.unit.test.ts (modèles de test pur) ; ARCHITECTURE-SPINE.md#AD-3 ; #AD-1 ; #AD-13]

   > **Note d'altitude :** la branche week-end est **conditionnelle** (option), contrairement aux 3 autres qui agrègent inconditionnellement. Le test paramétré « même prédicat dans la boucle de génération ET la deadline EDF » (AD-3) appartient à **4.2** (où `generateSchedule` existe) ; 4.1 prouve seulement que la branche **existe et répond à `skipWeekends`**.

2. **Type + couche data `settings` — patron LECTURE-SINGLETON + UPSERT (AD-7, AD-11, AD-14).** Créer `daily-wheel/lib/data/settings.ts` (seul point de contact Supabase pour cette table — AD-11). **Diffère structurellement** des 5 autres modules data (qui exposent `fetch*(): Promise<T[]>` + ops insert/delete) :
   - `export type Setting = { id: string; skip_weekends: boolean; start_date: string | null; updated_at: string }` (timestamps = chaînes ISO, **jamais** `Date` ; `start_date` **nullable** = colonne `settings.start_date` sans `not null` ; `skip_weekends` non-null).
   - `fetchSettings(): Promise<Setting | null>` — lecture via clé low-privilege : `supabasePublic.from('settings').select('*').eq('id', 'singleton').maybeSingle()`. **`maybeSingle()`** (pas `single()`) car la table est **vide au départ** → renvoie `null` sans erreur. `if (error) throw error; return data ?? null`. (≠ `fetch*` des listes qui renvoient `data ?? []`.)
   - `export type SettingWritePayload = { skip_weekends?: boolean; start_date?: string | null }` (**patch partiel** : on n'envoie que les colonnes changées).
   - `writeSettings(payload: SettingWritePayload, passphrase: string): Promise<unknown>` — `POST /api/settings`, header `x-team-passphrase`, corps `{ op: 'upsert', data: payload }` ; lève un `WriteError` typé. **Importer `WriteError` depuis `@/lib/data/write-error`** (module partagé) ; structure de `fetch`/gestion d'erreur **identique** à `writeHoliday` L33-54.
   - **Op unique `'upsert'`** (≠ `insert`/`delete`) : conforme à la convention spine « Settings : ligne unique `id='singleton'` + upsert ». **Pas** d'`insert`/`update`/`delete` exposés.
   [Source: daily-wheel/lib/data/holidays.ts (intégralité L1-54 : type L9-15, `fetchHolidays` L17-21, write op types L25-29, `writeHoliday` L33-54 — modèle de structure `fetch`/`write`, à ADAPTER en singleton/upsert) ; daily-wheel/lib/data/write-error.ts (taxonomie AD-17 partagée : `WriteError`, `writeErrorFromStatus` 401/400/409/5xx) ; daily-wheel/supabase/migrations/20260622121017_init_schema.sql (table settings L51-56 : `id text PK default 'singleton'`, `skip_weekends boolean not null default true`, `start_date date` nullable, `updated_at`) ; ARCHITECTURE-SPINE.md#AD-7 ; #AD-11 ; #AD-14 ; #Consistency-Conventions (Settings: singleton + upsert)]

3. **Route proxy `/api/settings` — UPSERT singleton (AD-8, AD-9, AD-14, AD-15).** Créer `daily-wheel/app/api/settings/route.ts` — **mirroir de structure** de `app/api/holidays/route.ts` (garde passphrase + allowlist + `json`), mais **op `upsert`** au lieu d'insert/delete :
   - `runtime = 'nodejs'` ; garde passphrase `x-team-passphrase` via `safeEqual`/`timingSafeEqual` (AD-8), retour **avant** tout accès Supabase (copier L65-73 de holidays) ; `json(status, body)` helper identique.
   - Allowlist `const ALLOWED = ['skip_weekends', 'start_date'] as const` (AD-14 : `id`/`updated_at` = serveur ; `id` est **toujours** forcé à `'singleton'`, jamais accepté du client) ; `pickAllowed` identique à holidays L32-40.
   - **Op unique** : si `op !== 'upsert'` → `400` (`"op invalide (attendu: 'upsert')"`). **PAS** d'`insert`/`delete`.
   - **Validation serveur défensive** (AD-17:400) avant écriture : sur le `picked` (allowlist), si `picked.length === 0` → 400 (`"data vide après allowlist (colonnes autorisées : skip_weekends, start_date)"`) ; si `skip_weekends` présent et `typeof !== 'boolean'` → 400 ; si `start_date` présent et **non null** : doit être chaîne YMD (`^\d{4}-\d{2}-\d{2}$`) sinon 400 (`start_date: null` est **valide** = « pas de date de début explicite »).
   - **Upsert** : `supabaseAdmin.from('settings').upsert({ id: 'singleton', ...picked, updated_at: new Date().toISOString() }, { onConflict: 'id' }).select().single()`. **CRITIQUE — `updated_at` explicite côté serveur** : le `default now()` SQL ne s'applique qu'à l'INSERT, **pas** à l'UPDATE d'un upsert → sans `updated_at` explicite, une mise à jour ne ferait pas avancer `updated_at` et **casserait la dédup/LWW Realtime (AD-15/AD-16)**. On le pose donc à chaque write (≠ routes insert-only qui reposent sur le default SQL). `id: 'singleton'` est **toujours** injecté serveur (jamais lu du client).
   - `mapDbError` générique (`PGRST116`→409, sinon 500) — **pas** de cas `23505` (aucune contrainte d'unicité au-delà du PK `id`, et l'upsert résout le conflit de PK).
   - **Ne PAS** modifier les routes participants / unavailabilities / group-exclusions / holidays / team-off-days ni `lib/supabase/admin.ts`.
   [Source: daily-wheel/app/api/holidays/route.ts (intégralité L1-112 — garde passphrase L65-73, `safeEqual` L24-29, `pickAllowed` L32-40, `mapDbError` L44-48, `json` L19-21, `validateInsert` L53-63 modèle de validation, parsing body L76-87) ; daily-wheel/lib/supabase/admin.ts (`supabaseAdmin` clé secrète) ; ARCHITECTURE-SPINE.md#AD-8 ; #AD-9 ; #AD-14 ; #AD-15 ; #Consistency-Conventions (settings upsert, updated_at serveur)]

4. **Réducteur optimiste SCALAIRE des settings + réconciliation Realtime LWW (AD-5, AD-15, AD-16, AD-13).** **Patron NEUF** : l'état est un **objet unique** (pas une liste) → le réducteur ne ressemble PAS aux 6 réducteurs-liste (pas d'`ADD_OPTIMISTIC`/`REMOVE`/`ROLLBACK` par tempId ; pas de `reconcileById`). Créer `daily-wheel/lib/store/settings-reducer.ts` (PUR : aucun import React/DOM/Supabase/`Date`) :
   - `export type StoreSetting = Setting & { pending?: boolean; failed?: boolean }`.
   - `export const DEFAULT_SETTING: Setting = { id: 'singleton', skip_weekends: true, start_date: null, updated_at: '' }` (défaut métier quand la table est vide ; `start_date: null` — le « aujourd'hui » est un défaut d'affichage UI, pas persisté ; pas de `Date` ici).
   - `type Action`, `export function settingsReducer(state: StoreSetting, action: Action): StoreSetting` :
     - `HYDRATE { row: Setting | null }` → `row ? { ...row } : DEFAULT_SETTING` (re-synchro source canonique AD-4 ; table vide → défaut).
     - `REALTIME { event: SettingChangeEvent }` → `reconcileSetting(state, event)` (voir ci-dessous) en conservant les drapeaux uniquement si la ligne n'est pas remplacée.
     - `OPTIMISTIC { patch: SettingWritePayload }` → `{ ...state, ...patch, pending: true, failed: false }` (mise à jour optimiste locale, fusion du patch).
     - `CONFIRM { row: Setting }` → `{ ...row }` (ligne serveur autoritaire, drapeaux effacés).
     - `MARK_FAILED` → `{ ...state, pending: false, failed: true }`.
     - `RESTORE { row: Setting }` → `{ ...row }` (rollback vers le snapshot pré-optimiste).
     - `default` → `state` (référence stable).
   - **Réconciliation Realtime SCALAIRE** : **NE PAS** réutiliser `reconcileById<T>` (il opère sur des **listes**). Ajouter dans `daily-wheel/lib/store/reconcile.ts`, après les alias liste (L100-102) : `export type SettingChangeEvent = ChangeEvent<Setting>` + une fonction dédiée
     ```ts
     export function reconcileSetting(state: Setting, event: SettingChangeEvent): Setting {
       if (event.eventType === 'DELETE') return state // settings n'est jamais supprimé
       const incoming = event.new
       if (!incoming || incoming.id !== 'singleton') return state
       if (state.updated_at === incoming.updated_at) return state // AD-15 : écho de notre write
       if (incoming.updated_at < state.updated_at) return state    // AD-16 : LWW (chaîne ISO)
       return incoming
     }
     ```
     et l'import du type `Setting` (`import type { Setting } from '@/lib/data/settings'`). **Le générique `reconcileById` et tous les alias liste restent INCHANGÉS.**
   - **TDD rouge d'abord** : `daily-wheel/tests/settings-reducer.unit.test.ts` (import absent → ROUGE) couvrant : `HYDRATE` (row → remplace ; `null` → `DEFAULT_SETTING`) ; `OPTIMISTIC` (fusionne `{skip_weekends:false}` puis `{start_date:'2026-07-01'}`, pending=true) ; `CONFIRM` (ligne serveur, drapeaux effacés) ; `MARK_FAILED` ; `RESTORE` (revient au snapshot) ; **`reconcileSetting`** (écho même `updated_at` → ignoré ; `updated_at` plus récent → appliqué ; plus ancien → ignoré ; `DELETE` → état inchangé ; `id !== 'singleton'` → ignoré). → VERT.
   [Source: daily-wheel/lib/store/holidays-reducer.ts (intégralité L1-59 — structure `StoreX`/`Action`/reducer + drapeaux pending/failed à ADAPTER en scalaire) ; daily-wheel/lib/store/reconcile.ts (`reconcileById<T>` L26-65 INCHANGÉ, `ChangeEvent<T>` L19-22, alias liste L67-102 modèle d'emplacement) ; daily-wheel/tests/holidays-reducer.unit.test.ts (modèle de test pur + helper) ; ARCHITECTURE-SPINE.md#AD-5 ; #AD-13 ; #AD-15 ; #AD-16 ; #AD-4]

5. **Store : 6ᵉ slice settings (SCALAIRE) + 6ᵉ canal Realtime — toujours UN SEUL prompt passphrase (AD-8, AD-5, AD-17).** Étendre le provider (`participants-store.tsx`) avec la slice `settings`, **consommant `useWriteQueue` déjà extrait (3.2)**. **Aucun refactor de la file** : elle est table- ET op-agnostique → accepte le spec upsert sans changement de contrat. La slice diffère des 5 autres (scalaire, pas de `seqRef`/tempId) :
   - **Slice** : `const [settings, dispatchS] = useReducer(settingsReducer, (initialSettings ?? DEFAULT_SETTING) as StoreSetting)` + `stateRefS` (maintenu par `useEffect`, modèle `stateRefH` L169/L180-182). **PAS de `sseqRef`** (pas d'ids temporaires : l'id est toujours `'singleton'`).
   - Exposer dans `StoreValue` (L94-122) : `settings: StoreSetting`, `setSkipWeekends(value: boolean)`, `setStartDate(date: string)`, `retrySettings()`. (Pas de `add`/`remove` : settings ne se crée/supprime pas, il se **met à jour**.)
   - **`updateSettings(patch: SettingWritePayload)`** (helper interne, `useCallback([runWrite])`) : snapshot `const snapshot = toServerSetting(stateRefS.current)` **avant** l'optimiste → `dispatchS({ type: 'OPTIMISTIC', patch })` ; puis `runWrite({ write: pp => writeSettings(patch, pp), onPending: () => dispatchS({type:'SET_PENDING'?}) ... })`. ⚠️ il n'y a **pas** de `SET_PENDING` séparé dans le reducer scalaire (l'`OPTIMISTIC` pose déjà `pending:true`) → `onPending` peut être **omis** (le reducer a déjà marqué pending). Spec complet :
     `runWrite({ write: pp => writeSettings(patch, pp), onConfirm: r => dispatchS({ type:'CONFIRM', row: r as Setting }), onFailed: () => dispatchS({ type:'MARK_FAILED' }), rollback: () => dispatchS({ type:'RESTORE', row: snapshot }), onConflictRehydrate: async () => { try { dispatchS({ type:'HYDRATE', row: await fetchSettings() }) } catch {} }, retryKey: 'settings' })`.
   - **`setSkipWeekends(value)`** → `updateSettings({ skip_weekends: value })`. **`setStartDate(date)`** → `updateSettings({ start_date: date })` (le `<input type=date>` fournit déjà du YMD ; pas de validation de plage). **`retrySettings()`** → `useCallback(() => retry('settings'), [retry])`.
   - `toServerSetting(s: StoreSetting): Setting` calqué sur `toServerHoliday` L74-76 : `{ id: s.id, skip_weekends: s.skip_weekends, start_date: s.start_date, updated_at: s.updated_at }`.
   - **6ᵉ abonnement Realtime** : un canal `settings-rt` sur `public.settings` (event `*`) → `dispatchS({ type:'REALTIME', event })` via `mapChange<Setting>(payload)` ; re-hydratation `fetchSettings` → `dispatchS({ type:'HYDRATE', row })` au `SUBSCRIBED` (AD-6). Calque exact du canal `holidays-rt` (L659-684), avec `row` (objet|null) au lieu de `rows` (liste).
   - **Invariant AD-8 préservé** : N mutations (participants + indispos + exclusions + fériés + jours off + **settings** confondus) sans passphrase → UN seul prompt → rejeu groupé. La file (`useWriteQueue`) accepte le spec upsert sans changement.
   - **Provider signature** : ajouter `initialSettings: Setting | null` aux props (modèle `initialHolidays` L130/L137). Ajouter les imports : `fetchSettings`, `writeSettings`, `type Setting`, `type SettingWritePayload` (`@/lib/data/settings`) ; `settingsReducer`, `DEFAULT_SETTING`, `type StoreSetting` (`@/lib/store/settings-reducer`).
   [Source: daily-wheel/lib/store/participants-store.tsx (slice holidays L150/L169/L180-182, `addHoliday` L447-483, `removeHoliday` L486-503, `retryHoliday` L505, `toServerHoliday` L74-76, canal `holidays-rt` L659-684, `mapChange` L752-766, `StoreValue` L94-122, `value` L713-741, signature provider L126-140, imports L1-40, `useWriteQueue` usage L158) ; daily-wheel/lib/store/use-write-queue.ts (contrat `WriteSpec` L30-39, `runWrite`/`retry` table-/op-agnostiques — INCHANGÉ) ; ARCHITECTURE-SPINE.md#AD-5 ; #AD-6 ; #AD-8 ; #AD-17]

   > **Note d'altitude :** pas de `onPending` distinct, pas de `tempId`, pas de `ROLLBACK`-par-temp : le scalaire simplifie. Le `retryKey: 'settings'` est une **clé fixe** (une seule ligne) — un retry rejoue le dernier patch échoué. Le snapshot pré-optimiste sert au `rollback`/`RESTORE` (400) comme pour les autres tables.

6. **UI : options de génération (toggle week-ends + date de début) en tête de la carte Options (UX-DR1, UX-DR3, FR9, FR10, NFR4/NFR5).** Créer `daily-wheel/components/GenerationOptions.tsx` — **bloc NON repliable** (≠ les panneaux de contraintes : ce sont les réglages **primaires** de génération, UX-DR1 « action principale claire » ; les panneaux repliables UX-DR4 sont réservés aux réglages **avancés**) — et le **monter EN PREMIER** dans la carte Options (au-dessus de `<GroupExclusionsPanel />`) :
   - Consomme `useParticipants()` → `{ settings, setSkipWeekends, setStartDate }`.
   - **Toggle « Ignorer les week-ends »** : `<input type="checkbox" checked={settings.skip_weekends} onChange={(e) => setSkipWeekends(e.target.checked)} />` avec `<label>` explicite (NFR4). Édition inline persistée immédiatement (UX-DR3, pas de bouton « Enregistrer »).
   - **Date de début** : `<input type="date" value={settings.start_date ?? todayYMD()} onChange={(e) => setStartDate(e.target.value)} />` avec `<label>` « Date de début : ». La valeur affichée par défaut est **aujourd'hui** (`start_date ?? todayYMD()`) — défaut d'affichage, persisté seulement au changement.
   - **Retour visuel** discret (UX-DR5) : pendant `settings.pending`, un état visuel léger (ex. opacité réduite ou texte « enregistrement… » via classe `.pending`) ; en cas d'erreur, l'erreur du store s'affiche déjà au niveau global (ne pas dupliquer). Pas de badge de comptage (pas une liste).
   - **A11y (UX-DR6)** : `<input>` natifs avec `<label htmlFor>` ; checkbox et date navigables clavier.
   - **`todayYMD()`** : ajouter un helper `export function todayYMD(): string` à `daily-wheel/lib/format/date-fr.ts` (formatage **local** : `const d = new Date(); return \`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}\``). **Local, jamais `toISOString()`** (UTC → décalage d'un jour — convention dates). Réutilisable par 4.2 (date de début effective de génération).
   - **Tout en français** (NFR4), **charte CSS existante**, **sans dégradé**, lisible **≤ 520 px** (NFR5, UX-DR7). Rendu **dans** `<ParticipantsStoreProvider>`.
   [Source: daily-wheel/components/HolidaysPanel.tsx (conso `useParticipants` L14, structure form/label/input L48-69, classes — modèle de composant Options ; à SIMPLIFIER en bloc non repliable) ; daily-wheel/lib/format/date-fr.ts (`formatDateFr`/`parseYMD` locaux L6-19 — y AJOUTER `todayYMD`) ; docs/prd.md §3 (UX-DR1 action principale, UX-DR3 édition inline, UX-DR5 retour visuel, UX-DR6 a11y, UX-DR7 ≤520px) ; ARCHITECTURE-SPINE.md#Consistency-Conventions (dates locales)]

7. **CSS options de génération responsive + montage Options + SSR hydration (AC6, AD-6).**
   - **CSS** : porter dans `daily-wheel/app/globals.css` un bloc `.gen-options-*` (toggle week-ends + champ date) **réutilisant les tokens existants** (`--primary`, `--primary-dark`, `--text-color`, `--text-muted`, `--radius-sm`, `--border`, `--card-bg`). Disposition : une ligne « checkbox + label » et une ligne « label + input date » ; `prefers-reduced-motion` déjà global. **Aucun dégradé** ; `≤ 520 px` : empilement vertical, champs pleine largeur (étendre la media query existante L683-724). Le `<input type=date>` et la `<input type=checkbox>` reprennent un style sobre cohérent avec les `<input>` existants (cf. `.holidays-form input` dans le bloc `.holidays-*` L475-576). État `.pending` discret (ex. `opacity: .6`).
   - **Montage Options + SSR** : `daily-wheel/app/page.tsx` — ajouter `fetchSettings().catch((): Setting | null => null)` au `Promise.all` (6ᵉ élément), passer `initialSettings` au provider, et monter `<GenerationOptions />` **en premier** dans la `<section className="card">` Options (avant `<GroupExclusionsPanel />`, L54-59). Carte Résultat **inchangée**. Ajouter les imports `fetchSettings`, `type Setting` et `GenerationOptions`.
   [Source: daily-wheel/app/globals.css (tokens `:root` L2-26, bloc `.holidays-*` L475-576 dont styles d'input, media ≤520px L683-724, reduced-motion) ; daily-wheel/app/page.tsx (Promise.all 5 fetchs L20-27, provider+Options L45-59, signature provider à étendre L45-51, imports L1-10) ; daily-wheel/lib/store/participants-store.tsx (signature provider L126-140) ; ARCHITECTURE-SPINE.md#AD-6]

8. **Tests + non-régression globale (AD-13, NFR9).**
   - **Filet CI pur (obligatoire)** : `tests/weekends.unit.test.ts` (AC1) **et** `tests/settings-reducer.unit.test.ts` (AC4) écrits **rouge → vert** ; **ajoutés à `test:unit`** dans `package.json` (liste explicite L14, après `team-off-days-reducer.unit`). **Réviser** dans `group-exclusions.unit.test.ts` l'assertion « skipWeekends sans effet » L93-97 (supprimée, couverture déplacée) et le titre describe L80 (AC1).
   - **Intégration live (optionnelle, gated)** : un `tests/settings.write.integration.test.ts` calqué sur `holidays.write.integration.test.ts` (upsert `skip_weekends:false` → relecture → upsert `start_date` → relecture → op invalide `'insert'`→400 → `start_date` mal formé→400 ; gate `SUPABASE_TEST_LIVE`) est **bienvenu mais non requis** pour le « vert » CI.
   - **Non-régression (NFR9)** : toutes les suites existantes restent **vertes** ; en particulier `group-exclusions.unit` après révision (les autres cas de récurrence/validateurs **inchangés**), et `holidays`/`team-off-days`/`reconcile` (le générique `reconcileById` et ses alias **inchangés** — seul `reconcileSetting` est ajouté). Les chemins **participants + indispos + exclusions + fériés + jours off** conservent un comportement **identique** (la 6ᵉ slice scalaire ne change ni le contrat `WriteSpec` ni la file `useWriteQueue` ni les 5 autres slices). `isWeekend`/le câblage n'altèrent pas le comportement des 3 branches existantes (week-end conditionnel à `skipWeekends === true`). `npm run lint` 0, `npx tsc --noEmit` 0, `npm run build` vert (route `/api/settings` enregistrée). Grep `.next/static` : **aucun** secret (`SUPABASE_SECRET_KEY`/`TEAM_PASSPHRASE`/`service_role` + valeur passphrase → 0).
   [Source: daily-wheel/package.json (`test:unit` L14 — 12 suites actuelles à porter à 14) ; daily-wheel/tests/holidays.write.integration.test.ts (modèle gated, gate `SUPABASE_TEST_LIVE`) ; daily-wheel/vitest.config.ts (gate, stub `server-only`) ; ARCHITECTURE-SPINE.md#AD-13 ; #AD-12 (parité = 4.2, hors-scope ici)]

## Tasks / Subtasks

> ⚠️ **Tout le code et toutes les commandes `npm` sont sous `daily-wheel/`** (variance structurelle héritée 1.1→3.3). Le workflow CI à la racine n'est **pas** touché par cette story.
> 🟢 **Pas de Task de refactor** : `useWriteQueue` est déjà extrait (commit `f847156`) et op-agnostique. On ajoute directement la 6ᵉ slice (scalaire).
> 🆕 **Patron NEUF** : settings = état **scalaire** (objet unique), op **upsert**, réconciliation **LWW une-ligne** — ne pas copier mécaniquement le patron liste (tempId/insert-delete) des 5 autres slices.

- [x] **Tâche 1 — Domaine pur : `isWeekend` + câblage `skipWeekends` dans `isTeamNonSessionDay` (rouge → vert)** (AC: 1, 8)
  - [x] Écrire `daily-wheel/tests/weekends.unit.test.ts` (ROUGE : `isWeekend` absent) : `isWeekend` (samedi/dimanche→true, jours ouvrés→false) ; `isTeamNonSessionDay` branche week-end (skipWeekends true+samedi→true ; false→false ; absent→false ; combiné exclusion/férié→true ; jour ouvré délègue).
  - [x] `team-availability.ts` : ajouter `isWeekend` (réutilise `weekdayOf`) ; brancher `ctx.skipWeekends === true && isWeekend(date)` en première condition `||` de `isTeamNonSessionDay`. **Signature/types inchangés.** Mettre à jour les commentaires « branche 4.1 non câblée » (L7-9/L27-29/L90-92).
  - [x] **Réviser** `group-exclusions.unit.test.ts` : supprimer l'`it` « skipWeekends sans effet » L93-97 (couverture déplacée) ; neutraliser le titre describe L80. VERT.

- [x] **Tâche 2 — Data : type + `fetchSettings` (maybeSingle) / `writeSettings` (upsert)** (AC: 2, 8)
  - [x] Créer `daily-wheel/lib/data/settings.ts` : `Setting` (start_date nullable), `fetchSettings(): Promise<Setting | null>` via `.eq('id','singleton').maybeSingle()`, `SettingWritePayload` (patch partiel), `writeSettings(payload, pp)` (POST `/api/settings`, body `{ op:'upsert', data }`, `WriteError`). `tsc` vert.

- [x] **Tâche 3 — Route proxy `/api/settings` (upsert singleton)** (AC: 3)
  - [x] Créer `daily-wheel/app/api/settings/route.ts` : garde `timingSafeEqual` (copie holidays L65-73) ; allowlist `['skip_weekends','start_date']` ; **op `upsert` uniquement** (sinon 400) ; validation serveur (`skip_weekends` boolean, `start_date` null|YMD, data non vide) ; **upsert** `{ id:'singleton', ...picked, updated_at: new Date().toISOString() }` `{ onConflict:'id' }` `.select().single()` ; `mapDbError` générique (pas de 23505). **`updated_at` posé serveur** (sinon LWW cassé sur UPDATE).
  - [x] Autres routes et `lib/supabase/` non touchées.

- [x] **Tâche 4 — Réducteur SCALAIRE settings + `reconcileSetting` (rouge → vert)** (AC: 4, 8)
  - [x] Ajouter `reconcileSetting(state, event)` + `SettingChangeEvent` + import type `Setting` dans `lib/store/reconcile.ts` (générique `reconcileById` et alias liste **inchangés**).
  - [x] Écrire `daily-wheel/tests/settings-reducer.unit.test.ts` (ROUGE) : `HYDRATE` (row/null→DEFAULT), `OPTIMISTIC`, `CONFIRM`, `MARK_FAILED`, `RESTORE` ; `reconcileSetting` (dédup écho, LWW récent/ancien, DELETE/ id≠singleton ignorés).
  - [x] Créer `daily-wheel/lib/store/settings-reducer.ts` (`StoreSetting`, `DEFAULT_SETTING`, `Action`, `settingsReducer`). PUR (pas de `Date`). VERT.

- [x] **Tâche 5 — Store : 6ᵉ slice settings (scalaire) + 6ᵉ canal Realtime** (AC: 5, 8)
  - [x] `participants-store.tsx` : `useReducer(settingsReducer, initialSettings ?? DEFAULT_SETTING)` + `stateRefS` (pas de `sseqRef`) + `toServerSetting` ; `updateSettings(patch)` (snapshot → OPTIMISTIC → runWrite upsert ; rollback RESTORE ; conflit re-hydrate) ; `setSkipWeekends`, `setStartDate`, `retrySettings`→`retry('settings')`. Exposés dans `StoreValue` + `value`.
  - [x] 6ᵉ abonnement `settings-rt` + re-hydratation `SUBSCRIBED` (AD-6) via `mapChange<Setting>` (dispatch `HYDRATE { row }`). Signature provider + `initialSettings` + imports. **File/`runWrite` non modifiés** → un seul prompt couvre 6 tables.

- [x] **Tâche 6 — UI : options de génération (toggle week-ends + date de début)** (AC: 6)
  - [x] Ajouter `todayYMD()` à `lib/format/date-fr.ts` (local, jamais UTC).
  - [x] Créer `daily-wheel/components/GenerationOptions.tsx` (bloc NON repliable : checkbox « Ignorer les week-ends » → `setSkipWeekends` ; `<input type=date>` « Date de début » valeur `start_date ?? todayYMD()` → `setStartDate` ; état `.pending` discret ; a11y `<label htmlFor>` ; tout FR). Consomme `useParticipants()`.

- [x] **Tâche 7 — CSS + montage Options + SSR hydration** (AC: 7)
  - [x] Classes `.gen-options-*` dans `app/globals.css` (charte, tokens existants, sans dégradé, champs empilés ≤520px, `.pending` discret).
  - [x] `app/page.tsx` : `fetchSettings().catch(() => null)` ajouté au `Promise.all` + `initialSettings` au provider ; `<GenerationOptions />` monté **en premier** dans Options + imports. Signature `ParticipantsStoreProvider` adaptée. Carte Résultat inchangée.

- [x] **Tâche 8 — Scripts de test + non-régression** (AC: 8)
  - [x] `package.json` : `weekends.unit` + `settings-reducer.unit` ajoutés à `test:unit` (→ 14 suites).
  - [x] (Optionnel) `tests/settings.write.integration.test.ts` gated.
  - [x] Non-régression : `npm run lint` 0, `npx tsc --noEmit` 0, `npm run test:unit` vert (14 suites), `npm test` vert (flake Realtime vert au retry), `npm run build` vert (`/api/settings` enregistrée). Grep `.next/static` : 0 secret.

## Dev Notes

### Contexte & périmètre
- **1ʳᵉ story d'Epic 4 (génération & affichage)** : ouvre `settings` (créée vide en 1.2) à l'écriture (patron **singleton/upsert**), **câble la dernière branche `skipWeekends`** du prédicat unique `isTeamNonSessionDay` (signature figée en 3.1, source AD-3, consommée en 4.2), et ajoute une **6ᵉ slice** (scalaire) au team store. Après cette story, **les 4 branches du prédicat sont câblées** et il ne reste qu'à le **consommer** dans `generateSchedule` (4.2). [Source: epics.md#Epic-4 ; #Story-4.1]
- **Feature NEUVE (FR9/FR10) — pas de fixture de parité ici** : la parité legacy (week-ends inclus) est prouvée en **4.2** par le test golden, qui **consommera** `settings.skip_weekends` + `settings.start_date`. 4.1 livre la **donnée persistée + la branche de prédicat testée**, pas la génération. [Source: epics.md#FR9 ; #FR10 ; ARCHITECTURE-SPINE.md#AD-12]
- **In-scope :** sous-prédicat pur `isWeekend` + câblage conditionnel `skipWeekends` dans `isTeamNonSessionDay` ; couche data + route proxy `settings` (upsert) ; réducteur **scalaire** optimiste pur + `reconcileSetting` (LWW une-ligne) ; **6ᵉ slice store + 6ᵉ canal Realtime** (un seul prompt) ; UI bloc options (toggle week-ends + date début) ; helper `todayYMD()` ; CSS ; SSR hydration + montage.
- **Hors-scope :** **génération du planning** → l'usage effectif de `skipWeekends`/`start_date` dans `generateSchedule` (boucle + deadline EDF) + le **test paramétré « même prédicat aux deux sites »** (AD-3) + le **test golden de parité** (AD-12) sont **Story 4.2** (epics.md#Story-4.1 : « ces réglages sont fournis en entrée de la génération (Story 4.2) »). **Affichage du planning** → 4.3. **Édition/suppression** de settings → N/A (upsert d'une ligne unique, jamais de delete). **Rename `team-store`** → optionnel/déféré. **Factorisation CSS générique** → hors-scope sauf décision.

### ⚠️ Variance structurelle héritée (CRITIQUE — rappel 1.1→3.3)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Tout le code, tous les `npm`, tout grep `.next/` → **depuis `daily-wheel/`**. [Source: 3-3-*.md#Variance-structurelle]
- État réel pertinent (sous `daily-wheel/`, vérifié au commit `316e198`) — **réutiliser, ne pas casser** :
  - `supabase/migrations/20260622121017_init_schema.sql` : table `settings` **DÉJÀ créée** (L51-56 : `id text PK default 'singleton'`, `skip_weekends boolean not null default true`, `start_date date` **nullable**, `updated_at`), **VIDE** (aucun INSERT), RLS **SELECT anon** (L78), **dans la publication realtime** (L90) + `REPLICA IDENTITY FULL` (L97). **Aucune migration à écrire.**
  - `lib/domain/team-availability.ts` : `isTeamNonSessionDay` (L93-99, branches exclusions+fériés+off câblées), `TeamConstraints.skipWeekends?: boolean` **déjà déclaré** (L31), `weekdayOf` (L50-53, **à RÉUTILISER**). Cette story **ajoute** `isWeekend` + le câble — **sans toucher la signature**.
  - `lib/data/holidays.ts` : **modèle de STRUCTURE** de la couche data (type + fetch + write + `WriteError`) à **ADAPTER** en singleton/upsert (≠ liste). `lib/data/write-error.ts` : taxonomie AD-17 **partagée, réutilisée telle quelle**.
  - `app/api/holidays/route.ts` : **modèle de structure** de la route (garde `timingSafeEqual` L65-73, `pickAllowed` L32-40, `mapDbError` L44-48, `json` L19-21) — à **adapter** en op `upsert`.
  - `lib/store/use-write-queue.ts` : `runWrite`/`WriteSpec`/`retry` **table-/op-agnostiques** (extrait 3.2) — **INCHANGÉ**, juste consommé par la 6ᵉ slice (spec upsert).
  - `lib/store/participants-store.tsx` : `addHoliday`/`removeHoliday`/`retryHoliday` (L447-505) + `toServerHoliday` (L74-76) + canal `holidays-rt` (L659-684) + `mapChange` (L752-766) = **modèles** (à adapter en scalaire). `StoreValue` L94-122, `value` L713-741, provider L126-140, imports L1-40.
  - `lib/store/reconcile.ts` : `reconcileById<T>` (L26-65) + alias liste (L67-102) → **INCHANGÉS** ; on **ajoute** `reconcileSetting` (scalaire, ne réutilise PAS `reconcileById`).
  - `lib/store/holidays-reducer.ts` : modèle de réducteur (drapeaux pending/failed) — à **adapter en scalaire** (objet unique, pas de tempId/ROLLBACK-par-temp).
  - `components/HolidaysPanel.tsx` : modèle de composant Options (conso `useParticipants`, form/label/input) — à **SIMPLIFIER en bloc non repliable**. `components/PassphrasePrompt.tsx` : **inchangé** (déclenché par le store, couvre désormais 6 tables).
  - `lib/format/date-fr.ts` : `formatDateFr`/`parseYMD` **déjà créés** (parse **local**, L6-19) → **y AJOUTER `todayYMD()`** (local, jamais UTC).
  - `app/globals.css` : tokens (L2-26), `.holidays-*` (L475-576 styles d'input), media `≤520px` (L683-724), reduced-motion → réutiliser/étendre. **Pas de token dédié** → réutiliser l'existant.
  - `app/page.tsx` : Server Component `force-dynamic`, `Promise.all` SSR (L20-27, **5 fetchs**), provider enveloppant `ParticipantsCard` **et** la carte Options (L45-59) → **ajouter** le 6ᵉ fetch (`fetchSettings`, `.catch(() => null)`), `initialSettings`, et monter `<GenerationOptions />` **en premier** dans Options.
  - `package.json` : `test:unit` = liste explicite (L14, **12 suites**) → **y ajouter** les 2 nouveaux fichiers (→ 14). **Aucune** lib d'état/UI/date (React + natifs) — **ne pas** ajouter de dépendance.
  - `vitest.config.ts` : alias `@`, stub `server-only`, gate `SUPABASE_TEST_LIVE` — **ne pas retoucher**.

### Décisions d'architecture qui cadrent cette story
- **AD-3 (source unique `isTeamNonSessionDay`)** : on **ajoute** la dernière branche `skipWeekends` (`(ctx.skipWeekends === true && isWeekend(date)) || …`) sans toucher la signature `(date, ctx)`. Branche **conditionnelle** (≠ les 3 autres, toujours actives). Après 4.1, le prédicat est **complet** ; l'intégration effective (génération + deadline EDF) + le test paramétré = **Story 4.2**.
- **Réutilisation `weekdayOf` = anti-réinvention** : le calcul calendaire (days-from-civil, sans `Date`/timezone) est **déjà** écrit et testé. `isWeekend` ne fait que tester `dow ∈ {0,6}`. **Ne pas** introduire `Date` dans le domaine.
- **Patron SINGLETON / UPSERT (NEUF)** : `settings` = **ligne unique** `id='singleton'` (convention spine). Conséquences vs les 5 tables-liste : (a) **état scalaire** (un objet, pas un tableau) → réducteur scalaire ; (b) **pas de tempId / pas de `seqRef`** (l'id est constant) ; (c) **op `upsert` unique** (pas insert/delete) ; (d) **réconciliation LWW une-ligne** (`reconcileSetting`, PAS `reconcileById`) ; (e) **table vide au départ** → `fetchSettings` `maybeSingle()`→`null`, défaut matérialisé client (`DEFAULT_SETTING`), 1ʳᵉ écriture = upsert.
- **`updated_at` serveur sur upsert (CRITIQUE)** : le `default now()` SQL ne s'applique qu'à l'INSERT. Sur l'UPDATE d'un upsert, **il faut poser `updated_at` explicitement** côté serveur (`new Date().toISOString()`), sinon la dédup d'écho (AD-15) et le LWW (AD-16) sont cassés (deux writes successifs auraient le même `updated_at`). C'est la **seule** route qui pose `updated_at` à la main (les routes insert-only reposent sur le default SQL).
- **AD-5/AD-17 (optimiste + taxonomie)** : update settings = `OPTIMISTIC { patch }` + `writeSettings('upsert')` ; rollback `RESTORE { snapshot }` ; classes auth/validation/conflict/transient **identiques** aux autres tables via `useWriteQueue`. Pas de cycle delete (settings ne se supprime pas).
- **AD-8 (passphrase)** : la file table-/op-agnostique accepte le spec upsert → **un seul** prompt pour N mutations **toutes tables confondues** (6 désormais).
- **AD-14 (contrat d'écriture)** : `{ op, data? }` + allowlist **serveur** `skip_weekends,start_date` ; `id` **toujours** forcé serveur. Une route **par table** → `/api/settings`. Op `upsert` (extension documentée par la convention « settings = singleton + upsert » ; pas d'insert/update/delete).
- **AD-15/AD-16 (réconciliation)** : `reconcileSetting` applique dédup `updated_at` + LWW sur la ligne unique (chaîne ISO comparable lexicographiquement) — DELETE ignoré (settings n'est jamais supprimé).
- **AD-11/AD-7 (chemins asymétriques)** : lecture `settings` via clé low-privilege (`fetchSettings` + abonnement) ; écriture **uniquement** via `/api/settings`. Aucun composant ne touche `supabase.from(...)` ni `fetch('/api/...')` — tout via le store → `lib/data/`.
- **AD-13 (CI pure)** : seuls `weekends.unit` + `settings-reducer.unit` (+ existants) tournent en CI **sans secrets**. Store/route/UI **non** unit-testés (cohérent 1.5→3.3 ; pas de RTL/jsdom — **ne pas** ajouter de dépendance) ; preuve = **vérification manuelle**.
- **Convention dates (CRITIQUE)** : tout en `YYYY-MM-DD` **local**. `<input type=date>` produit déjà du YMD. `todayYMD()` formate en **local** (`getFullYear`/`getMonth`/`getDate`), jamais `toISOString()` (UTC → décalage d'un jour). `isWeekend`/`weekdayOf` = arithmétique entière sur chaînes YMD, aucun recours à `Date`. `start_date` stocké en `date` Postgres.

### Previous Story Intelligence (3.3 / 3.2 / 1.5)
- **3.2/3.3 = patron du côté « équipe »** (data, route, reducer, slice, canal, tests) — **MAIS** settings diffère : scalaire + upsert + LWW une-ligne. **Ne pas copier mécaniquement** le patron liste (tempId/insert-delete). Copier la **structure** (garde passphrase, allowlist, `mapChange`, `runWrite`, drapeaux pending/failed, stateRef, canal RT, SSR), **adapter** la forme.
- **`useWriteQueue` déjà extrait (3.2)** : la 6ᵉ slice le consomme **sans refactor** — bénéfice prévu par [[store-extraction-plan]] (réalisé). Ne **pas** ré-extraire ni modifier le hook (il est op-agnostique → accepte le spec upsert).
- **`isTeamNonSessionDay` change de comportement** : un test `group-exclusions.unit` (L93-97) affirme que `skipWeekends` est « sans effet » — **à corriger** (c'est désormais neutralisant, conditionnel). Même schéma que la révision faite en 3.2 (holidays) et 3.3 (teamOffDays). Ne pas laisser ce test **inverser** la régression (il attendrait `false` là où c'est maintenant `true`).
- **Test pur rouge→vert** : `holidays.unit`/`holidays-reducer.unit` = modèles de structure ; `weekends.unit`/`settings-reducer.unit` les reproduisent (en adaptant : scalaire pour le reducer).
- **Flake Realtime connu (1.3→3.3)** : 1er `npm test` peut timeouter sur le handshake puis passer au retry — transitoire, **pas** une régression. Avec un **6ᵉ** canal, surveiller mais ne pas « corriger » un flake de handshake.
- **CI Node 22.x** + Vercel `framework=nextjs` (`vercel.json`) : **ne pas** retoucher CI/Vercel.
- **Dépendances Epic 1/2/3 en review** (non `done`) mais commitées et fonctionnelles : construire dessus. Epic-4 passe `backlog → in-progress` (1ʳᵉ story — géré par le workflow create-story).
- **Push Git** : remote via alias SSH `github-perso` → `Infinter/SpinThatWeeklyWheel` (compte SoloOz). [Source: MEMORY:git-remote-push-setup]

### Points techniques (Next.js 16 / React 19 — janv. 2026)
- **Pas de nouvelle techno, aucune recherche web requise.** Stack figée (Next 16.2.x, React 19.2, supabase-js 2.108.x). Story = domaine pur (réutilisation `weekdayOf`) + data + route (upsert) + store (slice scalaire) + UI + CSS, sur patterns existants.
- **`supabase.upsert(obj, { onConflict: 'id' })`** : insère si absent, met à jour les colonnes fournies si la PK existe. `.select().single()` renvoie la ligne résultante. C'est le mécanisme exact de la convention « settings singleton ».
- **`maybeSingle()`** vs `single()` : `maybeSingle()` renvoie `null` (sans erreur) si 0 ligne — requis car `settings` est vide au départ. `single()` lèverait `PGRST116`.
- **`isWeekend` sans `Date`** : délègue à `weekdayOf` (arithmétique entière). Déterministe, pur, sans timezone.
- **`todayYMD()` avec `Date` LOCAL** : autorisé **hors domaine** (composant/format, client). Formater via `getFullYear`/`getMonth`/`getDate` + `padStart`, jamais `toISOString()` (UTC).
- **Snapshot avant optimiste** : pour `updateSettings`, lire `toServerSetting(stateRefS.current)` **avant** `OPTIMISTIC` pour le `RESTORE`. `stateRefS` maintenu par `useEffect` (modèle `stateRefH` L169/L180-182).
- **Six canaux Realtime** : `participants-rt` + `unavailabilities-rt` + `group-exclusions-rt` + `holidays-rt` + `team-off-days-rt` (existants, inchangés) + `settings-rt` (nouveau) ; chacun se re-hydrate au `SUBSCRIBED`. Dédup d'écho settings par `reconcileSetting`.

### Project Structure Notes
- Arborescence touchée (tout sous `daily-wheel/`) :
  ```
  lib/domain/team-availability.ts                # UPDATE (isWeekend + branche skipWeekends ; signature inchangée ; commentaires — AC1)
  lib/data/settings.ts                            # NEW (type + fetchSettings maybeSingle + writeSettings upsert ; start_date nullable — AC2)
  app/api/settings/route.ts                       # NEW (proxy upsert ; allowlist skip_weekends/start_date ; updated_at serveur — AC3)
  lib/store/settings-reducer.ts                   # NEW (réducteur SCALAIRE pur + DEFAULT_SETTING — AC4)
  lib/store/reconcile.ts                          # UPDATE léger (reconcileSetting + SettingChangeEvent ; générique/alias liste inchangés — AC4)
  lib/store/participants-store.tsx                # UPDATE (6ᵉ slice settings scalaire + 6ᵉ canal RT ; consomme useWriteQueue inchangé — AC5)
  lib/format/date-fr.ts                           # UPDATE (ajout todayYMD local — AC6)
  components/GenerationOptions.tsx                # NEW (bloc Options non repliable : toggle week-ends + date début — AC6)
  app/globals.css                                 # UPDATE (classes .gen-options-* — AC7)
  app/page.tsx                                    # UPDATE (fetchSettings + initialSettings + montage GenerationOptions en tête — AC7)
  package.json                                    # UPDATE (weekends.unit + settings-reducer.unit dans test:unit — AC8)
  tests/weekends.unit.test.ts                     # NEW (preuve domaine pur week-ends — AC1)
  tests/settings-reducer.unit.test.ts             # NEW (preuve réducteur scalaire + reconcileSetting — AC4)
  tests/group-exclusions.unit.test.ts             # UPDATE (réviser assertion « skipWeekends sans effet » L93-97 + titre L80 — AC1)
  tests/settings.write.integration.test.ts        # NEW optionnel gated (AC8)
  _bmad-output/.../sprint-status.yaml             # UPDATE (statut 4.1 + epic-4 in-progress ; géré par le workflow)
  ```
- **Inchangés (réutilisés)** : `app/api/{participants,unavailabilities,group-exclusions,holidays,team-off-days}/route.ts`, `lib/supabase/{client,admin}.ts`, `lib/data/{participants,unavailabilities,group-exclusions,holidays,team-off-days,write-error}.ts`, `lib/store/{parse-names,participants-reducer,unavailabilities-reducer,group-exclusions-reducer,holidays-reducer,team-off-days-reducer,use-write-queue}.ts`, `lib/domain/availability.ts`, `lib/store/reconcile.ts` (générique + alias liste — seul ajout : `reconcileSetting`), `components/{ParticipantsCard,UnavailabilityPanel,GroupExclusionsPanel,HolidaysPanel,TeamOffDaysPanel,PassphrasePrompt}.tsx`, `app/layout.tsx`, `next.config.ts`, `vercel.json`, `vitest.config.ts`, **migrations SQL** (table déjà créée). *(Note : `participants-store.tsx` est modifié par l'ajout de la slice mais son API publique ne perd aucun membre — additive seulement.)*
- **Aucune migration DB** : `settings` existe déjà avec RLS read-only, publication realtime + REPLICA IDENTITY FULL (init_schema.sql L51-56/L78/L90/L97).

### Testing standards (pour cette story)
- **TDD** : écrire `weekends.unit.test.ts` **avant** `isWeekend`/le câblage, et `settings-reducer.unit.test.ts` **avant** le réducteur scalaire (rouge → vert). Double filet automatique.
- **Périmètre testé automatiquement** : sous-prédicat de domaine (week-ends) + réducteur scalaire + `reconcileSetting` (purs, CI sans secrets). Store/route/UI **non** unit-testés (cohérent 1.5→3.3). Preuve = **vérification manuelle** :
  - Carte Options : le bloc « options de génération » s'affiche **en tête** ; « ignorer les week-ends » coché par défaut, date de début = **aujourd'hui** par défaut.
  - Décocher « ignorer les week-ends » → persiste (reload + autre navigateur conservent l'état décoché — FR9/FR13).
  - Changer la date de début → persiste (YMD local, pas de décalage de jour — FR10).
  - Modifier **sans passphrase** → un seul prompt (même file que les 5 autres tables) ; passphrase erronée (401) → re-prompt, optimiste préservé.
  - Échec transitoire (5xx) → rollback visible vers la valeur précédente, action re-tentable (`retrySettings`).
  - Une modif faite par un autre client se reflète sans reload (Realtime `settings-rt`), écho de sa propre écriture dédupliqué.
  - **Non-régression manuelle** : ajouter/supprimer un participant/indispo/exclusion/férié/jour off → comportement **identique** (la 6ᵉ slice scalaire n'a touché ni la file ni les autres slices).
- **Critère « vert »** : `npm run test:unit` vert (**14 suites** : 12 actuelles + **weekends** + **settings-reducer**) ; `npm test` vert (flake Realtime vert au retry) ; `npm run lint` 0 ; `npx tsc --noEmit` 0 ; `npm run build` vert (`/api/settings` enregistrée) ; grep `.next/static` → 0 secret.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4 ; #Story-4.1 (4 critères, frontière 4.2 « fournis en entrée de la génération ») ; FR9 ; FR10 ; FR13 ; NFR4 ; NFR5 ; NFR9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-3 (isTeamNonSessionDay source unique, dernière branche skipWeekends, signature figée) ; #AD-1 ; #AD-5 ; #AD-6 ; #AD-7 ; #AD-8 ; #AD-9 ; #AD-11 ; #AD-13 ; #AD-14 ; #AD-15 ; #AD-16 ; #AD-17 ; #Consistency-Conventions (Settings : id='singleton' + upsert ; dates YMD locales ; updated_at serveur) ; #Structural-Seed (api/settings, lib/domain) ; #Modèle-de-données (table settings : skip_weekends/start_date) ; #Capability-Map (Options FR9/FR10 → settings + lib/store)]
- [Source: docs/prd.md §3 (UX-DR1 action principale, UX-DR3 édition inline auto, UX-DR5 retour visuel, UX-DR6 a11y, UX-DR7 ≤520px) ; §4 (modèle settings) ; FR9 ; FR10]
- [Source: _bmad-output/implementation-artifacts/3-3-jours-off-equipe.md (#AC1 domaine pur + signature `isTeamNonSessionDay` + révision test « sans effet » ; #AC2 data ; #AC3 route ; #AC4 réducteur + reconcile ; #AC5 slice store + canal ; #AC6 UI ; #AC7 CSS+SSR ; #AC8 critère vert ; extraction useWriteQueue) ; 3-2-jours-feries.md (modèle label/équipe + révision test branche)]
- [Source: daily-wheel/lib/domain/team-availability.ts (isTeamNonSessionDay L93-99, TeamConstraints.skipWeekends L31, weekdayOf L50-53 RÉUTILISÉ, commentaires L7-9/L27-29/L90-92) ; daily-wheel/tests/group-exclusions.unit.test.ts (assertion à réviser L93-97, titre L80) ; daily-wheel/lib/data/holidays.ts (modèle structure data L1-54) ; daily-wheel/lib/data/write-error.ts (taxonomie partagée) ; daily-wheel/app/api/holidays/route.ts (modèle route L1-112 : garde L65-73, pickAllowed L32-40, mapDbError L44-48) ; daily-wheel/lib/supabase/admin.ts ; daily-wheel/lib/store/use-write-queue.ts (WriteSpec/runWrite/retry, INCHANGÉ) ; daily-wheel/lib/store/participants-store.tsx (addHoliday L447-505, toServerHoliday L74-76, canal holidays-rt L659-684, mapChange L752-766, StoreValue L94-122, value L713-741, provider L126-140, imports L1-40, useWriteQueue L158, stateRef pattern L169/L180-182) ; daily-wheel/lib/store/holidays-reducer.ts (modèle reducer L1-59) ; daily-wheel/lib/store/reconcile.ts (reconcileById<T> L26-65 + ChangeEvent<T> L19-22 + alias liste L67-102 INCHANGÉS) ; daily-wheel/components/HolidaysPanel.tsx (modèle composant Options L1-105) ; daily-wheel/app/page.tsx (SSR L20-27, provider+Options L45-59) ; daily-wheel/app/globals.css (tokens L2-26, .holidays-* L475-576, media L683-724) ; daily-wheel/lib/format/date-fr.ts (formatDateFr/parseYMD L6-19) ; daily-wheel/supabase/migrations/20260622121017_init_schema.sql (settings L51-56, RLS L78, realtime L90/L97) ; daily-wheel/package.json (test:unit L14) ; daily-wheel/vitest.config.ts]

## Dev Agent Record

### Agent Model Used

Amelia (dev-story) — claude-opus-4-8[1m]

### Debug Log References

- `npx vitest run tests/weekends.unit.test.ts` → ROUGE (6 échecs : `isWeekend` absent + câblage non fait), puis VERT après implémentation (11 tests).
- `npx vitest run tests/settings-reducer.unit.test.ts` → ROUGE (module absent), puis VERT (14 tests).
- `npx tsc --noEmit` → 0 erreur. `npx eslint` → 0.
- `npm run test:unit` → 14 suites / 182 tests verts.
- `npm test` → 199/200 (seul échec : flake handshake `realtime.integration.test.ts`, timeout 20 s) ; `npm run test:realtime` au retry → VERT (1.03 s) — flake connu (1.3→3.3), pas une régression.
- `npm run build` → vert, route `ƒ /api/settings` enregistrée. Grep `.next/static` (`SUPABASE_SECRET_KEY`/`TEAM_PASSPHRASE`/`service_role` + valeur passphrase) → 0 secret.

### Completion Notes

- **Deux faces livrées.** (A) Domaine pur : `isWeekend(date)` (réutilise `weekdayOf`, sans `Date`) + branche **conditionnelle** `ctx.skipWeekends === true && isWeekend(date)` câblée en tête de `isTeamNonSessionDay` → prédicat AD-3 **complet** (4 branches), signature inchangée. Assertion périmée « branche 4.1 non câblée » de `group-exclusions.unit.test.ts` **retirée** (couverture déplacée dans `weekends.unit.test.ts`), titre du describe neutralisé.
- (B) Persistance `settings` — patron **SINGLETON/UPSERT NEUF** : `lib/data/settings.ts` (`fetchSettings` via `maybeSingle()`→null car table vide, `writeSettings` op `upsert`), route `/api/settings` (op `upsert` unique, allowlist `skip_weekends`/`start_date`, `id`='singleton' forcé serveur, **`updated_at` posé serveur** pour préserver dédup/LWW Realtime sur l'UPDATE), réducteur **scalaire** `settings-reducer.ts` (+ `DEFAULT_SETTING`), `reconcileSetting` (LWW une-ligne, ≠ `reconcileById`).
- **6ᵉ slice store** (scalaire, pas de tempId/seqRef) + **6ᵉ canal Realtime** `settings-rt` ; `updateSettings`/`setSkipWeekends`/`setStartDate`/`retrySettings` exposés ; file `useWriteQueue` **inchangée** (op-agnostique) → un seul prompt passphrase couvre désormais **6 tables** (AD-8).
- **UI** : `components/GenerationOptions.tsx` (bloc non repliable en tête de la carte Options : checkbox « Ignorer les week-ends » + `<input type=date>` « Date de début » défaut `start_date ?? todayYMD()`), helper `todayYMD()` (local, jamais UTC) ajouté à `date-fr.ts`, CSS `.gen-options-*` + media ≤520px.
- **Non-régression** : générique `reconcileById` + alias liste **inchangés** (seul ajout : `reconcileSetting`) ; les 5 autres slices et le contrat `WriteSpec` intacts ; les 12 suites préexistantes vertes.
- **Hors-scope respecté** : usage de `skip_weekends`/`start_date` dans `generateSchedule` + test paramétré AD-3 + test golden de parité = **Story 4.2** (la donnée + le prédicat testé sont livrés ici).

### File List

- `daily-wheel/lib/domain/team-availability.ts` (UPDATE — `isWeekend` + branche `skipWeekends` ; commentaires)
- `daily-wheel/lib/data/settings.ts` (NEW — type `Setting`, `fetchSettings` maybeSingle, `writeSettings` upsert)
- `daily-wheel/app/api/settings/route.ts` (NEW — proxy upsert singleton)
- `daily-wheel/lib/store/settings-reducer.ts` (NEW — réducteur scalaire + `DEFAULT_SETTING`)
- `daily-wheel/lib/store/reconcile.ts` (UPDATE — `reconcileSetting` + `SettingChangeEvent` + import type `Setting`)
- `daily-wheel/lib/store/participants-store.tsx` (UPDATE — 6ᵉ slice settings + canal `settings-rt` + méthodes + props)
- `daily-wheel/lib/format/date-fr.ts` (UPDATE — `todayYMD()`)
- `daily-wheel/components/GenerationOptions.tsx` (NEW — bloc options génération)
- `daily-wheel/app/globals.css` (UPDATE — `.gen-options-*` + media ≤520px)
- `daily-wheel/app/page.tsx` (UPDATE — `fetchSettings` SSR + `initialSettings` + montage `<GenerationOptions />`)
- `daily-wheel/package.json` (UPDATE — `weekends.unit` + `settings-reducer.unit` dans `test:unit`)
- `daily-wheel/tests/weekends.unit.test.ts` (NEW — domaine pur week-ends)
- `daily-wheel/tests/settings-reducer.unit.test.ts` (NEW — réducteur scalaire + `reconcileSetting`)
- `daily-wheel/tests/group-exclusions.unit.test.ts` (UPDATE — révision assertion périmée + titre)
- `daily-wheel/tests/settings.write.integration.test.ts` (NEW — intégration gated optionnelle)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — statut 4.1 + epic-4)

### Change Log

- 2026-06-23 — Story 4.1 implémentée (Amelia/dev-story) : options de génération (week-ends + date de début) persistées en `settings` (singleton/upsert), branche `skipWeekends` câblée dans `isTeamNonSessionDay` (prédicat AD-3 complet). 14 suites unit vertes (182 tests), build vert, 0 secret. Status → review.
