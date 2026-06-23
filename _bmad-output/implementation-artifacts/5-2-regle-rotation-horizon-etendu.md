---
baseline_commit: d3758654dd4eda0c47aa031dcec9acf60f2002cb
---
# Story 5.2: Règle de rotation à horizon étendu (domaine)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want que la génération produise **exactement un jour ouvré par personne disponible**, en débordant sur les semaines suivantes si besoin,
so that chaque membre dispo anime une fois, sans que les jours bloqués ne « consomment » une place (FR15).

## Acceptance Criteria

> Reformulées depuis `epics.md#Story 5.2` (l. 418-434) et la **règle autoritaire** `EXPERIENCE.md#Règle de rotation & horizon` (l. 46-55). Chaque AC porte un ID pour le suivi tâches.

**AC-1 — Domaine pur (AD-1).** La logique vit dans la fonction pure `generateSchedule(input, rng)` de `lib/domain/` : aucun import React/DOM/Supabase/`Date`/`Math.random`. Entrées = données + `rng` injecté ; sortie = `{ planning, unscheduled }`. (Déjà conforme — la story ne doit introduire **aucune** régression de pureté.)

**AC-2 — Nombre de sessions = nombre de disponibles.** Quand la rotation est calculée, `planning.length` égale le nombre de **disponibles** = participants **actifs** (le store ne passe QUE les actifs) **ET** tenant **au moins un slot** de l'horizon (non couverts par une indisponibilité sur toute leur fenêtre d'échéance). Chaque disponible apparaît **exactement une fois** (rotation one-shot). Voir Dev Notes §« Sémantique exacte de *disponible* » — l'invariant ne tient qu'avec cette définition (le cas `break` EDF, cf. AC-5, en est la frontière).

**AC-3 — Jour-slot via l'unique prédicat (AD-3).** Un jour n'est un slot que si `isTeamNonSessionDay(date, ctx)` est **faux**. Les jours bloqués — week-end (si `skipWeekends`), exclusion de groupe, jour férié, jour off d'équipe, **ou** jour où **tous** les actifs sont indisponibles — sont **sautés et jamais comptés** comme slot. Le même prédicat `isTeamNonSessionDay` est branché **à la fois** dans la boucle de placement **et** dans le calcul de deadline EDF (`getLastConsecAvailDay`) ; aucun nouveau prédicat n'est introduit.

**AC-4 — Horizon ÉTENDU, flag archi #1 levé.** La génération **continue d'avancer** dans le calendrier (en sautant les jours bloqués) **jusqu'à avoir placé tous les disponibles**, même bien au-delà de la semaine courante. **Aucune fenêtre fixe de 7 jours / semaine courante.** Le flag archi #1 (« valider que `generateSchedule` n'a pas de borne de fin implicite qui couperait l'horizon ») est **explicitement instruit** : la seule borne est le plafond **explicite et intentionnel** `start + 1 an` (NFR6, perf/sécurité anti-boucle-infinie), identique sur les **trois** sites d'itération. La résolution est **documentée** (Completion Notes) et **prouvée par un test** de débordement multi-semaines (AC-7).

**AC-5 — EDF + ordre aléatoire préservés (parité NFR9 / FR14).** L'affectation EDF (fenêtre se fermant le plus tôt d'abord ; égalités départagées par l'ordre du tirage aléatoire initial) et le shuffle seedé restent **strictement inchangés**. La roue (Story 5.4) ne fera que mettre en scène ce résultat ; elle ne le change pas. Les tests golden de parité legacy (`schedule.golden.test.ts`) **restent verts sans modification**.

**AC-6 — Non-planifié = cas rare, avertissement 4.3 inchangé.** Un disponible ne reste non planifié que s'il ne tient **aucun** slot de l'horizon (ex. : son indispo couvre toute sa fenêtre, ou le `break` EDF « no-hole » l'exclut — cf. Dev Notes). L'avertissement existant (`ScheduleResult.tsx`, `.schedule-warning`, raison générique collective, Story 4.3) **demeure tel quel** — aucune régression d'affichage ni de message.

**AC-7 — Tests.** Des tests Vitest (env `node`, domaine pur) couvrent explicitement :
- (a) **`nb sessions = nb dispos`** : N actifs tous disponibles → `planning.length === N`, chacun une fois, `unscheduled` vide ;
- (b) **un férié ET un week-end intercalés ne sont pas comptés** comme slots (les sessions tombent sur les seuls jours ouvrés valides, le total reste = nb dispos) ;
- (c) **débordement multi-semaines** : un horizon qui, à cause des jours bloqués, déborde sur **≥ 2 semaines** place **bien tout le monde** (preuve directe du flag archi #1 — aucune coupure à 7 jours) ;
- (d) **déterminisme à seed donné** (NFR7) : même seed → planning strictement identique (peut s'appuyer sur l'existant, mais l'assertion 5.2 doit être présente/citée).

**AC-8 — Performance (NFR6).** La génération reste quasi instantanée : ≤ 50 participants sur un horizon réaliste (et jusqu'au plafond ≤ 1 an) termine sans explosion. (Test perf existant conservé/renforcé.)

**AC-9 — Non-régression globale.** `npx tsc --noEmit` → 0 erreur ; `npx eslint .` → 0 erreur ; **toute** la suite Vitest verte (existants + nouveaux) ; `npm run build` OK.

## Tasks / Subtasks

- [x] **T1 — Audit du flag archi #1 (borne d'horizon) — AVANT tout code** (AC: 4)
  - [x] Relire `lib/domain/schedule.ts` et recenser **tous** les sites de borne d'itération calendaire. Attendu (état actuel, à confirmer) : (1) Phase 0 `lim0 = addYears(startDate, 1)` (`schedule.ts:105`) ; (2) `getLastConsecAvailDay` `lim = addYears(fromDay, 1)` (`:74`) ; (3) Phase 2 placement `lim = addYears(start, 1)` (`:127`). ✓ **Confirmé : exactement ces 3 sites, aucune autre borne calendaire.**
  - [x] **Confirmer** qu'aucune borne implicite ne coupe l'horizon à 7 jours / fin de semaine courante (il n'y en a pas dans le code lu — la boucle saute les jours bloqués et avance tant que la file n'est pas vide et `cur <= lim`). Tracer ce constat dans les Completion Notes : « flag #1 levé — seule borne = `start + 1 an`, explicite, NFR6 ». ✓
  - [x] **(Recommandé, optionnel)** Rendre la borne **légible** : extraire une constante nommée `HORIZON_LIMIT_YEARS = 1` (+ commentaire « flag archi #1 / NFR6 : horizon étendu plafonné à 1 an ») et l'utiliser aux 3 sites. ⚠ **Valeur strictement identique** (`addYears(x, 1)`) — refactor cosmétique uniquement ; les golden de parité doivent rester verts. Si le moindre doute sur la parité, **ne pas faire** et se contenter de documenter. ✓ **Constante ajoutée, golden vert immédiatement après refactor (garde-fou T6).**

- [x] **T2 — Test (a) : `nb sessions = nb disponibles`** (AC: 2, 7a)
  - [x] Dans `tests/schedule.unit.test.ts` (ou un nouveau bloc `describe('5.2 — horizon étendu & invariant nb sessions = nb dispos')`), cas : N actifs (ex. 6) **tous disponibles**, `startDate` un jour ouvré, sans contrainte d'équipe → `result.planning.length === 6`, `result.unscheduled` vide, et l'ensemble des `participantId` placés == l'ensemble des actifs (chacun **exactement une fois** : pas de doublon). ✓
  - [x] Ajouter une variante avec **1 inactif simulé en amont** : comme le store ne passe que les actifs, le test injecte directement N actifs ; documenter dans le test que « inactif » est filtré côté store (hors domaine) → l'invariant porte sur les actifs reçus. ✓ (`it('(a-bis) ...')`)

- [x] **T3 — Test (b) : férié + week-end intercalés non comptés** (AC: 3, 7b)
  - [x] Cas : `skipWeekends: true` + un `holiday` tombant un jour ouvré au milieu de la stretch. Asserter : aucune session sur le week-end ni sur le férié ; les `planning.length` sessions tombent toutes sur des jours où `isTeamNonSessionDay` est faux ; total inchangé = nb dispos (les jours bloqués n'ont **pas** consommé de place). ✓
  - [x] Vérifier les **dates** précises des sessions (pas seulement le compte) pour prouver le saut. ✓ (`toEqual(['2026-06-22','2026-06-23','2026-06-25','2026-06-26'])` + `not.toContain` 24/27/28)

- [x] **T4 — Test (c) : débordement multi-semaines place tout le monde** (AC: 4, 7c) — **cœur de la story**
  - [x] Construire un scénario où les jours bloqués forcent l'horizon à déborder sur **≥ 2 semaines civiles** : ex. `skipWeekends: true` + assez de disponibles (ex. 8) pour qu'après les jours ouvrés de la semaine 1, la rotation **continue** semaine 2 (et au-delà). Asserter : `planning.length === 8`, `unscheduled` vide, et la **dernière date** placée est postérieure d'**au moins 7 jours** à `startDate` (preuve qu'aucune borne à 7 j n'a coupé). ✓ (dernière date = `2026-07-01`, soit start+9j)
  - [x] Variante renforçant le flag : intercaler un **férié** une semaine donnée pour repousser encore l'horizon ; vérifier que tout le monde est tout de même placé. ✓ (`it('(c-bis) ...')`, férié jeu 25 → 8 placés jusqu'au 07-02)

- [x] **T5 — Test (d) : déterminisme à seed donné** (AC: 5, 7d)
  - [x] Réutiliser/citer l'assertion existante « même seed → résultat strictement identique » (`schedule.unit.test.ts:153`). Si elle ne couvre pas un horizon multi-semaines, ajouter un cas déterminisme **sur le scénario T4** (deux appels même seed → `planning` profond-égal). ✓ (cas dédié multi-semaines `createRng(2026)` ×2 → `toEqual`)

- [x] **T6 — Vérification parité legacy intacte** (AC: 5)
  - [x] Lancer `npx vitest run tests/schedule.golden.test.ts` → **vert sans modification** du fichier golden. Si T1 (option constante) casse un golden, **annuler T1-option**. ✓ **2/2 verts, fichier golden inchangé.**

- [x] **T7 — Vérification non-régression complète** (AC: 8, 9)
  - [x] `npx tsc --noEmit` (0), `npx eslint .` (0), `npm test` (toute la suite verte, dont les nouveaux), `npm run build` (OK). Confirmer le test perf NFR6 toujours vert. Reporter les compteurs exacts (nb tests / nb fichiers) dans les Completion Notes. ✓ **tsc 0 · eslint 0 · vitest 262/262 sur 27 fichiers · build OK · perf NFR6 vert.**

## Dev Notes

### Périmètre & principe directeur
- **Évolution, pas réécriture** (Epic 5, `epics.md:138-141`). Le domaine `generateSchedule` est **déjà** la source de vérité et **étend déjà l'horizon** (cf. ci-dessous). 5.2 **précise et verrouille** la règle : audit du flag archi #1, durcissement de la couverture de tests, documentation. **Ne PAS réécrire l'algorithme** — la parité legacy (NFR9) est sacrée.
- **Hors périmètre 5.2** (différés) : timeline visuelle (**5.3**), roue/canvas (**5.4**), modes Rotation complète / Jour le jour (**5.5/5.6**), exports (**5.7**), microcopie/branding/CTA « Lancer la roue » (**5.8**), édition rapide (**5.9**). 5.2 est **100 % domaine + tests** — aucun composant, aucun CSS, aucun store (sauf si T1-option touche `schedule.ts` uniquement).

### CONSTAT CLÉ — le code lu (`schedule.ts`) implémente DÉJÀ l'horizon étendu
Lecture obligatoire faite de `lib/domain/schedule.ts` (état actuel, baseline `d375865`) :
- **Boucle de placement** (`:129`) : `while (queue.length > 0 && cur <= lim)` avec `lim = addYears(start, 1)` (`:127`). Tant qu'il reste des gens en file, on avance — semaine après semaine — en **sautant** les jours neutralisés (`:131-134`) et les jours tous-indispo (`:136-139`). **Il n'existe aucune borne à 7 jours.**
- **Deadline EDF** `getLastConsecAvailDay` (`:68-86`) : même plafond `addYears(fromDay, 1)` (`:74`), même prédicat `isTeamNonSessionDay` (`:77`) — couture AD-3 respectée.
- **Phase 0** (`:104-116`) : avance jusqu'au premier jour valide, plafond `addYears(startDate, 1)` (`:105`).
→ **Le flag archi #1 est, de fait, déjà résolu par 4.2.** Le travail de 5.2 est de **le constater formellement, le documenter, et le prouver par un test de débordement multi-semaines** (T4) — plus combler les assertions explicites manquantes (T2 « nb=nb »).

### Sémantique exacte de « disponible » et frontière du cas non-planifié (À LIRE)
L'AC-2 « nb sessions = nb disponibles » ne tient qu'avec la **bonne** définition de *disponible*, alignée sur l'algorithme **no-hole / one-shot** existant :
- *Disponible* = actif **ET** capable de tenir un slot **consécutif** depuis le premier jour valide. L'algorithme place les gens sur des **jours ouvrés consécutifs** (jours bloqués sautés). Au jour `cur`, si **aucun** des restants n'est dispo alors que d'autres (déjà placés) l'étaient, il `break` (`schedule.ts:144`) : placer un restant plus tard **créerait un trou**, interdit (rotation one-shot sans trou).
- **Conséquence** : le cas « non-planifié » (`unscheduled`) recouvre exactement (i) qui n'a aucun jour ouvré dispo dans l'horizon, et (ii) le rare `break` EDF. C'est **la frontière** de l'invariant nb=nb : avec des disponibilités qui se chevauchent normalement (cas nominal, T2/T4 sans indispos individuelles), `unscheduled` est vide et `planning.length === nb actifs`. **Ne PAS tenter de « réparer » le break pour forcer nb=nb dans les cas pathologiques** : ce serait une rupture de parité (NFR9) et changerait le sens produit. Le test T2 utilise le cas nominal (tous dispos) ; documenter la frontière dans le test.

### Fichiers à TOUCHER (lecture obligatoire faite)
- `daily-wheel/lib/domain/schedule.ts` — **seul fichier de prod éventuellement touché**, et **uniquement** si T1-option (constante `HORIZON_LIMIT_YEARS`) est retenue. Sinon : **aucune modif de prod**, la story est purement additive (tests). État actuel détaillé ci-dessus.
- `daily-wheel/tests/schedule.unit.test.ts` — **principal site d'ajout** (T2-T5). Conventions du fichier : helpers de construction d'input en haut, `describe`/`it` en français, comparaisons sur dates YMD. Réutiliser les fabriques existantes ; ne pas dupliquer.
- `daily-wheel/tests/schedule.golden.test.ts` — **NE PAS MODIFIER** (parité legacy NFR9). Sert de garde-fou T6.

### Fichiers à NE PAS TOUCHER (régression interdite)
- `daily-wheel/lib/domain/team-availability.ts` (prédicat `isTeamNonSessionDay` `:135`, `addYears` `:76`, `addDays` `:67`) — inchangé.
- `daily-wheel/lib/domain/availability.ts` (`isPersonUnavailable`) — inchangé.
- `daily-wheel/lib/store/participants-store.tsx` (`generateSchedule` appelé `:678`, `startDate: settings.start_date ?? todayYMD()` `:675`) — inchangé.
- `daily-wheel/components/ScheduleResult.tsx` (avertissement non-planifiés `:26-33`, classe `.schedule-warning`) — **inchangé** (AC-6 : « demeure »).

### Architecture compliance (ARCHITECTURE-SPINE.md)
- **AD-1 — cœur EDF pur** (spine `:69-73`) : `generateSchedule(input, rng)` reste sans React/DOM/Supabase/`Date`/`Math.random`. Les tests vivent en env `node`. Ne rien importer d'interdit dans `schedule.ts`.
- **AD-3 — prédicat unique** (spine `:81-88`) : `isTeamNonSessionDay` reste l'**unique** source du « jour neutralisé », branché boucle **et** deadline. Le test paramétré existant (`schedule.unit.test.ts:82`) prouve déjà les deux sites — ne pas le casser, et **ne créer aucun second prédicat**.
- **AD-2 — aléa injecté** : `rng` seedé (jamais `Math.random` dans le domaine). Les tests passent un `rng` déterministe (`createRng(seed)`).
- **Flowchart génération** (spine `:284-310`) : invariant « chaque participant placé **au plus une fois** ; aucun trou jamais créé ». La condition de boucle `cur ≤ start+1an` y figure explicitement → c'est la borne **voulue**, pas un bug. T4 prouve qu'elle n'ampute pas l'horizon utile.
- **Convention dates** (spine `:185-197`) : dates métier = chaînes `YYYY-MM-DD` en **local**, jamais `toISOString()`/UTC. Itération via `addDays`. Les tests construisent et comparent des YMD lexicographiquement.
- **Stack** (spine `:199-211`) : Vitest, TS 5.1+, Node 20.9+. Lancer `npm test` = `vitest run --no-file-parallelism`.

### Règle de rotation autoritaire (EXPERIENCE.md:46-55) — implémenter EXACTEMENT
1. Disponibles = actifs ET non couverts par une indispo sur leur fenêtre. 2. Nb sessions = nb disponibles, chacun **une fois**. 3. Jour-slot ssi `isTeamNonSessionDay` faux ; bloqués **sautés, jamais comptés**. 4. EDF (deadline la plus tôt ; égalité = ordre du tirage). 5. **Horizon étendu** : avancer jusqu'à tout placer, **pas de fenêtre fixe 7 jours** ; `[NOTE→archi]` = flag #1, à valider (→ levé, cf. CONSTAT CLÉ). 6. Non-planifié = ne tient aucun slot (cas rare) ; avertissement `schedule-warning` conservé. ⚠ Ne PAS réintroduire le panneau « équité » abandonné.

### Microcopie / affichage (rappel — hors code 5.2)
La révélation « **{prénom}** animera le standup du {jour} {date} ! » et « Rotation complète ! Chacun anime une fois. » (`EXPERIENCE.md:62-75`) sont du ressort de **5.4/5.8**, pas de 5.2. La story 5.2 ne produit **que** des structures de données correctes + tests ; l'affichage reste celui de 4.3.

### Intelligence stories précédentes
- **4.2** (commit `f3bf2bd`) : a livré l'algo EDF avec parité legacy + prédicat unique AD-3. C'est le socle exact de 5.2 — relire son enregistrement si besoin (`4-2-algorithme-edf-integrant-toutes-les-contraintes.md`). 5.2 ne fait que **prouver/documenter** l'horizon et combler les assertions.
- **4.3** (commit `232bf3f`) : affichage planning + non-planifiés (`ScheduleResult.tsx`). AC-6 impose sa non-régression.
- **5.1** (review, baseline) : stepper + bandeau ; **n'a pas touché le domaine** — aucun couplage avec 5.2.

### Project Structure Notes
- App Next dans `daily-wheel/` (spec BMad à la racine du repo). Alias `@/*` → `daily-wheel/*`.
- Domaine pur sous `daily-wheel/lib/domain/` ; tests sous `daily-wheel/tests/` (`*.unit.test.ts`, `*.golden.test.ts`).
- Commande tests : `npm test` (depuis `daily-wheel/`).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 (l. 138-141) ; #Story 5.2 (l. 418-434)]
- [Source: …/ux-designs/ux-SpinThatWeeklyWheel-2026-06-23/EXPERIENCE.md#Règle de rotation & horizon (l. 46-55) ; microcopie (l. 62-75) ; Flow 1 Nadia (l. 124-133)]
- [Source: …/ux-designs/…/DESIGN.md#timeline+day-cell (l. 148-155) ; wheel (l. 145-147) — contexte aval, hors code 5.2]
- [Source: …/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-1 (l. 69-73) ; #AD-3 (l. 81-88) ; flowchart génération (l. 284-310) ; conventions (l. 185-197) ; stack (l. 199-211)]
- [Source: daily-wheel/lib/domain/schedule.ts:68-174 (horizon `addYears(.,1)` aux l. 74, 105, 127 ; break no-hole l. 144)]
- [Source: daily-wheel/lib/domain/team-availability.ts:67-145 (addDays, addYears, isTeamNonSessionDay)]
- [Source: daily-wheel/tests/schedule.unit.test.ts (blocs AD-3 l. 82 ; fériés/off l. 111 ; déterminisme l. 143 ; mécaniques l. 172) ; daily-wheel/tests/schedule.golden.test.ts:56-69]
- [Source: daily-wheel/lib/store/participants-store.tsx:675-678 (appel generateSchedule) ; daily-wheel/components/ScheduleResult.tsx:26-33 (avertissement 4.3)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev-story)

### Debug Log References

- `npx vitest run tests/schedule.golden.test.ts` après refactor T1 → 2/2 verts (garde-fou parité avant tout ajout de test).
- `npx vitest run tests/schedule.unit.test.ts` → 24/24 (17 existants + 7 nouveaux 5.2) ; ancrage calendaire confirmé (07-01 = mer, 07-02 = jeu).
- `npx tsc --noEmit` → 0 · `npx eslint .` → 0 · `npm test` → 262/262 sur 27 fichiers · `npm run build` → OK.

### Completion Notes List

- **Flag archi #1 LEVÉ (AC-4).** Audit confirmé : `lib/domain/schedule.ts` ne contient **que 3 sites** de borne calendaire, tous `addYears(., 1)` — Phase 0 (`:105`), `getLastConsecAvailDay` (`:74`), boucle de placement Phase 2 (`:127`). **Aucune borne implicite à 7 jours / fin de semaine courante** : la boucle `while (queue.length > 0 && cur <= lim)` saute les jours neutralisés et avance tant qu'il reste des disponibles. La **seule** borne est le plafond explicite et intentionnel `start + 1 an` (NFR6, garde anti-boucle-infinie). L'horizon étendu était donc **déjà** correctement implémenté par 4.2 ; 5.2 le constate, le rend lisible et le prouve.
- **T1 (refactor cosmétique).** Constante nommée `HORIZON_LIMIT_YEARS = 1` introduite avec commentaire « flag archi #1 / NFR6 » et appliquée aux 3 sites. **Valeur strictement identique** → parité legacy intacte : golden vérifié vert *immédiatement* après le refactor (T6).
- **Invariant nb=nb (AC-2).** Prouvé en cas nominal (T2 : 6 actifs tous dispos → 6 sessions, chacun exactement une fois, `unscheduled` vide). Variante (a-bis) documente la frontière domaine/store : un « inactif » est filtré côté store et n'atteint jamais le domaine — l'invariant porte sur les actifs reçus. La frontière du cas non-planifié (`break` EDF no-hole) reste **inchangée** : aucune tentative de « réparer » le break (préserve NFR9).
- **Jours bloqués jamais comptés (AC-3).** T3 prouve qu'un férié + un week-end intercalés sont sautés et ne consomment pas de place (dates exactes vérifiées). Prédicat unique `isTeamNonSessionDay` **inchangé** ; aucun second prédicat introduit (AD-3 respecté).
- **Débordement multi-semaines (AC-4, cœur).** T4 : 8 dispos avec `skipWeekends` → rotation continue en semaine 2 (dernière session `2026-07-01`, soit start+9j ≥ 7j). Variante T4 (férié) repousse à `2026-07-02`, tout le monde reste placé. Preuve directe qu'aucune borne à 7 jours n'ampute l'horizon utile.
- **Parité & déterminisme (AC-5).** EDF + shuffle seedé **strictement inchangés** ; golden (`schedule.golden.test.ts`) **non modifié** et vert. T5 ajoute le déterminisme sur le scénario multi-semaines (même seed → planning profond-égal).
- **AC-6.** `components/ScheduleResult.tsx` **non touché** (avertissement non-planifiés 4.3 préservé) — story 100 % domaine + tests.
- **AC-8 / AC-9.** Perf NFR6 (50 participants) toujours verte dans la suite. `tsc` 0 · `eslint` 0 · **262/262** tests sur **27** fichiers · build OK.

### File List

- `daily-wheel/lib/domain/schedule.ts` — MODIFIÉ (T1) : constante `HORIZON_LIMIT_YEARS = 1` + commentaire flag archi #1/NFR6 ; appliquée aux 3 bornes `addYears`. Refactor cosmétique, valeur inchangée.
- `daily-wheel/tests/schedule.unit.test.ts` — MODIFIÉ : ajout du bloc `describe('5.2 — horizon étendu & invariant nb sessions = nb dispos')` (7 tests : a, a-bis, b, c, c-bis, d).

### Change Log

- 2026-06-23 — Story 5.2 contextée (Amelia/create-story) : audit flag archi #1 (horizon étendu déjà implémenté en 4.2, seule borne = `start+1an` NFR6), invariant nb sessions = nb disponibles, durcissement de tests (nb=nb, férié/WE non comptés, débordement multi-semaines, déterminisme), parité legacy préservée. Statut → ready-for-dev.
- 2026-06-23 — Story 5.2 implémentée (Amelia/dev-story) : flag archi #1 levé & documenté ; constante `HORIZON_LIMIT_YEARS` extraite (3 sites, valeur identique) ; 7 tests 5.2 ajoutés (nb=nb, inactif filtré, férié+WE non comptés, débordement multi-semaines ×2, déterminisme multi-semaines). Golden parité inchangé/vert. tsc 0 · eslint 0 · vitest 262/262 (27 fichiers) · build OK. Statut → review.
