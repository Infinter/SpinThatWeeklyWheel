---
baseline_commit: f3b8ced286ea8a3bef2a59b8370cb1a87625a370
---
# Story 5.7: Exports Slack + CSV avec aperçu

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want exporter le planning en message Slack ou en CSV, en voyant exactement ce qui sera copié,
so that je partage la rotation à l'équipe sans surprise (FR17, UX-DR11).

## Acceptance Criteria

> Reformulées depuis `epics.md#Story 5.7` (l. 503-518) et la spec autoritaire `EXPERIENCE.md` (l. 152-171 formats exacts + règles ; l. 70-71/87/108 microcopie & clipboard ; l. 41/133 placement) / `DESIGN.md` (l. 54 composant `export-preview` ; l. 115 monospace ; l. 156-157 panneau dépliable) / `mockups/spin-rotation.html` (l. 313-327 markup, l. 583-635 `buildSlack`/`buildCSV`/`showExport`/copy/close, l. 202-220/230-237 CSS). Chaque AC porte un ID pour le suivi des tâches.
>
> **PRINCIPE DIRECTEUR Epic 5 (`epics.md:398`)** : `generateSchedule` reste la SOURCE DE VÉRITÉ ; 5.7 ne fait que **PROJETER** le planning déjà calculé en texte partageable. **Elle ne touche NI le domaine, NI la roue, NI la timeline, NI l'orchestration bi-mode (5.5), NI la persistance (5.6).** Les builders d'export sont des **fonctions pures** (esprit AD-1, voisines de `wheel.ts`/`timeline.ts`/`rotation-resume.ts`).

**AC-1 — Barre d'export sous la timeline, DEUX formats seulement (epics.md:503-518, EXPERIENCE.md:41/152, mockup:313-318).** Sous la timeline (dans la carte Résultat), une **barre d'export** affiche un libellé « Partager : » puis **exactement deux** boutons : **« 💬 Pour Slack »** et **« ⬇ En CSV »** (libellés au mot près). Le **lien public** (`🔗 Lien de partage`) et le **calendrier `.ics`** présents dans le mockup sont **HORS PÉRIMÈTRE** (différés, `epics.md:518`) → **ne PAS les implémenter**. Cliquer un format ouvre l'aperçu (AC-2) et marque le bouton **actif** (`.active` = bordure + texte `{colors.primary}`, fond `{colors.primary-light}`).

**AC-2 — Panneau d'aperçu : contenu EXACT en monospace (epics.md:513, UX-DR11, DESIGN.md:156-157, mockup:319-327).** Un clic sur un format **déplie un panneau d'aperçu** (`.export-preview`) sous la barre, qui affiche le **contenu EXACT qui sera copié** (rien de plus, rien de moins) dans un **`<pre>` monospace** (`ui-monospace, Menlo, Consolas`, `0.82rem`, `white-space: pre-wrap`, `word-break: break-word`). L'en-tête du panneau (`.ep-head`, fond `#f8fafc`) montre : le **nom du format** (« Message Slack » / « Fichier rotation.csv »), l'**indice** « — exactement ce qui est copié », un bouton **« 📋 Copier »** et un bouton **✕** (`aria-label="Fermer l'aperçu"`). ✕ referme le panneau et **désactive** l'état actif des boutons. Basculer Slack↔CSV met à jour le contenu et l'onglet actif **sans fermer** le panneau.

**AC-3 — Format Message Slack EXACT (epics.md:514, EXPERIENCE.md:156-162, mockup:592-598).** Le contenu Slack est un **markdown** :
```
🎡 *Rotation Daily Scrum* — semaine du {date de début longue}
_Chacun anime une fois ; jours fériés et week-ends sautés._

• {jourAbrégé} {numéro} {moisAbrégé}  →  *{animateur}*
…
```
- L'**en-tête** = `🎡 *Rotation Daily Scrum* — semaine du {date de début}` où « date de début » = **date du premier jour planifié** (`planning[0].date`) au format **long sans jour de semaine** (ex. « 23 juin 2026 »), suivi d'une ligne `_Chacun anime une fois ; jours fériés et week-ends sautés._`, puis une **ligne vide**.
- **Une ligne par session** : `• {jourAbrégé} {numéro} {moisAbrégé}  →  *{animateur}*` (ex. `• lun 23 juin  →  *Alice*`). Séparateur exact = `  →  ` (deux espaces avant/après la flèche, conforme `mockup:597`). Les jours abrégés/mois abrégés suivent `weekdayShortFr`/`dayOfMonth`/`monthShortFr` (ex. « lun », « 23 », « juin »).

**AC-4 — Format CSV EXACT, dates ISO (epics.md:515, EXPERIENCE.md:164-169, mockup:599-605).** Le contenu CSV comporte :
- **En-tête** : `Date,Jour,Animateur` (exact).
- **Une ligne par session** : `{dateISO},{jourAbrégé},{animateur}` où **`dateISO` = `planning[i].date` tel quel** (les dates domaine SONT déjà des chaînes `YYYY-MM-DD` locales — convention dates ; **AUCUNE conversion `toISOString()`/UTC**, qui décalerait d'un jour). Ex. `2026-06-23,lun,Alice`.
- **Échappement RFC-4180 défensif** : un champ contenant `,`, `"` ou un saut de ligne est entouré de guillemets doubles, les guillemets internes étant doublés (un prénom « Dupont, Jean » ne doit pas casser le CSV). `date` et `jour` sont sûrs ; seul `animateur` peut nécessiter l'échappement. Lignes séparées par `\n`.

**AC-5 — Bouton « Copier » → presse-papier + toast (epics.md:516, EXPERIENCE.md:71/108, mockup:628-631).** Cliquer **« 📋 Copier »** copie le **contenu exact de l'aperçu** via **`navigator.clipboard.writeText`**, avec **repli silencieux** si le presse-papier est indisponible (API absente, contexte non sécurisé, promesse rejetée → **aucune erreur visible, aucun crash**). En cas de succès, un **toast** « **Copié dans le presse-papier** » s'affiche (le bouton dit « Copier » → le toast dit « Copié », `EXPERIENCE.md:71`) puis disparaît seul (~2–3 s).

**AC-6 — Export indisponible tant qu'aucune rotation n'est tirée (epics.md:517, EXPERIENCE.md:70/171, mockup:613).** Tant qu'**aucune rotation n'est tirée** (`schedule === null` ou `planning.length === 0`), l'export est **indisponible** : la barre d'export n'apparaît qu'avec un planning **OU** ses boutons sont désactivés ; un déclenchement sans planning affiche le message **« Lance d'abord la rotation »** (toast). Voir Dev Notes §« Placement & disponibilité ». **Le contenu reflète l'état courant du planning** (`EXPERIENCE.md:171`) — voir §Questions ouvertes (planning complet vs jours révélés).

**AC-7 — Cœur pur testable + tests (pattern maison 5.2→5.6).** La **construction** des contenus est extraite dans un **module pur** `lib/ui/exports.ts` (aucun import React/DOM/Supabase ; esprit AD-1). Il expose :
```ts
export type ExportFormat = 'slack' | 'csv'
export function buildSlackExport(planning: ScheduleRow[]): string
export function buildCsvExport(planning: ScheduleRow[]): string
```
Des tests Vitest (env `node`, purs) couvrent : (a) Slack — en-tête exact (date longue du 1er jour) + lignes `• jour num mois  →  *nom*` ; (b) CSV — en-tête `Date,Jour,Animateur` + dates ISO `YYYY-MM-DD` (= `row.date`) + ordre chronologique ; (c) **échappement CSV** d'un nom contenant une virgule / un guillemet ; (d) cas planning à 1 session ; (e) déterminisme (mêmes entrées → même chaîne, octet pour octet).

**AC-8 — Périmètre PROTÉGÉ + différés (sacré, NFR9/AD-12).** Le **domaine `lib/domain/` n'est PAS touché** ; `lib/ui/wheel.ts`, `lib/ui/timeline.ts`, `lib/ui/spin-mode.ts`, `lib/ui/rotation-resume.ts`, `components/SpinWheel.tsx`, `components/ScheduleTimeline.tsx` **ne changent pas de contrat** ; la **persistance 5.6** (`rotation_state`, store, `/api/rotation_state`) et l'**orchestration 5.5** sont **intactes**. Les tests **golden**, domaine, `wheel`/`timeline`/`spin-mode`/`rotation-resume`/`rotation-state-reducer` restent **verts sans modification**. **Différés / hors périmètre** : **lien public** & **`.ics`** (`epics.md:518`) ; gel microcopie/branding (mark 🎡 global, favicon) → **5.8** ; popover d'édition + nudge « relancer » → **5.9**. 5.7 n'ajoute **aucune** table, **aucune** route API, **aucune** écriture serveur (l'export est 100 % client, lecture seule).

**AC-9 — Accessibilité & mouvement (UX-DR11, UX-DR13).** Boutons d'export et Copier/✕ = `<button>` natifs (clavier OK), **focus visible** (`outline 2px {colors.primary}` hérité). Le panneau d'aperçu est annoncé proprement (en-tête lisible ; le `<pre>` porte le contenu textuel exact). Le **toast** est dans une région `aria-live="polite"` (annonce « Copié dans le presse-papier »). L'animation d'ouverture (`rise`) et le toast respectent **`prefers-reduced-motion`** (règle globale héritée). La couleur n'est jamais le seul signal (libellés texte).

**AC-10 — Non-régression globale.** `npx tsc --noEmit` → 0 erreur ; `npx eslint .` → 0 erreur ; **toute** la suite Vitest verte (existants 5.2→5.6 + golden + nouveaux `exports`) ; `npm run build` OK.

## Tasks / Subtasks

> Ordre TDD : T1 (cœur pur + test RED→GREEN) → T2 (helper date) → T3 (CSS) → T4 (UI + clipboard + toast) → T5 (vérif). La logique décidable (formats exacts, échappement) est PURE et testée ; le panneau/clipboard/toast est validé par contrôle navigateur (pas de tests de composant React dans ce projet).

- [x] **T1 — Cœur pur des exports (NEW `lib/ui/exports.ts`, pur) + tests (NEW `tests/exports.unit.test.ts`)** (AC: 3, 4, 7)
  - [x] Créer `daily-wheel/lib/ui/exports.ts` — **PUR** (aucun import React/DOM/Supabase ; importe uniquement `ScheduleRow` du domaine et les formatteurs purs de `lib/format/date-fr`). Commenter en tête : « 5.7 — projection texte du planning (Slack/CSV). Le domaine reste la source de vérité ; ce module ne fait que FORMATER le résultat déjà calculé. »
  - [x] Exporter `type ExportFormat = 'slack' | 'csv'`.
  - [x] `buildSlackExport(planning: ScheduleRow[]): string` — en-tête `🎡 *Rotation Daily Scrum* — semaine du {dateLongueDébut}\n_Chacun anime une fois ; jours fériés et week-ends sautés._\n\n` (où `dateLongueDébut` = date longue SANS jour de semaine du `planning[0].date`, ex. « 23 juin 2026 » ; voir T2) + une ligne par session `• {weekdayShortFr} {dayOfMonth} {monthShortFr}  →  *{name}*` jointes par `\n`. **Séparateur EXACT `  →  `** (2 espaces de chaque côté, `mockup:597`). Planning vide → en-tête seul (défensif ; l'UI ne l'appelle pas vide, AC-6).
  - [x] `buildCsvExport(planning: ScheduleRow[]): string` — `['Date,Jour,Animateur', ...planning.map(r => `${r.date},${weekdayShortFr(r.date)},${csvField(r.name)}`)].join('\n')`. **`r.date` est utilisé TEL QUEL** (déjà `YYYY-MM-DD` local — AUCUN `Date`/UTC). Helper interne `csvField(v)` : si `v` contient `,` `"` ou `\n` → `"` + `v.replace(/"/g,'""')` + `"`, sinon `v`.
  - [x] Créer `daily-wheel/tests/exports.unit.test.ts` (Vitest env `node`, pur, style maison : helpers en tête, `describe('… (Story 5.7, AC-7)')`, assertions explicites). Couvrir AC-7 (a)→(e) avec un fixture `ScheduleRow[]` à dates connues (lundi 2026-06-22, etc.). Vérifier les chaînes **octet pour octet** (y compris séparateurs, header, ligne vide Slack) et l'échappement CSV (nom « Du, Bois » → `"Du, Bois"` ; nom avec `"` → guillemets doublés).
  - [x] Vérifier que `tests/timeline.unit.test.ts` / `wheel` / `spin-mode` / `rotation-*` passent **sans modification** (AC-8).

- [x] **T2 — Helper de date longue sans jour de semaine (UPDATE `lib/format/date-fr.ts`)** (AC: 3)
  - [x] Ajouter une fonction PURE `dateLongNoWeekdayFr(ymd: string): string` qui renvoie `parseYMD(ymd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })` (ex. « 23 juin 2026 »). Mêmes conventions que le reste du module (parsing LOCAL via `parseYMD`, jamais UTC). Réutilisée par `buildSlackExport`. (Ne PAS dupliquer la logique de parsing.)

- [x] **T3 — Styles barre + aperçu + toast (UPDATE `app/globals.css`)** (AC: 1, 2, 5, 9)
  - [x] Répliquer les blocs `mockup:202-220` (`.export-row`, `.export-row .lead`, `.mini`, `.mini:hover`, `.mini.active`, `.export-preview`, `.export-preview.show`, `.ep-head` + `.fmt`/`.ep-hint`/`.spacer`, `.ep-x` + hover, `.ep-body`) et `mockup:230-237` (`.toasts`, `.toast`, `.toast .ok`, keyframe `rise`).
  - [x] **⚠ TOKENS — pièges à éviter** : le mockup utilise `var(--font)`, `var(--text)`, `var(--muted)` qui **N'EXISTENT PAS** dans `app/globals.css`. Utiliser les tokens RÉELS du projet : `--text-color` (≡ `--text` du mockup), `--text-muted` (≡ `--muted`), `--primary`, `--primary-light`, `--border` ; et **`font-family: inherit`** (le projet n'a pas de `--font` — cf. décision Story 5.5). Reprendre la valeur monospace en dur (`ui-monospace, Menlo, Consolas, monospace`) et `#f8fafc` (fond ep-head) comme dans le mockup.
  - [x] La keyframe `rise` et les `transition` doivent être neutralisées sous `prefers-reduced-motion` — **vérifier** qu'une règle globale `@media (prefers-reduced-motion: reduce)` existe déjà (héritée 5.4/5.5) ; sinon ajouter `.export-preview.show { animation: none }` / `.toast { animation: none }` sous cette media query.
  - [x] Mobile (≤ 640 px) : `.export-row` reflue (`flex-wrap` déjà) ; optionnellement masquer `.ep-hint` (mockup:242). Pas de scrollbar horizontale (NFR5).

- [x] **T4 — UI export + clipboard + toast (UPDATE `components/ScheduleResult.tsx`)** (AC: 1, 2, 5, 6, 9)
  - [x] Importer `buildSlackExport`, `buildCsvExport`, `type ExportFormat` de `@/lib/ui/exports`.
  - [x] État LOCAL : `const [exportFmt, setExportFmt] = useState<ExportFormat | null>(null)` (format affiché / bouton actif ; `null` = panneau fermé) ; `const [toastMsg, setToastMsg] = useState('')` + `const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)`.
  - [x] Helper `showToast(msg)` : `setToastMsg(msg)` ; annule/réarme `toastTimer` (~2600 ms) → `setToastMsg('')`. Nettoyer `toastTimer` dans le `useEffect` de démontage existant (à côté de `justPickedTimer`/`chainTimer`).
  - [x] `openExport(fmt)` : si `!schedule || schedule.planning.length === 0` → `showToast('Lance d'abord la rotation')` (défensif, AC-6) ; sinon `setExportFmt(fmt)`.
  - [x] `closeExport()` : `setExportFmt(null)`.
  - [x] `copyExport()` : calculer `content` = `exportFmt === 'slack' ? buildSlackExport(planning) : buildCsvExport(planning)` ; `if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(content).then(() => showToast('Copié dans le presse-papier')).catch(() => {})` — **repli silencieux** (aucune erreur si indisponible). (Option : appeler `showToast` au succès uniquement ; ne PAS toaster en cas d'échec.)
  - [x] **Rendu** : DANS le bloc `schedule.planning.length > 0` (après `<ScheduleTimeline …/>`, comme `mockup:312-328`), ajouter :
    - la **barre** `.export-row` : `<span className="lead">Partager :</span>` + bouton `.mini` Slack + bouton `.mini` CSV (chacun `aria-pressed`/`className 'active'` selon `exportFmt`, `onClick={() => openExport('slack'|'csv')}`). **NE PAS** rendre de bouton Lien/`.ics` (AC-8).
    - le **panneau** `.export-preview` (avec classe `show` quand `exportFmt !== null`) : `.ep-head` (`<span className="fmt">{exportFmt==='slack'?'Message Slack':'Fichier rotation.csv'}</span>`, `<span className="ep-hint">— exactement ce qui est copié</span>`, `<span className="spacer" />`, bouton `.mini` « 📋 Copier » `onClick={copyExport}`, bouton `.ep-x` ✕ `aria-label="Fermer l'aperçu"` `onClick={closeExport}`) + `<pre className="ep-body">{exportFmt ? (exportFmt==='slack'?buildSlackExport(planning):buildCsvExport(planning)) : ''}</pre>`.
  - [x] **Toast** : rendre, en fin de composant, `{toastMsg && <div className="toasts"><div className="toast" role="status" aria-live="polite">{toastMsg}</div></div>}` (ou un conteneur toujours présent avec la région live). Garder une seule région live cohérente ; ne pas entrer en conflit avec la région `.reveal` (le toast est une confirmation ponctuelle distincte).
  - [x] Mettre à jour le **commentaire d'en-tête** du composant : 5.7 ajoute la barre d'export (Slack/CSV) + aperçu + copie ; toujours UI pure (aucune écriture serveur).
  - [x] **Reset à la (re)génération** : si l'aperçu est ouvert et qu'on relance/regénère, refermer l'aperçu (`setExportFmt(null)`) dans le pattern de reset « ajuster pendant le rendu » existant (l'aperçu d'un ancien planning ne doit pas rester affiché). Réutiliser le bloc `if (schedule !== prevSchedule)`.

- [x] **T5 — Vérification finale & non-régression** (AC: 7, 8, 10)
  - [x] `cd daily-wheel && npx tsc --noEmit` → 0 erreur.
  - [x] `npx eslint .` → 0 erreur.
  - [x] `npx vitest run tests/*.unit.test.ts tests/schedule.golden.test.ts` → **toute** la suite verte (existants + `exports`).
  - [x] `npm run build` → OK.
  - [x] **Contrôle navigateur recommandé en passe humaine** : (a) avant tirage → pas d'export (ou désactivé) ; (b) après tirage → « 💬 Pour Slack » ouvre l'aperçu, contenu exact monospace ; (c) « ⬇ En CSV » bascule le contenu (dates ISO) sans fermer ; (d) « 📋 Copier » → toast « Copié dans le presse-papier » et le presse-papier contient EXACTEMENT le `<pre>` ; (e) ✕ referme + désactive les boutons ; (f) repli silencieux si clipboard indisponible (pas de crash) ; (g) `prefers-reduced-motion` → pas d'animation `rise`.

## Dev Notes

### État actuel du code (post-5.6) — points d'ancrage
- **`components/ScheduleResult.tsx`** est l'orchestrateur de la carte Résultat. Il consomme le store (`schedule`, `rotationCursor`, `rotationMode`, …), rend le sélecteur de mode (5.5), la roue (`SpinWheel`), la région live `.reveal` (`role="status"`), la **timeline** (`<ScheduleTimeline …/>`) et l'avertissement non-planifiés — le tout dans le bloc `schedule.planning.length > 0`. **5.7 insère la barre d'export + l'aperçu juste après la timeline** dans ce bloc (cf. `mockup:312-328`), plus un toast en fin de composant. Les timers locaux (`justPickedTimer`, `chainTimer`) sont nettoyés dans un `useEffect` de démontage — y **ajouter `toastTimer`**.
- **Dates** : `ScheduleRow.date` est une chaîne **`YYYY-MM-DD` locale** (convention dates, jamais UTC). Le CSV « ISO » l'utilise **telle quelle** — surtout PAS `new Date(...).toISOString()` (décalage d'un jour selon le fuseau). Les helpers `weekdayShortFr`/`dayOfMonth`/`monthShortFr` (déjà dans `lib/format/date-fr.ts`) produisent « lun »/« 23 »/« juin » (point final des abréviations FR déjà retiré).
- **Aucun module export / clipboard / toast n'existe** dans le projet → tout est NEUF. Le seul `sessionStorage`/`navigator` utilisé ailleurs est la passphrase (`use-write-queue.ts`) — sans rapport.

### Formats EXACTS (source : `mockup:592-605`, `EXPERIENCE.md:156-169`)
**Slack** (markdown) :
```
🎡 *Rotation Daily Scrum* — semaine du 23 juin 2026
_Chacun anime une fois ; jours fériés et week-ends sautés._

• lun 23 juin  →  *Alice*
• mar 24 juin  →  *Bob*
```
**CSV** (dates ISO) :
```
Date,Jour,Animateur
2026-06-23,lun,Alice
2026-06-24,mar,Bob
```
> Le mockup hardcode « 23 juin 2026 » et un mapping `MON = { juin:'06', … }` pour le CSV : on N'en a PAS besoin (la date ISO est déjà `row.date`, et la date longue vient de `dateLongNoWeekdayFr(planning[0].date)`). Reproduire les **séparateurs exacts** (`  →  `, virgules) et la **ligne vide** entre l'en-tête Slack et la liste.

### Placement & disponibilité (AC-6) — décision
La barre d'export est rendue **DANS le bloc `schedule.planning.length > 0`** : elle n'apparaît donc **qu'avec une rotation tirée** (l'app affiche sinon un état vide « Cliquez sur … pour générer le planning. »). C'est l'interprétation la plus simple de « désactivé tant qu'aucune rotation n'est tirée ». Le garde-fou `openExport` (toast « Lance d'abord la rotation » si pas de planning) couvre le cas défensif et reste fidèle au `mockup:613`. **Ne PAS** rendre une barre d'export désactivée hors du bloc planning (redondant avec l'état vide existant).

### Architecture & conventions (rappel spine)
- **Couches** (`ARCHITECTURE-SPINE.md:40-46`) : `lib/ui/` héberge la projection/présentation **pure** (timeline, wheel, participant-colors, rotation-resume) — `exports.ts` s'y range naturellement (pur, sans dépendance descendante interdite ; importe le domaine en lecture de type + `lib/format`).
- **AD-7/AD-14 non concernés** : l'export est **100 % client, lecture seule** — aucune écriture serveur, aucune passphrase, aucune table, aucune route. (Contraste avec 5.6.)
- **Tests** = Vitest ; aucun test de composant React → couverture 5.7 = module **pur** `exports.ts` ; le panneau/clipboard/toast est validé par **contrôle navigateur** (T5). `navigator.clipboard.writeText` n'est PAS testé en unitaire (pas de jsdom/clipboard) — il vit dans le composant, comme `matchMedia` en 5.4/5.5.
- **Clipboard** : `navigator.clipboard` n'est dispo qu'en **contexte sécurisé** (https / localhost). Le **repli silencieux** (try/catch + garde de présence) est donc obligatoire (AC-5) ; ne jamais laisser une promesse rejetée non gérée.

### Garde-fous d'implémentation (pièges)
- **Tokens CSS** : utiliser `--text-color`/`--text-muted`/`--primary`/`--primary-light`/`--border` + `font-family: inherit` — **PAS** `--font`/`--text`/`--muted` (absents, cf. T3). C'est l'erreur la plus probable en copiant le mockup.
- **Une seule source pour le contenu copié** : le `<pre>` et `copyExport()` doivent produire **la même chaîne** (rappeler `buildSlackExport`/`buildCsvExport`, ou mémoïser le contenu courant dans une variable). Sinon « exactement ce qui est copié » serait faux. Recommandé : `const previewContent = useMemo(() => exportFmt ? (exportFmt==='slack'?buildSlackExport(planning):buildCsvExport(planning)) : '', [exportFmt, schedule])`, utilisé par le `<pre>` ET `copyExport`.
- **Refermer l'aperçu à la (re)génération** : un aperçu d'un ancien planning ne doit pas survivre à un nouveau tirage → `setExportFmt(null)` dans le reset au changement de `schedule`.
- **Toast vs région `.reveal`** : ce sont deux régions live distinctes ; garder le toast `aria-live="polite"` et transitoire. Ne pas réutiliser `revealMessage` (sémantique différente).
- **reduced-motion** : l'animation `rise` du panneau et du toast doit être désactivée sous `prefers-reduced-motion` (UX-DR13).

### Project Structure Notes
- **NEW** `daily-wheel/lib/ui/exports.ts` (pur) — `buildSlackExport`, `buildCsvExport`, `csvField`, `ExportFormat`.
- **NEW** `daily-wheel/tests/exports.unit.test.ts` — tests purs (AC-7).
- **UPDATE** `daily-wheel/lib/format/date-fr.ts` — ajoute `dateLongNoWeekdayFr`.
- **UPDATE** `daily-wheel/app/globals.css` — blocs `.export-row`/`.mini`/`.export-preview`/`.ep-*`/`.toasts`/`.toast` (tokens du projet).
- **UPDATE** `daily-wheel/components/ScheduleResult.tsx` — barre d'export + aperçu + clipboard + toast ; reste UI pure (AD-11) ; **n'élargit pas** son rôle (aucune écriture).
- **Aucune** migration, **aucune** route `app/api/`, **aucun** changement `lib/data/`/`lib/store/`/`lib/domain/`.

### References
- [Source: epics.md#Story 5.7 (l. 503-518)] — AC source : aperçu exact, format Slack, CSV ISO, bouton Copier + toast, désactivé sans tirage, lien public & `.ics` HORS périmètre.
- [Source: EXPERIENCE.md (l. 152-171)] — formats EXACTS (Slack header + lignes, CSV header + ISO), règles (désactivé, reflète la timeline, toast). (l. 70-71/87/108) microcopie & `navigator.clipboard.writeText` + repli silencieux. (l. 41/133) placement sous la timeline.
- [Source: DESIGN.md (l. 54, 115, 156-157)] — composant `export-preview` (panneau dépliable, en-tête, `📋 Copier`, ✕), monospace `0.82em`.
- [Source: mockups/spin-rotation.html (l. 313-327 markup ; l. 583-635 buildSlack/buildCSV/showExport/copy/close ; l. 202-220 + 230-237 CSS)] — markup, logique et styles de référence. ⚠ Tokens CSS du mockup (`--font`/`--text`/`--muted`) à remapper sur ceux du projet.
- [Source: lib/format/date-fr.ts] — `parseYMD`, `formatDateFr`, `weekdayShortFr`, `dayOfMonth`, `monthShortFr`, `todayYMD` (réutilisés ; + nouveau `dateLongNoWeekdayFr`).
- [Source: lib/domain/schedule.ts] — `ScheduleRow { date, participantId, name }`, `ScheduleResult.planning` (ordre chronologique).
- [Source: components/ScheduleResult.tsx (post-5.6)] — point d'insertion (après la timeline) + `useEffect` de nettoyage des timers + reset au changement de `schedule`.
- [Source: app/globals.css (:root l. 1-30)] — tokens RÉELS : `--text-color`, `--text-muted`, `--primary`, `--primary-light`, `--border`.
- [Source: ARCHITECTURE-SPINE.md (AD-1 pur, AD-11 contact data, l. 40-46 couches)] — placement de `exports.ts` ; 5.7 = lecture seule, hors AD-7/AD-14.
- [Source: 5-6-…-jour-le-jour.md] — story précédente : persistance rotation (à NE PAS régresser) ; même patron « cœur pur lib/ui + tests + UI mince ».

### Questions ouvertes (pour Solo, après lecture)
1. **Contenu exporté : planning COMPLET ou seulement jours révélés ?** Recommandé = **planning complet** (`schedule.planning` entier) dès qu'une rotation est tirée — c'est « un planning généré » (`epics.md:511`) et le plus utile pour partager. ⚠ En mode « Jour le jour », exporter le planning complet **révèle les animateurs des jours pas encore tirés** (fin du suspense). Alternative : n'exporter que `planning.slice(0, revealedCount)`. (1 ligne à changer : passer `planning` vs `planning.slice(0, revealedCount)` aux builders.) À trancher.
2. **Toast en cas d'échec de copie ?** Recommandé = toast **au succès uniquement** (repli silencieux sinon). OK, ou afficher un message d'échec discret ?

## Dev Agent Record

### Agent Model Used

Amelia (Senior Software Engineer) — Opus 4.8 (1M context). TDD red→green→refactor.

### Debug Log References

- `npx vitest run tests/exports.unit.test.ts` → RED (module `@/lib/ui/exports` absent) puis GREEN (8/8).
- Suite unitaire complète (hors intégration Supabase) : `npx vitest run tests/*.unit.test.ts tests/schedule.golden.test.ts` → **328/328 verts** (26 fichiers ; +8 vs 5.6 = `exports` ; golden 2/2, wheel/timeline/spin-mode/rotation-* INTACTS → zéro régression).
- `npx tsc --noEmit` → 0 erreur ; `npx eslint .` → 0 erreur ; `npm run build` → OK (**8 routes API inchangées** — 5.7 n'ajoute aucune route, confirmant le 100 % client).

### Completion Notes List

- **Cœur PUR `lib/ui/exports.ts`** : `buildSlackExport` / `buildCsvExport` / `csvField` (échappement RFC-4180) / type `ExportFormat`. Formats EXACTS du mockup reproduits octet pour octet (en-tête Slack « semaine du {date longue} » + lignes `• lun 22 juin  →  *Nom*` avec séparateur `  →  ` ; CSV `Date,Jour,Animateur` + **dates ISO = `row.date` telle quelle**, AUCUN `toISOString()`/UTC). 8 tests purs (AC-7 a→e), env `node`.
- **Helper `dateLongNoWeekdayFr`** ajouté à `lib/format/date-fr.ts` (« 23 juin 2026 », parsing local) pour l'en-tête Slack.
- **CSS** (`globals.css`) : blocs `.export-row`/`.mini`/`.export-preview`/`.ep-*`/`.toasts`/`.toast` + keyframe `rise` calqués sur le mockup, **REMAPPÉS sur les tokens RÉELS** : `--text` → `--text-color`, `--muted` → `--text-muted`, `--font` → `font-family: inherit` (le piège signalé en story). Overrides `prefers-reduced-motion` (aperçu + toast). Mobile : `.ep-hint` masqué ≤ 520 px.
- **UI `ScheduleResult.tsx`** : barre « Partager : » (💬 Pour Slack / ⬇ En CSV uniquement) + panneau aperçu dépliable sous la timeline + toast. `previewContent` mémoïsé = **source UNIQUE** affichée dans le `<pre>` ET copiée (« exactement ce qui est copié »). `copyExport` via `navigator.clipboard.writeText` avec **repli silencieux** (garde de présence + `.catch`), toast « Copié dans le presse-papier » au succès. `openExport` garde-fou « Lance d'abord la rotation ». Aperçu refermé à la (re)génération ; `toastTimer` nettoyé au démontage.
- **Décision Q1 (planning complet vs révélés)** : retenu **planning complet** (`schedule.planning` entier) dès qu'une rotation est tirée — défaut recommandé. ⚠ En mode « Jour le jour », l'aperçu révèle donc les animateurs des jours non encore tirés. **1 ligne à changer** (`schedule.planning` → `schedule.planning.slice(0, revealedCount)` dans `previewContent`) si Solo préfère limiter aux jours révélés.
- **Décision Q2** : toast **au succès uniquement** (repli silencieux sinon).
- **Périmètre PROTÉGÉ (AC-8)** : domaine, `lib/ui/wheel|timeline|spin-mode|rotation-resume`, `SpinWheel`, `ScheduleTimeline`, persistance 5.6, orchestration 5.5 → **inchangés**. Aucune table, aucune route API, aucune écriture serveur (lecture seule). Lien public & `.ics` HORS périmètre (différés).
- **Note review/passe humaine** : aucun test de composant React → l'aperçu/clipboard/toast est validé par tsc/eslint/build + cœur pur testé ; contrôle navigateur recommandé (ouverture aperçu, bascule Slack↔CSV, copie + toast, repli si clipboard indisponible, reduced-motion).

### File List

- `daily-wheel/lib/ui/exports.ts` (NEW) — cœur pur : `buildSlackExport`, `buildCsvExport`, `csvField`, `ExportFormat`.
- `daily-wheel/tests/exports.unit.test.ts` (NEW) — 8 tests purs (formats exacts, échappement CSV, dates ISO, déterminisme).
- `daily-wheel/lib/format/date-fr.ts` (UPDATE) — ajout `dateLongNoWeekdayFr`.
- `daily-wheel/app/globals.css` (UPDATE) — styles export/aperçu/toast (tokens réels du projet) + reduced-motion + mobile.
- `daily-wheel/components/ScheduleResult.tsx` (UPDATE) — barre d'export + panneau aperçu + clipboard + toast ; reset aperçu à la régénération ; nettoyage `toastTimer`. UI pure, aucune écriture.

### Change Log

- 2026-06-24 — Story 5.7 implémentée (Amelia/dev-story) : in-progress → review. Cœur pur `lib/ui/exports.ts` (buildSlackExport/buildCsvExport, échappement RFC-4180, dates ISO = row.date sans UTC) + 8 tests ; helper `dateLongNoWeekdayFr` ; CSS export/aperçu/toast (tokens réels --text-color/--text-muted, font inherit) + reduced-motion ; UI ScheduleResult (barre Slack/CSV sous la timeline + aperçu monospace `previewContent` source unique + Copier clipboard repli silencieux + toast) ; aperçu refermé à la régénération. Q1=planning complet, Q2=toast au succès. 100 % client/lecture seule (0 table/route/écriture). +8 tests ; tsc 0 / eslint 0 / 328 tests / build OK (8 routes API inchangées). Domaine/wheel/timeline/spin-mode/rotation-resume/persistance 5.6/golden INTACTS. Lien public & .ics HORS périmètre.
- 2026-06-24 — Story 5.7 contextée (Amelia/create-story) : backlog → ready-for-dev (epic-5 déjà in-progress). Exports Slack + CSV avec aperçu monospace exact + bouton Copier (clipboard, repli silencieux) + toast « Copié dans le presse-papier ». Cœur PUR `lib/ui/exports.ts` (buildSlackExport/buildCsvExport, échappement CSV, dates ISO = row.date sans UTC) + tests ; UI mince dans ScheduleResult (barre sous la timeline + panneau dépliable + toast) ; CSS calqué mockup mais avec tokens RÉELS du projet (--text-color/--text-muted, font-family inherit — PAS --font/--text/--muted). 100 % client/lecture seule : aucune table/route/écriture. Lien public & .ics HORS périmètre (différés) ; domaine/wheel/timeline/spin-mode/rotation-resume/persistance 5.6/golden INTACTS. 2 questions ouvertes (planning complet vs jours révélés ; toast sur échec de copie).
