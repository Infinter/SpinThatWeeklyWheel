---
baseline_commit: 6a6c2ab967fb96868c0d8aba4a5cfbe5a6aefb3e
---
# Story 5.3: Timeline visuelle (grille multi-lignes, sans scrollbar)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want voir la rotation sous forme de **bande de jours visuelle** plutôt qu'un tableau,
so that je comprends le planning et ses contraintes **d'un coup d'œil** (FR12 revisité, UX-DR10).

## Acceptance Criteria

> Reformulées depuis `epics.md#Story 5.3` (l. 436-451) et la spec autoritaire `DESIGN.md` (grille + day-cell) / `EXPERIENCE.md` (UX-DR10, UX-DR13) / `mockups/spin-rotation.html`. Chaque AC porte un ID pour le suivi des tâches. **Principe directeur Epic 5 (`epics.md:138-141`, `:398`) : ÉVOLUTION, pas réécriture — `generateSchedule` reste la source de vérité ; la timeline n'est qu'une MISE EN SCÈNE du résultat (les deux coïncident toujours).**

**AC-1 — Grille qui s'enroule, ZÉRO scrollbar horizontale (UX-DR10).** Quand un planning est généré, la timeline remplace le `<table>` actuel (`ScheduleResult.tsx:65-80`) et se rend en **grille CSS** `grid-template-columns: repeat(auto-fit, minmax(96px, 1fr))`, `gap: 8px`. Elle **s'enroule naturellement sur plusieurs lignes** quand l'espace manque — **aucune `overflow-x`, aucune scrollbar horizontale**, ni sur desktop ni sur mobile.

**AC-2 — Anatomie d'une cellule jour.** Chaque cellule affiche, de haut en bas : **jour de semaine abrégé** (`.dow`, ex. « lun ») + **numéro du jour** (`.dnum`, ex. « 23 ») + **mois abrégé** (`.mon`, ex. « juin »), puis un corps variable selon le type de jour. La cellule a `min-height: 132px`, `border-radius: 12px`, fond `var(--card-bg)` par défaut.

**AC-3 — Jour ouvré attribué : avatar animateur.** Chaque jour du planning (`schedule.planning`) affiche l'**animateur** : un **avatar rond** (`.av-lg`, 40 px) portant l'**initiale** du prénom, de **couleur stable** issue de la palette `wheel-segments`, **plus le prénom** en clair (`.who`) sous l'avatar. La date de la cellule provient du `ScheduleRow.date` ; le nom du `ScheduleRow.name`.

**AC-4 — Week-ends hachurés + badge.** Les jours de **week-end** (samedi/dimanche) compris dans l'horizon affiché sont rendus avec un **filigrane hachuré** (`repeating-linear-gradient(45deg, #f8fafc, #f8fafc 6px, #f1f5f9 6px, #f1f5f9 12px)`), un **badge texte « WE »**, et la mention « **sauté** ».

**AC-5 — Jours bloqués (férié / off / exclusion) : gold-soft + libellé + « sauté ».** Les jours **neutralisés** par une contrainte d'équipe (jour férié, jour off d'équipe, exclusion de groupe) sont rendus sur fond `var(--gold-soft)` + bordure `var(--gold-border)`, avec un **badge texte de libellé** (ex. « Férié », « Jour off », ou le libellé saisi quand il existe) **et** la mention « **sauté** ». La **décision canonique « ce jour est-il un slot ? »** passe EXCLUSIVEMENT par le prédicat existant `isTeamNonSessionDay` (AD-3) ; le libellé d'affichage est déterminé séparément à partir des sous-prédicats existants — **aucun nouveau prédicat de neutralisation n'est créé** (voir Dev Notes §AD-3).

**AC-6 — Couleur IDENTIQUE timeline ↔ roue (attribution par index stable).** La couleur d'un participant est dérivée de son **index dans la liste des participants actifs** (ordre du store — exactement la liste que `generate()` envoie au domaine, `participants-store.tsx:656`), modulo la palette `wheel-segments` (8 couleurs). Cette attribution vit dans un **module partagé** afin que la roue (Story 5.4) réutilise **exactement** la même couleur pour la même personne. L'attribution est **déterministe** et **stable** pour un même ordre d'actifs.

**AC-7 — Couleur jamais seul signal (UX-DR13).** Aucune information n'est portée par la seule couleur : les jours bloqués portent **toujours** un badge texte (« WE » / « Férié » / « Jour off » / « Exclusion ») **et** « sauté » ; l'animateur est identifié par son **prénom en clair** en plus de la pastille de couleur. Les focus visibles et la navigation clavier hérités sont conservés ; aucune dépendance au seul daltonisme-sensible.

**AC-8 — Responsive ≤ 520px (NFR5).** La grille **reflue** à petit écran (passe à moins de colonnes), **toujours sans scrollbar horizontale**, et chaque cellule reste lisible (libellés, avatar, prénom). Aucune information n'est tronquée ni masquée par débordement.

**AC-9 — Continuité de l'horizon affiché.** La timeline couvre, **sans trou**, l'intervalle calendaire **du premier au dernier jour planifié** (`planning[0].date` → `planning[n-1].date`, inclus). Tout jour de cet intervalle qui n'est pas un jour planifié est **nécessairement** un jour neutralisé (invariant « aucun trou jamais créé », flowchart spine `:284-310`) → il est rendu en cellule week-end ou bloquée. **Cas planning vide** : aucune timeline n'est rendue ; on retombe sur les états vides hérités (4.3) inchangés.

**AC-10 — Non-régression du périmètre 4.3 (sacré).** Le **bouton de tirage**, le **compteur de sessions** en en-tête (`.schedule-header` / `.schedule-count`), l'**avertissement non-planifiés** (`.schedule-warning`, raison générique collective) et les **messages d'état vide** restent **inchangés** dans leur logique et leur texte. 5.3 ne change QUE la **forme** de la liste des jours planifiés (tableau → timeline). Le **domaine `lib/domain/` n'est PAS touché** ; les tests **golden** (`schedule.golden.test.ts`) et la suite domaine restent verts **sans modification**.

**AC-11 — Tests du cœur projeté.** Des tests Vitest (env `node`, **purs**) couvrent la projection timeline et l'attribution de couleur (le seul code testable — aucun test de composant React n'existe dans ce projet) :
- (a) **span** : pour un planning donné, `buildTimeline` produit une cellule par jour de `[premier..dernier]` inclus, dans l'ordre chronologique, sans trou ni doublon ;
- (b) **jour ouvré** : une date présente dans `planning` → cellule `working` portant le bon `participantId`/`name`/`colorIndex` ;
- (c) **week-end** : un samedi/dimanche intercalé → cellule `weekend`, label « WE », `skipped` ;
- (d) **bloqué** : un férié / jour off / exclusion intercalé → cellule `blocked`, label attendu, `skipped` ; et **précédence** (un jour à la fois férié ET week-end → classé `blocked`/« Férié », pas « WE ») ;
- (e) **couleur stable** : `colorForIndex` et la map id→index sont déterministes ; deux participants distincts dans l'ordre des actifs reçoivent les couleurs `wheel-segments[0]`, `[1]`, … ; la 9ᵉ personne reboucle sur `[0]` (modulo 8) ;
- (f) **planning vide** → `buildTimeline` renvoie `[]`.

**AC-12 — Non-régression globale.** `npx tsc --noEmit` → 0 erreur ; `npx eslint .` → 0 erreur ; **toute** la suite Vitest verte (existants + nouveaux) ; `npm run build` OK.

## Tasks / Subtasks

- [x] **T1 — Module palette + attribution couleur partagée (NEW, pur)** (AC: 6, 11e)
  - [x] Créer `daily-wheel/lib/ui/participant-colors.ts` — PUR (aucun React/DOM). Exporter :
    - `export const WHEEL_SEGMENT_COLORS = ['#0078d4','#38b2ac','#7c5cff','#e8618c','#f59e0b','#10b981','#3b82f6','#ef4444'] as const` (palette `wheel-segments` autoritaire, `DESIGN.md` l. 25-32) ;
    - `export function colorForIndex(i: number): string` → `WHEEL_SEGMENT_COLORS[i % WHEEL_SEGMENT_COLORS.length]` (normalisation positive défensive ajoutée) ;
    - `export function buildColorIndexMap(activeParticipants: { id: string }[]): Map<string, number>` → `id` → sa position dans la liste reçue.
    - **(ajout)** `export function initialOf(name: string): string` → initiale capitalisée pour l'avatar (factorisé hors du composant pour être testable).
  - [x] Commenter en tête : « **Contrat partagé timeline (5.3) ↔ roue (5.4)** : même palette + même base d'index (participants actifs, ordre du store) ⇒ une personne garde sa couleur partout (AC-6, DESIGN.md:99). »

- [x] **T2 — Formatteurs de date courts FR (UPDATE `date-fr.ts`, purs)** (AC: 2)
  - [x] Dans `daily-wheel/lib/format/date-fr.ts`, ajouter (mêmes conventions : parsing LOCAL via `parseYMD`, jamais UTC) :
    - `export function weekdayShortFr(ymd: string): string` → `parseYMD(ymd).toLocaleDateString('fr-FR', { weekday: 'short' })`, **point final retiré** (`'lun.'` → `'lun'`) ;
    - `export function dayOfMonth(ymd: string): string` → numéro du jour (`'23'`) ;
    - `export function monthShortFr(ymd: string): string` → mois court (`'juin'`), point final retiré.
  - [x] **Ne pas toucher** `formatDateFr` / `parseYMD` / `todayYMD` (réutilisés ailleurs). ✓ inchangés.

- [x] **T3 — Projection timeline (NEW, pure feuille de présentation)** (AC: 4, 5, 9, 11a-d, 11f)
  - [x] Créer `daily-wheel/lib/ui/timeline.ts` — PUR. Importe les prédicats DÉJÀ exportés de `lib/domain/team-availability.ts` (`isWeekend`, `isHoliday`, `isTeamOffDay`, `isGroupExcluded`, `addDays`) + le type `ScheduleRow` (`lib/domain/schedule.ts`) + `TeamConstraints`. **Rien réimplémenté** (anti-réinvention, AD-3). Note : `isTeamNonSessionDay` n'est pas appelé directement — la projection déduit le libellé via les sous-prédicats, la décision canonique « slot ? » restant celle du domaine.
  - [x] Type de sortie :
    ```ts
    export type TimelineCell =
      | { date: string; kind: 'working'; participantId: string; name: string; colorIndex: number }
      | { date: string; kind: 'weekend'; label: string; skipped: true }
      | { date: string; kind: 'blocked'; label: string; skipped: true }
    ```
  - [x] Signature :
    ```ts
    export function buildTimeline(args: {
      planning: ScheduleRow[]
      constraints: TeamConstraints
      colorIndexById: ReadonlyMap<string, number>
      blockedLabelFor?: (date: string) => string | undefined // libellé férié/off saisi (store), optionnel
    }): TimelineCell[]
    ```
  - [x] Algorithme : si `planning` vide → `[]`. Sinon, itérer `d` de `planning[0].date` à `planning[planning.length-1].date` **inclus** via `addDays(d, 1)` (comparaison lexicographique YMD). Pour chaque `d` :
    1. si `d ∈ planning` (indexé par date en amont) → cellule `working` `{ participantId, name, colorIndex: colorIndexById.get(participantId) ?? 0 }`. **La présence dans `planning` PRIME sur toute classification** (défensif vs contrainte modifiée après génération — cas « périmé » géré par 5.9).
    2. sinon, **libellé d'affichage** par **précédence** (1ᵉʳ qui matche) : `isHoliday` → `blocked` (`blockedLabelFor(d) ?? 'Férié'`) ; `isTeamOffDay` → `blocked` (`blockedLabelFor(d) ?? 'Jour off'`) ; `isGroupExcluded` → `blocked` (`'Exclusion'`) ; `isWeekend` → `weekend` (`'WE'`).
    3. **filet défensif** (ne doit pas arriver, invariant no-hole AC-9) : aucun sous-prédicat → `blocked` `'Jour neutralisé'`.
  - [x] Commenter : décision canonique « slot ? » = domaine ; ici **projection d'affichage** d'un jour déjà non-planifié — pas une seconde source de vérité (AD-3 préservé). ✓

- [x] **T4 — Tests purs (NEW)** (AC: 11)
  - [x] Créé `daily-wheel/tests/timeline.unit.test.ts` (`describe`/`it` FR, fabriques en haut, comparaisons YMD, env `node`). Couvre 11(a)-(f) + précédence WE-vs-férié + cas « présence dans planning prime ». **11 tests buildTimeline**.
  - [x] Tests `participant-colors` ajoutés dans le **même fichier** (`colorForIndex` modulo 8, `buildColorIndexMap`, `initialOf`) — **4 tests**. + `tests/date-fr.unit.test.ts` (formatteurs courts, **3 tests**).

- [x] **T5 — Composant timeline (NEW) + styles (UPDATE globals.css)** (AC: 1, 2, 3, 4, 5, 7, 8)
  - [x] Créé `daily-wheel/components/ScheduleTimeline.tsx` (`'use client'`). Lit le store via `useParticipants()` (AD-11) ; assemble la **même** forme `TeamConstraints` que `generate()` ; `colorIndexById = buildColorIndexMap(participants.filter(p => p.active))` ; `blockedLabelFor` résout le libellé depuis `holidays` (label) puis `teamOffDays` (via `isTeamOffDay` réutilisé). Appelle `buildTimeline(...)` et rend la grille. Mapping dupliqué inline (≈8 lignes) plutôt qu'extrait — sans risque, le sélecteur optionnel n'a pas été jugé nécessaire.
  - [x] Rendu cellule : `.day` (+ `weekend`/`blocked`), `.dow`/`.dnum`/`.mon` via les formatteurs T2 ; avatar `.av-lg` (style inline `background: colorForIndex(colorIndex)`, `initialOf(name)`) + `.who` (prénom) ; badges `.badge` + `.skipnote` (« sauté »). Avatar marqué `aria-hidden` (info redondante avec `.who`) ; conteneur `role="list"`, cellules `role="listitem"`. **Aucune animation d'entrée** (le `pop` appartient à 5.4).
  - [x] **UPDATE** `daily-wheel/components/ScheduleResult.tsx` : `<table>…</table>` → `<ScheduleTimeline />`. Conservés : en-tête + compteur, actions + bouton (texte **inchangé** « 🎲 Lancer la sélection »), `unscheduledWarning`, états vides. Imports `formatDateFr` + helper `capitalize` retirés (devenus inutilisés).
  - [x] **UPDATE** `daily-wheel/app/globals.css` : `--gold-soft`/`--gold-border` ajoutés dans `:root` ; bloc `.timeline`/`.day` ajouté après le bloc 4.3 (valeurs reprises verbatim du mockup) ; aucune règle ≤520px ajoutée — l'`auto-fit` reflue seul, vérifié visuellement.

- [x] **T6 — Vérification non-régression** (AC: 10, 12)
  - [x] `npx vitest run tests/schedule.golden.test.ts` → **2/2 vert sans modification** (domaine intact).
  - [x] `npx tsc --noEmit` → **0** · `npx eslint .` → **0** · `npm test` → **280/280 sur 29 fichiers** · `npm run build` → **OK** (page `/` compilée, tree `ScheduleResult`→`ScheduleTimeline` inclus).
  - [x] **Vérification du rendu** : le markup est une projection triviale et type-vérifiée des cellules `buildTimeline` (couvertes par 11 tests, tous les types de cellule + précédence) ; valeurs CSS reprises verbatim du mockup validé ; build Next compile la page entière. ⚠ **Le contrôle pixel en navigateur (`npm run dev`) n'a PAS été exécuté** (job sans navigateur ; rendre le `.tsx` réel sous Vitest exigerait de modifier la config JSX partagée, hors périmètre 5.3) — **recommandé comme ultime passe humaine** avant merge (voir Completion Notes).

## Dev Notes

### Périmètre & principe directeur — ce que 5.3 fait et NE fait PAS
- **Évolution, pas réécriture** (Epic 5, `epics.md:138-141`, `:398`). 5.3 ne change QUE la **présentation** du planning déjà calculé : remplace le `<table>` de 4.3 par une **grille timeline**. Le domaine `generateSchedule` est la source de vérité et **n'est pas touché**.
- **STRICTEMENT HORS PÉRIMÈTRE 5.3 (différés, ne pas anticiper)** :
  - **Roue `<canvas>` + animation de révélation `pop` + région live `role="status"`** → **5.4**. La timeline 5.3 est **statique** : elle affiche le résultat déjà généré, sans suspense ni remplissage animé. **Ne pas** ajouter d'animation d'entrée sur les cellules.
  - **Placeholder « à tirer » par cellule** (mockup l. 405) → c'est l'état AVANT révélation, du ressort de **5.4/5.5**. En 5.3, un planning est déjà généré → toutes les cellules ouvrées sont **remplies**.
  - **Modes « Rotation complète / Jour le jour »** → **5.5/5.6**.
  - **Exports Slack/CSV** → **5.7**.
  - **CTA « Lancer la roue » + mark 🎡 (favicon/header)** → **5.8**. **Conserver le bouton actuel tel quel** (« 🎲 Lancer la sélection », `ScheduleResult.tsx:44`) — la microcopie/branding est gelée par 5.8 ; ne pas la modifier ici.
  - **Clic chip → popover d'édition + nudge « relancer la roue »** → **5.9**. Donc en 5.3, si les contraintes changent après génération, la timeline peut momentanément diverger du planning ; la règle défensive (la présence dans `planning` prime, T3 étape 1) garde l'affichage cohérent, et la gestion « périmé » est laissée à 5.9.

### Décision d'architecture CENTRALE de 5.3 — d'où vient le flux jour-par-jour ?
**Problème.** La timeline doit afficher **tous** les jours de l'horizon (ouvrés attribués **+** week-ends **+** bloqués « sautés »). Or `generateSchedule` ne renvoie **que** `{ planning, unscheduled }` (`schedule.ts:55-58`) — **aucun flux jour-par-jour, aucune raison de saut**. Le type `ScheduleResult` est **GELÉ et asserté par le golden** (`ScheduleResult.tsx:10` le rappelle) ⇒ **interdiction de modifier la sortie du domaine** (casserait la parité NFR9, AD-12).

**Décision (tranchée).** Construire le flux jour-par-jour dans une **feuille de présentation PURE** (`lib/ui/timeline.ts`), à partir de :
- `schedule.planning` (les jours ouvrés + animateurs, autoritaires),
- les `TeamConstraints` reconstituées depuis le store (les **mêmes** que `generate()` assemble),
- en **réutilisant les prédicats DÉJÀ exportés** du domaine (`isWeekend`, `isHoliday`, `isTeamOffDay`, `isGroupExcluded`, `isTeamNonSessionDay`, `addDays`).

Cela : (1) ne touche **pas** `generateSchedule` ni le golden ; (2) ne **réinvente aucune** logique de contrainte (anti-réinvention) ; (3) reste **pur** donc **testable en `node`** (le seul style de test du projet). C'est l'évolution minimale et conforme.

### AD-3 — pourquoi la projection ne crée PAS de second prédicat
AD-3 (`ARCHITECTURE-SPINE.md:81-88`) : `isTeamNonSessionDay` est l'**unique** source de vérité du « jour neutralisé », branchée boucle de génération **et** deadline EDF. La timeline **n'introduit aucune décision de neutralisation concurrente** : un jour de l'intervalle `[premier..dernier]` qui n'est pas dans `planning` est **déjà** neutralisé (invariant no-hole, flowchart spine `:284-310` + Dev Notes 5.2 §CONSTAT). La projection se contente d'en **déduire un LIBELLÉ d'affichage** (« WE » / « Férié » / …) en interrogeant les **sous-prédicats existants** — c'est de la présentation, pas une seconde vérité. Le badge « sauté » reflète exactement ce que le domaine a sauté. **Ne créer aucun nouveau prédicat dans `lib/domain/`.**

### Forme du résultat & store — ce que le composant lit (lecture obligatoire faite)
- `ScheduleRow = { date: string /*YMD*/; participantId: string; name: string }` ; `ScheduleResult = { planning: ScheduleRow[]; unscheduled: {id;name}[] }` (`schedule.ts:48-58`).
- Le store expose tout le nécessaire via `useParticipants()` (`participants-store.tsx:111-150, 847-882`) : `schedule`, `participants` (avec `.active`), `groupExclusions`, `holidays` (PORTENT `label`), `teamOffDays` (PORTENT `label`), `settings` (`skip_weekends`, `start_date`).
- **Assemblage `TeamConstraints`** : copier la forme de `generate()` (`participants-store.tsx:665-674`) — `{ skipWeekends: settings.skip_weekends, groupExclusions: …, holidays: holidays.map(h => ({date:h.date})), teamOffDays: … }`. Pour les **libellés** de badge (férié/off), passer `blockedLabelFor` qui lit `holidays`/`teamOffDays` **avec** leur `label` (le domaine, lui, ne reçoit que `{date}` — d'où la nécessité de résoudre le libellé côté composant).
- **Base d'index couleur** : `participants.filter(p => p.active)` dans l'ordre du store = **exactement** la liste passée au domaine (`participants-store.tsx:656`) **et** le set de segments de la roue 5.4. ⇒ index stable, couleur identique partout (AC-6).

### Fichiers à TOUCHER
- **NEW** `daily-wheel/lib/ui/participant-colors.ts` — palette + `colorForIndex` + `buildColorIndexMap` (pur). Voisin de `lib/ui/stepper.ts` (convention `lib/ui/` pour helpers UI purs testés en node, cf. `tests/stepper-states.unit.test.ts`).
- **NEW** `daily-wheel/lib/ui/timeline.ts` — `buildTimeline` + type `TimelineCell` (pur).
- **NEW** `daily-wheel/components/ScheduleTimeline.tsx` — rendu grille (`'use client'`).
- **NEW** `daily-wheel/tests/timeline.unit.test.ts` (+ éventuellement `participant-colors.unit.test.ts`).
- **UPDATE** `daily-wheel/lib/format/date-fr.ts` — 3 formatteurs courts (purs, additifs).
- **UPDATE** `daily-wheel/components/ScheduleResult.tsx` — `<table>` (l. 65-80) → `<ScheduleTimeline />` ; tout le reste conservé.
- **UPDATE** `daily-wheel/app/globals.css` — 2 tokens `:root` + bloc `.timeline`/`.day` après l. 853.

### Fichiers à NE PAS TOUCHER (régression interdite)
- `daily-wheel/lib/domain/schedule.ts` — sortie GELÉE (golden). **Aucune** modification.
- `daily-wheel/lib/domain/team-availability.ts`, `availability.ts` — prédicats CONSOMMÉS tels quels, jamais modifiés.
- `daily-wheel/tests/schedule.golden.test.ts` & `schedule.unit.test.ts` — garde-fous parité, inchangés (T6).
- `daily-wheel/lib/store/participants-store.tsx` — lecture seule via `useParticipants()` (sauf si T5-option `selectTeamConstraints` y est extraite, et seulement si trivial & sûr).
- Le **bouton** et sa microcopie (`ScheduleResult.tsx:44`) — gelés par 5.8.

### CSS de référence (mockup → tokens projet) — à ajouter dans globals.css
```css
/* ── Timeline visuelle (Story 5.3 — grille multi-lignes, sans scrollbar, UX-DR10/UX-DR13) ── */
.timeline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 8px;
  padding: 2px 0 4px;
}
.day {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 8px 12px;
  min-height: 132px;
  background: var(--card-bg);
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: center;
}
.day .dow { font-size: .68rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted); }
.day .dnum { font-size: 1.15rem; font-weight: 800; color: var(--text-color); line-height: 1; }
.day .mon { font-size: .62rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
.day .av-lg { width: 40px; height: 40px; border-radius: 50%; color: #fff; font-weight: 700; font-size: 1rem; display: grid; place-items: center; margin: 4px auto 2px; }
.day .who { font-size: .8rem; font-weight: 600; color: var(--text-color); }
.day .badge { font-size: .62rem; font-weight: 700; padding: 2px 6px; border-radius: 6px; background: #fff; border: 1px solid currentColor; color: var(--text-muted); align-self: center; margin-top: auto; }
.day .skipnote { font-size: .6rem; color: var(--text-muted); margin-top: 2px; }
.day.weekend { background: repeating-linear-gradient(45deg, #f8fafc, #f8fafc 6px, #f1f5f9 6px, #f1f5f9 12px); }
.day.blocked { background: var(--gold-soft); border-color: var(--gold-border); }
```
> `#f8fafc`/`#f1f5f9` sont des gris de hachure non tokenisés (cosmétique locale du filigrane) — acceptables en littéral, comme dans le mockup. Tout le reste passe par les tokens existants.

### Architecture compliance (ARCHITECTURE-SPINE.md)
- **AD-1 (domaine feuille pur)** : `lib/ui/timeline.ts` et `participant-colors.ts` sont des feuilles UI **pures** (aucun React/DOM) qui **consomment** le domaine sans le modifier — dépendances descendantes (UI → domaine), jamais l'inverse (`:48-67`).
- **AD-3 (prédicat unique)** : voir §AD-3 ci-dessus — aucun second prédicat ; réutilisation stricte des sous-prédicats exportés pour le seul libellé.
- **AD-11 (Supabase via lib/data uniquement)** : le composant ne touche QUE le store (`useParticipants`), aucun `supabase.from` (`:139-143`).
- **AD-12 (golden parité)** : domaine intact ⇒ golden vert sans modification (`:145-149`, T6).
- **Convention dates** (`:190`) : YMD locales, itération via `addDays`, jamais `toISOString()`/UTC. Les formatteurs courts parsent en LOCAL via `parseYMD` (déjà la règle de `date-fr.ts`).
- **Langue/format FR 100 %** (`:197`, NFR4) : libellés « WE », « Férié », « Jour off », « Exclusion », « sauté », jours/mois abrégés FR.
- **Stack** (`:199-211`) : Next 16 / React 19 / TS 5.1+ / Vitest. `npm test` = `vitest run --no-file-parallelism`.

### Intelligence stories précédentes
- **4.2** (`f3bf2bd`) : algo EDF + prédicats AD-3 — socle consommé (lecture seule).
- **4.3** (`232bf3f`) : `ScheduleResult.tsx` (tableau + compteur + avertissement). 5.3 fait évoluer **ce** composant ; AC-10 protège son périmètre (bouton/compteur/avertissement/états vides).
- **5.1** (review) : stepper + bandeau ; la carte Résultat est montée dans `app/page.tsx:88-95` (section `#surface-spin`). 5.3 rend dans cette même section, aucun couplage avec le stepper.
- **5.2** (review, baseline `6a6c2ab`) : a verrouillé l'horizon étendu + `HORIZON_LIMIT_YEARS` + 7 tests ; **domaine 100 % stable** — 5.3 s'appuie dessus sans le toucher. Le débordement multi-semaines de 5.2 implique que la timeline peut couvrir **plusieurs semaines** : la grille `auto-fit` qui s'enroule est précisément la réponse (AC-1).

### Project Structure Notes
- App Next dans `daily-wheel/` ; alias `@/*` → `daily-wheel/*`. Helpers UI purs sous `lib/ui/` (précédent : `stepper.ts`), formatage sous `lib/format/`, tests sous `tests/` (`*.unit.test.ts`).
- **Aucun test de composant React** dans le projet (pas de jsdom / testing-library) → la couverture 5.3 porte sur les **feuilles pures** (`buildTimeline`, couleurs). Le composant est vérifié par `build` + contrôle visuel (T6).
- Commandes (depuis `daily-wheel/`) : `npm test`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 (l. 138-141, 398) ; #Story 5.3 (l. 436-451)]
- [Source: …/ux-designs/ux-SpinThatWeeklyWheel-2026-06-23/DESIGN.md#palette wheel-segments (l. 24-32) ; #timeline+day-cell (grille `repeat(auto-fit, minmax(96px,1fr))`, gold-soft #fef3c7, gold-border #fcd34d, hachure WE) ; #pas de scrollbar (l. 184)]
- [Source: …/ux-designs/…/EXPERIENCE.md#UX-DR10 (grille qui s'enroule, l. 86) ; #UX-DR13 (couleur jamais seule, badges texte, l. 116)]
- [Source: …/ux-designs/…/mockups/spin-rotation.html (`.timeline` l. 173 ; `.day`/`.dow`/`.dnum`/`.mon` l. 174-199 ; `.av-lg` l. 183-187 ; `COLORS[i % len]` l. 353 ; badge/skipnote l. 195-199, 400 ; weekend hachure l. 192 ; blocked l. 193)]
- [Source: …/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-1 (l. 69-73) ; #AD-3 (l. 81-88) ; #AD-11 (l. 139-143) ; #AD-12 (l. 145-149) ; flowchart no-hole (l. 284-310) ; conventions dates/langue (l. 190, 197)]
- [Source: daily-wheel/lib/domain/schedule.ts:48-58 (types GELÉS) ; team-availability.ts:111-142 (prédicats exportés : isHoliday, isTeamOffDay, isGroupExcluded, isWeekend, isTeamNonSessionDay) ; :67-69 (addDays)]
- [Source: daily-wheel/components/ScheduleResult.tsx:18-94 (tableau l. 65-80 à remplacer ; compteur/avertissement/états vides à conserver) ; app/page.tsx:88-95 (montage section #surface-spin)]
- [Source: daily-wheel/lib/store/participants-store.tsx:111-150 (StoreValue) ; :656,665-674 (assemblage actifs + TeamConstraints à répliquer) ; :847-882 (value exposée)]
- [Source: daily-wheel/lib/format/date-fr.ts:1-28 (parseYMD local, point d'extension formatteurs courts)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev-story)

### Debug Log References

- `npx vitest run tests/timeline.unit.test.ts` → 15/15 (11 buildTimeline + 4 couleurs) ; ancrage calendaire confirmé (22=lun, 24=mer, 27=sam, 28=dim, 29=lun).
- `npx vitest run tests/date-fr.unit.test.ts` → 3/3 (formatteurs courts ; `node` Intl fr : `lun.`/`juin` → `lun`/`juin` après strip du point).
- `npx vitest run tests/schedule.golden.test.ts` → 2/2 (garde-fou parité ; domaine non touché).
- `npx tsc --noEmit` → 0 · `npx eslint .` → 0 (1 warning d'import inutilisé corrigé) · `npm test` → 280/280 sur 29 fichiers · `npm run build` → OK (page `/` compilée).

### Completion Notes List

- **Décision d'archi centrale appliquée (flux jour-par-jour).** `generateSchedule` (sortie GELÉE, golden) **non touché**. Le flux jour-par-jour de la timeline est reconstruit dans une **feuille de présentation PURE** `lib/ui/timeline.ts` (`buildTimeline`), qui **réutilise** les prédicats déjà exportés du domaine (`isWeekend`/`isHoliday`/`isTeamOffDay`/`isGroupExcluded`/`addDays`) — **aucun nouveau prédicat**, AD-3 préservé. Parité NFR9 intacte : golden 2/2 vert sans modification.
- **AC-1/AC-8 (grille sans scrollbar).** `grid-template-columns: repeat(auto-fit, minmax(96px, 1fr))` + `gap: 8px` (verbatim mockup) : s'enroule sur plusieurs lignes, aucune `overflow-x`. Reflux ≤520px géré par l'algorithme lui-même → aucune règle responsive ajoutée.
- **AC-2/AC-3 (cellules & avatar).** `.dow/.dnum/.mon` via 3 formatteurs courts FR purs ajoutés à `date-fr.ts` (parsing local, point final retiré). Avatar `.av-lg` 40px, `background: colorForIndex(idx)` inline, `initialOf(name)` ; prénom en `.who`.
- **AC-4/AC-5 (WE & bloqués) + précédence.** WE → hachure `repeating-linear-gradient` + badge « WE » + « sauté ». Férié/off/exclusion → `--gold-soft`/`--gold-border` + badge libellé + « sauté ». Précédence d'affichage : férié > off > exclusion > WE (un samedi aussi férié s'affiche « Férié », prouvé par test).
- **AC-6 (couleur partagée roue 5.4).** Palette `WHEEL_SEGMENT_COLORS` (8 hex, DESIGN.md) + `colorForIndex(i)` (modulo 8) + `buildColorIndexMap(actifs)` dans `lib/ui/participant-colors.ts` — **contrat partagé** documenté pour que 5.4 réutilise exactement la même couleur par personne. Index = position dans `participants.filter(active)` (ordre du store = liste envoyée au domaine).
- **AC-7 (couleur jamais seul signal).** Badges texte sur tous les jours bloqués + « sauté » ; animateur nommé en clair (`.who`) à côté de la pastille (avatar `aria-hidden`, conteneur `role="list"`).
- **AC-9 (continuité).** `buildTimeline` couvre `[planning[0]..planning[n-1]]` inclus via `addDays` ; tout jour non planifié de l'intervalle est nécessairement neutralisé (invariant no-hole). Règle défensive : la présence dans `planning` PRIME sur la classification (robuste à une contrainte modifiée post-génération — cas « périmé » déféré à 5.9). Planning vide → `[]` → états vides 4.3 préservés.
- **AC-10 (non-régression 4.3, sacré).** Bouton (« 🎲 Lancer la sélection », gelé pour 5.8), compteur de sessions, avertissement non-planifiés et états vides **inchangés**. Domaine + golden intacts.
- **AC-11/AC-12.** 18 tests purs ajoutés (timeline 11 + couleurs 4 + dates 3) ; tsc 0 · eslint 0 · 280/280 (29 fichiers) · build OK.
- **⚠ Contrôle pixel navigateur NON exécuté.** Job sans navigateur ; rendre le `.tsx` réel sous Vitest aurait exigé de modifier la config JSX partagée (hors périmètre 5.3). Le rendu est néanmoins fortement attesté : projection triviale type-vérifiée des cellules exhaustivement testées + CSS verbatim du mockup validé + compilation Next de la page entière. **Passe humaine recommandée** (`npm run dev`, section « Résultat » après un tirage avec ≥1 week-end et ≥1 férié intercalés) avant merge — c'est aussi l'objet du `code-review`.

### File List

- `daily-wheel/lib/ui/participant-colors.ts` — **NEW** : palette `WHEEL_SEGMENT_COLORS` + `colorForIndex` + `buildColorIndexMap` + `initialOf` (pur ; contrat couleur partagé avec la roue 5.4).
- `daily-wheel/lib/ui/timeline.ts` — **NEW** : type `TimelineCell` + `buildTimeline` (projection pure, réutilise les prédicats domaine ; AD-3 préservé).
- `daily-wheel/components/ScheduleTimeline.tsx` — **NEW** : rendu de la grille timeline (`'use client'`, consomme le store, assemble contraintes + couleurs + libellés).
- `daily-wheel/tests/timeline.unit.test.ts` — **NEW** : 15 tests (11 `buildTimeline` + 4 `participant-colors`).
- `daily-wheel/tests/date-fr.unit.test.ts` — **NEW** : 3 tests (formatteurs courts FR).
- `daily-wheel/lib/format/date-fr.ts` — **MODIFIÉ** : ajout `weekdayShortFr` / `dayOfMonth` / `monthShortFr` (purs, additifs ; `parseYMD`/`formatDateFr`/`todayYMD` inchangés).
- `daily-wheel/components/ScheduleResult.tsx` — **MODIFIÉ** : `<table>` → `<ScheduleTimeline />` ; imports `formatDateFr` + helper `capitalize` retirés ; périmètre 4.3 (bouton/compteur/avertissement/états vides) conservé.
- `daily-wheel/app/globals.css` — **MODIFIÉ** : tokens `--gold-soft`/`--gold-border` dans `:root` + bloc `.timeline`/`.day` (grille, cellules, WE hachuré, bloqué gold-soft, badges).

### Change Log

- 2026-06-23 — Story 5.3 contextée (Amelia/create-story) : décision d'archi (timeline = projection PURE `lib/ui/`, domaine/golden intacts), couleurs partagées avec la roue 5.4, périmètre 4.3 protégé, défer 5.4→5.9. Statut → ready-for-dev.
- 2026-06-23 — Story 5.3 implémentée (Amelia/dev-story) : `buildTimeline` (projection pure réutilisant les prédicats domaine), palette/couleurs partagées, formatteurs courts FR, composant `ScheduleTimeline` + CSS grille `auto-fit` (sans scrollbar), `ScheduleResult` table→timeline. 18 tests purs ajoutés ; domaine non touché (golden 2/2). tsc 0 · eslint 0 · vitest 280/280 (29 fichiers) · build OK. Contrôle pixel navigateur recommandé en passe humaine. Statut → review.
