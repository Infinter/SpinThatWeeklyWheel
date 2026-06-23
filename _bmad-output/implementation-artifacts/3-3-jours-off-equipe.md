---
baseline_commit: f847156
---

# Story 3.3: Jours off d'équipe (nouveau)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want saisir des jours « off » d'équipe en jour isolé ou en plage (avec libellé optionnel),
so that je gère une fermeture/un pont pour tout le monde en une seule saisie (FR8) — **3ᵉ et dernière story d'Epic 3 (contraintes d'équipe)**. Elle ouvre la **table `team_off_days`** (créée vide en 1.2) à l'écriture, **ajoute la dernière branche `teamOffDays`** au prédicat unique `isTeamNonSessionDay` (signature figée en 3.1 — AD-3), et ajoute une **5ᵉ table** au team store. C'est une **feature neuve** (FR8 « Nouveau ») : **aucune parité legacy**.

## Acceptance Criteria

> Ces AC décomposent les 5 critères de l'epic (epics.md#Story-3.3) en unités implémentables et testables. La story est un **HYBRIDE de deux patrons déjà livrés** : la structure **jour/plage** (`kind`/`date1`/`date2`, validation `isValidRange`, UI à bascule Jour/Plage) vient de **2.3 (indisponibilités)** ; le caractère **niveau-équipe** (pas de `participant_id`, libellé, panneau repliable + badge dans la carte Options, branche du prédicat `isTeamNonSessionDay`) vient de **3.2 (jours fériés)**. **Différences** : (a) `label` est **OPTIONNEL** (colonne `team_off_days.label` **nullable** — ≠ `holidays.label` qui est `not null`) ; (b) **aucune contrainte d'unicité** (≠ `holidays.date unique`) → **pas de dédup, pas de 23505/409-conflit** ; (c) jour **ou** plage (≠ date unique des fériés).
>
> **✅ Aucune extraction / aucun refactor préparatoire.** La machinerie d'écriture partagée `useWriteQueue()` (file passphrase + `runWrite` + taxonomie AD-17) **a été extraite en 3.2** ([[store-extraction-plan]] réalisé, commit `f847156`) et est **table-agnostique**. **3.3 est la story « triviale » promise par cette extraction** : on **ajoute simplement la 5ᵉ slice** qui consomme `useWriteQueue` — pas de Task de refactor (≠ 3.2). Le **rename** `participants-store`→`team-store` reste **déféré** (churn d'imports sans valeur ; fichier et `useParticipants` conservés).
>
> Le **cœur testable en CI sans secrets** (AD-13) est **double** : (a) le **sous-prédicat de domaine pur** `isTeamOffDay` branché dans `isTeamNonSessionDay` (`lib/domain/team-availability.ts`) ; (b) le **réducteur optimiste pur** des jours off (`lib/store/team-off-days-reducer.ts`), calqué sur `holidays-reducer.ts` (3.2). Tous les patterns d'écriture (`useWriteQueue`, route proxy, allowlist serveur, `reconcileById<T>`) **existent déjà** et sont **réutilisés**, pas réécrits.

1. **Domaine pur : sous-prédicat `isTeamOffDay` + câblage dans `isTeamNonSessionDay` (cœur testable — AD-3, AD-13, AC9).** Étendre `daily-wheel/lib/domain/team-availability.ts` (PUR, **feuille** : aucun import React/DOM/Supabase/`lib/data`/`lib/format` — état actuel respecté). **Ne PAS toucher la signature** ni les types (`TeamConstraints.teamOffDays?: DayOrRange[]` est **déjà déclaré** L34 depuis 3.1) :
   - **RÉUTILISER `isPersonUnavailable`** (domaine voisin `@/lib/domain/availability` L23-32) : un jour off d'équipe neutralise **exactement** comme une indispo individuelle (jour → `date1 === date` ; plage → `date1 <= date <= date2`, bornes incluses). **Ne PAS réimplémenter** la logique de bornes. Changer l'import existant L15 de type-only en import runtime : `import { isPersonUnavailable, type DayOrRange } from '@/lib/domain/availability'` (les deux modules sont des **feuilles pures** — import domaine→domaine conforme AD-1, aucune dépendance vers data/React).
   - Ajouter `export function isTeamOffDay(offDays: DayOrRange[], date: string): boolean { return isPersonUnavailable(offDays, date) }` (alias sémantique explicite : même test d'appartenance jour/plage). Liste vide → `false` (déjà garanti par `isPersonUnavailable`).
   - **Brancher** dans `isTeamNonSessionDay` (L85-87) : `return isGroupExcluded(ctx.groupExclusions ?? [], date) || isHoliday(ctx.holidays ?? [], date) || isTeamOffDay(ctx.teamOffDays ?? [], date)`. Seule `skipWeekends` (4.1) restera **non câblée** après cette story (à ajouter en `||` plus tard, sans toucher la signature).
   - **TDD rouge d'abord** : créer `daily-wheel/tests/team-off-days.unit.test.ts` (préférer un fichier dédié, cohérence avec le découpage par table) avec `import { isTeamOffDay, isTeamNonSessionDay } from '@/lib/domain/team-availability'` (ROUGE car `isTeamOffDay` absent), puis ajouter la fonction → VERT. Couvrir : `isTeamOffDay` (vide→false ; jour présent→true ; jour absent→false ; plage borne incluse début/fin→true ; hors plage→false ; plage `date2:null` défensif→false) ; `isTeamNonSessionDay` **avec `teamOffDays`** (jour off fourni → **true** désormais ; combiné avec une exclusion de groupe ou un férié → toujours true ; ctx sans `teamOffDays` → délègue aux autres branches).
   - **CRITIQUE — réviser un test existant** : `tests/group-exclusions.unit.test.ts` L93-102 affirme « teamOffDays / skipWeekends fournis n'ont AUCUN effet (branches 3.3/4.1 non câblées) ». La branche `teamOffDays` **devient câblée en 3.3** → cette assertion est **périmée et trompeuse** (même si elle ne casse pas mécaniquement — l'off-day y est sur `2026-06-23` alors qu'on teste `2026-06-27`). **La réviser** : retirer `teamOffDays` du ctx et du titre → « **skipWeekends** fourni n'a AUCUN effet (branche **4.1** non câblée) » ; déplacer la couverture `teamOffDays` neutralisant vers `team-off-days.unit.test.ts`. Ne **pas** laisser ce test masquer une régression future.
   [Source: daily-wheel/lib/domain/team-availability.ts (signature `isTeamNonSessionDay` L85-87, `TeamConstraints.teamOffDays` L34 déjà déclaré, `import type DayOrRange` L15 à passer en runtime, `isHoliday` L78-80 / `isGroupExcluded` L63-73 modèles de sous-prédicat) ; daily-wheel/lib/domain/availability.ts (`isPersonUnavailable` L23-32 à RÉUTILISER, `DayOrRange` L13-17, `isValidRange` L37-40) ; daily-wheel/tests/group-exclusions.unit.test.ts (assertion à réviser L93-102) ; daily-wheel/tests/holidays.unit.test.ts (modèle de test pur 3.2) ; ARCHITECTURE-SPINE.md#AD-3 ; #AD-1 ; #AD-13]

   > **Note d'altitude :** `isTeamOffDay` est un **alias de réutilisation** — la logique jour/plage est déjà prouvée par `availability.unit.test.ts` (2.3). Le test 3.3 vérifie surtout le **câblage** dans `isTeamNonSessionDay` (la branche existe et agrège en `||`). Pas de validateur de récurrence ni d'unicité ici (≠ 3.1/3.2). La seule règle métier est `date2 >= date1` pour une plage (`isValidRange`, réutilisé).

2. **Type + couche data `team_off_days` (AD-7, AD-11, AD-14).** Créer `daily-wheel/lib/data/team-off-days.ts` (seul point de contact Supabase pour cette table — AD-11), **copie structurelle** de `lib/data/unavailabilities.ts` (pour `kind`/`date1`/`date2`) **moins** `participant_id`, **plus** `label` optionnel :
   - `export type TeamOffDay = { id: string; kind: 'day' | 'range'; date1: string; date2: string | null; label: string | null; updated_at: string }` (timestamps = chaînes ISO, **jamais** `Date` ; `label` **nullable** = colonne `team_off_days.label` sans `not null`).
   - `fetchTeamOffDays(): Promise<TeamOffDay[]>` — lecture via clé low-privilege (`supabasePublic.from('team_off_days').select('*')`), `data ?? []`, exactement comme `fetchUnavailabilities`/`fetchHolidays` (AD-7).
   - `export type TeamOffDayWriteOp = 'insert' | 'delete'` (**pas d'`update`** : ajout/suppression unitaires — epics.md#Story-3.3).
   - `export type TeamOffDayWritePayload = { id?: string; data?: { kind: 'day' | 'range'; date1: string; date2: string | null; label: string | null } }`
   - `writeTeamOffDay(op, payload, passphrase): Promise<unknown>` — `POST /api/team-off-days`, header `x-team-passphrase`, corps `{ op, ...payload }` ; lève un `WriteError` typé. **Importer `WriteError` depuis `@/lib/data/write-error`** (module partagé).
   [Source: daily-wheel/lib/data/unavailabilities.ts (intégralité L1-55 : type kind/date1/date2 L9-17, fetch L19-23, ops L26-30, writeUnavailability L34-55 — modèle exact pour jour/plage) ; daily-wheel/lib/data/holidays.ts (label + niveau-équipe L9-54 — modèle pour le caractère équipe) ; daily-wheel/lib/data/write-error.ts (taxonomie AD-17 partagée) ; daily-wheel/supabase/migrations/20260622121017_init_schema.sql (table team_off_days L42-49 : `kind check(day,range)`, `date1 not null`, `date2` nullable, `label` nullable, **pas d'unique**) ; ARCHITECTURE-SPINE.md#AD-7 ; #AD-11 ; #AD-14 ; #AD-17]

3. **Route proxy `/api/team-off-days` (AD-8, AD-9, AD-14).** Créer `daily-wheel/app/api/team-off-days/route.ts` — **mirroir** de `app/api/unavailabilities/route.ts` (pour la validation jour/plage), adapté (pas de `participant_id`, `label` optionnel, pas d'unicité) :
   - `runtime = 'nodejs'` ; garde passphrase `x-team-passphrase` via `safeEqual`/`timingSafeEqual` (AD-8), retour **avant** tout accès Supabase ; `mapDbError` (`PGRST116`→409, sinon 500). **Pas de cas `23505`** spécifique requis (aucune contrainte d'unicité sur `team_off_days`) — garder le mapping générique (un `23505` improbable retomberait en 409 générique, acceptable ; ne pas inventer de message « doublon »).
   - Allowlist `const ALLOWED = ['kind', 'date1', 'date2', 'label'] as const` (AD-14 : `id`/`updated_at` = serveur).
   - Ops : **`insert`** (`pickAllowed` → validation → `.insert(picked).select().single()`) et **`delete`** (`id` requis ; `.delete().eq('id', id).select('id')` ; **409 si 0 ligne** — état périmé). **PAS d'op `update`** : renvoyer `400` si `op` n'est ni `insert` ni `delete`.
   - **Validation serveur défensive** (AD-17:400) avant insert, calquée sur `validateInsert` de la route unavailabilities (L53-65) **adaptée** : `kind` ∈ {`day`,`range`} ; `date1` = chaîne YMD non vide (`^\d{4}-\d{2}-\d{2}$`) ; si `range` : `date2` chaîne non vide **et** `date2 >= date1` (sinon 400) ; si `day` : forcer `picked.date2 = null` (jamais une valeur cliente). **`label` optionnel** : si présent et `typeof === 'string'` → `trim()`, et si vide après trim → **`null`** ; si absent/non-string → `null`. (Le label vide est **valide** ici — colonne nullable ; ≠ fériés où le label est requis.)
   - **Ne PAS** modifier les routes participants / unavailabilities / group-exclusions / holidays ni `lib/supabase/admin.ts`.
   [Source: daily-wheel/app/api/unavailabilities/route.ts (intégralité L1-119 — `validateInsert` jour/plage L50-65 modèle EXACT, garde L67-75, `safeEqual` L25-30, `pickAllowed` L32-41, `mapDbError` L43-48, ops insert/delete L91-118, 409 si 0 ligne L98, rejet update L87, normalisation `day → date2=null` L62) ; daily-wheel/app/api/holidays/route.ts (modèle label + allowlist 2 colonnes L11/L100-111) ; ARCHITECTURE-SPINE.md#AD-8 ; #AD-9 ; #AD-14 ; #AD-17]

4. **Réducteur optimiste pur des jours off + réconciliation Realtime (AD-5, AD-13, AC9).** Sur le modèle **exact** de `holidays-reducer.ts` (3.2) — les deux réducteurs (holidays, unavailabilities) sont **identiques** (cycle insert + delete, pas de patch) ; seul le type de ligne change :
   - Créer `daily-wheel/lib/store/team-off-days-reducer.ts` (PUR) : `export type StoreTeamOffDay = TeamOffDay & { pending?: boolean; failed?: boolean }`, `type Action`, `export function teamOffDaysReducer(state, action)`. Transitions **identiques** à `holidaysReducer` : `HYDRATE { rows }` ; `REALTIME { event }` (délègue à `reconcileTeamOffDays`) ; `ADD_OPTIMISTIC { tempId, row }` ; `SET_PENDING { id }` ; `CONFIRM { tempId, row }` ; `ROLLBACK { tempId }` ; `MARK_FAILED { id }` ; `RESTORE { row }` (upsert) ; `REMOVE { id }`. PUR : aucun import React/DOM/Supabase/`Date`. **Références stables** sur no-op (préserver `state` à l'identique — cf. test de pureté `REMOVE` id absent).
   - **Réconciliation Realtime** : **réutiliser le générique `reconcileById<T>` existant** (`lib/store/reconcile.ts` — AD-15 dédup `id`+`updated_at`, AD-16 LWW lexicographique). Ajouter, sur le modèle des alias existants (L67-96) : `export type TeamOffDayChangeEvent = ChangeEvent<TeamOffDay>` + `export function reconcileTeamOffDays(state: TeamOffDay[], event: TeamOffDayChangeEvent): TeamOffDay[] { return reconcileById(state, event) }`, et l'import du type `TeamOffDay`. **Aucune modif de la logique générique** — juste un alias typé de plus.
   - **TDD rouge d'abord** : `daily-wheel/tests/team-off-days-reducer.unit.test.ts` (import absent → ROUGE) couvrant les transitions + quelques cas `reconcileTeamOffDays` (dédup écho `id`+`updated_at`, INSERT inconnu = upsert, DELETE). → VERT. Helper `o(over)` calqué sur le helper `h(over)` de `holidays-reducer.unit.test.ts` (avec une ligne jour **et** une ligne plage dans les cas).
   [Source: daily-wheel/lib/store/holidays-reducer.ts (intégralité L1-59 : `StoreHoliday` L11, `Action` L13-22, reducer L24-59 — modèle exact) ; daily-wheel/lib/store/unavailabilities-reducer.ts (variante avec ligne jour/plage L1-62) ; daily-wheel/lib/store/reconcile.ts (`reconcileById<T>` L25-64 inchangé, `ChangeEvent<T>` L18-21, alias L67-96 modèle) ; daily-wheel/tests/holidays-reducer.unit.test.ts (modèle test pur + helper `h` L11-19) ; ARCHITECTURE-SPINE.md#AD-5 ; #AD-13 ; #AD-15 ; #AD-16]

5. **Store : 5ᵉ slice jours off + 5ᵉ canal Realtime — toujours UN SEUL prompt passphrase (AD-8, AD-5, AD-17).** Étendre le provider (`participants-store.tsx`) avec la slice `teamOffDays`, **consommant `useWriteQueue` déjà extrait (3.2)**. **Aucun refactor de la file** : elle est table-agnostique et accepte les specs jours off sans changement de contrat.
   - **Slice** : `const [teamOffDays, dispatchO] = useReducer(teamOffDaysReducer, initialTeamOffDays as StoreTeamOffDay[])` + `stateRefO` (maintenu par `useEffect`, modèle `stateRefH` L150/L160-162) + `oseqRef` (ids temporaires `otemp:<n>`). Exposer dans `StoreValue` : `teamOffDays: StoreTeamOffDay[]`, `addTeamOffDay(input: { kind: 'day' | 'range'; date1: string; date2: string | null; label: string })`, `removeTeamOffDay(id)`, `retryTeamOffDay(id)`. `toServerTeamOffDay(o: StoreTeamOffDay): TeamOffDay` calqué sur `toServerHoliday` L72-74 / `toServerUnavailability` L53-62 (inclut `kind`/`date1`/`date2`/`label`).
   - `addTeamOffDay` : **valider d'abord** (client, RÉUTILISER `isValidRange` du domaine — modèle `addUnavailability` L281-305) → si invalide, `setError(message FR)` + **aucune écriture** :
     - `date1` vide → « Veuillez saisir une date. »
     - si `kind === 'range'` : `input.date2` vide → « Veuillez saisir la date de fin. » ; `!isValidRange(date1, input.date2)` → « La date de fin doit être postérieure ou égale au début. »
     - **PAS de pré-check doublon** (aucune contrainte d'unicité ; ≠ fériés/indispos-jour). Un même jour off peut être saisi deux fois — c'est accepté (epic n'exige pas de dédup).
     - **`label` optionnel** : `const label = input.label.trim() || null` (vide → `null`, pas d'erreur).
     - Sinon : `date2 = kind === 'range' ? input.date2 : null` ; `tempId = 'otemp:<n>'` ; `row: TeamOffDay = { id: tempId, kind, date1, date2, label, updated_at: '' }` ; `dispatchO(ADD_OPTIMISTIC { tempId, row })` ; puis `runWrite({ write: pp => writeTeamOffDay('insert', { data: { kind, date1, date2, label } }, pp), onPending: () => dispatchO(SET_PENDING{id:tempId}), onConfirm: r => dispatchO(CONFIRM{tempId, row: r as TeamOffDay}), onFailed: () => dispatchO(MARK_FAILED{id:tempId}), rollback: () => dispatchO(ROLLBACK{tempId}), onConflictRehydrate: async () => { try { dispatchO(HYDRATE{rows: await fetchTeamOffDays()}) } catch {} }, retryKey: tempId })`. (Calque exact d'`addHoliday` L424-460 / `addUnavailability` L281-334.)
   - `removeTeamOffDay(id)` : snapshot via `stateRefO` → `dispatchO(REMOVE{id})` → `runWrite({ write: pp => writeTeamOffDay('delete', { id }, pp), onConfirm: () => {}, rollback: () => dispatchO(RESTORE{row: snapshot}), deleteIdempotent: true, retryKey: null })` (delete idempotent — calque `removeHoliday` L463-480).
   - `retryTeamOffDay(id)` : `useCallback((id) => retry(id), [retry])` (calque `retryHoliday` L482).
   - **5ᵉ abonnement Realtime** : un canal `team-off-days-rt` sur `public.team_off_days` (event `*`) → `dispatchO(REALTIME{event})` via `mapChange<TeamOffDay>(payload)` ; re-hydratation `fetchTeamOffDays` → `dispatchO(HYDRATE)` au `SUBSCRIBED` (AD-6). Calque exact du canal `holidays-rt` (L569-594).
   - **Invariant AD-8 préservé** : N mutations (participants + indispos + exclusions + fériés + **jours off** confondus) sans passphrase → UN seul prompt → rejeu groupé. La file (`useWriteQueue`) est déjà op- et table-agnostique → accepte les specs jours off sans changement.
   - **Provider signature** : ajouter `initialTeamOffDays: TeamOffDay[]` aux props (modèle `initialHolidays` L118/L124). Ajouter les imports : `fetchTeamOffDays`, `writeTeamOffDay`, `type TeamOffDay` (`@/lib/data/team-off-days`) ; `teamOffDaysReducer`, `type StoreTeamOffDay` (`@/lib/store/team-off-days-reducer`).
   [Source: daily-wheel/lib/store/participants-store.tsx (slice holidays L136/L150/L160-162, `hseqRef` L145, `addHoliday` L424-460, `removeHoliday` L463-480, `retryHoliday` L482, `toServerHoliday` L72-74, `addUnavailability` jour/plage L281-334, `toServerUnavailability` L53-62, canal `holidays-rt` L569-594, `mapChange` L632-645, `StoreValue` L86-110, `value` L596-620, signature provider L114-126, imports L13-38, `isValidRange` import L35) ; daily-wheel/lib/store/use-write-queue.ts (contrat `WriteSpec` L30-39, `runWrite`/`retry` table-agnostiques — INCHANGÉ) ; ARCHITECTURE-SPINE.md#AD-5 ; #AD-6 ; #AD-8 ; #AD-17]

6. **UI : panneau repliable « Jours off d'équipe » + badge, dans la carte Options (UX-DR4, UX-DR5, FR8, NFR4/NFR5).** Créer `daily-wheel/components/TeamOffDaysPanel.tsx` — **hybride** de `HolidaysPanel.tsx` (toggle repliable + badge + montage Options) et `UnavailabilityPanel.tsx` (bascule Jour/Plage + date1/date2) — et le **monter dans la carte Options** (sous `<HolidaysPanel />`) :
   - **Toggle + badge** (UX-DR4/UX-DR5) : bouton repliable « Jours off d'équipe » avec flèche (`▶`/rotation à l'ouverture) et **badge de comptage** = `teamOffDays.length` (masqué si 0). État d'ouverture **local** (`useState`, jamais dans le store). `aria-expanded` sur le bouton. (Calque `HolidaysPanel` L29-42.)
   - **Formulaire** : un `<select>` Type (Jour/Plage, modèle `UnavailabilityPanel` L38-46) + `<input type="date">` date1 (label « Du : » si plage, « Date : » sinon) + `<input type="date">` date2 **conditionnel** (si `kind === 'range'`, modèle L57-68) + `<input type="text">` libellé **optionnel** (placeholder « Libellé optionnel (ex. Pont de l'Ascension) ») + bouton « ＋ Ajouter ». Au submit → `addTeamOffDay({ kind, date1, date2: kind === 'range' ? date2 : null, label })` puis reset des champs. La validation (date1 requis, plage `date2 >= date1`) est portée par le store (AC5) → afficher l'erreur FR du store ; **ne PAS dupliquer** la validation dans le composant. (Le `label` est facultatif → ne pas bloquer si vide.)
   - **Liste des tags** : sous le formulaire, un jour off par tag, **trié par `date1` croissante** (`[...teamOffDays].sort((a,b) => a.date1.localeCompare(b.date1))`), **supprimable** via ✕ → `removeTeamOffDay(o.id)`. Texte du tag : pour un **jour** → `formatDateFr(o.date1)` ; pour une **plage** → `${formatDateFr(o.date1)} → ${o.date2 ? formatDateFr(o.date2) : ''}` (modèle `UnavailabilityPanel` L78-81) ; **suffixer le libellé s'il existe** : `o.label ? ` — ${o.label}` : ''`. État vide : « Aucun jour off défini. ». Désactiver le ✕ d'un tag `pending` ; classe `.failed` si `failed`.
   - Réutiliser `formatDateFr` de `@/lib/format/date-fr.ts` (parse **local**). **Tout en français** (NFR4), **charte CSS existante**, **sans dégradé**, lisible **≤ 520 px** (NFR5, UX-DR7). A11y (UX-DR6) : `<select>`/`<input>` natifs avec labels explicites, bouton toggle `aria-expanded`. Consomme `useParticipants()` (le team store) → rendu **dans** `<ParticipantsStoreProvider>`.
   [Source: daily-wheel/components/HolidaysPanel.tsx (intégralité L1-105 : toggle+badge+`aria-expanded` L31-42, badge conditionnel L41, formulaire L48-69, tags triés+✕+`.filter(Boolean).join(' ')` L71-100, `disabled={pending}` L90, état vide L73, conso `useParticipants` L14 — modèle Options) ; daily-wheel/components/UnavailabilityPanel.tsx (bascule Jour/Plage `<select>` L38-46, date2 conditionnel L57-68, libellé tag jour/plage L78-81 — modèle jour/plage) ; daily-wheel/lib/format/date-fr.ts (`formatDateFr`/`parseYMD` locaux) ; docs/prd.md §3 (UX-DR4/5/6/7) ; ARCHITECTURE-SPINE.md#Consistency-Conventions (dates locales)]

7. **CSS panneau jours off responsive + montage Options + SSR hydration (AC6, AD-6).**
   - **CSS** : porter dans `daily-wheel/app/globals.css` un bloc `.team-off-*` calqué sur `.holidays-*` (L475-576) — toggle, badge, arrow (+`.open` rotation 90°), panel (+`.open`/title), form (+`label`/`input[type=date]`/`input[type=text]`/`select`/`button`), tags (+`.pending`/`.failed` + bouton ✕), empty. **Réutiliser les tokens existants** (`--primary`, `--primary-dark`, `--primary-light`, `--radius-sm`, `--card-bg`, `--text-muted`). **Aucun dégradé** ; `≤ 520 px` : formulaire empilé, inputs pleine largeur (étendre le bloc media L579-613, calque `.holidays-form` L607-611) ; `prefers-reduced-motion` (L615+) déjà global. Le `<select>` Type doit reprendre le style des `<select>` existants (cf. `.indispo-form select` L315-329 / `.group-excl-form select` L423-433). *(Alternative légitime — factoriser un jeu de classes génériques `.team-panel-*` partagé par exclusions + fériés + off : **hors-scope** sauf décision ; par défaut, dupliquer le bloc comme l'ont fait 3.1 et 3.2.)*
   - **Montage Options + SSR** : `daily-wheel/app/page.tsx` — ajouter `fetchTeamOffDays().catch((): TeamOffDay[] => [])` au `Promise.all` (5ᵉ élément), passer `initialTeamOffDays` au provider, et monter `<TeamOffDaysPanel />` sous `<HolidaysPanel />` dans la `<section className="card">` Options (L49-53). Carte Résultat **inchangée**. Ajouter les imports `fetchTeamOffDays`, `type TeamOffDay` et `TeamOffDaysPanel`.
   [Source: daily-wheel/app/globals.css (bloc `.holidays-*` L475-576 modèle, tokens L2-26, media ≤520px L579-613 dont `.holidays-form` L607-611, reduced-motion L615, selects `.indispo-form select` L315-329 / `.group-excl-form select` L423-433) ; daily-wheel/app/page.tsx (Promise.all 4 fetchs L18-23, provider+Options L41-54, signature provider à étendre L41-46, imports L1-8) ; daily-wheel/lib/store/participants-store.tsx (signature provider L114-126) ; ARCHITECTURE-SPINE.md#AD-6]

8. **Tests + non-régression globale (AD-13, NFR9).**
   - **Filet CI pur (obligatoire)** : `tests/team-off-days.unit.test.ts` (AC1) **et** `tests/team-off-days-reducer.unit.test.ts` (AC4) écrits **rouge → vert** ; **ajoutés à `test:unit`** dans `package.json` (liste explicite L14, après `holidays-reducer.unit`). **Réviser** le bloc `isTeamNonSessionDay` de `group-exclusions.unit.test.ts` L93-102 (assertion « teamOffDays sans effet » → « skipWeekends seul, branche 4.1 », AC1).
   - **Intégration live (optionnelle, gated)** : un `tests/team-off-days.write.integration.test.ts` calqué sur `holidays.write.integration.test.ts` / `unavailabilities.write.integration.test.ts` (insert jour → insert plage → **plage inversée date2<date1 → 400** → `update`→400 → delete → 409 re-delete ; label vide accepté ; gate `SUPABASE_TEST_LIVE`) est **bienvenu mais non requis** pour le « vert » CI.
   - **Non-régression (NFR9)** : toutes les suites existantes restent **vertes** (`write-error`/`reconcile`/`parse-names`/`participants-reducer`/`availability`/`unavailabilities-reducer`/`group-exclusions`/`group-exclusions-reducer`/`holidays`/`holidays-reducer`) ; les chemins **participants + indispos + exclusions + fériés** conservent un comportement **identique** (la 5ᵉ slice ne change ni le contrat `WriteSpec` ni la file `useWriteQueue`) ; `reconcileById<T>` et ses alias existants inchangés ; `isPersonUnavailable` (domaine) inchangé (juste réutilisé). `npm run lint` 0, `npx tsc --noEmit` 0, `npm run build` vert (route `/api/team-off-days` enregistrée). Grep `.next/static` : **aucun** secret (`SUPABASE_SECRET_KEY`/`TEAM_PASSPHRASE`/`service_role` + valeur passphrase → 0).
   [Source: daily-wheel/package.json (`test:unit` L14 — 10 suites actuelles à porter à 12) ; daily-wheel/tests/holidays.write.integration.test.ts + tests/unavailabilities.write.integration.test.ts (modèles gated, gate `SUPABASE_TEST_LIVE`) ; daily-wheel/vitest.config.ts (gate, stub `server-only`) ; ARCHITECTURE-SPINE.md#AD-13 ; 3-2-jours-feries.md#AC9 (critère « vert »)]

## Tasks / Subtasks

> ⚠️ **Tout le code et toutes les commandes `npm` sont sous `daily-wheel/`** (variance structurelle héritée 1.1→3.2). Le workflow CI à la racine n'est **pas** touché par cette story.
> 🟢 **Pas de Task de refactor** (≠ 3.2) : `useWriteQueue` est déjà extrait (commit `f847156`). On ajoute directement la 5ᵉ slice.

- [x] **Tâche 1 — Domaine pur : `isTeamOffDay` (réutilise `isPersonUnavailable`) + câblage `isTeamNonSessionDay` (rouge → vert)** (AC: 1, 8)
  - [x] Écrire `daily-wheel/tests/team-off-days.unit.test.ts` (ROUGE : `isTeamOffDay` absent) : `isTeamOffDay` (vide/jour présent/jour absent/plage bornes incluses/hors plage/`date2:null` défensif) ; `isTeamNonSessionDay` avec `teamOffDays` (neutralise ; combiné exclusions/fériés ; ctx sans teamOffDays délègue).
  - [x] `team-availability.ts` : passer l'import `availability` en runtime (`isPersonUnavailable` + `type DayOrRange`) ; ajouter `isTeamOffDay` (alias) ; brancher en `||` dans `isTeamNonSessionDay`. **Signature/types inchangés.**
  - [x] **Réviser** l'assertion « teamOffDays / skipWeekends sans effet » de `group-exclusions.unit.test.ts` L93-102 (→ « skipWeekends seul, branche 4.1 non câblée » ; retirer `teamOffDays`). VERT.

- [x] **Tâche 2 — Data : type + `fetch`/`write` jours off** (AC: 2, 8)
  - [x] Créer `daily-wheel/lib/data/team-off-days.ts` : `TeamOffDay` (label nullable), `fetchTeamOffDays`, `TeamOffDayWriteOp`/`Payload` (insert+delete), `writeTeamOffDay` (POST `/api/team-off-days`, `WriteError` depuis `@/lib/data/write-error`). Copie structurelle d'`unavailabilities.ts` (jour/plage) sans `participant_id` + `label`. `tsc` vert.

- [x] **Tâche 3 — Route proxy `/api/team-off-days`** (AC: 3)
  - [x] Créer `daily-wheel/app/api/team-off-days/route.ts` : mirroir route unavailabilities ; allowlist `['kind','date1','date2','label']` ; ops `insert`/`delete` (rejet `update`→400) ; validation serveur (kind day/range, date1 YMD, plage date2>=date1, day→date2 null, **label optionnel→null si vide**) ; 409 si delete 0 ligne ; garde `timingSafeEqual` identique ; **pas de cas 23505 dédié** (pas d'unicité).
  - [x] Autres routes et `lib/supabase/` non touchées.

- [x] **Tâche 4 — Réducteur optimiste pur jours off + alias réconciliation (rouge → vert)** (AC: 4, 8)
  - [x] Ajouter `reconcileTeamOffDays` (alias `reconcileById<TeamOffDay>`) + `TeamOffDayChangeEvent` + import `TeamOffDay` dans `lib/store/reconcile.ts` (générique inchangé).
  - [x] Écrire `daily-wheel/tests/team-off-days-reducer.unit.test.ts` (ROUGE) : transitions + cas `reconcileTeamOffDays`. Helper `o(over)` (ligne jour + ligne plage).
  - [x] Créer `daily-wheel/lib/store/team-off-days-reducer.ts` (`StoreTeamOffDay`, `Action`, `teamOffDaysReducer`). PUR. VERT.

- [x] **Tâche 5 — Store : 5ᵉ slice jours off + 5ᵉ canal Realtime** (AC: 5, 8)
  - [x] `participants-store.tsx` : `useReducer(teamOffDaysReducer)` + `stateRefO` + `oseqRef` + `toServerTeamOffDay` ; `addTeamOffDay` (valide date1/plage via `isValidRange` → message FR + aucune écriture si invalide ; label optionnel→null ; **pas de dédup** ; sinon optimiste + insert), `removeTeamOffDay` (REMOVE + delete idempotent), `retryTeamOffDay`→`retry(id)`. Exposés dans `StoreValue` + `value`.
  - [x] 5ᵉ abonnement `team-off-days-rt` + re-hydratation `SUBSCRIBED` (AD-6) via `mapChange<TeamOffDay>`. Signature provider + `initialTeamOffDays` + imports. **File/`runWrite` non modifiés** (consommés via `useWriteQueue`) → un seul prompt couvre 5 tables.

- [x] **Tâche 6 — UI : panneau repliable « Jours off d'équipe » + badge** (AC: 6)
  - [x] Créer `daily-wheel/components/TeamOffDaysPanel.tsx` (toggle `aria-expanded` + badge ; `<select>` Jour/Plage + date1 + date2 conditionnel + `<input type=text>` libellé optionnel + « ＋ Ajouter » ; tags triés par date1, jour=`formatDateFr(date1)` / plage=`date1 → date2`, suffixe `— label` si présent, + ✕ ; état vide « Aucun jour off défini. » ; affichage erreur store ; `pending` désactivé). Consomme `useParticipants()`. `formatDateFr` réutilisé.

- [x] **Tâche 7 — CSS + montage Options + SSR hydration** (AC: 7)
  - [x] Classes `.team-off-*` portées dans `app/globals.css` (charte, tokens existants, sans dégradé, `<select>` aligné sur l'existant, formulaire empilé ≤520px, reduced-motion global).
  - [x] `app/page.tsx` : `fetchTeamOffDays()` ajouté au `Promise.all` (`.catch(() => [])`) + `initialTeamOffDays` au provider ; `<TeamOffDaysPanel />` monté sous `<HolidaysPanel />` dans Options + imports. Signature `ParticipantsStoreProvider` adaptée. Carte Résultat inchangée.

- [x] **Tâche 8 — Scripts de test + non-régression** (AC: 8)
  - [x] `package.json` : `team-off-days.unit` + `team-off-days-reducer.unit` ajoutés à `test:unit`.
  - [x] (Optionnel) `tests/team-off-days.write.integration.test.ts` gated.
  - [x] Non-régression : `npm run lint` 0, `npx tsc --noEmit` 0, `npm run test:unit` vert (12 suites), `npm test` vert (flake Realtime vert au retry), `npm run build` vert (`/api/team-off-days` enregistrée). Grep `.next/static` : 0 secret.

## Dev Notes

### Contexte & périmètre
- **3ᵉ et DERNIÈRE story d'Epic 3 (contraintes d'équipe)** : ouvre `team_off_days` (créée vide en 1.2) à l'écriture, **ajoute la dernière branche `teamOffDays`** au prédicat unique `isTeamNonSessionDay` (signature figée en 3.1, source AD-3, consommée en 4.2), et ajoute une **5ᵉ table** au team store. Après cette story, seule `skipWeekends` (4.1) reste à câbler dans le prédicat. [Source: epics.md#Epic-3 ; #Story-3.3]
- **Feature NEUVE (FR8 « Nouveau ») — aucune parité legacy** : on conçoit le comportement (jour/plage + libellé optionnel, tri par date1, neutralisation équipe) **sans** fixture legacy à mirrorer (comme 3.2). [Source: epics.md#FR8]
- **HYBRIDE de patrons déjà livrés** : jour/plage = **2.3** (`unavailabilities`) ; niveau-équipe + libellé + panneau Options + branche prédicat = **3.2** (`holidays`). Différences vs 3.2 : (a) `label` **optionnel** (colonne nullable) ; (b) **pas d'unicité → pas de dédup, pas de 23505** ; (c) jour **ou** plage.
- **In-scope :** sous-prédicat pur `isTeamOffDay` (réutilise `isPersonUnavailable`) + câblage `isTeamNonSessionDay` ; couche data + route proxy `team_off_days` ; réducteur optimiste pur + alias réconciliation ; **5ᵉ slice store + 5ᵉ canal Realtime** (un seul prompt) ; UI panneau repliable jour/plage + badge dans Options ; CSS ; SSR hydration + montage.
- **Hors-scope :** **effet sur la génération du planning** → l'exclusion effective des jours off via `isTeamNonSessionDay` (boucle de génération + deadline EDF) est vérifiée en **Story 4.2** (epics.md#Story-3.3 : « l'effet à la génération est vérifié en Story 4.2 »). On livre la **donnée + le prédicat testé**, pas la génération. **Week-ends** → 4.1. **Édition** d'un jour off existant → non prévue (ajout/suppression unitaires). **Dédup** d'un jour off → **non** (pas d'unicité, epic ne l'exige pas). **Rename `team-store`** → optionnel/déféré. **Factorisation de classes CSS génériques** → hors-scope sauf décision.

### ⚠️ Variance structurelle héritée (CRITIQUE — rappel 1.1→3.2)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Tout le code, tous les `npm`, tout grep `.next/` → **depuis `daily-wheel/`**. [Source: 3-2-*.md#Variance-structurelle]
- État réel pertinent (sous `daily-wheel/`, vérifié au commit `f847156`) — **réutiliser, ne pas casser** :
  - `supabase/migrations/20260622121017_init_schema.sql` : table `team_off_days` **DÉJÀ créée** (L42-49 : `id uuid PK`, `kind text check(day,range)`, `date1 date not null`, `date2 date` nullable, `label text` **nullable**, `updated_at`), **pas d'unique**, RLS **SELECT anon** (L77), **dans la publication realtime** (L89) + `REPLICA IDENTITY FULL` (L96). **Aucune migration à écrire.**
  - `lib/domain/team-availability.ts` : `isTeamNonSessionDay` (L85-87, branches exclusions+fériés), `TeamConstraints.teamOffDays?: DayOrRange[]` **déjà déclaré** (L34), `import type { DayOrRange }` (L15, à passer en runtime). Cette story **ajoute** `isTeamOffDay` + le câble — **sans toucher la signature**.
  - `lib/domain/availability.ts` : `isPersonUnavailable` (L23-32) = **logique jour/plage exacte à RÉUTILISER** ; `isValidRange` (L37-40) = validation plage réutilisée par le store. **Module pur feuille** — import domaine→domaine conforme AD-1.
  - `lib/data/unavailabilities.ts` + `lib/data/holidays.ts` + `lib/data/write-error.ts` : **modèles** de la couche data (type + fetch + ops insert/delete + `WriteError` partagé). `unavailabilities` pour jour/plage, `holidays` pour label/équipe.
  - `app/api/unavailabilities/route.ts` : **modèle exact** de la route (validation jour/plage `validateInsert` L50-65, garde `timingSafeEqual`, `pickAllowed`, ops insert/delete, 409 si 0 ligne). `app/api/holidays/route.ts` : modèle label + allowlist courte.
  - `lib/store/use-write-queue.ts` : `runWrite`/`WriteSpec`/`retry` **table-agnostiques** (extrait 3.2) — **INCHANGÉ**, juste consommé par la 5ᵉ slice.
  - `lib/store/participants-store.tsx` : `addHoliday`/`removeHoliday`/`retryHoliday` (L424-482) + `toServerHoliday` (L72-74) + canal `holidays-rt` (L569-594) = **modèles** de la 5ᵉ slice ; `addUnavailability` (L281-334) = modèle de la **validation jour/plage** côté store.
  - `lib/store/reconcile.ts` : `reconcileById<T>` + `ChangeEvent<T>` + alias (L67-96) → **réutiliser** (ajout d'un simple alias `reconcileTeamOffDays`).
  - `lib/store/holidays-reducer.ts` (= `unavailabilities-reducer.ts`) : **modèle exact** du réducteur pur (cycle insert+delete).
  - `components/HolidaysPanel.tsx` : **modèle** du panneau Options (toggle+badge+montage). `components/UnavailabilityPanel.tsx` : **modèle** de la bascule Jour/Plage (`<select>` + date2 conditionnel + libellé de tag jour/plage). `components/PassphrasePrompt.tsx` : **inchangé** (déclenché par le store, couvre désormais 5 tables).
  - `lib/format/date-fr.ts` : `formatDateFr`/`parseYMD` **déjà créés** (parse **local**) → réutiliser, ne PAS recréer.
  - `app/globals.css` : tokens (L2-26), `.holidays-*` (L475-576 modèle), `.indispo-form select`/`.group-excl-form select` (styles de `<select>`), media `≤520px` (L579-613), reduced-motion (L615) → réutiliser/étendre. **Pas de token `--team-off-*`** → réutiliser l'existant.
  - `app/page.tsx` : Server Component `force-dynamic`, `Promise.all` SSR (L18-23, 4 fetchs), provider enveloppant **déjà** `ParticipantsCard` **et** la carte Options (L41-54) → **ajouter** le 5ᵉ fetch, `initialTeamOffDays`, et monter `<TeamOffDaysPanel />` sous `<HolidaysPanel />`.
  - `package.json` : `test:unit` = liste explicite (L14, 10 suites) → **y ajouter** les 2 nouveaux fichiers. **Aucune** lib d'état/UI/date (React + natifs) — **ne pas** ajouter de dépendance.
  - `vitest.config.ts` : alias `@`, stub `server-only`, gate `SUPABASE_TEST_LIVE` — **ne pas retoucher**.

### Décisions d'architecture qui cadrent cette story
- **AD-3 (source unique `isTeamNonSessionDay`)** : on **ajoute** la dernière branche `teamOffDays` (`|| isTeamOffDay(ctx.teamOffDays ?? [], date)`) sans toucher la signature `(date, ctx)`. Seul `skipWeekends` (4.1) reste non câblé. L'intégration effective (génération + deadline EDF) = **Story 4.2**.
- **Réutilisation `isPersonUnavailable` = anti-réinvention clé** : la membership jour/plage est **déjà** écrite et testée (`availability.unit.test.ts`, 2.3). `isTeamOffDay` la **réexpose** sous un nom métier — **ne pas dupliquer** les comparaisons de bornes. Import domaine→domaine (feuille→feuille), conforme AD-1.
- **Pas d'unicité / pas de dédup** : `team_off_days` n'a aucune contrainte d'unicité (≠ `holidays.date unique`, ≠ dédup jour des indispos). Donc **pas de pré-check client `some(...)`**, **pas de message « déjà ajouté »**, **pas de cas `23505`→409 dédié** dans la route. Plus simple que 3.2.
- **`label` optionnel** : colonne nullable. Client : `input.label.trim() || null`. Serveur : si présent et non vide après trim → garder, sinon `null`. Un jour off **sans** libellé est **valide**.
- **AD-5/AD-17 (optimiste + taxonomie)** : insert jour off = `ADD_OPTIMISTIC` + `writeTeamOffDay('insert')` ; delete = `REMOVE` + `writeTeamOffDay('delete')` ; rollback/restore + classes auth/validation/conflict/transient **identiques** aux autres tables. Delete 409 « introuvable » = succès idempotent (AD-16).
- **AD-8 (passphrase)** : la file table-agnostique (`useWriteQueue`) accepte les specs jours off → **un seul** prompt pour N mutations **toutes tables confondues** (participants + indispos + exclusions + fériés + jours off).
- **AD-14 (contrat d'écriture)** : `{ op, id?, data? }` + allowlist **serveur** `kind,date1,date2,label`. Une route **par table** → `/api/team-off-days`. Pas d'`update`.
- **AD-15/AD-16 (réconciliation)** : `reconcileById<TeamOffDay>` dédup `id`+`updated_at`, LWW lexicographique — identique aux autres tables.
- **AD-11/AD-7 (chemins asymétriques)** : lecture `team_off_days` via clé low-privilege (`fetchTeamOffDays` + abonnement) ; écriture **uniquement** via `/api/team-off-days`. Aucun composant ne touche `supabase.from(...)` ni `fetch('/api/...')` — tout via le store → `lib/data/`.
- **AD-13 (CI pure)** : seuls `team-off-days.unit` + `team-off-days-reducer.unit` (+ existants) tournent en CI **sans secrets**. Store/route/UI **non** unit-testés (cohérent 1.5→3.2 ; pas de RTL/jsdom — **ne pas** ajouter de dépendance) ; preuve = **vérification manuelle**.
- **Convention dates (CRITIQUE)** : tout en `YYYY-MM-DD` **local**. `<input type=date>` produit déjà du `YYYY-MM-DD`. `formatDateFr` parse en **local**, jamais `new Date('YYYY-MM-DD')` (UTC → décalage). `isTeamOffDay`/`isValidRange` = comparaisons de **chaînes** YMD (lexicographiques = chronologiques) → aucun recours à `Date`.

### Previous Story Intelligence (3.2 / 2.3)
- **3.2 = patron direct pour le côté « équipe »** (data, route, reducer, panel Options, tests, 4ᵉ slice/canal). **2.3 = patron direct pour le côté « jour/plage »** (validation `isValidRange`, `<select>` Jour/Plage, date2 conditionnel, tag jour/plage). 3.3 = **fusion mécanique** des deux.
- **`useWriteQueue` déjà extrait (3.2)** : la 5ᵉ slice le consomme **sans refactor** — c'est le bénéfice prévu par [[store-extraction-plan]]. Ne **pas** ré-extraire ni modifier le hook.
- **Test pur rouge→vert** : `holidays.unit` / `holidays-reducer.unit` = modèles. Reproduire pour `team-off-days`.
- **`isTeamNonSessionDay` change de comportement** : un test `group-exclusions.unit` (L93-102) affirme que `teamOffDays` est « sans effet » — **à corriger** (c'est désormais neutralisant). Ne pas laisser ce test masquer une régression (même schéma que la révision « holidays sans effet » faite en 3.2).
- **Pas de dédup** (≠ 3.2) : ne PAS copier le pré-check `some(h => h.date === date)` d'`addHoliday`. Copier plutôt la **validation de plage** d'`addUnavailability`.
- **`retry` rejoue l'op d'origine** : `failedWritesRef` par clé ; `retryTeamOffDay` rejoue le `WriteSpec` insert (le delete restaure la ligne, pas de retry).
- **Flake Realtime connu (1.3→3.2)** : 1er `npm test` peut timeouter sur le handshake puis passer au retry — transitoire, **pas** une régression. Avec un **5ᵉ** canal, surveiller mais ne pas « corriger » un flake de handshake.
- **CI Node 22.x** + Vercel `framework=nextjs` (`vercel.json`) : **ne pas** retoucher CI/Vercel.
- **Dépendances Epic 1/2/3 en review** (non `done`) mais commitées et fonctionnelles : construire dessus.
- **Push Git** : remote via alias SSH `github-perso` → `Infinter/SpinThatWeeklyWheel` (compte SoloOz). [Source: MEMORY:git-remote-push-setup]

### Points techniques (Next.js 16 / React 19 — janv. 2026)
- **Pas de nouvelle techno, aucune recherche web requise.** Stack figée (Next 16.2.9, React 19.2.4, supabase-js 2.108.x). Story 100 % domaine pur (réutilisation) + data + route + store + UI + CSS, sur patterns existants.
- **`isTeamOffDay` sans `Date`** : délègue à `isPersonUnavailable` (comparaisons de chaînes YMD). Déterministe, pur, sans timezone.
- **`<input type="date">`** : valeur native `YYYY-MM-DD`. **`<input type="text">`** : libellé trimé → `null` si vide. **`<select>`** : `kind` `'day'|'range'`.
- **Snapshot avant optimiste** : pour `removeTeamOffDay`, lire la ligne via `stateRefO.current.find(...)` **avant** `REMOVE` pour le `RESTORE`. `stateRefO` maintenu par `useEffect` (modèle `stateRefH` L150/L160-162).
- **Cinq canaux Realtime** : `participants-rt` + `unavailabilities-rt` + `group-exclusions-rt` + `holidays-rt` (existants, inchangés) + `team-off-days-rt` (nouveau) ; chacun se re-hydrate au `SUBSCRIBED`. Dédup d'écho par `reconcileById`.

### Project Structure Notes
- Arborescence touchée (tout sous `daily-wheel/`) :
  ```
  lib/domain/team-availability.ts                # UPDATE (isTeamOffDay réutilise isPersonUnavailable + branche teamOffDays ; signature inchangée ; import availability runtime — AC1)
  lib/data/team-off-days.ts                       # NEW (type + fetch + write insert/delete ; label nullable — AC2)
  app/api/team-off-days/route.ts                  # NEW (proxy écriture insert/delete ; validation jour/plage ; label optionnel — AC3)
  lib/store/team-off-days-reducer.ts              # NEW (réducteur optimiste PUR — AC4)
  lib/store/reconcile.ts                          # UPDATE léger (alias reconcileTeamOffDays + TeamOffDayChangeEvent — AC4, générique inchangé)
  lib/store/participants-store.tsx                # UPDATE (5ᵉ slice jours off + 5ᵉ canal RT ; consomme useWriteQueue inchangé — AC5)
  components/TeamOffDaysPanel.tsx                 # NEW (panneau repliable Options, jour/plage + libellé optionnel — AC6)
  app/globals.css                                 # UPDATE (classes .team-off-* — AC7)
  app/page.tsx                                    # UPDATE (fetchTeamOffDays + initialTeamOffDays + montage panneau — AC7)
  package.json                                    # UPDATE (team-off-days.unit + team-off-days-reducer.unit dans test:unit — AC8)
  tests/team-off-days.unit.test.ts                # NEW (preuve domaine pur — AC1)
  tests/team-off-days-reducer.unit.test.ts        # NEW (preuve réducteur pur — AC4)
  tests/group-exclusions.unit.test.ts             # UPDATE (réviser assertion « teamOffDays sans effet » L93-102 — AC1)
  tests/team-off-days.write.integration.test.ts   # NEW optionnel gated (AC8)
  _bmad-output/.../sprint-status.yaml             # UPDATE (statut 3.3 ; géré par le workflow)
  ```
- **Inchangés (réutilisés)** : `app/api/{participants,unavailabilities,group-exclusions,holidays}/route.ts`, `lib/supabase/{client,admin}.ts`, `lib/data/{participants,unavailabilities,group-exclusions,holidays,write-error}.ts`, `lib/store/{parse-names,participants-reducer,unavailabilities-reducer,group-exclusions-reducer,holidays-reducer,use-write-queue}.ts`, `lib/domain/availability.ts` (réutilisé, non modifié), `lib/format/date-fr.ts`, `components/{ParticipantsCard,UnavailabilityPanel,GroupExclusionsPanel,HolidaysPanel,PassphrasePrompt}.tsx`, `app/layout.tsx`, `next.config.ts`, `vercel.json`, `vitest.config.ts`, **migrations SQL** (table déjà créée). *(Note : `participants-store.tsx` est modifié par l'ajout de la slice mais son API publique ne perd aucun membre — additive seulement.)*
- **Aucune migration DB** : `team_off_days` existe déjà avec RLS read-only, publication realtime + REPLICA IDENTITY FULL (init_schema.sql L42-49/L77/L89/L96).

### Testing standards (pour cette story)
- **TDD** : écrire `team-off-days.unit.test.ts` **avant** `isTeamOffDay`/le câblage, et `team-off-days-reducer.unit.test.ts` **avant** le réducteur (rouge → vert). Double filet automatique.
- **Périmètre testé automatiquement** : sous-prédicat de domaine + réducteur optimiste (purs, CI sans secrets). Store/route/UI **non** unit-testés (cohérent 1.5→3.2). Preuve = **vérification manuelle** :
  - Ouvrir le panneau « Jours off d'équipe » (badge 0) → ajouter un **jour** (date) → tag « <date longue FR> » (+ « — <libellé> » si saisi), badge 1, **trié par date1**, persistant après reload + autre navigateur (FR8/FR13).
  - Ajouter une **plage** (du/au + libellé) → tag « <début> → <fin> — <libellé> ». **Plage inversée** (fin < début) → refus (message FR, aucune écriture). Libellé **vide** → **accepté** (pas de blocage).
  - Supprimer un jour off (✕) → disparaît, absent après reload.
  - Ajouter **sans passphrase** → un seul prompt (même file que les 4 autres tables) ; passphrase erronée (401) → re-prompt, optimiste préservé.
  - Échec transitoire (5xx) → rollback visible / restauration, action re-tentable.
  - **Non-régression manuelle** : ajouter/supprimer un participant/indispo/exclusion/férié → comportement **identique** (la 5ᵉ slice n'a touché ni la file ni les autres slices).
- **Critère « vert »** : `npm run test:unit` vert (12 suites : les 10 actuelles + **team-off-days** + **team-off-days-reducer**) ; `npm test` vert (flake Realtime vert au retry) ; `npm run lint` 0 ; `npx tsc --noEmit` 0 ; `npm run build` vert (`/api/team-off-days` enregistrée) ; grep `.next/static` → 0 secret.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3 ; #Story-3.3 (5 critères, frontière 4.2) ; FR8 ; FR13 ; NFR4 ; NFR5 ; NFR9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-1 ; #AD-3 (isTeamNonSessionDay source unique, signature figée, dernière branche teamOffDays) ; #AD-5 ; #AD-6 ; #AD-7 ; #AD-8 ; #AD-9 ; #AD-11 ; #AD-13 ; #AD-14 ; #AD-15 ; #AD-16 ; #AD-17 ; #Consistency-Conventions (dates YMD locales) ; #Structural-Seed (api/team-off-days, lib/domain) ; #Modèle-de-données (table team_off_days : kind/date1/date2/label, pas d'unique)]
- [Source: docs/prd.md §3 (UX-DR4 panneaux repliables, UX-DR5 badges, UX-DR6 a11y, UX-DR7 ≤520px) ; §4 (modèle) ; FR8]
- [Source: _bmad-output/implementation-artifacts/3-2-jours-feries.md (#AC1 domaine pur + signature `isTeamNonSessionDay` + révision test « sans effet » ; #AC2 data ; #AC3 route ; #AC4 réducteur + reconcileById<T> ; #AC6 4ᵉ slice store ; #AC7 panneau Options ; #AC8 CSS ; #AC9 critère vert ; extraction useWriteQueue) ; 2-3-indisponibilites-individuelles-jour-isole-plage.md (#AC1 isPersonUnavailable + isValidRange ; #AC6 panneau Jour/Plage)]
- [Source: daily-wheel/lib/domain/team-availability.ts (isTeamNonSessionDay L85-87, TeamConstraints.teamOffDays L34, import DayOrRange L15) ; daily-wheel/lib/domain/availability.ts (isPersonUnavailable L23-32 RÉUTILISÉ, DayOrRange L13-17, isValidRange L37-40) ; daily-wheel/lib/data/unavailabilities.ts (modèle jour/plage) ; daily-wheel/lib/data/holidays.ts (modèle label/équipe) ; daily-wheel/lib/data/write-error.ts ; daily-wheel/app/api/unavailabilities/route.ts (validation jour/plage L50-65, route complète L1-119) ; daily-wheel/app/api/holidays/route.ts ; daily-wheel/lib/store/use-write-queue.ts (WriteSpec/runWrite/retry, INCHANGÉ) ; daily-wheel/lib/store/participants-store.tsx (addHoliday L424-460, removeHoliday L463-480, retryHoliday L482, toServerHoliday L72-74, addUnavailability L281-334, canal holidays-rt L569-594, mapChange L632-645, StoreValue L86-110, value L596-620, provider L114-126, imports L13-38) ; daily-wheel/lib/store/holidays-reducer.ts ; daily-wheel/lib/store/unavailabilities-reducer.ts ; daily-wheel/lib/store/reconcile.ts (reconcileById<T> + ChangeEvent<T> + alias L67-96) ; daily-wheel/components/HolidaysPanel.tsx (panneau Options L1-105) ; daily-wheel/components/UnavailabilityPanel.tsx (bascule Jour/Plage L1-105) ; daily-wheel/app/page.tsx (SSR L18-23, provider+Options L41-54) ; daily-wheel/app/globals.css (tokens L2-26, .holidays-* L475-576, media L579-613, reduced-motion L615, selects L315-329/L423-433) ; daily-wheel/lib/format/date-fr.ts ; daily-wheel/supabase/migrations/20260622121017_init_schema.sql (team_off_days L42-49, RLS L77, realtime L89/L96) ; daily-wheel/package.json (test:unit L14) ; daily-wheel/vitest.config.ts]
- [Source: historique/Spin That Wheel v2.html (feature neuve FR8 : aucune parité)]
- [Source: MEMORY:store-extraction-plan (useWriteQueue extrait en 3.2 → 3.3 consomme sans refactor) ; MEMORY:git-remote-push-setup (remote github-perso → Infinter/SpinThatWeeklyWheel)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / create-story)

### Debug Log References

- `npx tsc --noEmit` → 0 erreur.
- `npx eslint` → 0 problème.
- `npm run test:unit` → 12 suites, 158 tests verts (dont les 2 nouvelles : `team-off-days.unit`, `team-off-days-reducer.unit`).
- `npm test` → 19 fichiers, 174 tests verts (intégrations live gated/skippées sans secrets ; aucun flake Realtime ce run).
- `npm run build` → succès ; route `ƒ /api/team-off-days` enregistrée.
- `grep -rIE "SUPABASE_SECRET_KEY|TEAM_PASSPHRASE|service_role" .next/static` → 0 occurrence (aucune fuite de secret côté client).

### Completion Notes List

- **TDD rouge → vert respecté** sur les deux cœurs purs : `tests/team-off-days.unit.test.ts` (AC1, 14 cas) et `tests/team-off-days-reducer.unit.test.ts` (AC4, 14 cas) écrits AVANT le code, échec confirmé, puis vert.
- **AC1** — `isTeamOffDay` ajouté comme **alias de réutilisation** de `isPersonUnavailable` (aucune logique de bornes réimplémentée) ; import `availability` passé en runtime ; branche `|| isTeamOffDay(...)` ajoutée à `isTeamNonSessionDay` (signature/types inchangés). Commentaires d'en-tête du module mis à jour (3.3 désormais câblée ; seul `skipWeekends`/4.1 reste). Assertion périmée de `group-exclusions.unit.test.ts` (« teamOffDays sans effet ») **révisée** → « skipWeekends seul, branche 4.1 non câblée » ; la couverture `teamOffDays` neutralisante vit dans le test dédié.
- **AC2** — `lib/data/team-off-days.ts` : `TeamOffDay` (`label` **nullable**), `fetchTeamOffDays`, ops `insert`/`delete`, `writeTeamOffDay` (POST `/api/team-off-days`, `WriteError` partagé).
- **AC3** — `app/api/team-off-days/route.ts` : mirroir route unavailabilities ; allowlist `['kind','date1','date2','label']` ; validation serveur jour/plage (`date1` YMD, plage `date2 >= date1`, `day → date2=null`) ; **label optionnel → trim → null si vide** ; rejet `update`→400 ; 409 si delete 0 ligne ; garde `timingSafeEqual` ; **pas de cas 23505 dédié** (aucune unicité).
- **AC4** — `team-off-days-reducer.ts` (PUR, cycle insert+delete identique à `holidaysReducer`) + alias typé `reconcileTeamOffDays`/`TeamOffDayChangeEvent` dans `reconcile.ts` (générique `reconcileById<T>` **inchangé**).
- **AC5** — 5ᵉ slice dans `participants-store.tsx` : `useReducer(teamOffDaysReducer)` + `stateRefO` + `oseqRef` (`otemp:<n>`) + `toServerTeamOffDay` ; `addTeamOffDay` (validation `isValidRange` réutilisée → message FR + aucune écriture si invalide ; libellé optionnel→null ; **PAS de dédup**), `removeTeamOffDay` (delete idempotent), `retryTeamOffDay`→`retry(id)` ; consomme `useWriteQueue` **inchangé** (file table-agnostique → un seul prompt passphrase pour 5 tables). 5ᵉ canal Realtime `team-off-days-rt` + re-hydratation au `SUBSCRIBED`.
- **AC6** — `components/TeamOffDaysPanel.tsx` : hybride HolidaysPanel (toggle `aria-expanded` + badge + montage Options) × UnavailabilityPanel (`<select>` Jour/Plage + `date2` conditionnel) ; libellé optionnel ; tags triés par `date1`, jour=`formatDateFr` / plage=`date1 → date2`, suffixe `— label` si présent ; état vide ; `pending` désactive le ✕.
- **AC7** — Bloc `.team-off-*` dans `globals.css` (calqué `.holidays-*` + style `<select>` aligné sur l'existant, tokens réutilisés, sans dégradé, formulaire empilé ≤520px) ; `page.tsx` : 5ᵉ fetch SSR (`.catch(() => [])`), prop `initialTeamOffDays`, `<TeamOffDaysPanel />` monté sous `<HolidaysPanel />` dans la carte Options. Carte Résultat inchangée.
- **AC8** — 2 suites ajoutées à `test:unit` ; test d'intégration `team-off-days.write.integration.test.ts` (gated) livré ; non-régression complète verte.
- **Aucune migration** (table `team_off_days` déjà créée vide en 1.2) ; **aucune dépendance ajoutée** ; rename `team-store` resté déféré ; `useWriteQueue`/`reconcileById<T>`/`isPersonUnavailable` **réutilisés sans modification**.
- **Vérification manuelle non exécutée** (pas de secrets/instance live dans cette session) : le périmètre store/route/UI suit le mode de preuve « vérification manuelle » des stories 1.5→3.2 ; à valider lors de la review/QA (cf. Testing standards).

### File List

**NEW**
- `daily-wheel/lib/data/team-off-days.ts`
- `daily-wheel/app/api/team-off-days/route.ts`
- `daily-wheel/lib/store/team-off-days-reducer.ts`
- `daily-wheel/components/TeamOffDaysPanel.tsx`
- `daily-wheel/tests/team-off-days.unit.test.ts`
- `daily-wheel/tests/team-off-days-reducer.unit.test.ts`
- `daily-wheel/tests/team-off-days.write.integration.test.ts`

**UPDATE**
- `daily-wheel/lib/domain/team-availability.ts` (import runtime `isPersonUnavailable` ; `isTeamOffDay` ; branche `teamOffDays` câblée ; commentaires)
- `daily-wheel/lib/store/reconcile.ts` (alias `reconcileTeamOffDays` + `TeamOffDayChangeEvent` ; générique inchangé)
- `daily-wheel/lib/store/participants-store.tsx` (5ᵉ slice + 5ᵉ canal Realtime ; API additive)
- `daily-wheel/app/globals.css` (bloc `.team-off-*` + media ≤520px)
- `daily-wheel/app/page.tsx` (5ᵉ fetch SSR + `initialTeamOffDays` + montage `<TeamOffDaysPanel />`)
- `daily-wheel/package.json` (`team-off-days.unit` + `team-off-days-reducer.unit` dans `test:unit`)
- `daily-wheel/tests/group-exclusions.unit.test.ts` (assertion « teamOffDays sans effet » révisée → skipWeekends seul)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut 3.3)

### Change Log

- 2026-06-23 — Story 3.3 (jours off d'équipe) implémentée (Amelia/dev-story) : 5ᵉ slice jours off (jour/plage + libellé optionnel), branche `teamOffDays` câblée dans `isTeamNonSessionDay`, route proxy `/api/team-off-days`, panneau Options repliable. 8 tâches / 8 AC. tsc+lint+build verts, 12 suites unit (158 tests) + suite complète (174 tests) vertes, 0 secret en bundle. Status → review.
