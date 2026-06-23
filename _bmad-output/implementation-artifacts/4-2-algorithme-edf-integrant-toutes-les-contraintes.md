---
baseline_commit: c89d4b1
---

# Story 4.2: Algorithme EDF intégrant toutes les contraintes

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want lancer la génération et obtenir un animateur unique par jour ouvré valide,
so that l'ordre est équitable et toutes les contraintes respectées (FR11, FR14) — **2ᵉ story d'Epic 4, et CŒUR DE VALEUR de toute l'application**. C'est la story qui **consomme** enfin le domaine pur bâti en 2.3 → 4.1 : le prédicat unique `isTeamNonSessionDay` (4 branches câblées, AD-3) et `isPersonUnavailable` deviennent les briques de `generateSchedule(input, rng)`. Après cette story, l'app **produit réellement** un planning (l'affichage soigné — dates longues FR, compteur, avertissements, ≤520 px — reste **Story 4.3**).

## Acceptance Criteria

> Ces AC décomposent les **10 critères** de l'epic (epics.md#Story-4.2) en unités implémentables et testables. La story a **deux faces** :
> - **(A) Domaine pur EDF (cœur testable CI — AD-1, AD-13)** : `generateSchedule(input, rng)` + un `rng` seedable (`createRng`) + les primitives calendaires manquantes (`addDays`, `ymdFromDayNumber`). C'est **l'essentiel de l'effort et des tests** (parité golden AD-12, test paramétré AD-3, tests d'extension fériés/off, déterminisme NFR7). Aucun import React/DOM/Supabase (`lib/domain/` est une FEUILLE).
> - **(B) Câblage UI éphémère (NON persisté — pattern NEUF)** : un état **résultat éphémère** dans le store (pas de table, pas de route d'écriture, pas de Realtime, pas d'optimiste/réconciliation — le planning est **recalculé**, jamais stocké), un bouton « 🎲 Lancer la sélection », et un **rendu minimal** du résultat. La présentation riche = **4.3**.
>
> ⚠️ **Le résultat n'est PAS une donnée persistée.** Contrairement aux 6 slices existantes (participants → settings), il n'y a **ni table `schedule`, ni migration, ni `app/api/schedule`, ni canal Realtime, ni `WriteError`/optimiste**. C'est un **calcul client pur** : `generate()` lit l'état courant du store, appelle le domaine, et pose le résultat dans un `useState`. Ne **PAS** copier le patron insert/delete/upsert des autres slices.
>
> ✅ **Tout le domaine de contraintes existe et est testé** (`isTeamNonSessionDay` 4 branches — `team-availability.ts` L102-109 ; `isPersonUnavailable` — `availability.ts` L23-32 ; calendrier entier `dayNumber`/`weekdayOf`). 4.2 les **consomme** sans les réécrire. Le seul NEUF calendaire est l'**itération jour-par-jour en YMD** (`addDays`) + l'**inverse civil-from-days** (`ymdFromDayNumber`), additifs à `team-availability.ts`.

1. **Primitives calendaires pures manquantes (additif, FEUILLE — AD-1, convention dates).** Étendre `daily-wheel/lib/domain/team-availability.ts` **sans toucher** les fonctions existantes ni leurs signatures (régression interdite) :
   - **Exporter** `dayNumber` (actuellement privé L38-46 : `function dayNumber` → `export function dayNumber`) — il devient une primitive partagée du domaine.
   - **Ajouter** `export function ymdFromDayNumber(n: number): string` — **inverse** de `dayNumber` (civil-from-days de Howard Hinnant), pur, entier, **sans `Date`** : reconstitue `YYYY-MM-DD` (zéro-paddé) depuis un n° de jour absolu. C'est le pendant exact de `dayNumber` ; un test round-trip (`ymdFromDayNumber(dayNumber(ymd)) === ymd`) le prouve.
   - **Ajouter** `export function addDays(ymd: string, n: number): string { return ymdFromDayNumber(dayNumber(ymd) + n) }` — avance/recul de `n` jours en YMD. **C'est le seul moyen autorisé d'itérer jour par jour** dans la génération (le legacy faisait `date.setDate(getDate()+1)` sur un `Date` — INTERDIT ici, AD-1/convention dates).
   - **Ajouter** `export function addYears(ymd: string, years: number): string` — incrémente la composante année (`${y+years}-${mm}-${dd}`), pour calculer la **borne d'horizon** (+1 an, parité legacy `setFullYear(+1)`). *Nuance documentée* : `2028-02-29` (bissextile) + 1 an donne une chaîne `2029-02-29` inexistante ; comme l'horizon est une **borne d'arrêt de sécurité** comparée lexicographiquement (`cur <= lim`) et jamais atteinte pour une équipe typique (NFR6 : ≤ 50 personnes, ≤ 1 an), c'est sans impact sur la planification. Laisser un commentaire à ce sujet.
   - **TDD rouge d'abord** : créer `daily-wheel/tests/calendar.unit.test.ts` (ROUGE : `addDays`/`ymdFromDayNumber` absents) couvrant : round-trip `ymdFromDayNumber(dayNumber(x))===x` sur plusieurs dates (epoch, avant epoch `1969-12-31`, bissextile `2024-02-29`, `2026-06-23`) ; `addDays('2026-06-23', 1)==='2026-06-24'` ; passage de mois `addDays('2026-06-30', 1)==='2026-07-01'` ; passage d'année `addDays('2026-12-31', 1)==='2027-01-01'` ; recul `addDays('2026-01-01', -1)==='2025-12-31'` ; `addYears('2026-06-23', 1)==='2027-06-23'`. → VERT.
   [Source: daily-wheel/lib/domain/team-availability.ts (`dayNumber` L38-46 à EXPORTER, `weekdayOf` L50-53 modèle d'usage de `dayNumber`, en-tête « days-from-civil » L11-13) ; daily-wheel/tests/group-exclusions.unit.test.ts (style test calendaire L24-39 : `weekdayOf` ancré sur dates connues) ; ARCHITECTURE-SPINE.md#AD-1 ; #Consistency-Conventions (dates YMD locales, jamais `Date`/UTC)]

2. **RNG seedable pur (`createRng`) — AD-2, NFR7.** Créer `daily-wheel/lib/domain/rng.ts` (FEUILLE, PUR — aucun import, **aucun `Math.random()` interne**) :
   - `export type Rng = () => number` — interface contractuelle (`[0,1)`, compatible `Math.random`).
   - `export function createRng(seed: number): Rng` — implémentation **mulberry32** (générateur 32 bits déterministe, standard, ~5 lignes). Même `seed` → **même séquence** (rejouabilité NFR7/parité AD-12).
   - **Ne PAS** exposer de `randomSeed()` ici : le tirage du seed aléatoire en prod se fait **hors domaine** (dans le store, via `Math.random()` — autorisé là, voir AC7). Le domaine ne connaît que `seed → générateur`.
   - **TDD rouge d'abord** : `daily-wheel/tests/rng.unit.test.ts` (ROUGE : module absent) : même seed → séquences identiques (déterminisme) ; seeds différents → séquences différentes ; toutes les valeurs ∈ `[0, 1)` (≥ 0 et < 1 sur N tirages). → VERT.
   [Source: ARCHITECTURE-SPINE.md#AD-2 (rng injecté, interface `rng: () => number` renvoyant `[0,1)`, mulberry32 cité ; aucun `Math.random()` dans le domaine) ; #AD-1 ; historique/Spin That Wheel v2.html (shuffle Fisher-Yates L607-611 — à reproduire avec `rng` au lieu de `Math.random`)]

3. **`generateSchedule(input, rng)` — cœur EDF pur (AD-1, AD-2, AD-3, FR11, FR14).** Créer `daily-wheel/lib/domain/schedule.ts` (FEUILLE PURE : imports **type-only/fonction-pure** de `@/lib/domain/team-availability` [`isTeamNonSessionDay`, `TeamConstraints`, `addDays`, `addYears`], `@/lib/domain/availability` [`isPersonUnavailable`, `DayOrRange`], `@/lib/domain/rng` [`Rng`] — **rien d'autre**). Types + fonction :
   - **Types d'entrée/sortie** (camelCase domaine, ≠ snake_case DB — le store fait le mapping en AC7) :
     ```ts
     export type SchedulePerson = { id: string; name: string; unavailabilities: DayOrRange[] }
     export type ScheduleInput = {
       participants: SchedulePerson[]   // UNIQUEMENT les actifs (le store filtre active=true)
       constraints: TeamConstraints     // { skipWeekends?, groupExclusions?, holidays?, teamOffDays? }
       startDate: string                // YMD ; défaut « aujourd'hui » résolu côté store (settings.start_date ?? todayYMD())
     }
     export type ScheduleRow = { date: string /*YMD*/; participantId: string; name: string }
     export type ScheduleResult = { planning: ScheduleRow[]; unscheduled: { id: string; name: string }[] }
     export function generateSchedule(input: ScheduleInput, rng: Rng): ScheduleResult
     ```
   - **Algorithme — REPRODUIRE FIDÈLEMENT le legacy** (pseudo-code complet en Dev Notes §« Référence de parité legacy ») en 3 phases :
     - **Phase 0 — premier jour valide** : partir de `startDate`, avancer (`addDays(cur, 1)`) tant que `isTeamNonSessionDay(cur, constraints)` **OU** « tous les actifs indisponibles ce jour » (`participants.every(p => isPersonUnavailable(p.unavailabilities, cur))`), borné par l'horizon `lim = addYears(start0, 1)` calculé depuis le `startDate` initial. (Parité legacy L1006-1013.)
     - **Phase 1 — ordre initial** : `const order = shuffle([...participants], rng)` (Fisher-Yates **descendant**, identique au legacy L607-611 mais avec `rng()` au lieu de `Math.random()` : `for (let i=order.length-1; i>0; i--) { const j = Math.floor(rng()*(i+1)); [swap] }`). Mémoriser l'**index initial** de chaque personne (`shuffleIdx: Map<id, position>`) pour le tie-break EDF. (Parité legacy L1015-1019.)
     - **Phase 2 — placement EDF** : `queue = [...order]` ; `cur = (premier jour valide)` ; `lim = addYears(cur, 1)` (**recalculé depuis le premier jour valide**, parité legacy L1023-1025 où `lim` part du `start` déjà avancé). Tant que `queue.length > 0 && cur <= lim` (comparaison **lexicographique** de chaînes YMD) :
       1. si `isTeamNonSessionDay(cur, constraints)` → `cur = addDays(cur,1)` ; continue (jour neutralisé, **pas un trou**).
       2. si `participants.every(p => isPersonUnavailable(p.unavailabilities, cur))` → `cur = addDays(cur,1)` ; continue (tous indispo — testé sur **TOUS les actifs**, pas la queue ; pas un trou).
       3. `avail = queue.filter(p => !isPersonUnavailable(p.unavailabilities, cur))`.
       4. si `avail.length === 0` → **`break`** (il reste des gens en queue mais aucun n'est dispo aujourd'hui → les placer ailleurs créerait un trou : on arrête, rotation one-shot — AC6).
       5. **tri EDF** de `avail` (voir AC4) ; `pick = avail[0]` ; `planning.push({ date: cur, participantId: pick.id, name: pick.name })` ; retirer `pick` de `queue` ; `cur = addDays(cur,1)`.
     - **Sortie** : `unscheduled` = les `participants` (actifs) dont l'`id` n'apparaît PAS dans `planning` (restants en queue **+** ceux jamais plaçables). (Parité legacy L1095.)
   - **Invariant one-shot (AC6)** : chaque personne placée **au plus une fois** (la queue se vide, jamais de ré-insertion) ; **aucun trou** n'est jamais créé (un jour sans candidat dispo arrête la boucle, il n'est pas « rempli »). [Source: ARCHITECTURE-SPINE.md#Flux-génération (flowchart invariants L286-310)]
   - **Aucun `Date`, aucun `Math.random()`, aucune lecture de store** : tout en YMD + `addDays` + `rng` paramètre. (AD-1/AD-2.)
   [Source: historique/Spin That Wheel v2.html (handler `selectButton` L994-1104 : phase 0 L1006-1013, shuffle L1015-1019, boucle EDF L1021-1065, non-planifiés L1095-1101 ; `shuffle` L607-611 ; `isWeekend` L626-628 ; `isDateGroupExcluded` L651-661 ; `isDateIndispo` L640-647) ; daily-wheel/lib/domain/team-availability.ts (`isTeamNonSessionDay` L102-109) ; daily-wheel/lib/domain/availability.ts (`isPersonUnavailable` L23-32) ; ARCHITECTURE-SPINE.md#AD-1 ; #AD-2 ; #AD-3 ; #Flux-génération-du-planning]

4. **Priorité EDF + `getLastConsecAvailDay` via LE MÊME prédicat (AD-3 — couture critique).** Dans `schedule.ts`, fonction interne **pure** :
   - `getLastConsecAvailDay(person: SchedulePerson, fromDay: string, constraints: TeamConstraints): string | null` — dernier jour **consécutif ouvré disponible** pour `person` à partir de `fromDay` (borne `addYears(fromDay,1)`). Itère `d = fromDay` puis `addDays(d,1)` ; **si `isTeamNonSessionDay(d, constraints)` → continue** (jour neutralisé sauté, **PAS** une fin de fenêtre) ; **si `isPersonUnavailable(person.unavailabilities, d)` → `break`** (fin de la fenêtre consécutive) ; sinon `last = d`. Retourne `last` (ou `null` si `person` est indispo dès `fromDay`). (Parité legacy `getLastConsecAvailDay` L979-992.)
   - 🔴 **EXIGENCE AD-3 (la plus importante de la story)** : `getLastConsecAvailDay` **DOIT** utiliser **exactement le même** `isTeamNonSessionDay(date, constraints)` que la boucle de placement (AC3, étape 1). **Aucune** réimplémentation locale du « jour neutralisé », **aucune** vérification partielle (p. ex. week-ends seuls). Le legacy ne neutralisait QUE week-ends + exclusions de groupe dans cette fonction (fériés/off n'existaient pas) ; ici, **brancher le prédicat complet** garantit que fériés et jours off **élargissent** la fenêtre de disponibilité de la même façon dans les deux sites. C'est la couture que AD-3 protège : une contrainte ajoutée à la boucle mais oubliée dans la deadline ⇒ planning faux **silencieusement**.
   - **Tri EDF** (comparateur, parité legacy L1050-1059) sur `avail` :
     1. `da = getLastConsecAvailDay(a, cur, constraints)` ; `db = getLastConsecAvailDay(b, cur, constraints)`.
     2. si `da && db` : comparer **lexicographiquement** les YMD → **plus tôt en premier** (`da < db ? -1 : da > db ? 1 : tieBreak`). (Pour des YMD, l'ordre lexicographique == chronologique.)
     3. sinon si `da` seul (b null) → `-1` ; sinon si `db` seul → `1`.
     4. **tie-break** (`da === db` ou les deux null) → `shuffleIdx.get(a.id)! - shuffleIdx.get(b.id)!` (**ordre du tirage initial**, FR14 — départage déterministe). 
   - *Note pratique* : par construction, les membres de `avail` sont dispo à `cur` ⇒ `getLastConsecAvailDay` retourne au minimum `cur` (jamais `null` pour un membre d'`avail`). Le cas `null` est donc **défensif** (fidélité legacy) ; le reproduire quand même.
   - **`Array.prototype.sort` n'est pas stable garanti cross-moteur** mais l'est en V8/Node (≥ Node 11) et le tie-break explicite par `shuffleIdx` rend l'ordre **totalement déterministe** indépendamment de la stabilité — c'est voulu (AD-2/NFR7).
   [Source: historique/Spin That Wheel v2.html (`getLastConsecAvailDay` L979-992, comparateur EDF L1050-1059, `shuffleIdx` L1019) ; daily-wheel/lib/domain/team-availability.ts (`isTeamNonSessionDay` L102-109 — SOURCE UNIQUE) ; ARCHITECTURE-SPINE.md#AD-3 (les deux sites d'appel partagent le prédicat ; test paramétré le prouve)]

5. **Test paramétré AD-3 « même prédicat aux deux sites » (epic AC7) — preuve sans spy.** Dans `daily-wheel/tests/schedule.unit.test.ts`, un `describe` paramétré sur les **4 types de neutralisation** (`weekend` via `skipWeekends`, `groupExclusion`, `holiday`, `teamOffDay`). Pour **chaque** type, construire un dataset minimal où une seule journée `D` est neutralisée par ce type, et asserter **les deux effets** :
   - **(a) Effet boucle** : `D` ne reçoit **aucun** animateur dans `planning` (la boucle a sauté `D` — étape 1 d'AC3), et le placement reprend au jour suivant disponible **sans trou** ni décalage erroné.
   - **(b) Effet deadline** : une personne disponible **avant et après** `D` a une fenêtre EDF qui **franchit** `D` (sa priorité/placement reflète une deadline **postérieure** à `D`, pas une deadline qui s'arrête à la veille de `D`). Concrètement : monter un cas à 2 personnes où, **si** la deadline ignorait la neutralisation de `D` (fenêtre tronquée à `D-1`), l'ordre de placement serait **différent** de celui obtenu quand `D` est correctement neutralisé — et asserter l'ordre **correct**.
   - Si les deux sites utilisaient des prédicats divergents, (a) ou (b) échouerait pour au moins un des 4 types. Les 4 types passant **prouve** la source unique (AD-3). Documenter en commentaire l'intention de chaque cas.
   [Source: ARCHITECTURE-SPINE.md#AD-3 (« un test paramétré prouve que les deux sites d'appel utilisent le même prédicat ») ; epics.md#Story-4.2 (AC : test paramétré boucle ⇔ deadline) ; daily-wheel/tests/group-exclusions.unit.test.ts (style paramétré `rule()` L17-22)]

6. **Test GOLDEN de parité (périmètre LEGACY uniquement — NFR9, AD-12, epic AC6/AC8).** Créer `daily-wheel/tests/schedule.golden.test.ts` — **dédié**, distinct des tests d'extension :
   - **Périmètre** : **uniquement** les contraintes présentes dans l'ancienne page → `skipWeekends`, **exclusions de groupe**, **indisponibilités individuelles**. `constraints.holidays = []` et `constraints.teamOffDays = []` (extensions hors legacy ⇒ exclues du golden). Dans ce périmètre, `isTeamNonSessionDay` se réduit **exactement** à `weekend|groupExclusion`, donc équivalent au legacy.
   - **Parité ALGORITHMIQUE, pas rejeu d'output** : ⚠️ le shuffle legacy utilisait `Math.random()` **non-seedable** → il n'existe pas d'« output legacy figé » à rejouer. La parité se prouve en **fixant le seed** (donc l'ordre initial via `createRng`), puis en **traçant À LA MAIN** l'algorithme legacy (pseudo-code en Dev Notes) sur le **même** dataset + **même** ordre initial pour dériver le `planning` **attendu**, et en assertant l'égalité stricte. Recommandation pour rendre la dérivation robuste : choisir un dataset où les **deadlines EDF sont distinctes** sur les jours contendus (l'ordre est alors déterminé par l'EDF, le shuffle ne servant qu'aux tie-breaks documentés) — ainsi l'attendu est traçable sans ambiguïté.
   - **Contenu** : 1 fixture `LEGACY_FIXTURE` (≈ 4-6 participants, `skipWeekends:true`, 1-2 exclusions de groupe, quelques indispos dont 1 plage), 1 `SEED` fixe, l'`expected: ScheduleRow[]` hand-tracé + la liste `unscheduled` attendue. Asserter `generateSchedule(LEGACY_FIXTURE, createRng(SEED))` **deep-equal** à l'attendu. **Documenter en commentaire** la dérivation (jour par jour : neutralisations, avail, deadlines, pick) pour que la parité soit auditable.
   - **NFR9 est satisfait SSI ce test passe** (AD-12). Ne **PAS** y mêler fériés/off (ce serait hors parité).
   [Source: ARCHITECTURE-SPINE.md#AD-12 (test golden, périmètre legacy strict, parité ⇔ test vert) ; #AD-2 (seed fixe en test) ; historique/Spin That Wheel v2.html (algorithme complet L994-1104 = référence à tracer) ; epics.md#Story-4.2 (AC8 golden, AC10 déterminisme)]

7. **Tests d'extension dédiés (fériés/off ↔ deadline EDF) + déterminisme + perf (epic AC9/AC10).** Dans `daily-wheel/tests/schedule.unit.test.ts` (mécaniques + extension), couvrir **distinctement de la parité** (AD-12 : l'extension porte ses propres tests) :
   - **Extension fériés/off ↔ deadline** : un dataset où un **jour férié** (puis un **jour off** d'équipe, puis une **plage off**) tombe **au milieu** de la fenêtre d'une personne, et asserter que (a) le jour est neutralisé (pas d'animateur, pas de trou) **et** (b) la fenêtre/priorité EDF le **franchit** (extension du comportement legacy). C'est le complément métier hors-legacy (les fériés/off n'existaient pas dans l'ancienne page).
   - **Déterminisme (NFR7)** : `generateSchedule(input, createRng(S))` appelé 2× avec **le même** `S` ⇒ résultats **identiques** (deep-equal) ; avec 2 seeds différents ⇒ ordres initiaux différents (au moins un dataset où l'ordre change).
   - **Mécaniques de base** : un seul participant → planifié chaque jour ouvré valide jusqu'à épuisement ? Non — **one-shot** : placé **une seule** fois (rotation), puis la queue est vide → planning de **1 ligne**. Asserter cet invariant (AC6). Jour « tous indispo » sauté. `avail` vide → break (non-planifiés non vides). `startDate` tombant un jour neutralisé → phase 0 avance correctement. Liste d'actifs **vide** → `planning: []`, `unscheduled: []` (pas de crash).
   - **Perf (NFR6, léger)** : un test sanity (≤ 50 participants, horizon réaliste) s'exécute en quelques ms (pas d'assertion de temps stricte — juste prouver qu'il **termine** sans explosion ; l'horizon +1 an borne la boucle).
   [Source: ARCHITECTURE-SPINE.md#AD-12 (extension fériés/off = tests dédiés, distincts de la parité) ; #AD-2 (déterminisme) ; epics.md#Story-4.2 (AC9 extension, AC10 déterminisme + perf NFR6/NFR7) ; daily-wheel/lib/domain/team-availability.ts (`isHoliday` L78-80, `isTeamOffDay` L86-88)]

8. **Store : action `generate()` + état résultat ÉPHÉMÈRE (pattern NEUF — non persisté, AD-1 consommé côté state).** Étendre `daily-wheel/lib/store/participants-store.tsx`. **AUCUNE** persistance : pas de reducer optimiste, pas de `WriteSpec`/`useWriteQueue`, pas de canal Realtime, pas de route. Juste un `useState` + une fonction de calcul pur :
   - **État** : `const [schedule, setSchedule] = useState<ScheduleResult | null>(null)` (`null` = pas encore généré). Optionnel : `const [lastSeed, setLastSeed] = useState<number | null>(null)` si utile au debug (sinon s'abstenir).
   - **Action** `generate()` (`useCallback`) :
     1. **Filtrer les actifs** : `const actives = participants.filter(p => p.active === true)` — même critère « actif » que l'UI (champ `active`). Rester simple : ne pas tenter d'exclure les états optimistes transitoires.
     2. **Mapper l'entrée** `ScheduleInput` (camelCase domaine ← snake_case store) :
        - `participants`: `actives.map(p => ({ id: p.id, name: p.name, unavailabilities: unavailabilities.filter(u => u.participant_id === p.id).map(u => ({ kind: u.kind, date1: u.date1, date2: u.date2 })) }))`.
        - `constraints`: `{ skipWeekends: settings.skip_weekends, groupExclusions: groupExclusions.map(g => ({ day_of_week: g.day_of_week, every_n: g.every_n, ref_date: g.ref_date })), holidays: holidays.map(h => ({ date: h.date })), teamOffDays: teamOffDays.map(t => ({ kind: t.kind, date1: t.date1, date2: t.date2 })) }`.
        - `startDate`: `settings.start_date ?? todayYMD()` (import `todayYMD` de `@/lib/format/date-fr` — **autorisé hors domaine**).
     3. **Seed aléatoire** : `const seed = Math.floor(Math.random() * 0x100000000)` — **`Math.random()` est ici autorisé** (store, hors de la FEUILLE domaine ; AD-2 n'interdit `Math.random` qu'**à l'intérieur** de `lib/domain/`). En prod chaque clic produit un ordre différent (FR14) ; les **tests** du domaine passent un seed fixe via `createRng`.
     4. `setSchedule(generateSchedule(input, createRng(seed)))` (et `setLastSeed(seed)` si retenu).
   - **Exposer** dans `StoreValue` (zone L94-122) + l'objet `value` (zone L713-741) : `schedule: ScheduleResult | null` et `generate: () => void`. **API additive uniquement** (aucun membre retiré — non-régression).
   - **Imports** à ajouter : `generateSchedule`, `createRng`, `type ScheduleResult` (depuis `@/lib/domain/schedule` et `@/lib/domain/rng`) ; `todayYMD` (`@/lib/format/date-fr`) ; `useState`/`useCallback` (déjà importés).
   - **Ne PAS** : créer de table/migration, de `lib/data/schedule.ts`, de route `app/api/schedule`, de canal Realtime, ni toucher `useWriteQueue`/les 6 slices/réducteurs/`reconcile.ts`. Le résultat **n'est jamais écrit ni reçu** de Supabase.
   [Source: daily-wheel/lib/store/participants-store.tsx (StoreValue L94-122, `value` L713-741, imports L1-40, usage `settings`/`participants`/`unavailabilities`/`groupExclusions`/`holidays`/`teamOffDays` déjà dans le store — voir StoreValue) ; daily-wheel/lib/data/{participants,unavailabilities,group-exclusions,holidays,team-off-days,settings}.ts (formes snake_case à mapper) ; daily-wheel/lib/format/date-fr.ts (`todayYMD` L23-28) ; ARCHITECTURE-SPINE.md#AD-1 (domaine appelé par le store) ; #AD-2 (seed hors domaine)]

9. **UI : bouton « 🎲 Lancer la sélection » + rendu MINIMAL du résultat (UX-DR1, FR11/FR12 amorce — présentation riche déléguée à 4.3).** Créer `daily-wheel/components/ScheduleResult.tsx` (consomme `useParticipants()` → `{ schedule, generate, participants }`) :
   - **Bouton primaire** « 🎲 Lancer la sélection » → `onClick={generate}` ; c'est l'**action principale** (UX-DR1). Désactivé (`disabled`) s'il n'y a **aucun** participant actif (`participants.filter(p=>p.active).length === 0`) avec un libellé explicite (« Ajoutez au moins un participant actif »).
   - **Rendu minimal** (la présentation soignée = **Story 4.3**, ne PAS sur-investir ici) : si `schedule === null` → message « Cliquez sur Lancer pour générer le planning. » ; sinon un tableau simple **Date → Animateur** (utiliser `formatDateFr(row.date)` — déjà dispo, lisible FR/NFR4) + un compteur léger de sessions + une liste des **non-planifiés** (`schedule.unscheduled.map(u => u.name)`). **Pas** de raisons détaillées par non-planifié, **pas** de polish responsive avancé, **pas** d'état vide riche : tout ça est **4.3**.
   - **A11y/charte** : `<button>` natif, FR, charte existante (primaire `#0078d4`, sans dégradé). 
   - **⚠️ Frontière 4.2/4.3** : 4.3 (« Affichage du planning et des non-planifiés ») **remplacera/enrichira** ce rendu (dates longues structurées, compteur en en-tête, avertissements avec raison générique « indisponible / placerait un trou », message « aucun planifiable », responsive ≤ 520 px). 4.2 livre **le déclencheur + le résultat brut affiché** ; ne pas empiéter sur le périmètre 4.3.
   [Source: epics.md#Story-4.2 (« quand je clique 🎲 Lancer la sélection ») ; #Story-4.3 (périmètre affichage à NE PAS faire ici) ; docs/prd.md §3 (UX-DR1 action principale claire) ; daily-wheel/components/GenerationOptions.tsx (modèle de composant consommant `useParticipants` ; bloc non repliable) ; daily-wheel/lib/format/date-fr.ts (`formatDateFr` L12-19) ; daily-wheel/components/HolidaysPanel.tsx (structure form/classes)]

10. **Montage : déplacer la carte Résultat DANS le provider + CSS bouton minimal (AC9, structure).** 
    - **`daily-wheel/app/page.tsx`** : la `<section className="card">` **Résultat** est actuellement **HORS** du `<ParticipantsStoreProvider>` (L73-78). La **déplacer À L'INTÉRIEUR** du provider (après la carte Options, L71) et y monter `<ScheduleResult />` (remplaçant le placeholder `<p>Le planning généré s'affichera ici.</p>`). Le provider doit envelopper Résultat car le bouton/rendu consomment le store. **Conserver** le titre `<h2 id="card-resultat">Résultat</h2>`. Ajouter l'import `ScheduleResult`. **Aucun nouveau fetch SSR** (le résultat n'est pas persisté — rien à hydrater).
    - **`daily-wheel/app/globals.css`** : ajouter un style **minimal** pour le bouton primaire de lancement (`.btn-generate` ou réutiliser un style de bouton existant) — charte `--primary`/`--primary-dark`, coins arrondis, **sans dégradé**, focus visible (UX-DR6) — et un style sobre pour le tableau de résultat minimal. **Le responsive ≤ 520 px soigné de la carte Résultat = Story 4.3** : ici, juste s'assurer que ça ne casse pas la mise en page (réutiliser tokens/`.card` existants). Ne PAS sur-styliser.
    [Source: daily-wheel/app/page.tsx (carte Résultat HORS provider L73-78, provider L54-71, imports L1-12) ; daily-wheel/app/globals.css (tokens `:root` L2-26, styles de boutons/inputs existants, media ≤520px) ; ARCHITECTURE-SPINE.md#AD-1 ; epics.md#Story-4.3 (responsive/présentation = 4.3)]

11. **Tests + non-régression globale (AD-13, NFR9).**
    - **Filet CI pur (obligatoire, tout sous `daily-wheel/`)** : `tests/calendar.unit.test.ts` (AC1), `tests/rng.unit.test.ts` (AC2), `tests/schedule.unit.test.ts` (AC5 paramétré AD-3 + AC7 extension/déterminisme/mécaniques), `tests/schedule.golden.test.ts` (AC6 parité legacy) — tous écrits **rouge → vert** et **ajoutés à `test:unit`** dans `package.json` (liste explicite L14, actuellement **14 suites** → **18**).
    - **Non-régression (NFR9)** : les **14 suites existantes** restent vertes (le domaine de contraintes et les 6 slices ne sont **pas modifiés** — `team-availability.ts` n'est étendu qu'**additivement** : `dayNumber` exporté + 3 fonctions calendaires neuves, **aucune** signature existante touchée). Les chemins participants/indispos/exclusions/fériés/off/settings conservent un comportement **identique** (la fonctionnalité résultat est **additive** et éphémère). `npm run lint` 0 ; `npx tsc --noEmit` 0 ; `npm run build` vert (aucune nouvelle route ⇒ pas de `/api/schedule`). Grep `.next/static` : **0 secret** (inchangé — aucune nouvelle surface serveur).
    - **Vérification manuelle (Store/UI non unit-testés, cohérent 1.5→4.1 — pas de RTL/jsdom, ne pas ajouter de dépendance)** : voir Dev Notes §Testing.
    [Source: daily-wheel/package.json (`test:unit` L14 — 14 suites à porter à 18) ; daily-wheel/vitest.config.ts (alias `@`, stub `server-only`, gate `SUPABASE_TEST_LIVE` — NE PAS retoucher) ; ARCHITECTURE-SPINE.md#AD-13 (CI = tests domaine purs sans secrets) ; #AD-12 (parité = golden vert)]

## Tasks / Subtasks

> ⚠️ **Tout le code et toutes les commandes `npm` sont sous `daily-wheel/`** (variance structurelle héritée 1.1→4.1). Le workflow CI à la racine n'est **pas** touché.
> 🟢 **Aucune migration / route / écriture / Realtime** : le résultat est un **calcul client éphémère**. Ne pas copier le patron persisté des 6 slices.
> 🆕 **Le NEUF** : domaine EDF pur (`generateSchedule` + `rng` + `addDays`/`ymdFromDayNumber`), parité golden hand-tracée, test paramétré AD-3, état résultat éphémère + bouton.

- [x] **Tâche 1 — Primitives calendaires pures (`addDays`, `ymdFromDayNumber`, export `dayNumber`, `addYears`) (rouge → vert)** (AC: 1, 11)
  - [x] Écrire `daily-wheel/tests/calendar.unit.test.ts` (ROUGE : fonctions absentes) : round-trip `ymdFromDayNumber(dayNumber(x))`, `addDays` (jour/mois/année/recul), `addYears`.
  - [x] `team-availability.ts` : **exporter** `dayNumber` ; **ajouter** `ymdFromDayNumber` (inverse civil-from-days), `addDays`, `addYears` (commentaire nuance bissextile sur l'horizon). **Signatures existantes inchangées.** VERT.

- [x] **Tâche 2 — RNG seedable `createRng` (mulberry32) (rouge → vert)** (AC: 2, 11)
  - [x] Écrire `daily-wheel/tests/rng.unit.test.ts` (ROUGE) : déterminisme (même seed ⇒ même séquence), seeds≠ ⇒ séquences≠, valeurs ∈ [0,1).
  - [x] Créer `daily-wheel/lib/domain/rng.ts` : `type Rng`, `createRng(seed)` mulberry32 (PUR, sans `Math.random`). VERT.

- [x] **Tâche 3 — `generateSchedule` + `getLastConsecAvailDay` (cœur EDF pur)** (AC: 3, 4)
  - [x] Créer `daily-wheel/lib/domain/schedule.ts` : types (`SchedulePerson`/`ScheduleInput`/`ScheduleRow`/`ScheduleResult`), `shuffle(arr, rng)` Fisher-Yates, `getLastConsecAvailDay` (via `isTeamNonSessionDay`), comparateur EDF (tie-break `shuffleIdx`), boucle 3 phases (phase 0 + shuffle + placement, break « avail vide », one-shot). Imports purs uniquement. `tsc` vert.

- [x] **Tâche 4 — Test paramétré AD-3 (boucle ⇔ deadline, 4 types) + mécaniques + extension + déterminisme** (AC: 5, 7, 11)
  - [x] Écrire `daily-wheel/tests/schedule.unit.test.ts` : `describe` paramétré sur weekend/groupExclusion/holiday/teamOffDay prouvant effet boucle **et** effet deadline (AD-3) ; extension fériés/off ↔ fenêtre EDF ; déterminisme (même seed) ; mécaniques (one-shot 1 ligne, tous-indispo sauté, avail vide → break, startDate sur jour neutralisé, actifs vides). VERT.

- [x] **Tâche 5 — Test GOLDEN de parité legacy (périmètre legacy strict)** (AC: 6, 11)
  - [x] Créer `daily-wheel/tests/schedule.golden.test.ts` : `LEGACY_FIXTURE` (skipWeekends + exclusions + indispos ; `holidays:[]`, `teamOffDays:[]`), `SEED` fixe, `expected` hand-tracé (dérivation documentée jour par jour), assert deep-equal. NFR9.

- [x] **Tâche 6 — Store : action `generate()` + état `schedule` éphémère** (AC: 8)
  - [x] `participants-store.tsx` : `useState<ScheduleResult|null>` ; `generate()` (filtre actifs → map `ScheduleInput` snake→camel → seed `Math.random` → `generateSchedule(input, createRng(seed))` → `setSchedule`) ; exposer `schedule`/`generate` dans `StoreValue` + `value` ; imports. **Aucune** persistance/Realtime/route/file. API additive.

- [x] **Tâche 7 — UI : bouton « 🎲 Lancer la sélection » + rendu minimal** (AC: 9)
  - [x] Créer `daily-wheel/components/ScheduleResult.tsx` (bouton primaire → `generate` ; désactivé si 0 actif ; tableau minimal Date(`formatDateFr`)→Animateur + compteur + non-planifiés ; FR/charte). Présentation riche = 4.3.

- [x] **Tâche 8 — Montage page + CSS minimal** (AC: 10)
  - [x] `app/page.tsx` : **déplacer** la carte Résultat **dans** le provider, monter `<ScheduleResult />`, import. Aucun fetch SSR ajouté.
  - [x] `app/globals.css` : style minimal bouton primaire (charte, sans dégradé, focus visible) + tableau résultat sobre. Responsive soigné = 4.3.

- [x] **Tâche 9 — Scripts de test + non-régression** (AC: 11)
  - [x] `package.json` : ajouter `calendar.unit`, `rng.unit`, `schedule.unit`, `schedule.golden` à `test:unit` (→ **18 suites**).
  - [x] Non-régression : `npm run test:unit` vert (18 suites) ; `npm test` vert (flake Realtime connu → vert au retry `npm run test:realtime`) ; `npm run lint` 0 ; `npx tsc --noEmit` 0 ; `npm run build` vert (pas de nouvelle route) ; grep `.next/static` → 0 secret.

## Dev Notes

### Contexte & périmètre
- **2ᵉ story d'Epic 4, cœur de valeur (FR11, FR14)** : c'est ICI que le domaine pur accumulé (2.3 `isPersonUnavailable`, 3.1-3.3 + 4.1 `isTeamNonSessionDay` 4 branches, 4.1 `settings`) est **consommé** pour produire un planning. Le prédicat unique AD-3 est **complet** depuis 4.1 ; 4.2 le **branche** dans `generateSchedule` (boucle + deadline). [Source: epics.md#Epic-4 ; #Story-4.2 ; ARCHITECTURE-SPINE.md#AD-3 ; #Capability-Map L316]
- **In-scope :** primitives calendaires `addDays`/`ymdFromDayNumber`/`addYears` (additif) ; `rng` mulberry32 ; `generateSchedule(input, rng)` + `getLastConsecAvailDay` (EDF, parité legacy) ; tests (paramétré AD-3, golden parité, extension, déterminisme, calendrier, rng) ; action store `generate()` + état résultat **éphémère** ; bouton « 🎲 Lancer la sélection » + rendu **minimal** ; montage page (Résultat dans le provider) + CSS minimal bouton.
- **Hors-scope (Story 4.3) :** affichage **soigné** — dates longues structurées, compteur en en-tête de carte, avertissements non-planifiés avec **raison générique** (indisponible / placerait un trou), message « aucun planifiable », **responsive ≤ 520 px** de la carte Résultat. 4.2 produit le résultat et un rendu brut ; 4.3 le met en forme.
- **Hors-scope (jamais) :** persistance du planning (pas de table/migration/route/Realtime — c'est un **recalcul** à la demande), import legacy localStorage (déféré), pré-remplissage fériés (déféré).

### ⚠️ Variance structurelle héritée (CRITIQUE — rappel 1.1→4.1)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Tout code, tout `npm`, tout grep `.next/` → **depuis `daily-wheel/`**. [Source: 4-1-*.md#Variance-structurelle]
- État réel pertinent (sous `daily-wheel/`, vérifié au commit `316e198`) — **réutiliser, ne pas casser** :
  - `lib/domain/team-availability.ts` (122 L) : `isTeamNonSessionDay(date, ctx)` **complet** L102-109 (4 branches), `TeamConstraints` L30-35 (`skipWeekends?`, `groupExclusions?`, `holidays?`, `teamOffDays?`), `weekdayOf` L50-53, **`dayNumber` PRIVÉ** L38-46 (à **exporter**), `isWeekend`/`isGroupExcluded`/`isHoliday`/`isTeamOffDay` (sous-prédicats). **Pas d'`addDays`/inverse** → à AJOUTER (additif).
  - `lib/domain/availability.ts` (50 L) : `isPersonUnavailable(unavailabilities, date)` L23-32, type `DayOrRange` L13-17 (`kind:'day'|'range'`, `date1`, `date2:string|null`), `isValidRange`/`isDuplicateDay` (validation). **Réutilisé tel quel.**
  - `lib/format/date-fr.ts` : `formatDateFr(ymd)` L12-19 (date longue FR, pour l'affichage minimal), `parseYMD` L6-9, `todayYMD()` L23-28 (défaut date de début côté store). **Réutilisé.**
  - `lib/store/participants-store.tsx` : expose déjà (via `useParticipants()`) `participants` (avec `active`), `unavailabilities` (avec `participant_id`), `groupExclusions`, `holidays`, `teamOffDays`, `settings` (`skip_weekends`/`start_date`). `StoreValue` L94-122, `value` L713-741, imports L1-40. **Étendre additivement** (`schedule`/`generate`).
  - `lib/data/*.ts` : formes **snake_case** à mapper vers le domaine camelCase — `Participant{id,name,active}`, `Unavailability{participant_id,kind,date1,date2}`, `GroupExclusion{day_of_week,every_n,ref_date}`, `Holiday{date,label}`, `TeamOffDay{kind,date1,date2,label}`, `Setting{skip_weekends,start_date}`.
  - `app/page.tsx` : carte Résultat **HORS** provider L73-78 (placeholder) → à **déplacer dans** le provider et y monter `<ScheduleResult />`. `Promise.all` SSR L22-36 — **inchangé** (rien à hydrater pour le résultat).
  - `components/GenerationOptions.tsx` : modèle de composant Options consommant `useParticipants` (bloc non repliable). `package.json` `test:unit` L14 (**14 suites**) → 18. `vitest.config.ts` (alias `@`, gate `SUPABASE_TEST_LIVE`, stub `server-only`) — **ne pas retoucher**.

### Référence de parité legacy (historique/Spin That Wheel v2.html — à reproduire à l'identique)
> Pseudo-code consolidé de l'algorithme legacy (handler `selectButton` L994-1104). C'est la **référence de parité** (AD-12). Reproduire la **logique** en YMD pur (`addDays`/`isTeamNonSessionDay`/`isPersonUnavailable`), `rng` au lieu de `Math.random`.

```
// Phase 0 — premier jour valide (L1006-1013)
start = startDate ; lim0 = addYears(start, 1)
while (start <= lim0):
    if isTeamNonSessionDay(start, ctx): start = addDays(start,1); continue   // legacy: skipWeekends||groupExcl ; ICI: + fériés/off
    if active.every(p => isPersonUnavailable(p, start)): start = addDays(start,1); continue
    break

// Phase 1 — shuffle (L1015-1019) — Fisher-Yates descendant, rng au lieu de Math.random
order = [...active] ; for i=len-1..1: j=floor(rng()*(i+1)); swap(order[i],order[j])
shuffleIdx = Map(order[i].id -> i)

// Phase 2 — placement EDF (L1021-1065)
queue = [...order] ; cur = start ; lim = addYears(start, 1)   // lim part du PREMIER JOUR VALIDE
while (queue.length>0 && cur <= lim):
    if isTeamNonSessionDay(cur, ctx): cur=addDays(cur,1); continue            // jour neutralisé, PAS un trou
    if active.every(p => isPersonUnavailable(p, cur)): cur=addDays(cur,1); continue  // tous indispo, PAS un trou
    avail = queue.filter(p => !isPersonUnavailable(p, cur))
    if avail.length==0: break                                                 // plus de candidat dispo → STOP (pas de trou)
    avail.sort(EDF)                                                           // deadline croissante, tie = shuffleIdx
    pick = avail[0] ; planning.push({date:cur, id:pick.id, name:pick.name}) ; queue.remove(pick) ; cur=addDays(cur,1)

unscheduled = active.filter(p => !planning.some(r => r.id===p.id))            // restants queue + jamais plaçables

// getLastConsecAvailDay(p, fromDay, ctx) (L979-992) — fenêtre consécutive dispo
d = fromDay ; lim = addYears(fromDay,1) ; last = null
while (d <= lim):
    if isTeamNonSessionDay(d, ctx): d=addDays(d,1); continue                  // saute le jour neutralisé (NE termine PAS la fenêtre)
    if isPersonUnavailable(p, d): break                                       // fin de la fenêtre
    last = d ; d = addDays(d,1)
return last   // null si p indispo dès fromDay

// comparateur EDF (L1050-1059)
da = getLastConsecAvailDay(a, cur, ctx) ; db = getLastConsecAvailDay(b, cur, ctx)
if (da && db): if da!=db return (da<db?-1:1)
else if (da): return -1
else if (db): return 1
return shuffleIdx.get(a.id) - shuffleIdx.get(b.id)
```

**Différences voulues vs legacy (toutes documentées, toutes conformes spine) :**
1. **`isTeamNonSessionDay` complet** (week-ends + exclusions + **fériés + off**) au lieu des 2 conditions legacy → AD-3. Le golden neutralise fériés/off (`[]`) pour rester en périmètre legacy ; l'extension a ses tests dédiés.
2. **`rng` seedable** au lieu de `Math.random()` → AD-2/NFR7 (déterminisme, parité algorithmique).
3. **Itération YMD pure** (`addDays`) au lieu de `Date.setDate` → AD-1/convention dates (pas de dérive timezone).
4. **Calendrier entier exact** (`dayNumber`/`ymdFromDayNumber`) au lieu de `Math.round((t1-t2)/86400000)` → strictement plus correct (déjà le cas pour les exclusions en 3.1).

### Décisions d'architecture qui cadrent cette story
- **AD-1 (domaine FEUILLE pur)** : `schedule.ts`/`rng.ts` n'importent que d'autres modules `lib/domain/` (purs) ; **aucun** React/DOM/Supabase/`Date`/`lib/data`/`lib/store`. Le **store** appelle `generateSchedule` (la couche autorisée à utiliser `Math.random` pour le seed et `useState`).
- **AD-2 (aléa injecté seedable)** : `rng: () => number ∈ [0,1)`, mulberry32. Prod = seed aléatoire (clic) ; tests = seed fixe. **Aucun `Math.random()` dans `lib/domain/`** (il vit dans le store).
- **AD-3 (source unique `isTeamNonSessionDay`) — LA couture de cette story** : le **même** prédicat est branché dans (a) la boucle de placement **et** (b) `getLastConsecAvailDay`. Le test paramétré (AC5) le prouve sur les 4 types de neutralisation. Ne **jamais** réimplémenter localement un sous-ensemble (ex. week-ends seuls) dans la deadline — c'est exactement la régression silencieuse que AD-3 interdit.
- **AD-12 (parité = golden, périmètre legacy)** : `schedule.golden.test.ts` couvre **uniquement** week-ends/exclusions/indispos (fériés/off à `[]`). Parité **algorithmique** (seed fixe + dérivation manuelle de l'attendu, car le shuffle legacy était non-seedable). L'extension fériés/off ↔ deadline = tests **dédiés distincts** (`schedule.unit.test.ts`). NFR9 ⇔ golden vert.
- **AD-13 (CI pure sans secrets)** : seuls les 4 nouveaux tests purs (calendar/rng/schedule.unit/schedule.golden) + les 14 existants tournent en CI. Store/UI **non** unit-testés (cohérent 1.5→4.1 ; pas de RTL/jsdom — **ne pas** ajouter de dépendance).
- **Résultat éphémère (pattern NEUF, hors taxonomie d'écriture)** : le planning **n'est pas** une donnée partagée Supabase (AD-4/AD-7/AD-14 **ne s'appliquent pas**) — c'est un calcul client reproductible. Aucun `updated_at`, aucune réconciliation, aucun prompt passphrase. C'est la **première** fonctionnalité du projet **sans** persistance.
- **Convention dates (CRITIQUE)** : tout en `YYYY-MM-DD` **local**, comparaisons **lexicographiques** (== chronologiques pour ce format). Itération via `addDays` (entier civil), **jamais** `Date`/`setDate`/`toISOString`. `formatDateFr` (affichage) parse en local (déjà correct).

### Previous Story Intelligence (4.1 / 3.x / 2.3)
- **4.1 a livré la donnée + le prédicat ; 4.2 livre l'algorithme** : `settings.skip_weekends`/`settings.start_date` sont persistés et lisibles via le store ; `isTeamNonSessionDay` est **complet** (branche week-ends conditionnelle câblée). 4.2 les **consomme** — ne rien re-câbler dans le prédicat. [Source: 4-1-*.md#Completion-Notes]
- **`weekdayOf`/`dayNumber` = anti-réinvention calendaire** : le calcul days-from-civil (sans `Date`/timezone) est **déjà écrit et testé**. `addDays`/`ymdFromDayNumber` en sont l'extension naturelle (inverse + offset) — **ne pas** réintroduire `Date` pour itérer.
- **`isPersonUnavailable` couvre jour ET plage (bornes incluses)** ; `isTeamOffDay` en est l'alias d'équipe. Réutiliser tels quels — ne pas réimplémenter la logique de bornes.
- **Flake Realtime connu (1.3→4.1)** : 1er `npm test` peut timeouter sur le handshake puis passer au retry — transitoire, **pas** une régression. 4.2 n'ajoute **aucun** canal Realtime (résultat éphémère) → la surface Realtime est **inchangée** (6 canaux).
- **CI Node 22.x** + Vercel `framework=nextjs` (`vercel.json`) : **ne pas** retoucher CI/Vercel. Aucune nouvelle route ⇒ build identique en surface serveur.
- **Push Git** : remote via alias SSH `github-perso` → `Infinter/SpinThatWeeklyWheel` (compte SoloOz). [Source: MEMORY:git-remote-push-setup]
- **Epic 4 déjà `in-progress`** (depuis 4.1) ; 4.2 passe `backlog → ready-for-dev` (géré par ce workflow).

### Points techniques (Next.js 16 / React 19 — janv. 2026)
- **Pas de nouvelle techno, aucune recherche web requise.** Stack figée (Next 16.2.x, React 19.2, supabase-js 2.108.x, Vitest 4.1.x). Story = domaine pur + state client + 1 composant + CSS, sur patterns existants. **Aucune dépendance à ajouter** (mulberry32 = ~5 lignes maison, pas de lib).
- **mulberry32 (référence d'implémentation)** : générateur PRNG 32 bits déterministe — `let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }`. **`Math.imul`** est ici une opération **arithmétique** (32 bits), **pas** `Math.random` — autorisée dans le domaine (déterministe). Renvoie `[0,1)`.
- **`Array.sort` en V8/Node** est stable (≥ Node 11) ; le tie-break explicite par `shuffleIdx` garantit de toute façon un ordre **totalement déterministe** (AD-2). Ne pas s'appuyer sur la stabilité seule.
- **`Math.random()` pour le seed** est appelé **dans le store** (`generate()`), pas dans `lib/domain/` → conforme AD-2 (le domaine reste pur ; seul le seed entrant varie).
- **Horizon +1 an** = borne d'arrêt de sécurité (`cur <= addYears(start,1)`), conforme legacy ; jamais atteinte pour une équipe typique (NFR6). Empêche toute boucle infinie si la queue ne se vide pas.

### Project Structure Notes
- Arborescence touchée (tout sous `daily-wheel/`) :
  ```
  lib/domain/team-availability.ts        # UPDATE additif (export dayNumber + ymdFromDayNumber + addDays + addYears ; existant inchangé — AC1)
  lib/domain/rng.ts                       # NEW (createRng mulberry32, type Rng — AC2)
  lib/domain/schedule.ts                  # NEW (generateSchedule + getLastConsecAvailDay + types + shuffle — AC3/AC4)
  lib/store/participants-store.tsx        # UPDATE additif (état schedule éphémère + generate() ; aucune persistance — AC8)
  components/ScheduleResult.tsx           # NEW (bouton 🎲 Lancer + rendu MINIMAL ; riche = 4.3 — AC9)
  app/page.tsx                            # UPDATE (carte Résultat déplacée DANS le provider + <ScheduleResult /> — AC10)
  app/globals.css                         # UPDATE (style minimal bouton primaire + table résultat ; responsive soigné = 4.3 — AC10)
  package.json                            # UPDATE (calendar/rng/schedule.unit/schedule.golden dans test:unit → 18 — AC11)
  tests/calendar.unit.test.ts             # NEW (addDays/ymdFromDayNumber round-trip — AC1)
  tests/rng.unit.test.ts                  # NEW (mulberry32 déterminisme/range — AC2)
  tests/schedule.unit.test.ts             # NEW (paramétré AD-3 + extension + déterminisme + mécaniques — AC5/AC7)
  tests/schedule.golden.test.ts           # NEW (parité legacy, périmètre legacy strict — AC6)
  _bmad-output/.../sprint-status.yaml     # UPDATE (statut 4.2 ; géré par le workflow)
  ```
- **Inchangés (réutilisés)** : `lib/domain/availability.ts` (consommé), `lib/format/date-fr.ts` (consommé), `lib/data/*` (formes mappées), les 6 réducteurs + `reconcile.ts` + `use-write-queue.ts` + toutes les routes `app/api/*` + `lib/supabase/*` + migrations + composants existants (`ParticipantsCard`, `GenerationOptions`, `*Panel`, `PassphrasePrompt`) + `vitest.config.ts` + `vercel.json`. *(`participants-store.tsx` étendu additivement — API publique ne perd aucun membre.)*
- **Aucune migration DB, aucune route, aucune dépendance npm.**

### Testing standards (pour cette story)
- **TDD** : écrire `calendar.unit`/`rng.unit` **avant** les fonctions ; `schedule.unit`/`schedule.golden` **avant**/en parallèle de `generateSchedule` (rouge → vert). Le domaine pur est entièrement testable en CI sans secrets (AD-13).
- **Le test paramétré AD-3 (AC5) est obligatoire** : 4 types de neutralisation × (effet boucle + effet deadline). C'est l'AC le plus structurant (couture AD-3).
- **Le golden (AC6) prouve NFR9** : périmètre legacy strict, attendu hand-tracé + documenté. Ne pas y mêler fériés/off.
- **Périmètre NON unit-testé (Store/UI)** — preuve = **vérification manuelle** (cohérent 1.5→4.1) :
  - Carte Résultat : bouton « 🎲 Lancer la sélection » visible et primaire ; désactivé tant qu'aucun participant actif.
  - Avec des participants actifs + quelques contraintes (week-ends, 1 férié, 1 indispo) : un clic produit un tableau Date→Animateur (un nom par jour ouvré valide), les jours neutralisés **absents** du tableau (pas de trou), et les éventuels non-planifiés listés.
  - **Aléa (FR14)** : deux clics successifs **rejouent** un ordre potentiellement différent (seed ré-aléatoire) — pas figé.
  - **Persistance** : recharger la page **efface** le résultat (éphémère, attendu — il n'est pas stocké) ; les **données** (participants/contraintes/settings) restent, elles, persistées et partagées.
  - **Non-régression manuelle** : ajouter/supprimer participant/indispo/exclusion/férié/off/settings → comportement **identique** (la fonctionnalité résultat est additive et n'a touché ni les slices ni les écritures).
- **Critère « vert »** : `npm run test:unit` vert (**18 suites** : 14 + calendar + rng + schedule.unit + schedule.golden) ; `npm test` vert (flake Realtime vert au retry) ; `npm run lint` 0 ; `npx tsc --noEmit` 0 ; `npm run build` vert (aucune nouvelle route) ; grep `.next/static` → 0 secret.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4 ; #Story-4.2 (10 critères : generateSchedule pur, rng seedable, neutralisation via isTeamNonSessionDay, jour tous-indispo, EDF + getLastConsecAvailDay + tie-break shuffle, one-shot sans trou, test paramétré AD-3, golden parité legacy, extension fériés/off dédiée, déterminisme NFR7 + perf NFR6) ; #Story-4.3 (frontière affichage) ; FR11 ; FR12 ; FR14 ; NFR6 ; NFR7 ; NFR9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-1 (domaine pur generateSchedule(input,rng), feuille) ; #AD-2 (rng seedable [0,1), mulberry32, pas de Math.random dans le domaine) ; #AD-3 (isTeamNonSessionDay source unique, branché boucle ET deadline, test paramétré) ; #AD-12 (golden périmètre legacy, parité ⇔ vert, extension = tests dédiés) ; #AD-13 (CI tests domaine purs) ; #Flux-génération-du-planning (flowchart invariants phase 0/shuffle/placement/one-shot L286-310) ; #Consistency-Conventions (dates YMD locales, jamais Date/UTC) ; #Capability-Map (Génération EDF → lib/domain/generateSchedule, AD-1/2/3/12)]
- [Source: historique/Spin That Wheel v2.html (handler selectButton L994-1104 : phase 0 L1006-1013, shuffle L1015-1019, boucle EDF L1021-1065, non-planifiés L1095-1101 ; shuffle Fisher-Yates L607-611 ; getLastConsecAvailDay L979-992 ; comparateur EDF L1050-1059 ; isWeekend L626-628 ; isDateGroupExcluded L651-661 ; isDateIndispo L640-647 ; structures participant.indispos/groupExclusions)]
- [Source: daily-wheel/lib/domain/team-availability.ts (isTeamNonSessionDay L102-109, TeamConstraints L30-35, weekdayOf L50-53, dayNumber PRIVÉ L38-46 à exporter, sous-prédicats isWeekend/isGroupExcluded/isHoliday/isTeamOffDay) ; daily-wheel/lib/domain/availability.ts (isPersonUnavailable L23-32, DayOrRange L13-17) ; daily-wheel/lib/format/date-fr.ts (formatDateFr L12-19, parseYMD L6-9, todayYMD L23-28)]
- [Source: daily-wheel/lib/store/participants-store.tsx (StoreValue L94-122, value L713-741, imports L1-40, slices participants/unavailabilities/groupExclusions/holidays/teamOffDays/settings exposées) ; daily-wheel/lib/data/{participants,unavailabilities,group-exclusions,holidays,team-off-days,settings}.ts (formes snake_case à mapper) ; daily-wheel/components/GenerationOptions.tsx (modèle composant useParticipants) ; daily-wheel/app/page.tsx (carte Résultat hors provider L73-78, provider L54-71, SSR L22-36) ; daily-wheel/app/globals.css (tokens L2-26) ; daily-wheel/package.json (test:unit L14, 14 suites) ; daily-wheel/vitest.config.ts (alias @, gate SUPABASE_TEST_LIVE)]
- [Source: _bmad-output/implementation-artifacts/4-1-options-generation-weekends-date-debut.md (#Completion-Notes : prédicat AD-3 complet, settings persistés ; #Variance-structurelle daily-wheel/ ; flake Realtime ; #Testing manual) ; MEMORY:git-remote-push-setup]

## Dev Agent Record

### Agent Model Used

Amelia (dev-story) — claude-opus-4-8[1m]

### Debug Log References

- `npx vitest run tests/calendar.unit.test.ts` → ROUGE (23 échecs : `addDays`/`ymdFromDayNumber`/`addYears` absents), puis VERT (23 tests) après ajout des primitives.
- `npx vitest run tests/rng.unit.test.ts` → ROUGE (module absent), puis VERT (5 tests).
- `npx vitest run tests/schedule.unit.test.ts` → VERT du 1ᵉʳ coup (18 tests) — dont les 8 assertions paramétrées AD-3 (effet boucle + effet deadline `planning[0]==='Y'`), extension fériés/off, déterminisme, mécaniques.
- `npx vitest run tests/schedule.golden.test.ts` → VERT (2 tests) — l'attendu hand-tracé correspond à l'implémentation (parité des règles legacy).
- `npx tsc --noEmit` → 0 erreur. `npm run lint` → 0.
- `npm run test:unit` → **18 suites / 230 tests** verts.
- `npm test` → **26 fichiers / 248 tests** verts (le flake handshake Realtime ne s'est pas produit cette fois).
- `npm run build` → vert ; **aucune nouvelle route** (le résultat est un calcul client éphémère, pas une route serveur). Grep `.next/static` (`SUPABASE_SECRET_KEY`/`TEAM_PASSPHRASE`/`service_role`) → **0 secret**.

### Completion Notes List

- **Domaine EDF pur livré (cœur de valeur).** `lib/domain/schedule.ts` : `generateSchedule(input, rng)` reproduit fidèlement l'algorithme legacy (phase 0 → shuffle Fisher-Yates via `rng` → placement EDF), avec 4 différences voulues et documentées : prédicat unique `isTeamNonSessionDay` complet aux DEUX sites (boucle + deadline), `rng` seedable au lieu de `Math.random`, itération YMD pure (`addDays`) au lieu de `Date`, calendrier entier exact.
- **Couture AD-3 prouvée sans spy.** `getLastConsecAvailDay` et la boucle de placement appellent le MÊME `isTeamNonSessionDay`. Le test paramétré (4 types : week-end/exclusion/férié/off) prouve l'effet boucle (jour sauté) ET l'effet deadline (fenêtre qui franchit le jour → ordre de placement correct) — un prédicat divergent ferait échouer l'un des deux.
- **Parité legacy (NFR9, AD-12).** `schedule.golden.test.ts` : périmètre legacy STRICT (`holidays:[]`, `teamOffDays:[]`), fixture à deadlines distinctes → ordre déterminé par l'EDF, indépendant du tirage (le shuffle legacy `Math.random` n'étant pas rejouable, la parité porte sur les RÈGLES). Attendu dérivé à la main, dérivation documentée dans le test.
- **Primitives calendaires additives.** `team-availability.ts` : `dayNumber` exporté + `ymdFromDayNumber` (inverse civil-from-days), `addDays`, `addYears` ajoutés. Aucune signature existante modifiée → 14 suites préexistantes intactes.
- **RNG seedable.** `lib/domain/rng.ts` : `createRng` (mulberry32), pur, sans `Math.random` (déterminisme NFR7). Aucune dépendance ajoutée.
- **Résultat ÉPHÉMÈRE (pattern NEUF).** Store : `useState<ScheduleResult|null>` + action `generate()` (mappe l'état snake_case → entrée domaine camelCase, seed via `Math.random` AUTORISÉ hors domaine). AUCUNE persistance : pas de table/migration/route/Realtime/optimiste. API publique du store additive (aucun membre retiré).
- **UI minimale.** `ScheduleResult.tsx` : bouton primaire « 🎲 Lancer la sélection » (désactivé sans actif), tableau Date(`formatDateFr`)→Animateur + compteur + non-planifiés. La présentation soignée (dates structurées, raisons, responsive ≤520px) est explicitement laissée à la Story 4.3. Carte Résultat déplacée DANS le provider (`page.tsx`).
- **Non-régression.** `team-availability.ts` étendu additivement ; les 6 slices, `useWriteQueue`, `reconcile`, routes et migrations inchangés ; aucune nouvelle route au build.

### File List

- `daily-wheel/lib/domain/team-availability.ts` (UPDATE — export `dayNumber` + ajout `ymdFromDayNumber`/`addDays`/`addYears` ; existant inchangé)
- `daily-wheel/lib/domain/rng.ts` (NEW — `createRng` mulberry32, type `Rng`)
- `daily-wheel/lib/domain/schedule.ts` (NEW — `generateSchedule` + `getLastConsecAvailDay` + types + `shuffle`)
- `daily-wheel/lib/store/participants-store.tsx` (UPDATE — état `schedule` éphémère + action `generate()` ; imports ; `StoreValue` + `value` additifs)
- `daily-wheel/components/ScheduleResult.tsx` (NEW — bouton « 🎲 Lancer la sélection » + rendu minimal)
- `daily-wheel/app/page.tsx` (UPDATE — carte Résultat déplacée dans le provider + `<ScheduleResult />` + import)
- `daily-wheel/app/globals.css` (UPDATE — bloc minimal `.schedule-*`)
- `daily-wheel/package.json` (UPDATE — calendar/rng/schedule.unit/schedule.golden dans `test:unit` → 18 suites)
- `daily-wheel/tests/calendar.unit.test.ts` (NEW — round-trip `dayNumber`/`ymdFromDayNumber`, `addDays`/`addYears`)
- `daily-wheel/tests/rng.unit.test.ts` (NEW — mulberry32 déterminisme/range)
- `daily-wheel/tests/schedule.unit.test.ts` (NEW — paramétré AD-3 + extension + déterminisme + mécaniques)
- `daily-wheel/tests/schedule.golden.test.ts` (NEW — parité legacy, périmètre legacy strict)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — statut 4.2)

### Change Log

- 2026-06-23 — Story 4.2 implémentée (Amelia/dev-story) : algorithme EDF pur `generateSchedule(input, rng)` (parité legacy AD-12, prédicat unique AD-3 aux deux sites, rng seedable mulberry32, calendrier YMD pur), résultat éphémère non persisté + bouton « 🎲 Lancer la sélection ». 18 suites unit / 230 tests verts (248 suite complète), build vert sans nouvelle route, 0 secret. Status → review.
