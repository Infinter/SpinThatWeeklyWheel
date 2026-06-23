---
baseline_commit: 664dcbe
---

# Story 3.1: Exclusions de groupe récurrentes

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want définir des jours récurrents ignorés pour tout le groupe (jour de semaine, toutes les N semaines, à partir d'une date de référence),
so that je modélise un Daily qui ne se tient pas certaines semaines (FR6) — **première story d'Epic 3 (contraintes d'équipe)**. Elle ouvre la **table `group_exclusions`** (créée vide en 1.2) à l'écriture, crée le **prédicat pur `isTeamNonSessionDay`** mandaté par AD-3 (source unique du « jour neutralisé », consommé par la génération en 4.2), et **généralise la machinerie d'écriture optimiste à une 3ᵉ table** sans dupliquer le prompt de passphrase. C'est aussi la **première story à peupler la carte Options** (placeholder aujourd'hui).

## Acceptance Criteria

> Ces AC décomposent les 5 critères de l'epic (epics.md#Story-3.1) en unités implémentables et testables. Le **cœur testable en CI sans secrets** (AD-13) est **double** : (a) le **prédicat de domaine pur** `isTeamNonSessionDay` + le sous-prédicat `isGroupExcluded` + les **validateurs purs** (`lib/domain/`) ; (b) le **réducteur optimiste pur** des exclusions (`lib/store/group-exclusions-reducer.ts`), calqué sur `unavailabilities-reducer.ts` (2.3). Les patterns d'écriture (`runWrite` table-agnostique, file passphrase, taxonomie AD-17, route proxy, allowlist serveur, `reconcileById<T>`) **existent déjà** (1.4 → 2.3) et sont **réutilisés**, pas réécrits.

1. **Domaine pur : `isTeamNonSessionDay` (source unique AD-3) + `isGroupExcluded` + validateurs (cœur testable — AD-3, AD-13, AC8).** Créer `daily-wheel/lib/domain/team-availability.ts` (PUR, **feuille** : aucun import React/DOM/Supabase/`lib/data`/`lib/format`). Le domaine définit son **propre type structurel minimal** (ne PAS importer le type de `lib/data` — AD-1/AD-11) :
   - `type GroupExclusionRule = { day_of_week: number /*0-6, 0=dimanche*/; every_n: number; ref_date: string /*YMD*/ }`
   - `type TeamConstraints = { skipWeekends?: boolean; groupExclusions?: GroupExclusionRule[]; holidays?: { date: string }[]; teamOffDays?: import('@/lib/domain/availability').DayOrRange[] }` — **forme complète déclarée dès maintenant** ; seule la branche `groupExclusions` est câblée en 3.1. `holidays` (3.2), `teamOffDays` (3.3) et `skipWeekends` (4.1) sont déclarés mais **non implémentés** ici (champs optionnels, défaut « pas d'effet »). Cela fige la **signature unique AD-3** dès la 1ʳᵉ story et évite tout churn de signature en 3.2/3.3/4.1.
   - `isTeamNonSessionDay(date: string /*YMD*/, ctx: TeamConstraints): boolean` = `true` ssi le jour est neutralisé par **au moins une** contrainte d'équipe. **En 3.1, n'évalue que** `isGroupExcluded(ctx.groupExclusions ?? [], date)`. Structurer le corps en `||` de sous-prédicats (`isGroupExcluded(...) || isHoliday(...) || isTeamOff(...) || (ctx.skipWeekends && isWeekend(...))`) où les sous-prédicats non encore implémentés renvoient `false` sur entrée vide — pour que 3.2/3.3/4.1 ne fassent qu'**ajouter** leur branche. **AD-3 : ce prédicat est l'unique source de vérité du jour neutralisé** ; il sera branché à la fois dans la boucle de génération ET le calcul de deadline EDF en 4.2.
   - `isGroupExcluded(rules: GroupExclusionRule[], date: string): boolean` — **parité exacte avec le legacy `isDateGroupExcluded` (historique L651-660)** : liste vide → `false` ; pour chaque règle : `weekdayOf(date) === rule.day_of_week` **ET** `diffDays >= 0` **ET** `Math.floor(diffDays / 7) % rule.every_n === 0`, où `diffDays` = nombre **entier** de jours de `rule.ref_date` à `date` (positif si `date` après `ref_date`). **`diffDays < 0` (date avant la réf.) → la règle ne matche pas** (parité L658 : `if (diffDays < 0) return false`). Comme `date` et `ref_date` partagent le même jour de semaine quand la règle peut matcher, `diffDays` est alors un multiple de 7 → `floor(diffDays/7)` est exact.
   - `weekdayOf(ymd: string): number` — jour de semaine **0=dimanche … 6=samedi**, identique à `Date.prototype.getDay()`. **Recommandé : implémentation entière pure « days-from-civil »** (algorithme de Howard Hinnant) donnant un n° de jour absolu, d'où `diffDays` (soustraction de deux n° de jours) **et** le weekday (`((dayNumber % 7) + 4) % 7` normalisé positif, car 1970-01-01 = jeudi = 4). Cette voie est **sans timezone et insensible au DST**, donc strictement plus correcte que le legacy `Math.round((t1-t2)/86400000)` (qui dérive d'un jour aux frontières DST). *Voie alternative acceptable : `parseYMD` local (`new Date(y,m-1,d)`) + `getDay()` + diff de `getTime()` arrondie — mirroir exact du legacy mais fragile au DST. Choix par défaut = days-from-civil ; documente ta décision.*
   - **Validateurs purs (validation d'entrée, co-localisés ici — un seul module pur testé en CI, cohérent avec `availability.ts` 2.3) :**
     - `isValidEveryN(n: number): boolean` — `true` ssi `n` est un entier `>= 1` (legacy : `isNaN || n < 1` → refus, L736).
     - `refDateMatchesDayOfWeek(refDate: string, dayOfWeek: number): boolean` — `true` ssi `weekdayOf(refDate) === dayOfWeek` (legacy L738 : la date de réf. doit tomber sur le jour choisi).
   - **TDD rouge d'abord** : écrire `daily-wheel/tests/group-exclusions.unit.test.ts` (import `@/lib/domain/team-availability` → ROUGE car module absent), puis créer le module → VERT. Couvre : `weekdayOf` ancré sur des dates **vérifiables** (`1970-01-01` → 4 jeudi ; `2024-01-01` → 1 lundi ; `2000-01-01` → 6 samedi) ; `isGroupExcluded` (vide→false ; même jour que réf. `diffDays=0`→true ; `every_n=2` → semaine 0 true, semaine 1 false, semaine 2 true ; date **avant** réf.→false ; mauvais jour de semaine→false ; `every_n=1` → chaque occurrence du jour true) ; `isTeamNonSessionDay` (délègue aux exclusions : couvert→true, non couvert→false, ctx sans `groupExclusions`→false, `holidays`/`teamOffDays`/`skipWeekends` fournis mais **sans effet en 3.1**) ; `isValidEveryN` (`1`→T, `0`→F, `-1`→F, `1.5`→F, `NaN`→F) ; `refDateMatchesDayOfWeek` (réf. tombe sur le jour→T, sinon→F).
   [Source: historique/Spin That Wheel v2.html (isDateGroupExcluded L651-660, validation add L731-744, DAY_NAMES L636) ; ARCHITECTURE-SPINE.md#AD-3 (signature `isTeamNonSessionDay(date, ctx:{skipWeekends,groupExclusions,holidays,teamOffDays})`, source unique, prédicat pur recevant ses contraintes en argument) ; #AD-1 (domaine = feuille) ; #AD-13 (tests purs CI) ; daily-wheel/lib/domain/availability.ts (modèle de module pur + type `DayOrRange`) ; daily-wheel/tests/availability.unit.test.ts (modèle test pur)]

   > **Note d'altitude (tranchée, défaut documenté) :** AD-3 mandate **un** `isTeamNonSessionDay` qui agrège les 4 contraintes d'équipe. On crée donc dès 3.1 la **signature complète** `(date, ctx)` mais on **n'implémente que la branche exclusions de groupe** ; 3.2/3.3/4.1 ajouteront leur branche **sans toucher la signature**. `isGroupExcluded` est exporté séparément pour tester la **récurrence** de façon isolée (parité fine). Les validateurs (`isValidEveryN`, `refDateMatchesDayOfWeek`) sont co-localisés ici (module pur unique) — ne PAS les mettre dans `lib/data/`.

2. **Type + couche data `group_exclusions` (AD-7, AD-11, AD-14).** Créer `daily-wheel/lib/data/group-exclusions.ts` (seul point de contact Supabase pour cette table — AD-11), **copie structurelle** de `lib/data/unavailabilities.ts` :
   - `export type GroupExclusion = { id: string; day_of_week: number; every_n: number; ref_date: string; updated_at: string }` (timestamps = chaînes ISO, **jamais** `Date`).
   - `fetchGroupExclusions(): Promise<GroupExclusion[]>` — lecture via clé low-privilege (`supabasePublic.from('group_exclusions').select('*')`), exactement comme `fetchUnavailabilities` (AD-7).
   - `export type GroupExclusionWriteOp = 'insert' | 'delete'` (**pas d'`update`** : on ajoute et on supprime des règles unitairement, jamais d'édition inline — epics.md#Story-3.1 ; parité legacy qui n'édite pas une règle).
   - `export type GroupExclusionWritePayload = { id?: string; data?: { day_of_week: number; every_n: number; ref_date: string } }`
   - `writeGroupExclusion(op, payload, passphrase): Promise<unknown>` — `POST /api/group-exclusions`, header `x-team-passphrase`, corps `{ op, ...payload }` ; lève un `WriteError` typé. **Importer `WriteError` depuis `@/lib/data/write-error`** (module partagé extrait en 2.3) — ne PAS réimporter via `participants.ts`.
   [Source: daily-wheel/lib/data/unavailabilities.ts (intégralité : type, fetch, ops insert/delete, writeUnavailability — modèle exact) ; daily-wheel/lib/data/write-error.ts (taxonomie AD-17 partagée) ; daily-wheel/supabase/migrations/20260622121017_init_schema.sql (table group_exclusions L27-33) ; ARCHITECTURE-SPINE.md#AD-7 ; #AD-11 ; #AD-14 ; #AD-17]

3. **Route proxy `/api/group-exclusions` (AD-8, AD-9, AD-14).** Créer `daily-wheel/app/api/group-exclusions/route.ts` — **mirroir exact** de `app/api/unavailabilities/route.ts`, adapté :
   - `runtime = 'nodejs'`, garde passphrase `x-team-passphrase` en `timingSafeEqual` (AD-8), retour **avant** tout accès Supabase ; `mapDbError` identique (23505→409, PGRST116→409, sinon 500).
   - Allowlist `const ALLOWED = ['day_of_week', 'every_n', 'ref_date'] as const` (AD-14 : `id`/`updated_at` = serveur).
   - Ops : **`insert`** (`pickAllowed` → `.insert(picked).select().single()` ; `id`/`updated_at` par défaut SQL) et **`delete`** (`id` requis ; `.delete().eq('id', id).select('id')` ; **409 si 0 ligne** — état périmé). **PAS d'op `update`** : renvoyer `400` si `op` n'est ni `insert` ni `delete`.
   - **Validation serveur défensive** (AD-17:400) avant insert (dernière ligne de défense — un caller direct ne doit pas insérer une règle invalide) : `day_of_week` = entier ∈ `[0,6]` ; `every_n` = entier `>= 1` ; `ref_date` = chaîne non vide ; **et** la date de réf. tombe bien sur `day_of_week` (réutiliser la logique de weekday — soit importer `weekdayOf`/`refDateMatchesDayOfWeek` depuis le domaine pur AC1, soit recalculer côté serveur). *(La validation primaire est cliente/pure AC1 ; le serveur reste la dernière ligne.)*
   - **Ne PAS** modifier la route participants ni unavailabilities ni `lib/supabase/admin.ts`.
   [Source: daily-wheel/app/api/unavailabilities/route.ts (intégralité — garde, allowlist, mapDbError, ops insert/delete, 409 si 0 ligne, validation défensive — modèle exact) ; daily-wheel/app/api/participants/route.ts (réf.) ; ARCHITECTURE-SPINE.md#AD-8 ; #AD-9 ; #AD-14 ; #AD-17]

4. **Réducteur optimiste pur des exclusions + réconciliation Realtime (AD-5, AD-13, AC8).** Sur le modèle **exact** de `unavailabilities-reducer.ts` (2.3) :
   - Créer `daily-wheel/lib/store/group-exclusions-reducer.ts` (PUR) : `type StoreGroupExclusion = GroupExclusion & { pending?: boolean; failed?: boolean }`, `type Action`, `groupExclusionsReducer`. Transitions (cycle **insert + delete** uniquement — pas de patch) : `HYDRATE { rows }` ; `REALTIME { event }` (délègue à `reconcileGroupExclusions`) ; `ADD_OPTIMISTIC { tempId, row }` ; `SET_PENDING { id }` ; `CONFIRM { tempId, row }` ; `ROLLBACK { tempId }` ; `MARK_FAILED { id }` ; `RESTORE { row }` ; `REMOVE { id }`. Pur : aucun import React/DOM/Supabase/`Date`. Références stables quand rien ne change.
   - **Réconciliation Realtime** : **réutiliser le générique `reconcileById<T>` existant** (`lib/store/reconcile.ts`, généralisé en 2.3 — AD-15 dédup `id`+`updated_at`, AD-16 LWW). Ajouter `reconcileGroupExclusions` (alias `reconcileById<GroupExclusion>`) + le type d'événement `GroupExclusionChangeEvent = ChangeEvent<GroupExclusion>`. **Aucune modif de la logique générique** — juste un alias typé de plus.
   - **TDD rouge d'abord** : `daily-wheel/tests/group-exclusions-reducer.unit.test.ts` (import absent → ROUGE) couvrant les transitions + quelques cas `reconcileGroupExclusions` (dédup écho `id`+`updated_at`, LWW lexicographique, INSERT inconnu = upsert, DELETE). → VERT.
   [Source: daily-wheel/lib/store/unavailabilities-reducer.ts (modèle reducer pur exact) ; daily-wheel/lib/store/reconcile.ts (reconcileById<T> + ChangeEvent<T> + alias — généralisés en 2.3) ; daily-wheel/tests/unavailabilities-reducer.unit.test.ts (modèle) ; ARCHITECTURE-SPINE.md#AD-5 ; #AD-13 ; #AD-15 ; #AD-16]

5. **Store : 3ᵉ slice exclusions + 3ᵉ canal Realtime — toujours UN SEUL prompt passphrase (AD-8, AD-5, AD-17).** Étendre `daily-wheel/lib/store/participants-store.tsx` (le provider centralise déjà la passphrase et la file table-agnostique depuis 2.3 → on évite un prompt par table). **La machinerie `WriteSpec`/`runWrite` est déjà table-agnostique (2.3) : ne pas la modifier, juste la consommer.**
   - **Ajouter la slice exclusions** : `const [groupExclusions, dispatchG] = useReducer(groupExclusionsReducer, initialGroupExclusions as StoreGroupExclusion[])` + `stateRefG` (maintenu par `useEffect`, modèle `stateRefU` L132/L137). Exposer dans `StoreValue` : `groupExclusions: StoreGroupExclusion[]`, `addGroupExclusion(input: { day_of_week: number; every_n: number; ref_date: string })`, `removeGroupExclusion(id)`, `retryGroupExclusion(id)`.
     - `addGroupExclusion` : **valider d'abord** via AC1 (`isValidEveryN(every_n)` ; `refDateMatchesDayOfWeek(ref_date, day_of_week)`) → si invalide, `setError(message FR explicite)` + **aucune écriture**. Sinon : `tempId = 'gtemp:<n>'`, `dispatchG(ADD_OPTIMISTIC { tempId, row })`, puis `runWrite({ write: pp => writeGroupExclusion('insert', { data: { day_of_week, every_n, ref_date } }, pp), onPending: () => dispatchG(SET_PENDING{id:tempId}), onConfirm: row => dispatchG(CONFIRM{tempId, row}), onFailed: () => dispatchG(MARK_FAILED{id:tempId}), rollback: () => dispatchG(ROLLBACK{tempId}), onConflictRehydrate: async () => dispatchG(HYDRATE{rows: await fetchGroupExclusions()}), retryKey: tempId })`. (Calque exact d'`addUnavailability` L328-382.)
     - `removeGroupExclusion(id)` : snapshot via `stateRefG` → `dispatchG(REMOVE{id})` → `runWrite({ write: pp => writeGroupExclusion('delete', { id }, pp), rollback: () => dispatchG(RESTORE{row: snapshot}), onConfirm: () => {}, deleteIdempotent: true, retryKey: null })` (delete idempotent : 409 introuvable = succès — calque `removeUnavailability` L384-401).
   - **3ᵉ abonnement Realtime** : un canal `group-exclusions-rt` sur `public.group_exclusions` (event `*`) → `dispatchG(REALTIME{event})` via `mapChange<GroupExclusion>(payload)` ; re-hydratation `fetchGroupExclusions` → `dispatchG(HYDRATE)` au `SUBSCRIBED` (AD-6). Calque exact du canal `unavailabilities-rt` (L469-491).
   - **Invariant AD-8 préservé** : N mutations (participants + indispos + **exclusions** confondus) sans passphrase → N specs en file → **UN seul** prompt → rejeu groupé. `cancelPassphrase` exécute tous les `rollback()`. (La file étant déjà op- et table-agnostique depuis 2.3, elle accepte les specs exclusions sans changement de contrat.)
   [Source: daily-wheel/lib/store/participants-store.tsx (provider L106-112, reducers/refs L115-137, runWrite L142, addUnavailability L328-382, removeUnavailability L384-401, retryUnavailability L403, canaux Realtime L440/L469-491, mapChange L521, StoreValue L86-96, value L493-503) ; ARCHITECTURE-SPINE.md#AD-5 ; #AD-6 ; #AD-8 ; #AD-17 ; 2-3-*.md#AC5 (store table-agnostique)]

   > **⚠️ Décision d'architecture à valider (signalée — voir questions en fin de story) :** 3.1 est la **3ᵉ table** dans `participants-store.tsx`. Le note de 2.3 prévoyait de reconsidérer une extraction (`useWriteQueue()` partagé / renommage en « team store ») **« si une 3ᵉ/4ᵉ table rend le provider trop lourd »**. Avec Epic 3 (3 nouvelles tables) + 4.1 (settings), le provider va porter ~5 slices + 5 canaux. **Recommandation pour 3.1 : étendre en place** (churn nul, machinerie prouvée), **et planifier l'extraction avant 3.2/3.3**. Ne pas faire le refactor dans 3.1 sauf décision explicite de Solo.

6. **UI : panneau repliable « Exclusions de groupe » + badge, dans la carte Options (UX-DR4, UX-DR5, FR6, NFR4/NFR5).** Créer `daily-wheel/components/GroupExclusionsPanel.tsx` (auto-contenu : toggle repliable + badge + formulaire + liste de tags) et le **monter dans la carte Options** :
   - **Toggle + badge** (UX-DR4/UX-DR5) : un bouton repliable « Jours exclus (groupe) » avec une flèche (`▶`/rotation à l'ouverture) et un **badge de comptage** = `groupExclusions.length` (masqué si 0). État d'ouverture **local au composant** (`useState`, jamais dans le store — cohérent `expandedId`/`editingId`). `aria-expanded` sur le bouton.
   - **Formulaire** (parité legacy L578-593) : un `<select>` jour de semaine (7 options `DAY_NAMES` — **0=Dimanche … 6=Samedi**, valeur = index) ; un `<input type="number">` fréquence `every_n` (`min=1 max=52`, défaut **2** comme le legacy) avec label « toutes les … semaine(s) » ; un `<input type="date">` date de référence ; un bouton « ＋ Ajouter ». Au clic → `addGroupExclusion({ day_of_week, every_n, ref_date })` puis reset de la date. La validation (every_n ≥ 1 ; réf. tombe sur le jour) est portée par le store (AC5/AC1) → afficher l'erreur FR retournée (`error` du store) ; ne PAS dupliquer la logique de validation dans le composant.
   - **Liste des tags** (parité legacy L703-718) : sous le formulaire, une règle par tag, **supprimable** via ✕ → `removeGroupExclusion(rule.id)`. Label = `${freq} ${DAY_NAMES[day_of_week]} (réf. ${formatDateFr(ref_date)})` où `freq = every_n === 1 ? 'Chaque' : '1/' + every_n` (ex. « 1/2 Mardi (réf. mardi 23 juin 2026) »). État vide : « Aucune règle définie. ». Désactiver le ✕ d'une règle `pending`.
   - **`DAY_NAMES`** = `['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']` (parité legacy L636, **index 0 = Dimanche**). Réutiliser `formatDateFr` de `@/lib/format/date-fr.ts` (déjà créé en 2.3, parse **local**). Petite constante `DAY_NAMES` locale au composant (ou un util partagé si tu préfères).
   - **Tout en français** (NFR4), **charte CSS existante**, **sans dégradé**, lisible **≤ 520 px** (NFR5, UX-DR7). Accessibilité (UX-DR6) : `<select>`/`<input>` natifs avec labels explicites, bouton toggle `aria-expanded`.
   - **Montage dans Options** : voir AC7 (lift du provider). Le composant consomme `useParticipants()` (le « team store ») → il doit être rendu **dans** `<ParticipantsStoreProvider>`.
   [Source: historique/Spin That Wheel v2.html (markup panel L566-593, renderGroupExclusions L686-720, validation/add L731-744, DAY_NAMES L636) ; daily-wheel/components/UnavailabilityPanel.tsx (modèle panneau repliable + tags + ✕ + état vide + a11y) ; daily-wheel/components/ParticipantsCard.tsx (modèle toggle+badge local) ; daily-wheel/lib/format/date-fr.ts (formatDateFr local) ; docs/prd.md §3 (UX-DR4/5/6/7) ; ARCHITECTURE-SPINE.md#Consistency-Conventions (dates locales)]

7. **CSS : panneau exclusions responsive + lift provider + SSR hydration (AC6, AD-6).**
   - **CSS** : porter dans `daily-wheel/app/globals.css` les classes `.group-excl-toggle` (+ `:hover`), `.group-excl-toggle-label`, `.group-excl-toggle-badge`, `.group-excl-arrow` (+ `.open` rotation 90°), `.group-excl-panel` (+ `.open`), `.group-excl-panel-title`, `.group-excl-form` (+ `label`, `select`, `input`), `.group-excl-tags`, `.group-excl-tag` (+ bouton ✕), `.group-excl-empty` depuis le legacy (historique L275-360 env.), **adaptées à la charte** : réutiliser `--primary`, `--primary-light`, `--radius-sm`, et les tokens `--indispo-*` (L18-21) si une couleur de panneau/tag est utile (aucun token `--group-excl-*` n'existe — réutiliser l'existant, ne pas en inventer sauf besoin réel) ; **aucun dégradé** ; `≤ 520 px` : formulaire empilé, pas de débordement horizontal. `<select>`/`<input>` suivent `.text-input` existant. Respecter `@media (prefers-reduced-motion)` (L393) pour l'animation d'ouverture.
   - **Lift du provider + montage Options** : `daily-wheel/app/page.tsx` — étendre `ParticipantsStoreProvider` pour qu'il **enveloppe aussi la carte Options** (aujourd'hui le provider n'enveloppe que `<ParticipantsCard />`). Déplacer la `<section className="card">` Options **à l'intérieur** du provider et y rendre `<GroupExclusionsPanel />` (sous le `<h2>Options</h2>`, en remplaçant le placeholder « Réglages du planning à venir. »). La carte **Résultat** reste **hors** du provider.
   - **SSR hydration** : `fetchGroupExclusions()` en parallèle de `fetchParticipants()`/`fetchUnavailabilities()` dans le `Promise.all` (try/catch → `[]` si échec, comme l'existant) et passer `initialGroupExclusions` au provider. Adapter la signature de `ParticipantsStoreProvider` (`{ initial, initialUnavailabilities, initialGroupExclusions, children }`).
   [Source: historique/Spin That Wheel v2.html (CSS group-excl L275-360) ; daily-wheel/app/globals.css (tokens L3/L14/L18-21, .text-input L165, media ≤520px L370, reduced-motion L393, .indispo-* L296-360 modèle) ; daily-wheel/app/page.tsx (Promise.all SSR L12-15, provider L35-37, carte Options L40-43) ; ARCHITECTURE-SPINE.md#AD-6]

8. **Tests + non-régression globale (AD-13, NFR9).**
   - **Filet CI pur (obligatoire)** : `tests/group-exclusions.unit.test.ts` (AC1) **et** `tests/group-exclusions-reducer.unit.test.ts` (AC4) écrits **rouge → vert** ; **ajoutés à `test:unit`** dans `package.json` (liste explicite L14 — y ajouter les deux fichiers ; ramassés par `npm test`).
   - **Intégration live (optionnelle, gated)** : un `tests/group-exclusions.write.integration.test.ts` calqué sur `unavailabilities.write.integration.test.ts` (insert règle → delete via la route ; validation serveur 400 sur `every_n` 0 / réf. mauvais jour ; `update`→400 ; delete + 409 ; gate `SUPABASE_TEST_LIVE`) est **bienvenu mais non requis** pour le « vert » CI (CI sans secrets — AD-13). Ne PAS bloquer dessus.
   - **Non-régression (NFR9)** : toutes les suites existantes restent **vertes** (`write-error` / `reconcile` / `parse-names` / `participants-reducer` / `availability` / `unavailabilities-reducer`) ; les chemins **participants** ET **indispos** conservent un comportement **identique** (l'ajout de la 3ᵉ slice ne change ni `WriteSpec`/`runWrite` ni la file — déjà table-agnostiques) ; `reconcileById<T>` et ses alias existants inchangés. `npm run lint` 0, `npx tsc --noEmit` 0, `npm run build` vert. Grep `.next/static` : **aucun** secret (`SUPABASE_SECRET_KEY`/`TEAM_PASSPHRASE`/`service_role` + valeur passphrase → 0).
   [Source: daily-wheel/package.json (test:unit L14, test L10) ; daily-wheel/tests/unavailabilities.write.integration.test.ts (modèle intégration gated) ; daily-wheel/vitest.config.ts (gate SUPABASE_TEST_LIVE, stub server-only) ; ARCHITECTURE-SPINE.md#AD-13 ; 2-3-*.md#AC8 (critère « vert »)]

## Tasks / Subtasks

> ⚠️ **Tout le code et toutes les commandes `npm` sont sous `daily-wheel/`** (variance structurelle héritée 1.1→2.3). Le workflow CI à la racine n'est **pas** touché par cette story.

- [x] **Tâche 1 — Domaine pur : `isTeamNonSessionDay` + `isGroupExcluded` + validateurs (rouge → vert)** (AC: 1, 8)
  - [x] Écrire d'abord `daily-wheel/tests/group-exclusions.unit.test.ts` (ROUGE attendu : `Cannot find package '@/lib/domain/team-availability'`) : `weekdayOf` (ancres 1970-01-01→4, 2024-01-01→1, 2000-01-01→6) ; `isGroupExcluded` (vide, diff 0, every_n=2 semaines 0/1/2, date avant réf.→F, mauvais jour→F, every_n=1) ; `isTeamNonSessionDay` (délégation exclusions ; holidays/teamOffDays/skipWeekends fournis = sans effet en 3.1) ; `isValidEveryN` ; `refDateMatchesDayOfWeek`.
  - [x] Créer `daily-wheel/lib/domain/team-availability.ts` : types `GroupExclusionRule`/`TeamConstraints`, `weekdayOf` (days-from-civil pur recommandé), `isGroupExcluded` (parité L651-660, `diffDays<0`→false), `isTeamNonSessionDay` (branche exclusions câblée ; holidays/off/weekend = sous-prédicats `false` à brancher en 3.2/3.3/4.1), `isValidEveryN`, `refDateMatchesDayOfWeek`. PUR (aucun import sauf type `DayOrRange`).
  - [x] VERT.

- [x] **Tâche 2 — Data : type + `fetch`/`write` exclusions** (AC: 2, 8)
  - [x] Créer `daily-wheel/lib/data/group-exclusions.ts` : `GroupExclusion`, `fetchGroupExclusions`, `GroupExclusionWriteOp`/`Payload` (insert+delete), `writeGroupExclusion` (POST `/api/group-exclusions`, `WriteError` depuis `@/lib/data/write-error`). Copie structurelle de `unavailabilities.ts`.
  - [x] `npx tsc --noEmit` vert.

- [x] **Tâche 3 — Route proxy `/api/group-exclusions`** (AC: 3)
  - [x] Créer `daily-wheel/app/api/group-exclusions/route.ts` : mirroir de la route unavailabilities ; allowlist `['day_of_week','every_n','ref_date']` ; ops `insert`/`delete` (rejet `update`→400) ; validation serveur défensive (`day_of_week` ∈ [0,6] entier, `every_n` ≥ 1 entier, `ref_date` non vide, **réf. tombe sur day_of_week**) ; 409 si delete 0 ligne ; garde passphrase `timingSafeEqual` identique.
  - [x] Ne PAS toucher les routes participants/unavailabilities ni `lib/supabase/`.

- [x] **Tâche 4 — Réducteur optimiste pur exclusions + alias réconciliation (rouge → vert)** (AC: 4, 8)
  - [x] Ajouter `reconcileGroupExclusions` (alias `reconcileById<GroupExclusion>`) + `GroupExclusionChangeEvent` dans `lib/store/reconcile.ts` (aucune modif de la logique générique).
  - [x] Écrire d'abord `daily-wheel/tests/group-exclusions-reducer.unit.test.ts` (ROUGE) : `ADD_OPTIMISTIC`/`CONFIRM`/`ROLLBACK`/`SET_PENDING`/`MARK_FAILED`/`RESTORE`/`REMOVE`/`HYDRATE` + 3 cas `reconcileGroupExclusions` (INSERT inconnu, écho dédup, DELETE).
  - [x] Créer `daily-wheel/lib/store/group-exclusions-reducer.ts` (`StoreGroupExclusion`, `Action`, `groupExclusionsReducer`). PUR. → VERT.

- [x] **Tâche 5 — Store : 3ᵉ slice exclusions + 3ᵉ canal Realtime** (AC: 5, 8)
  - [x] `participants-store.tsx` : `useReducer(groupExclusionsReducer)` + `stateRefG` ; `addGroupExclusion` (valide via AC1 → message FR + aucune écriture si invalide, sinon optimiste + insert), `removeGroupExclusion` (optimiste REMOVE + delete idempotent), `retryGroupExclusion`. Exposés dans `StoreValue`.
  - [x] 3ᵉ abonnement Realtime `group-exclusions-rt` + re-hydratation `SUBSCRIBED` (AD-6) via `mapChange<GroupExclusion>`. **Ne pas modifier** `WriteSpec`/`runWrite`/la file (déjà table-agnostiques) → un seul prompt couvre les 3 tables.

- [x] **Tâche 6 — UI : panneau repliable « Exclusions de groupe » + badge** (AC: 6)
  - [x] Créer `daily-wheel/components/GroupExclusionsPanel.tsx` (toggle repliable + badge `aria-expanded`, formulaire select jour / number every_n (défaut 2) / date réf. / « ＋ Ajouter », liste de tags `${freq} ${DAY_NAMES[dow]} (réf. …)` + ✕, état vide « Aucune règle définie. », affichage de l'erreur store, contrôles `pending` désactivés). Consomme `useParticipants()`. `DAY_NAMES` index 0 = Dimanche. `formatDateFr` réutilisé.

- [x] **Tâche 7 — CSS + lift provider + SSR hydration** (AC: 7)
  - [x] Porter les classes `.group-excl-*` dans `app/globals.css` (charte, tokens existants, sans dégradé, formulaire empilé ≤520px, reduced-motion).
  - [x] `app/page.tsx` : `fetchGroupExclusions()` ajouté au `Promise.all` (`.catch(() => [])`) + `initialGroupExclusions` au provider ; **lift** du provider pour envelopper la carte Options ; `<GroupExclusionsPanel />` monté sous `<h2>Options</h2>` (placeholder retiré) ; carte Résultat hors provider. Signature `ParticipantsStoreProvider` adaptée.

- [x] **Tâche 8 — Scripts de test + non-régression** (AC: 8)
  - [x] `package.json` : `group-exclusions.unit` + `group-exclusions-reducer.unit` ajoutés à `test:unit`.
  - [x] `tests/group-exclusions.write.integration.test.ts` gated écrit (optionnel, non bloquant).
  - [x] Non-régression : `npm run lint` 0, `npx tsc --noEmit` 0, `npm run test:unit` vert (8 suites), `npm test` vert (flake Realtime connu → vert au retry via `test:realtime`), `npm run build` vert. Grep `.next/static` : 0 secret.

## Dev Notes

### Contexte & périmètre
- **Première story d'Epic 3 (contraintes d'équipe)** : ouvre `group_exclusions` (créée vide en 1.2) à l'écriture, crée le prédicat **`isTeamNonSessionDay`** (source unique AD-3, consommé en 4.2), généralise la machinerie d'écriture à une **3ᵉ table**, et **peuple la carte Options** (placeholder aujourd'hui). [Source: epics.md#Epic-3 ; #Story-3.1]
- **In-scope :** prédicat pur `isTeamNonSessionDay` (signature complète, branche exclusions câblée) + `isGroupExcluded` + validateurs ; couche data + route proxy `group_exclusions` ; réducteur optimiste pur + alias réconciliation ; 3ᵉ slice store + 3ᵉ canal Realtime (un seul prompt) ; UI panneau repliable + badge dans Options ; CSS ; lift provider + SSR hydration.
- **Hors-scope :** **effet sur la génération du planning** → la deadline EDF et l'exclusion effective des jours via `isTeamNonSessionDay` sont vérifiées en **Story 4.2** (epics.md#Story-3.1 : « l'intégration effective au planning est vérifiée en Story 4.2 »). On livre la **donnée + le prédicat testé**, pas la génération. **Jours fériés** → 3.2 ; **jours off d'équipe** → 3.3 ; **week-ends** → 4.1 (ces 3 branches de `isTeamNonSessionDay` sont déclarées mais non implémentées ici). **Édition d'une règle** existante → non prévue (ajout/suppression unitaires).

### ⚠️ Variance structurelle héritée (CRITIQUE — rappel 1.1→2.3)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Tout le code, tous les `npm`, tout grep `.next/` → **depuis `daily-wheel/`**. [Source: 2-3-*.md#Variance-structurelle]
- État réel pertinent (sous `daily-wheel/`, vérifié au commit `664dcbe`) — **réutiliser, ne pas casser** :
  - `lib/domain/` : contient `availability.ts` (1ᵉʳ module, 2.3). Cette story ajoute `team-availability.ts` (modèle de pureté = `availability.ts`).
  - `supabase/migrations/20260622121017_init_schema.sql` : table `group_exclusions` **DÉJÀ créée** (L27-33 : `id uuid PK default gen_random_uuid()`, `day_of_week int check between 0 and 6`, `every_n int check >= 1`, `ref_date date not null`, `updated_at timestamptz default now()`), RLS **SELECT anon** (L75), **dans la publication realtime** (L87) + `REPLICA IDENTITY FULL` (L94). **Aucune migration à écrire.**
  - `lib/data/unavailabilities.ts` + `lib/data/write-error.ts` : **modèles exacts** de la couche data (type + fetch + write ops insert/delete + `WriteError` partagé).
  - `app/api/unavailabilities/route.ts` : **modèle exact** de la route (garde passphrase `timingSafeEqual`, `pickAllowed`, `mapDbError`, ops insert/delete, 409 si 0 ligne, validation serveur défensive).
  - `lib/store/participants-store.tsx` : `runWrite`/`WriteSpec` **déjà table-agnostiques** (2.3) — **ne pas modifier**, juste ajouter une slice qui les consomme ; file `pendingWritesRef`/`failedWritesRef` + `submit/cancelPassphrase` **réutilisés** ; `addUnavailability`/`removeUnavailability` (L328-401) + canal `unavailabilities-rt` (L469-491) = **modèles** des nouvelles méthodes et du 3ᵉ canal.
  - `lib/store/reconcile.ts` : `reconcileById<T>` + `ChangeEvent<T>` **généralisés en 2.3** → **réutiliser** (ajout d'un simple alias `reconcileGroupExclusions`).
  - `lib/store/unavailabilities-reducer.ts` : **modèle exact** du réducteur pur (cycle insert+delete).
  - `components/UnavailabilityPanel.tsx` : **modèle** du panneau repliable (form + tags + ✕ + état vide + a11y + désactivation `pending`). `components/PassphrasePrompt.tsx` : **inchangé** (déclenché par le store, couvre désormais les 3 tables).
  - `lib/format/date-fr.ts` : `formatDateFr`/`parseYMD` **déjà créés** (2.3, parse **local**) → réutiliser, ne PAS recréer.
  - `app/globals.css` : tokens `--primary`/`--radius-sm`/`--indispo-*` (L3/L14/L18-21), `.text-input` (L165), media `≤520px` (L370), reduced-motion (L393) → réutiliser. **Aucun token `--group-excl-*`** → réutiliser l'existant.
  - `app/page.tsx` : Server Component `force-dynamic`, `Promise.all` SSR (L12-15), provider enveloppant **seulement** `ParticipantsCard` (L35-37), carte Options = **placeholder** (L40-43) → **à étendre** (3ᵉ fetch, `initialGroupExclusions`, lift provider sur Options, montage panneau).
  - `package.json` : `test:unit` = liste explicite (L14) → **y ajouter** les 2 nouveaux fichiers. **Aucune** lib d'état/UI/date (React + natifs) — **ne pas** ajouter de dépendance.
  - `vitest.config.ts` : alias `@`, stub `server-only`, gate `SUPABASE_TEST_LIVE` — **ne pas retoucher**.

### Décisions d'architecture qui cadrent cette story
- **AD-3 (source unique `isTeamNonSessionDay`)** : on crée la **signature complète** `(date, ctx:{skipWeekends,groupExclusions,holidays,teamOffDays})` dès 3.1, mais seule la branche **exclusions de groupe** est implémentée. 3.2/3.3/4.1 **ajoutent** leur branche sans toucher la signature. Le domaine est une **feuille** → il définit ses **propres** types structurels (`GroupExclusionRule`, `TeamConstraints`), n'importe **pas** `lib/data`. La branche dans `generateSchedule`/deadline EDF = **Story 4.2**.
- **Parité récurrence (CRITIQUE)** : `isGroupExcluded` = `weekdayOf(date) === day_of_week` ET `diffDays >= 0` ET `floor(diffDays/7) % every_n === 0`. **`diffDays < 0` → pas de match** (parité legacy L658 — une date *avant* la date de réf. n'est jamais exclue). Recommandation : `weekdayOf`/`diffDays` via **days-from-civil entier pur** (sans timezone, sans DST) plutôt que `Date.getTime()` (le legacy `Math.round((t1-t2)/86400000)` dérive aux frontières DST — bug latent qu'on corrige proprement). `day_of_week` 0-6 avec **0 = Dimanche** (= JS `getDay()`, = `DAY_NAMES[0]`).
- **AD-5/AD-17 (optimiste + taxonomie)** : insert règle = `ADD_OPTIMISTIC` + `writeGroupExclusion('insert')` ; delete = `REMOVE` + `writeGroupExclusion('delete')` ; rollback/restore + classes auth/validation/conflict/transient **identiques** aux indispos. Delete 409 « introuvable » = succès idempotent (AD-16).
- **AD-8 (passphrase)** : la file table-agnostique de 2.3 accepte les specs exclusions → **un seul** prompt pour N mutations **toutes tables confondues** (participants + indispos + exclusions). Argument décisif pour **étendre le provider** plutôt qu'un provider sibling.
- **AD-14 (contrat d'écriture)** : `{ op, id?, data? }` + allowlist **serveur** `day_of_week,every_n,ref_date`. Une route **par table** → `/api/group-exclusions`. Pas d'`update` (ajout/suppression unitaires).
- **AD-15/AD-16 (réconciliation)** : `reconcileById<GroupExclusion>` dédup `id`+`updated_at`, LWW lexicographique — identique aux autres tables.
- **AD-11/AD-7 (chemins asymétriques)** : lecture `group_exclusions` via clé low-privilege (`fetchGroupExclusions` + abonnement) ; écriture **uniquement** via `/api/group-exclusions`. Aucun composant ne touche `supabase.from(...)` ni `fetch('/api/...')` — tout via le store → `lib/data/`.
- **AD-13 (CI pure)** : seuls `group-exclusions.unit` + `group-exclusions-reducer.unit` (+ existants) tournent en CI **sans secrets**. Store/route/UI **non** unit-testés (cohérent 1.5→2.3 ; pas de RTL/jsdom — **ne pas** ajouter de dépendance) ; preuve = **vérification manuelle**.
- **Convention dates (CRITIQUE)** : tout en `YYYY-MM-DD` **local**. `<input type=date>` produit déjà du `YYYY-MM-DD`. Le formatage FR (`formatDateFr`) parse en **local** (`new Date(y,m-1,d)`), jamais `new Date('YYYY-MM-DD')` (UTC → décalage). Pour `weekdayOf`/`diffDays`, l'approche days-from-civil entière évite **tout** recours à `Date`.

### Décision de design à valider (signalée, non bloquante — voir questions en fin de story)
- **3ᵉ table → le provider devient un « team store ».** 2.3 prévoyait de reconsidérer l'extraction d'un `useWriteQueue()` partagé (et/ou un renommage `participants-store` → `team-store`) **« si une 3ᵉ/4ᵉ table rend le provider trop lourd »**. On y est. **Recommandation : étendre en place pour 3.1** (machinerie déjà prouvée table-agnostique, churn nul, livraison feature) **et planifier l'extraction avant 3.2/3.3** (qui ajouteraient 2 slices + 2 canaux de plus). Si Solo préfère extraire **maintenant**, c'est un refactor à isoler **avant** d'empiler la 3ᵉ slice. *(Escalade avant d'implémenter si tu juges que la slice déséquilibre trop le provider.)*

### Parité avec le legacy (historique/Spin That Wheel v2.html)
- `isDateGroupExcluded(date, rules)` (L651-660) : vide→false ; `dow = date.getDay()` ; `dow !== rule.dayOfWeek`→skip ; `diffDays = Math.round((date - ref)/86400000)` ; **`diffDays < 0`→false** ; `Math.floor(diffDays/7) % rule.everyN === 0`.
- Validation add (L731-744) : `ref` requise ; `everyN` `isNaN || <1`→refus (« La fréquence doit être ≥ 1. ») ; `refDate.getDay() !== dow`→refus (« La date de référence doit être un {DAY_NAMES[dow]}. »). **Pas de dédup de règles** (le legacy `push` sans contrôle de doublon → on ne dédup pas non plus).
- Affichage (L686-720) : badge = `groupExclusions.length` (masqué si 0) ; tag = `${everyN===1 ? 'Chaque' : '1/'+everyN} ${DAY_NAMES[dayOfWeek]} (réf. ${formatDateFr(parseYMD(refDate))})` + ✕ ; état vide « Aucune règle définie. ».
- `DAY_NAMES` (L636) = `['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']` (**index 0 = Dimanche**). Input `everyN` legacy : `value=2 min=1 max=52`.

### Previous Story Intelligence (2.3 / 2.2 / 2.1)
- **Pattern test pur** : `availability.unit.test.ts` / `unavailabilities-reducer.unit.test.ts` = modèles exacts (rouge→vert, pur, CI-runnable). Reproduire pour `group-exclusions` + `group-exclusions-reducer`.
- **File passphrase table-agnostique (2.3)** : `Map<writeKey, WriteSpec>` + `submitPassphrase` rejouant tout = **un seul prompt pour N**, déjà op- ET table-agnostique. Les specs exclusions s'y insèrent **sans changer le contrat**. Le comportement participants ET indispos doit rester **byte-identique**.
- **`retry` rejoue l'op d'origine** : `failedWritesRef` par clé. `retryGroupExclusion` rejoue le `WriteSpec` insert conservé (le delete n'a pas de retry — il restaure la ligne, calque `removeUnavailability`).
- **Flake Realtime connu (1.3→2.3)** : 1er `npm test` peut timeouter sur le handshake puis passer au retry — transitoire, **pas** une régression. Avec un **3ᵉ** canal, surveiller mais ne pas « corriger » un flake de handshake.
- **CI Node 22.x** + Vercel `framework=nextjs` (`vercel.json`) : **ne pas** retoucher CI/Vercel.
- **Dépendances Epic 1/2 en review** (non `done`) mais commitées et fonctionnelles : construire dessus.
- **Push Git** : remote via alias SSH `github-perso` → `Infinter/SpinThatWeeklyWheel` (compte SoloOz). [Source: MEMORY:git-remote-push-setup]

### Points techniques (Next.js 16 / React 19 — janv. 2026)
- **Pas de nouvelle techno, aucune recherche web requise.** Stack figée (Next 16.2.x, React 19.2, supabase-js 2.108.x). Story 100 % domaine pur + data + route + store + UI + CSS, sur patterns existants.
- **`weekdayOf` sans `Date`** : days-from-civil (Hinnant) — convertir `YYYY-MM-DD` (3 entiers) en n° de jour absolu ; weekday = `((dayNumber % 7) + 4 + 7) % 7` (1970-01-01 = jeudi = 4) ; `diffDays = dayNumber(date) - dayNumber(ref_date)`. Déterministe, pur, sans timezone.
- **`<input type="date">`** : valeur native `YYYY-MM-DD`. **`<input type="number">`** : `parseInt(value, 10)` → valider `isValidEveryN`. Pas de lib de date.
- **Snapshot avant optimiste** : pour `removeGroupExclusion`, lire la ligne via `stateRefG.current.find(...)` **avant** `REMOVE` pour le `RESTORE`. `stateRefG` maintenu par `useEffect` (modèle `stateRefU` L132/L137).
- **Trois canaux Realtime** : `participants-rt` + `unavailabilities-rt` (existants, inchangés) + `group-exclusions-rt` (nouveau) ; chacun se re-hydrate au `SUBSCRIBED`. Dédup d'écho par `reconcileById`.

### Project Structure Notes
- Arborescence touchée (tout sous `daily-wheel/`) :
  ```
  lib/domain/team-availability.ts                # NEW (isTeamNonSessionDay + isGroupExcluded + weekdayOf + validateurs PURS — AC1)
  lib/data/group-exclusions.ts                   # NEW (type + fetch + write insert/delete — AC2)
  app/api/group-exclusions/route.ts              # NEW (proxy écriture insert/delete — AC3)
  lib/store/group-exclusions-reducer.ts          # NEW (réducteur optimiste PUR — AC4)
  lib/store/reconcile.ts                          # UPDATE léger (alias reconcileGroupExclusions + GroupExclusionChangeEvent — AC4, générique inchangé)
  lib/store/participants-store.tsx               # UPDATE (3ᵉ slice exclusions + 3ᵉ canal RT ; WriteSpec/runWrite/file INCHANGÉS — AC5)
  components/GroupExclusionsPanel.tsx            # NEW (panneau repliable Options — AC6)
  app/globals.css                                # UPDATE (classes .group-excl-* — AC7)
  app/page.tsx                                   # UPDATE (fetchGroupExclusions + initialGroupExclusions + lift provider Options + montage panneau — AC7)
  package.json                                   # UPDATE (group-exclusions.unit + group-exclusions-reducer.unit dans test:unit — AC8)
  tests/group-exclusions.unit.test.ts            # NEW (preuve domaine pur — AC1)
  tests/group-exclusions-reducer.unit.test.ts    # NEW (preuve réducteur pur — AC4)
  tests/group-exclusions.write.integration.test.ts # NEW optionnel gated (AC8)
  _bmad-output/.../sprint-status.yaml            # UPDATE (statut 3.1 ; géré par le workflow)
  ```
- **Inchangés (réutilisés)** : `app/api/{participants,unavailabilities}/route.ts`, `lib/supabase/{client,admin}.ts`, `lib/data/{participants,unavailabilities,write-error}.ts`, `lib/store/{parse-names,participants-reducer,unavailabilities-reducer}.ts`, `lib/domain/availability.ts`, `lib/format/date-fr.ts`, `components/{ParticipantsCard,UnavailabilityPanel,PassphrasePrompt}.tsx`, `app/layout.tsx`, `next.config.ts`, `vercel.json`, `vitest.config.ts`, **migrations SQL** (table déjà créée).
- **Aucune migration DB** : `group_exclusions` existe déjà avec RLS read-only, publication realtime + REPLICA IDENTITY FULL (init_schema.sql L27-33/L75/L87/L94).

### Testing standards (pour cette story)
- **TDD** : écrire `group-exclusions.unit.test.ts` **avant** `team-availability.ts`, et `group-exclusions-reducer.unit.test.ts` **avant** le réducteur (rouge → vert). Double filet automatique.
- **Périmètre testé automatiquement** : prédicat de domaine + validateurs + réducteur optimiste (purs, CI sans secrets). Store/route/UI **non** unit-testés (cohérent 1.5→2.3). Preuve = **vérification manuelle** :
  - Ouvrir le panneau « Jours exclus (groupe) » (badge 0) → ajouter une règle (jour=Mardi, fréquence=2, réf.=un mardi) → tag « 1/2 Mardi (réf. …) » affiché, badge 1, persistant après reload + autre navigateur (FR6/FR13).
  - Saisir une réf. qui **ne tombe pas** sur le jour choisi → refus (message FR, aucune écriture). Fréquence 0/vide → refus.
  - Supprimer une règle (✕) → disparaît, absente après reload.
  - Ajouter une règle **sans passphrase** → un seul prompt (même file que participants/indispos) ; passphrase erronée (401) → re-prompt, optimiste préservé.
  - Échec transitoire (5xx) → rollback visible / restauration, action re-tentable.
- **Critère « vert »** : `npm run test:unit` vert (write-error + reconcile + parse-names + participants-reducer + availability + unavailabilities-reducer + **group-exclusions** + **group-exclusions-reducer** = 8 suites) ; `npm test` vert (flake Realtime vert au retry) ; `npm run lint` 0 ; `npx tsc --noEmit` 0 ; `npm run build` vert ; grep `.next/static` → 0 secret.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3 ; #Story-3.1 (5 critères, frontière 4.2) ; FR6 ; FR13 ; NFR4 ; NFR5 ; NFR9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-1 ; #AD-3 (isTeamNonSessionDay source unique) ; #AD-5 ; #AD-6 ; #AD-7 ; #AD-8 ; #AD-9 ; #AD-11 ; #AD-13 ; #AD-14 ; #AD-15 ; #AD-16 ; #AD-17 ; #Consistency-Conventions (dates YMD locales) ; #Structural-Seed (api/group_exclusions, lib/domain) ; #Modèle-de-données (table group_exclusions : day_of_week 0-6, every_n, ref_date)]
- [Source: docs/prd.md §3 (UX-DR4 panneaux repliables, UX-DR5 badges, UX-DR6 a11y, UX-DR7 ≤520px) ; §4 (modèle) ; FR6]
- [Source: _bmad-output/implementation-artifacts/2-3-*.md#AC5 (store table-agnostique, un seul prompt) ; #AC4 (réducteur pur + reconcileById<T>) ; #AC1 (module domaine pur, validateurs co-localisés) ; #Dev-Notes (variance structurelle, dates, flake Realtime, Node 22) ; #Décision-de-design (extraction provider déférée si 3ᵉ table)]
- [Source: daily-wheel/lib/data/unavailabilities.ts (modèle data) ; daily-wheel/lib/data/write-error.ts ; daily-wheel/app/api/unavailabilities/route.ts (route complète, modèle) ; daily-wheel/lib/store/participants-store.tsx (runWrite/WriteSpec table-agnostiques L71-169, addUnavailability L328-382, removeUnavailability L384-401, canaux Realtime L440/L469-491, mapChange L521, StoreValue L86-96) ; daily-wheel/lib/store/unavailabilities-reducer.ts ; daily-wheel/lib/store/reconcile.ts (reconcileById<T> + ChangeEvent<T>) ; daily-wheel/components/UnavailabilityPanel.tsx ; daily-wheel/app/page.tsx (SSR L9-53) ; daily-wheel/app/globals.css (tokens L3/L14/L18-21, .text-input L165, media L370, reduced-motion L393) ; daily-wheel/lib/format/date-fr.ts ; daily-wheel/supabase/migrations/20260622121017_init_schema.sql (group_exclusions L27-33, RLS L75, realtime L87/L94) ; daily-wheel/package.json (test:unit L14) ; daily-wheel/vitest.config.ts]
- [Source: historique/Spin That Wheel v2.html (isDateGroupExcluded L651-660 ; markup panel L566-593 ; renderGroupExclusions L686-720 ; validation/add L731-744 ; DAY_NAMES L636 ; CSS group-excl L275-360 ; formatDateFr/parseYMD)]
- [Source: MEMORY:git-remote-push-setup (remote github-perso → Infinter/SpinThatWeeklyWheel)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev-story)

### Debug Log References

- TDD rouge confirmé pour les deux modules purs avant implémentation : `Cannot find package '@/lib/domain/team-availability'` puis `@/lib/store/group-exclusions-reducer`.
- `weekdayOf` validé par ancres calendaires vérifiables (1970-01-01→4 jeudi, 2024-01-01→1 lundi, 2000-01-01→6 samedi, 2026-06-23→2 mardi, 1969-12-31→3 mercredi) ; algorithme entier days-from-civil (sans `Date`, insensible DST).
- `npm test` : 13 suites / 120 tests verts **du premier coup** (pas de flake Realtime cette fois) ; intégration live exécutée (secrets présents en `.env.local`) : `group-exclusions.write.integration` vert (insert règle → 400 every_n=0 → 400 réf. mauvais jour → 400 update → delete + 409).

### Completion Notes List

- **AC1** — `lib/domain/team-availability.ts` (FEUILLE, seul import = type `DayOrRange`) : `isTeamNonSessionDay(date, ctx)` (signature complète AD-3, **seule la branche `groupExclusions` câblée** — 3.2/3.3/4.1 ajouteront les leurs), `isGroupExcluded` (parité legacy L651-660 : `diffDays<0`→false, `floor(diffDays/7)%every_n===0`), `weekdayOf` (days-from-civil pur), `isValidEveryN`, `refDateMatchesDayOfWeek`. 24 tests purs.
- **AC2** — `lib/data/group-exclusions.ts` : `GroupExclusion`, `fetchGroupExclusions`, `writeGroupExclusion` (`insert`/`delete`, pas d'`update`), `WriteError` depuis `@/lib/data/write-error`. Copie structurelle de `unavailabilities.ts`.
- **AC3** — `app/api/group-exclusions/route.ts` : mirroir route unavailabilities, allowlist `day_of_week/every_n/ref_date`, validation serveur défensive (dow ∈ [0,6] entier, every_n ≥ 1 via `isValidEveryN`, ref_date sur le bon jour via `refDateMatchesDayOfWeek`), 409 si delete 0 ligne, `update`→400. Routes participants/unavailabilities et `lib/supabase/` non touchées.
- **AC4** — `reconcile.ts` : ajout alias `reconcileGroupExclusions` + `GroupExclusionChangeEvent` (générique `reconcileById<T>` **inchangé**). `group-exclusions-reducer.ts` pur (cycle insert+delete). 14 tests purs ; `reconcile.unit`/`unavailabilities-reducer` restent verts.
- **AC5** — `participants-store.tsx` : 3ᵉ slice exclusions (`useReducer` + `stateRefG` + `gseqRef`), `addGroupExclusion` (valide via AC1 → message FR + aucune écriture si invalide, optimiste + insert sinon), `removeGroupExclusion` (REMOVE + delete idempotent), `retryGroupExclusion` ; 3ᵉ canal `group-exclusions-rt` + re-hydratation `SUBSCRIBED`. **`WriteSpec`/`runWrite`/file passphrase non modifiés** (déjà table-agnostiques en 2.3) → **un seul prompt** couvre désormais les 3 tables. Chemins participants/indispos byte-identiques (build + intégration live verts).
- **AC6** — `GroupExclusionsPanel.tsx` (toggle repliable `aria-expanded` + badge, select jour `DAY_NAMES` index 0=Dimanche, number every_n défaut 2, date réf., « ＋ Ajouter », tags triés par `ref_date` + ✕, état vide « Aucune règle définie. », contrôles `pending` désactivés). `formatDateFr` réutilisé. Label tag = `${freq} ${DAY_NAMES[dow]} (réf. …)` (parité legacy L703-708).
- **AC7** — CSS `.group-excl-*` (charte bleue primaire, sans dégradé, ≤520px empilé, reduced-motion via tokens existants) ; `page.tsx` : `fetchGroupExclusions` parallèle + `initialGroupExclusions` ; **provider lifté** pour envelopper la carte Options ; `<GroupExclusionsPanel />` monté sous `<h2>Options</h2>` (placeholder retiré) ; carte Résultat hors provider.
- **AC8** — `test:unit` étendu (8 suites / 108 tests purs). `tests/group-exclusions.write.integration.test.ts` gated écrit + vert en live. `lint` 0, `tsc` 0, `build` vert (route `/api/group-exclusions` enregistrée), `npm test` 13 suites / 120 tests, grep `.next/static` → **0 secret** (noms + valeur passphrase).
- **Décision d'altitude tranchée** (validée par Solo) : provider participants **étendu en place** pour la 3ᵉ table (machinerie déjà table-agnostique, churn nul). Extraction d'un `useWriteQueue` partagé planifiée **avant 3.2/3.3** ([[store-extraction-plan]]).
- **Hors-scope respecté** : aucun effet sur la génération du planning (branche `isTeamNonSessionDay` consommée en 4.2) ; aucune migration DB (table créée en 1.2) ; pas d'édition de règle (insert/delete unitaires).

### File List

**Nouveaux :**
- `daily-wheel/lib/domain/team-availability.ts`
- `daily-wheel/lib/data/group-exclusions.ts`
- `daily-wheel/app/api/group-exclusions/route.ts`
- `daily-wheel/lib/store/group-exclusions-reducer.ts`
- `daily-wheel/components/GroupExclusionsPanel.tsx`
- `daily-wheel/tests/group-exclusions.unit.test.ts`
- `daily-wheel/tests/group-exclusions-reducer.unit.test.ts`
- `daily-wheel/tests/group-exclusions.write.integration.test.ts`

**Modifiés :**
- `daily-wheel/lib/store/reconcile.ts` (alias `reconcileGroupExclusions` + `GroupExclusionChangeEvent` ; générique inchangé)
- `daily-wheel/lib/store/participants-store.tsx` (3ᵉ slice exclusions + 3ᵉ canal Realtime ; `WriteSpec`/`runWrite`/file inchangés)
- `daily-wheel/app/page.tsx` (SSR `initialGroupExclusions` + lift provider Options + montage panneau)
- `daily-wheel/app/globals.css` (classes `.group-excl-*` + responsive ≤520px)
- `daily-wheel/package.json` (`test:unit` étendu : +2 suites)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut 3.1)

### Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-06-23 | 0.1 | Story 3.1 contextée (Amelia/create-story) : prête pour dev. |
| 2026-06-23 | 1.0 | Story 3.1 implémentée (Amelia/dev-story) : domaine pur `isTeamNonSessionDay` (source unique AD-3, branche exclusions) + `isGroupExcluded` (parité legacy) + validateurs ; couche data + route proxy `group_exclusions` ; réducteur optimiste pur + alias `reconcileGroupExclusions` ; store 3ᵉ slice + 3ᵉ canal Realtime (un seul prompt passphrase) ; UI panneau repliable + badge dans Options ; CSS + lift provider + SSR. 8 suites unitaires / 108 tests verts, `npm test` 13/120, lint/tsc/build verts, 0 secret. Statut → review. |
