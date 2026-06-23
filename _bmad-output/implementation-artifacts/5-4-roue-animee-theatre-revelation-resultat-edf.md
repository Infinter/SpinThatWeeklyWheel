---
baseline_commit: 56e1ef5a16bcfe2e8af3b91945a679cf3fda7293
---
# Story 5.4: Roue animée — théâtre de révélation du résultat EDF

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want faire tourner une **vraie roue** qui s'arrête sur l'animateur du jour,
so that la désignation devient un **moment de suspense partagé** (FR16, UX-DR9, axe A).

## Acceptance Criteria

> Reformulées depuis `epics.md#Story 5.4` (l. 453-468) et la spec autoritaire `DESIGN.md` (roue/pointeur/hub, palette wheel-segments) / `EXPERIENCE.md` (UX-DR9 révèle≠retire, UX-DR13 mouvement/a11y) / `mockups/spin-rotation.html` (canvas + `drawWheel`/`spinTo`/`fillDay`). Chaque AC porte un ID pour le suivi des tâches. **Principe directeur Epic 5 (`epics.md:138-141`, `:398`) : ÉVOLUTION, pas réécriture — `generateSchedule` reste la SOURCE DE VÉRITÉ ; la roue n'est qu'une MISE EN SCÈNE du résultat (animation et planning coïncident TOUJOURS — UX-DR9).**

**AC-1 — Roue canvas : un segment par animateur, pointeur or 12h, moyeu 🎡 (UX-DR9, DESIGN.md:145-147).** Quand un planning existe (Story 5.2/4.2), la section Spin affiche une **roue `<canvas>`** au-dessus de la timeline. Elle dessine **un segment par participant à révéler** (= les animateurs du `planning`, voir Dev Notes §« Qui est sur la roue »), chacun de **couleur stable** (palette `wheel-segments`, contrat partagé 5.3) et portant le **prénom lisible** écrit radialement en blanc. Un **pointeur or fixe à 12h** (triangle `var(--gold)`) et un **moyeu central blanc 🎡** sont superposés. Dimensions : affichage 280×280 px, backing canvas 560×560 (DPR 2).

**AC-2 — Le spin RÉVÈLE le résultat EDF, il ne re-tire pas (UX-DR9, sacré).** Au lancement d'un tirage, la roue **tourne et ralentit en ease-out (~2,1 s) puis s'arrête EXACTEMENT sur le segment de l'animateur que `generateSchedule` a déjà assigné au jour courant** (le prochain slot chronologique non encore révélé, `planning[revealedCount]`). La roue **ne tire jamais un gagnant elle-même** : l'angle final est *calculé* pour amener ce segment précis sous le pointeur. Animation et planning **coïncident toujours** ; aucun appel à `generateSchedule`/`Math.random` ne décide du gagnant pendant l'animation.

**AC-3 — La personne révélée quitte la roue (« chacun une fois »).** Après chaque révélation, le segment de l'animateur révélé est **retiré** de la roue : le tour suivant ne dessine **que les restants** (`remaining`), les segments se redistribuant pour remplir le disque. Quand tous les slots sont révélés, la roue est vide (ou affiche son état terminal). Cela reflète l'invariant domaine « rotation one-shot, chacun placé au plus une fois » (`ARCHITECTURE-SPINE.md:310`).

**AC-4 — Remplissage de la cellule (animation `pop`) + annonce en région live (UX-DR13).** À chaque révélation : (a) la **cellule de jour correspondante** de la timeline passe de l'état placeholder « à tirer » à l'état **rempli** (avatar + prénom), avec une **animation `pop`** (zoom `.3→1`) et un **halo or transitoire** (`.justpicked`, ~0,9 s) ; (b) la révélation est **annoncée dans une région live `role="status" aria-live="polite"`** par le message « **{prénom}** animera le standup du {jour} {date} ». Le **`<canvas>` est `aria-hidden="true"`** (non lisible par lecteur d'écran ; l'information passe par la région live et la timeline). Le format de date suit `weekdayShortFr`/`dayOfMonth`/`monthShortFr` (Story 5.3) ou `formatDateFr` — voir Dev Notes.

**AC-5 — `prefers-reduced-motion` : saut direct au résultat (UX-DR13, sacré a11y).** Sous `prefers-reduced-motion: reduce`, la roue **saute directement à l'angle final sans rotation** (aucune boucle `requestAnimationFrame`), et la cellule se remplit **sans animation `pop` ni halo**. Le résultat (segment retiré, cellule remplie, message live) est **identique** ; seul le mouvement est supprimé. La détection se fait en JS (`window.matchMedia('(prefers-reduced-motion: reduce)').matches`) **et** la règle CSS du `pop`/halo est neutralisée dans le bloc `@media (prefers-reduced-motion: reduce)` existant (`globals.css:967`).

**AC-6 — Actionnable au clavier + CTA désactivé pendant l'animation (`aria-busy`).** Le déclencheur du tirage est **actionnable au clavier** (focus visible + **Entrée/Espace**) — réalisé par le **bouton CTA natif existant** (`<button>`, déjà géré nativement par le navigateur), le canvas restant non focusable car `aria-hidden`. Pendant l'animation, le CTA est **désactivé** (`disabled`) **et** porte **`aria-busy="true"`** ; il redevient actif et `aria-busy="false"` à la fin de l'animation.

**AC-7 — Couleur IDENTIQUE roue ↔ timeline ↔ avatar (contrat 5.3 réutilisé, sacré).** La couleur d'un participant sur la roue est **exactement** celle de son avatar timeline : dérivée de son **index dans la liste des participants ACTIFS** (ordre du store), modulo la palette `WHEEL_SEGMENT_COLORS`, via les helpers **déjà existants** `buildColorIndexMap` + `colorForIndex` (`lib/ui/participant-colors.ts`). **Aucune nouvelle palette, aucune ré-attribution** : 5.4 CONSOMME le contrat partagé posé par 5.3 (commenté `participant-colors.ts:4-7`).

**AC-8 — Périmètre PROTÉGÉ : domaine, golden, microcopie, 4.3 (sacré).** Le **domaine `lib/domain/` n'est PAS touché** (la roue ne fait que projeter `schedule.planning`) ; les tests **golden** (`schedule.golden.test.ts`) et toute la suite domaine restent verts **sans modification** (parité NFR9, AD-12). Le **texte du bouton** (« 🎲 Lancer la sélection ») reste **inchangé** (microcopie gelée par Story 5.8 — voir Dev Notes §Hors-périmètre). Le **compteur de sessions**, l'**avertissement non-planifiés** et les **états vides** de 4.3 restent inchangés dans leur logique et leur texte.

**AC-9 — Hors-périmètre 5.4 NON anticipé (différés).** 5.4 implémente le **mécanisme d'une roue + une révélation par activation du CTA** (baseline « jour le jour » sans sélecteur). Sont **STRICTEMENT différés** et **ne doivent PAS être implémentés ici** : le **sélecteur de mode** `role="tablist"` (« Rotation complète » / « Jour le jour »), l'**enchaînement automatique ~0,6 s** entre jours, les **libellés de CTA évolutifs** (« Tirer le premier jour »→…), le **message de fin** « Rotation complète ! » et le **reset au changement de mode** → **Story 5.5**. La **persistance** de la rotation → **5.6**. Les **exports Slack/CSV** → **5.7**. La **microcopie/branding figés** (dont « Lancer la roue », mark 🎡) → **5.8**. Le **clic chip → popover d'édition + nudge « relancer la roue »** → **5.9**.

**AC-10 — Tests purs du cœur testable.** Des tests Vitest (env `node`, **purs**) couvrent la **géométrie/animation pure** de la roue et la **projection placeholder** de la timeline (le seul code testable — aucun test de composant React n'existe dans ce projet) :
- (a) **angle de segment** : `segmentAngle(n) = 2π/n` ; cas `n=1` (segment plein) ;
- (b) **angle cible déterministe** : `finalAngle(current, targetIdx, n, turns)` amène le **centre du segment `targetIdx` sous le pointeur 12h** → `((finalAngle + (targetIdx+0.5)·seg + π/2) mod 2π) ≈ 0` ; le résultat est **> current** et comporte **au moins `turns`** de rotation ;
- (c) **easing** : `easeOutCubic(0)=0`, `easeOutCubic(1)=1`, **monotone croissant** sur [0,1] ;
- (d) **segments** : `buildWheelSegments(planning, colorIndexById)` produit un segment par ligne de `planning`, dans l'ordre, avec `{participantId, name, colorIndex}` correct ; couleur cohérente avec `colorForIndex` ;
- (e) **cible courante** : pour un `planning` et un `revealedCount` donnés, l'index cible **dans `remaining`** correspond bien à `planning[revealedCount].participantId` ;
- (f) **timeline placeholder** : `buildTimeline({..., revealedCount})` rend les cellules ouvrées d'**index de travail ≥ revealedCount** en `kind: 'pending'` (sans exposer le nom) et celles **< revealedCount** en `kind: 'working'` (rempli) ; `revealedCount` **absent ⇒ tout révélé** (rétro-compatibilité : les tests 5.3 existants restent verts) ; les cellules `weekend`/`blocked` sont **toujours** rendues, indépendamment de `revealedCount`.

**AC-11 — Non-régression globale.** `npx tsc --noEmit` → 0 erreur ; `npx eslint .` → 0 erreur ; **toute** la suite Vitest verte (existants 5.3 inclus + nouveaux) ; `npm run build` OK.

## Tasks / Subtasks

- [x] **T1 — Géométrie + animation PURE de la roue (NEW `lib/ui/wheel.ts`, pur)** (AC: 1, 2, 3, 10a-e)
  - [x] Créer `daily-wheel/lib/ui/wheel.ts` — **PUR** (aucun import React/DOM/Supabase ; esprit AD-1, voisin de `lib/ui/timeline.ts` et `participant-colors.ts`). Importer le type `ScheduleRow` (`@/lib/domain/schedule`) et `colorForIndex` (`@/lib/ui/participant-colors`).
  - [x] Exporter :
    ```ts
    export type WheelSegment = { participantId: string; name: string; colorIndex: number }

    // Un segment par animateur du planning, dans l'ordre chronologique (= ordre de révélation).
    export function buildWheelSegments(
      planning: ScheduleRow[],
      colorIndexById: ReadonlyMap<string, number>,
    ): WheelSegment[]

    export function segmentAngle(n: number): number            // 2π/n (n>=1)
    export function easeOutCubic(t: number): number             // 1 - (1-t)^3

    // Angle de roue final qui amène le CENTRE du segment targetIdx sous le pointeur fixe à 12h (-π/2),
    // en partant de `current`, après AU MOINS `turns` radians de rotation supplémentaire (sens horaire).
    // Réplique la mécanique du mockup (spin-rotation.html:471-474) — `turns` est INJECTÉ (pas de hasard ici).
    export function finalAngle(current: number, targetIdx: number, n: number, turns: number): number

    // Index DANS `remaining` du prochain animateur à révéler (= planning[revealedCount].participantId).
    export function targetIndexInRemaining(remaining: WheelSegment[], targetParticipantId: string): number
    ```
  - [x] `finalAngle` : `desired = -Math.PI/2 - (targetIdx + 0.5) * seg` ; `end = current + turns + (((desired - (current % 2π)) + 4π) % 2π)` (mockup l. 471-474, verbatim de la logique). Commenter : **le pointeur est fixe à 12h ; on calcule l'angle qui place le segment ciblé dessous — la roue ne choisit pas, elle révèle (UX-DR9).**
  - [x] Commenter en tête : « **5.4 réutilise le contrat couleur 5.3** (`participant-colors.ts`) ; segments = animateurs du `planning` (source de vérité domaine) ⇒ animation ≡ planning. »

- [x] **T2 — Projection placeholder « à tirer » (UPDATE `lib/ui/timeline.ts`, pur, additif)** (AC: 4, 10f)
  - [x] Ajouter le **type de cellule** `pending` (jour ouvré non encore révélé — son animateur reste **caché**) :
    ```ts
    export type TimelineCell =
      | { date: string; kind: 'working'; participantId: string; name: string; colorIndex: number }
      | { date: string; kind: 'pending' }                       // ⟵ NOUVEAU (à révéler)
      | { date: string; kind: 'weekend'; label: string; skipped: true }
      | { date: string; kind: 'blocked'; label: string; skipped: true }
    ```
  - [x] Étendre la signature de `buildTimeline` avec un champ **optionnel** `revealedCount?: number`. Algorithme : itérer comme aujourd'hui ; tenir un **compteur d'index de travail** `w` qui s'incrémente à chaque jour présent dans `planning`. Pour un jour ouvré : si `revealedCount === undefined || w < revealedCount` → cellule `working` (comportement actuel) ; sinon → cellule `pending` (`{ date, kind: 'pending' }`). Les cellules `weekend`/`blocked` sont **inchangées** et rendues quel que soit `revealedCount`.
  - [x] **CRITIQUE rétro-compat** : `revealedCount` absent ⇒ **tout révélé** (`working`) → les **18 tests 5.3 existants restent verts sans modification**. Vérifier que `tests/timeline.unit.test.ts` (appels sans `revealedCount`) passe tel quel.
  - [x] **Ne PAS** appeler de prédicat de neutralisation nouveau (AD-3 préservé, comme en 5.3) ; la décision « slot ? » reste celle du domaine.

- [x] **T3 — Composant roue canvas (NEW `components/SpinWheel.tsx`, `'use client'`)** (AC: 1, 2, 3, 4, 5, 6)
  - [x] Créer `daily-wheel/components/SpinWheel.tsx`. **Props** (état piloté par le parent — voir T4) :
    ```ts
    {
      segments: WheelSegment[]      // ordre stable (= buildWheelSegments du planning)
      revealedCount: number         // nb déjà révélés
      onRevealed: (slotIndex: number) => void  // appelé en fin d'animation (incrémente côté parent)
      spinNonce: number             // change => déclenche un spin (voir T4) ; sentinelle de déclenchement
    }
    ```
  - [x] Rendu : `<div className="wheel-stage">` contenant `<canvas className="wheel" aria-hidden="true" width={560} height={560} />`, `<div className="pointer" aria-hidden="true" />`, `<div className="hub" aria-hidden="true">🎡</div>`. Le canvas est **purement visuel** (AC-4 : `aria-hidden`).
  - [x] **Dessin** (`drawWheel(ctx, rot, remaining)`) — répliquer `mockups/spin-rotation.html:438-465` : `remaining` = `segments.slice(revealedCount)` ; `seg = segmentAngle(remaining.length)` ; pour chaque `i` : arc `R-8` de `rot + i*seg` à `+seg`, `fillStyle = colorForIndex(remaining[i].colorIndex)` ; texte blanc `700 26px 'Segoe UI'` au milieu du segment, aligné droite à `R-38`. `remaining.length === 0` → disque gris `#eef4fb`. Gérer le **DPR 2** : backing 560, rayon `R=280`, centre `(280,280)`.
  - [x] **Animation** (effet sur `spinNonce`) : calculer `targetIdx = targetIndexInRemaining(remaining, segments[revealedCount].participantId)` ; `n = remaining.length` ; `turns = (4 + (revealedCount % 3)) * 2π` (varie l'effet sans hasard, mockup l. 472) ; `end = finalAngle(angleRef, targetIdx, n, turns)`. Boucle `requestAnimationFrame` sur `dur = 2100 ms`, `p = clamp01((ts - t0)/dur)`, `angle = start + (end - start) * easeOutCubic(p)`, `drawWheel(angle)` à chaque frame ; à `p>=1` : `angle = end`, dernier `drawWheel`, puis `onRevealed(revealedCount)`.
  - [x] **`prefers-reduced-motion`** (AC-5) : si `window.matchMedia('(prefers-reduced-motion: reduce)').matches` → **pas de RAF** : poser `angle = end`, `drawWheel(end)` une fois, appeler `onRevealed(revealedCount)` immédiatement (le retrait du segment se fait via le re-render parent qui décrémente `remaining`).
  - [x] **Nettoyage** : annuler le `requestAnimationFrame` au démontage / changement de nonce (`cancelAnimationFrame` dans le cleanup d'effet) pour éviter les fuites. Stocker `angle` dans une `useRef` (persiste entre spins, repart de l'angle courant).
  - [x] **Aucun** accès store/Supabase ici (AD-11) : le composant ne reçoit que des props et dessine.

- [x] **T4 — Orchestration de la révélation (UPDATE `components/ScheduleResult.tsx`)** (AC: 2, 3, 4, 6, 8)
  - [x] Faire de `ScheduleResult` l'**orchestrateur** de l'état de révélation, **en préservant le périmètre 4.3** (compteur, avertissement, états vides, **texte du bouton**). État local (`useState`) : `revealedCount`, `spinNonce`, `busy`, `pendingSpin`, `justRevealedDate`.
  - [x] **Reset** : un `useEffect([schedule])` remet `revealedCount = 0`, `busy = false`, `justRevealedDate = null` à chaque **nouveau** `schedule` (identité change quand `generate()` repose un résultat).
  - [x] **Construire** `colorIndexById = buildColorIndexMap(participants.filter(p => p.active))` et `segments = buildWheelSegments(schedule.planning, colorIndexById)`.
  - [x] **Déclencheur CTA** (`handleSpin`) — **un seul bouton, texte inchangé** :
    - si `schedule === null` **ou** `revealedCount >= planning.length` → appeler `generate()` (store) **puis** `setPendingSpin(true)` (démarre/redémarre une rotation) ;
    - sinon → `setBusy(true)`, `setSpinNonce(n => n+1)` (déclenche un spin dans `SpinWheel`).
    - Un `useEffect([schedule])` qui, si `pendingSpin` et `schedule?.planning.length`, lance le **premier** spin (`setBusy(true); setSpinNonce(n=>n+1); setPendingSpin(false)`).
  - [x] **Fin d'animation** (`onRevealed(slotIndex)` passé à `SpinWheel`) : `setRevealedCount(slotIndex + 1)`, `setBusy(false)`, `setJustRevealedDate(planning[slotIndex].date)`, mettre à jour le **message de la région live** (« {prénom} animera le standup du {jour} {date} »). Retirer la classe `.justpicked` après ~900 ms (`setTimeout`, annulé proprement).
  - [x] **Région live** : ajouter `<p className="reveal" role="status" aria-live="polite">{revealMessage}</p>` (texte par défaut neutre avant tout tirage ; **ne dépend pas** de la microcopie figée 5.8 — garder un message factuel). C'est une 2ᵉ région live distincte du `.schedule-warning` existant (`role="status"`) → s'assurer qu'elles ne se polluent pas.
  - [x] **CTA** : `disabled = !canGenerate || busy` ; ajouter `aria-busy={busy}`. **NE PAS changer** le label « 🎲 Lancer la sélection » (gelé 5.8) ni la logique du compteur/avertissement/états vides.
  - [x] Rendre `<SpinWheel segments revealedCount onRevealed spinNonce />` au-dessus de `<ScheduleTimeline revealedCount={revealedCount} justRevealedDate={justRevealedDate} />`, uniquement quand `schedule.planning.length > 0`.
  - [x] **Note d'archi** (commentaire) : l'état de révélation est **local au composant** (éphémère, comme `schedule` l'est dans le store) — **pas** de persistance ici ; 5.6 (flag archi #2) introduira la persistance « jour le jour ». 5.5 remplacera ce déclencheur mono-bouton par le sélecteur de mode + l'enchaînement.

- [x] **T5 — Timeline : placeholder « à tirer » + pop sur la cellule révélée (UPDATE `components/ScheduleTimeline.tsx`)** (AC: 4, 7, 10f)
  - [x] Ajouter les props `revealedCount?: number` et `justRevealedDate?: string | null`. Passer `revealedCount` à `buildTimeline(...)`.
  - [x] Rendu d'une cellule `pending` : conserver `.dow/.dnum/.mon` ; corps = **placeholder « à tirer »** (`<div className="slot">à tirer</div>`, **sans** avatar ni prénom — l'animateur reste un secret jusqu'au spin). Pas de couleur (la couleur n'est jamais le seul signal, UX-DR13 — ici aucune info animateur n'est divulguée).
  - [x] Rendu d'une cellule `working` : **inchangé** (avatar `colorForIndex(cell.colorIndex)` + `initialOf(name)` + `.who`). Si `cell.date === justRevealedDate`, ajouter la classe `justpicked` sur le `.day` (halo + pop transitoires).
  - [x] **Réutiliser** `buildColorIndexMap`/`colorForIndex`/`initialOf` (déjà importés) — **ne rien réécrire** (AC-7). Conserver `role="list"`/`role="listitem"`, `aria-label`.

- [x] **T6 — Styles roue + pop + placeholder + reduced-motion (UPDATE `app/globals.css`)** (AC: 1, 4, 5)
  - [x] Ajouter le token **`--gold: #f59e0b`** dans `:root` (le pointeur et le halo en ont besoin ; seuls `--gold-soft`/`--gold-border` existent — `globals.css:27-28`). Valeur = `DESIGN.md:15`.
  - [x] Ajouter (verbatim du mockup, tokenisé) : `.wheel-stage` (relative, 280×280, `margin:0 auto`), `canvas.wheel` (block, 280×280, `border-radius:50%`, ombre `0 18px 40px -18px rgba(0,120,212,.6), inset 0 0 0 8px #fff`), `.pointer` (triangle `border-top:22px solid var(--gold)`, `top:-4px`, centré, `z-index:3`), `.hub` (64px, blanc, `🎡`, centré, `z-index:2`).
  - [x] Ajouter le **placeholder** `.day .slot` (style discret « à tirer » : pointillé/atténué, centré, `margin-top:auto` pour aligner comme les badges). Ajouter `.reveal` (région live : texte centré, lisible).
  - [x] Ajouter `@keyframes pop { from{transform:scale(.3);opacity:0} to{transform:scale(1);opacity:1} }` ; appliquer le **pop au scope `.day.justpicked .av-lg`** (pas à tous les `.av-lg`, pour éviter un re-pop parasite au re-render — déviation justifiée vs mockup, voir Dev Notes) : `animation: pop .4s cubic-bezier(.2,1.3,.5,1)`. `.day.justpicked { box-shadow: 0 0 0 3px var(--gold); transform: translateY(-3px); }`.
  - [x] **Reduced-motion** (AC-5) : dans le bloc `@media (prefers-reduced-motion: reduce)` **existant** (`globals.css:967`), neutraliser `.day.justpicked .av-lg { animation: none; }` et le `transform`/halo du `.justpicked` (`box-shadow:none; transform:none;`).
  - [x] **Aucune** règle ne casse la grille `.timeline` 5.3 (l'ajout est additif).

- [x] **T7 — Tests purs (NEW `tests/wheel.unit.test.ts`) + extension timeline** (AC: 10)
  - [x] Créer `daily-wheel/tests/wheel.unit.test.ts` (`describe`/`it` FR, fabriques en haut, env `node`). Couvrir 10(a)-(e) : `segmentAngle` (dont `n=1`) ; `easeOutCubic` (0/1/monotonie sur un échantillon) ; `finalAngle` (alignement du centre du segment sous `-π/2` modulo 2π pour plusieurs `targetIdx`/`n` ; `end > current` ; ≥ `turns`) ; `buildWheelSegments` (1 segment/ligne, ordre, `colorIndex` cohérent avec `colorForIndex`) ; `targetIndexInRemaining`.
  - [x] Étendre `daily-wheel/tests/timeline.unit.test.ts` : cas 10(f) — `revealedCount = 0` ⇒ toutes ouvrées `pending` ; `=1` ⇒ 1ʳᵉ ouvrée `working`, reste `pending` ; `= nb ouvrés` ⇒ toutes `working` ; **absent ⇒ tout `working`** (prouve la rétro-compat) ; les `weekend`/`blocked` restent rendus à tout `revealedCount`.

- [x] **T8 — Vérification non-régression** (AC: 8, 11)
  - [x] `npx vitest run tests/schedule.golden.test.ts` → **2/2 vert sans modification** (domaine intact, AD-12).
  - [x] `npx vitest run tests/timeline.unit.test.ts` → les 18 cas 5.3 + nouveaux verts (rétro-compat `revealedCount`).
  - [x] `npx tsc --noEmit` → **0** · `npx eslint .` → **0** · `npm test` → **toute** la suite verte · `npm run build` → **OK** (page `/`).
  - [x] ⚠ **Contrôle pixel/interaction navigateur** : le rendu canvas et l'animation **ne sont pas couverts par Vitest** (pas de jsdom/canvas mock dans le projet — cf. 5.3). La géométrie/easing/segments/placeholder sont prouvés par tests purs ; le **spin réel, le `pop`, le `prefers-reduced-motion`, le focus clavier et l'`aria-busy`** exigent une **passe humaine** (`npm run dev`, lancer un tirage, vérifier l'arrêt sur le bon animateur, le retrait du segment, le remplissage, l'annonce live, puis OS en reduced-motion). À mentionner dans les Completion Notes et l'objet du `code-review`.

## Dev Notes

### Périmètre & principe directeur — ce que 5.4 fait et NE fait PAS
- **Évolution, pas réécriture** (Epic 5, `epics.md:138-141`, `:398`). 5.4 ajoute la **mise en scène** du planning déjà calculé : une roue canvas qui **révèle** l'animateur EDF de chaque jour. `generateSchedule` reste **la source de vérité** et **n'est pas touché** (AC-8, AD-1/AD-12). **UX-DR9 (sacré) : la roue RÉVÈLE, elle ne re-tire pas** — l'angle final est calculé pour s'arrêter sur le segment déjà désigné par l'EDF.
- **STRICTEMENT HORS PÉRIMÈTRE 5.4 (différés, ne pas anticiper)** — voir AC-9 :
  - **Sélecteur de mode `role="tablist"` + enchaînement auto ~0,6 s + libellés CTA évolutifs + message « Rotation complète ! » + reset au changement de mode** → **5.5**. En 5.4, **un seul bouton** (texte inchangé) ; **une activation = une révélation** (baseline « jour le jour »). Ne PAS ajouter de tablist ni d'auto-chaining.
  - **Persistance de la rotation (reprise après reload / autre poste)** → **5.6** (flag archi #2). En 5.4, l'état de révélation est **éphémère et local** ; un reload efface la rotation (comme `schedule` aujourd'hui).
  - **Exports Slack/CSV** → **5.7**.
  - **Microcopie/branding figés** (« Lancer la roue », pré-tirage « On fait tourner ? », fin « Chacun anime une fois », mark 🎡 favicon/header) → **5.8**. **Conserver le bouton « 🎲 Lancer la sélection » tel quel** (`ScheduleResult.tsx:40`). Le message de révélation reste **factuel** (« {prénom} animera le standup du {jour} {date} ») — pas de wording « marketing » figé ici.
  - **Clic chip → popover d'édition + nudge « relancer la roue »** → **5.9**.

### DÉCISION D'ARCHITECTURE CENTRALE de 5.4 — où vit l'état de révélation ?
**Problème.** La roue (qui tourne) ET la timeline (cellules « à tirer » → remplies) doivent partager **un même curseur de révélation** `revealedCount`. Aujourd'hui (post-5.3), `ScheduleResult` calcule `schedule` (via store) et `ScheduleTimeline` rend **tout** le planning d'emblée. `generate()` **repose un nouveau seed à chaque appel** (`participants-store.tsx:677`) → on **ne peut pas** régénérer à chaque spin (le plan changerait sous nos pieds).

**Décision (tranchée).**
1. **Séparer « calculer » de « révéler ».** `generate()` (store, inchangé) calcule le plan **une fois** ; la **révélation** est une **machine à états UI** par-dessus `schedule.planning`.
2. **`revealedCount` vit dans `ScheduleResult`** (état local `useState`), **pas dans le store** (éphémère ; la persistance est l'objet de 5.6/flag #2). `ScheduleResult` orchestre : il passe `revealedCount` + `onRevealed` + `spinNonce` à `<SpinWheel>` et `revealedCount` + `justRevealedDate` à `<ScheduleTimeline>`.
3. **La roue est « bête »** : composant **piloté par props** (`SpinWheel`), sans store ni domaine (AD-11). Il dessine `segments.slice(revealedCount)`, anime vers le segment cible, et **remonte** la fin via `onRevealed`.
4. **Le flux jour-par-jour** réutilise l'ordre **chronologique** de `planning` (le domaine `push` dans l'ordre de `cur` — `schedule.ts:168`), donc `planning[revealedCount]` = « jour courant ».

Cela : (1) ne touche **pas** `generateSchedule`/golden (AD-12) ; (2) isole tout le **pur** (`wheel.ts`, extension `timeline.ts`) → testable en `node` ; (3) garde la roue découplée (props in / event out), prête à être pilotée par le **mode selector de 5.5** sans réécriture. C'est l'évolution minimale conforme.

### Qui est sur la roue ? (« participant disponible » = animateur du planning)
- AC-1/AC-3 disent « un segment par participant **disponible** » + « chacun une fois ». **Opérationnellement, les segments = les animateurs du `planning`** (`schedule.planning.map(r => r.participantId)`), chacun apparaissant **exactement une fois** (invariant rotation one-shot, `:310`, et Story 5.2 : nb sessions = nb disponibles). Les **non-planifiés** (`schedule.unscheduled`, cas rare) **ne sont PAS** sur la roue (ils n'ont aucun slot à révéler) — ils restent signalés par l'**avertissement 4.3** (inchangé). Cela garantit que la roue **se vide exactement** quand la rotation est complète (AC-3).
- **Couleur** : index = position dans `participants.filter(p => p.active)` (ordre du store) via `buildColorIndexMap` ; un animateur garde **la même couleur** sur la roue, l'avatar et la timeline (AC-7) — même si certains actifs sont non-planifiés, leur présence dans la base d'index ne décale rien (l'index est par `id`).

### Mécanique d'animation — réplique fidèle du mockup (pure + imperative)
- **Source** : `mockups/spin-rotation.html` — `drawWheel(rot)` (l. 438-465), `spinTo(targetIdx, cb)` (l. 469-484), `easeOut` (l. 467), `fillDay` (l. 409-417). Le subagent UX a extrait le détail verbatim (cf. References).
- **Pure (testable, `lib/ui/wheel.ts`)** : `segmentAngle`, `easeOutCubic`, `finalAngle` (le calcul `desired`/`end`), `buildWheelSegments`, `targetIndexInRemaining`. C'est le **cœur correct** : on prouve que l'angle final **aligne le segment ciblé sous le pointeur** (UX-DR9) sans jamais tirer au hasard.
- **Imperative (composant, `SpinWheel.tsx`)** : le `requestAnimationFrame`, le `2100 ms`, `clearRect`/`arc`/`fillText`, le DPR 2, et la branche `prefers-reduced-motion`. **Non testable** par Vitest (pas de canvas/jsdom) → passe humaine (T8).
- **`turns` injecté** : `(4 + (revealedCount % 3)) * 2π` côté composant (varie l'effet sans paraître répétitif, mockup l. 472). La fonction pure reçoit `turns` en argument → **déterministe et testable** (pas de `Math.random` dans le cœur).

### Accessibilité (UX-DR13) — décisions
- **Canvas `aria-hidden="true"`** : un canvas n'est pas lisible par lecteur d'écran. L'info passe par (a) la **région live** `role="status" aria-live="polite"` (message « {prénom} animera… »), (b) la **timeline** (cellule remplie, prénom en clair). Le pointeur/hub sont aussi `aria-hidden` (décoratifs).
- **Clavier (AC-6)** : le déclencheur **est le bouton CTA natif** — `<button>` gère nativement focus + Entrée/Espace. On **ne rend PAS** le canvas focusable (anti-pattern : un élément `aria-hidden` ne doit pas être dans l'ordre de tabulation). C'est la lecture correcte de « la roue est actionnable au clavier » : l'**action** (lancer le spin) est au clavier via le CTA.
- **`aria-busy`** : sur le CTA pendant l'animation (+ `disabled`). Évite le double-déclenchement et signale l'état occupé.
- **Couleur jamais seule (AC-7)** : les `pending` ne révèlent **aucune** info animateur (ni couleur ni nom) ; les `working` nomment l'animateur en clair (`.who`) en plus de la pastille.
- **`prefers-reduced-motion`** : double garde — **JS** (saut d'angle, pas de RAF) **et CSS** (neutralise pop/halo). Les deux nécessaires : le CSS seul ne stoppe pas la boucle canvas (le subagent a relevé cette lacune du mockup).

### Forme du résultat & store — ce que le composant lit (lecture obligatoire faite)
- `ScheduleRow = { date: string /*YMD*/; participantId: string; name: string }` ; `ScheduleResult = { planning: ScheduleRow[]; unscheduled: {id;name}[] }` (`schedule.ts:48-58`). `planning` est **chronologique** (`push` dans l'ordre de `cur`, `schedule.ts:168`).
- `generate()` (`participants-store.tsx:655-679`) : assemble actifs+indispos+contraintes, **tire un seed aléatoire** (`Math.random` autorisé hors domaine, AD-2), pose `schedule` via `setSchedule`. **Aucune persistance** (reload efface — attendu). 5.4 **ne modifie pas** `generate()`.
- Le store expose via `useParticipants()` : `schedule`, `generate`, `participants` (avec `.active`). La base d'index couleur = `participants.filter(p => p.active)`, **exactement** ce que 5.3 utilise (`ScheduleTimeline.tsx:20`) et ce que `generate()` envoie au domaine (`:656`).

### Fichiers à TOUCHER
- **NEW** `daily-wheel/lib/ui/wheel.ts` — géométrie/animation **pure** (segments, angles, easing). Voisin de `lib/ui/timeline.ts`/`participant-colors.ts` (convention `lib/ui/` = helpers UI purs testés en node).
- **NEW** `daily-wheel/components/SpinWheel.tsx` — canvas piloté par props (`'use client'`).
- **NEW** `daily-wheel/tests/wheel.unit.test.ts` — tests purs roue.
- **UPDATE** `daily-wheel/lib/ui/timeline.ts` — type `pending` + param **optionnel** `revealedCount` (additif, rétro-compatible).
- **UPDATE** `daily-wheel/components/ScheduleResult.tsx` — orchestrateur révélation (état local + CTA→spin + région live), **périmètre 4.3 conservé**, **texte bouton inchangé**.
- **UPDATE** `daily-wheel/components/ScheduleTimeline.tsx` — props `revealedCount`/`justRevealedDate` ; rendu `pending` (« à tirer ») + classe `justpicked`.
- **UPDATE** `daily-wheel/app/globals.css` — token `--gold` + styles roue/pointeur/hub + `.slot` + `.reveal` + `@keyframes pop`/`.justpicked` + extension reduced-motion.
- **UPDATE** `daily-wheel/tests/timeline.unit.test.ts` — cas `revealedCount`/`pending` (rétro-compat incluse).

### Fichiers à NE PAS TOUCHER (régression interdite)
- `daily-wheel/lib/domain/*` — domaine GELÉ (golden). **Aucune** modification (AC-8, AD-1/AD-12).
- `daily-wheel/lib/ui/participant-colors.ts` — **CONSOMMÉ tel quel** (contrat couleur partagé). Ne rien y ajouter.
- `daily-wheel/tests/schedule.golden.test.ts` & `schedule.unit.test.ts` — garde-fous parité, inchangés (T8).
- `daily-wheel/lib/store/participants-store.tsx` — **lecture seule** via `useParticipants()` ; `generate()` **non modifié** (pas de persistance en 5.4 ; c'est 5.6).
- Le **texte du bouton** (`ScheduleResult.tsx:40`) — gelé par 5.8.

### CSS de référence (mockup → tokens projet) — à ajouter dans globals.css
```css
:root { --gold: #f59e0b; } /* (à fusionner dans le :root existant, après --gold-border) */

/* ── Roue animée (Story 5.4 — UX-DR9 ; valeurs reprises du mockup spin-rotation.html) ── */
.wheel-stage { position: relative; width: 280px; height: 280px; margin: 0 auto 1rem; }
.wheel { display: block; width: 280px; height: 280px; border-radius: 50%;
  box-shadow: 0 18px 40px -18px rgba(0,120,212,.6), inset 0 0 0 8px #ffffff; }
.pointer { position: absolute; top: -4px; left: 50%; transform: translateX(-50%);
  width: 0; height: 0; border-left: 13px solid transparent; border-right: 13px solid transparent;
  border-top: 22px solid var(--gold); filter: drop-shadow(0 3px 3px rgba(0,0,0,.2)); z-index: 3; }
.hub { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
  width: 64px; height: 64px; border-radius: 50%; background: #fff; z-index: 2;
  display: grid; place-items: center; font-size: 1.5rem; box-shadow: 0 4px 12px rgba(15,23,42,.18); }
.reveal { text-align: center; font-size: .95rem; color: var(--text-color); margin: .25rem 0 .75rem; min-height: 1.4em; }
.day .slot { font-size: .72rem; color: var(--text-muted); border: 1px dashed var(--border);
  border-radius: 8px; padding: 8px 6px; margin-top: auto; align-self: stretch; }

@keyframes pop { from { transform: scale(.3); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.day.justpicked .av-lg { animation: pop .4s cubic-bezier(.2,1.3,.5,1); }
.day.justpicked { box-shadow: 0 0 0 3px var(--gold); transform: translateY(-3px); }
```
> `#eef4fb` (disque vide), `#ffffff`, `rgba(...)` d'ombres = littéraux cosmétiques repris verbatim du mockup (comme les gris de hachure de 5.3) — acceptables. Le reste passe par les tokens.
> **Reduced-motion** (à ajouter dans le bloc `@media (prefers-reduced-motion: reduce)` existant l. 967) :
> ```css
> .day.justpicked .av-lg { animation: none; }
> .day.justpicked { box-shadow: none; transform: none; }
> ```

### Architecture compliance (ARCHITECTURE-SPINE.md)
- **AD-1 (domaine feuille pur)** : `lib/ui/wheel.ts` + extension `timeline.ts` sont des feuilles UI **pures** (aucun React/DOM) qui **consomment** le domaine ; `SpinWheel`/`ScheduleResult` sont la couche UI. Dépendances descendantes (UI → domaine), jamais l'inverse (`:48-67`).
- **AD-2 (aléa injecté)** : aucun hasard ne décide du gagnant pendant l'animation (UX-DR9) ; `turns` (cosmétique) est dérivé de `revealedCount`, pas de `Math.random`. Le seul `Math.random` reste celui de `generate()` (store, hors domaine, inchangé).
- **AD-3 (prédicat unique)** : la timeline ne crée **aucun** nouveau prédicat ; `pending` est un état d'affichage d'un jour **déjà** dans `planning` (donc déjà « slot » selon le domaine). Préservé comme en 5.3.
- **AD-11 (Supabase via lib/data uniquement)** : `SpinWheel` n'a **aucun** accès données (props only) ; `ScheduleResult` ne touche QUE le store (`useParticipants`), aucun `supabase.from` (`:139-143`).
- **AD-12 (golden parité)** : domaine intact ⇒ golden vert sans modification (`:145-149`, T8).
- **Convention dates** (`:190`) : YMD locales ; affichage via les formatteurs FR purs de 5.3 (`weekdayShortFr`/`dayOfMonth`/`monthShortFr`) ou `formatDateFr`. Aucun `toISOString()`/UTC.
- **Langue/format FR 100 %** (`:197`, NFR4) : « à tirer », « {prénom} animera le standup du {jour} {date} », jours/mois FR.
- **Stack** (`:199-211`) : Next 16 / React 19 / TS 5.1+ / Vitest. `'use client'` requis pour `SpinWheel` (canvas + RAF + `matchMedia`) et `ScheduleResult` (déjà client). `npm test` = `vitest run --no-file-parallelism`.

### Intelligence stories précédentes
- **4.2** (`f3bf2bd`) : algo EDF + `planning` chronologique — socle consommé (lecture seule). `planning[k]` = k-ᵉ jour ouvré.
- **4.3** (`232bf3f`) : `ScheduleResult.tsx` (bouton + compteur + avertissement + états vides). 5.4 fait évoluer **ce** composant en orchestrateur ; AC-8 protège son périmètre (bouton/compteur/avertissement/états vides inchangés).
- **5.1** (review) : la carte Résultat est montée `app/page.tsx:88-95` (section `#surface-spin`). 5.4 rend la roue **dans** cette section, au-dessus de la timeline.
- **5.2** (`6a6c2ab`) : horizon étendu — la rotation peut couvrir **plusieurs semaines** ⇒ la roue révèle potentiellement de nombreux jours ; le baseline « une révélation par activation » tient quel que soit le nombre de slots.
- **5.3** (`56e1ef5`, baseline 5.4) : a posé **explicitement le contrat couleur partagé pour la roue** (`participant-colors.ts:4-7` : « La roue (5.4) DOIT réutiliser cette même palette et la même base d'index »). 5.4 **honore** ce contrat sans le réécrire. La timeline 5.3 (`buildTimeline`, grille `auto-fit`) est **étendue** (param `revealedCount` additif), pas remplacée. Les 18 tests purs 5.3 doivent **rester verts** (rétro-compat `revealedCount` absent ⇒ tout révélé). 5.3 a aussi documenté que le **placeholder « à tirer » et le `pop` appartiennent à 5.4** (`5-3-...md:111-112`) — c'est exactement le périmètre ici.

### Project Structure Notes
- App Next dans `daily-wheel/` ; alias `@/*` → `daily-wheel/*`. Helpers UI purs sous `lib/ui/` (`stepper.ts`, `timeline.ts`, `participant-colors.ts`), formatage sous `lib/format/`, tests sous `tests/` (`*.unit.test.ts`).
- **Aucun test de composant React** (pas de jsdom/testing-library/canvas-mock) → la couverture 5.4 porte sur les **feuilles pures** (`wheel.ts`, extension `timeline.ts`). Le canvas/animation/a11y interactive sont vérifiés par **build + contrôle humain** (T8) — même posture que 5.3.
- Commandes (depuis `daily-wheel/`) : `npm test`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 (l. 138-141, 398) ; #Story 5.4 (l. 453-468) ; #Story 5.5 (l. 470-483, périmètre différé)]
- [Source: …/ux-designs/ux-SpinThatWeeklyWheel-2026-06-23/DESIGN.md#palette wheel-segments (l. 24-32) ; #--gold #f59e0b (l. 15) ; #roue/pointeur/hub (l. 136-147) ; #do's : animation concentrée sur la roue, couleur stable, respecter reduced-motion (l. 179-183)]
- [Source: …/EXPERIENCE.md#UX-DR9 « la roue révèle le résultat EDF, ne re-tire pas » (l. 83-86) ; #UX-DR13 « canvas aria-hidden + région live role=status, couleur jamais seule, clavier, reduced-motion » (l. 115-118) ; #Spin clic CTA→ease-out (l. 106) ; #voix/ton révélation (l. 63-68, FIGÉ 5.8)]
- [Source: …/mockups/spin-rotation.html — canvas+pointer+hub (l. 286-289, CSS 131-145) ; `drawWheel(rot)` (l. 438-465) ; `COLORS[i%8]` (l. 340, 353) ; `spinTo`/`desired`/`end`/`turns` (l. 469-475) ; `easeOut` (l. 467) ; RAF frame (l. 476-484) ; retrait segment `remaining.splice` (l. 500-501) ; `fillDay`/`pop`/`justpicked` (l. 186-200, 409-417) ; région live `#reveal` role=status (l. 302, 497, 502) ; reduced-motion CSS (l. 244-246)]
- [Source: …/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-1 (l. 69-73) ; #AD-2 (l. 75-79) ; #AD-3 (l. 81-88) ; #AD-11 (l. 139-143) ; #AD-12 (l. 145-149) ; invariant one-shot/no-hole (l. 310) ; conventions dates/langue (l. 190, 197) ; stack (l. 199-211)]
- [Source: daily-wheel/lib/domain/schedule.ts:48-58 (types GELÉS) ; :168 (push chronologique dans `planning`)]
- [Source: daily-wheel/lib/ui/participant-colors.ts:4-7 (CONTRAT couleur partagé timeline↔roue) ; :10-19 (WHEEL_SEGMENT_COLORS) ; :22-26 (colorForIndex) ; :31-33 (buildColorIndexMap) ; :36-38 (initialOf)]
- [Source: daily-wheel/lib/ui/timeline.ts (TimelineCell + buildTimeline à étendre, additif) ; daily-wheel/tests/timeline.unit.test.ts (18 tests 5.3 à garder verts)]
- [Source: daily-wheel/components/ScheduleResult.tsx:14-75 (orchestrateur ; bouton l.39-41 texte GELÉ ; compteur l.53-58 ; avertissement l.22-34 ; états vides l.47-72) ; ScheduleTimeline.tsx:14-82 (consomme buildTimeline + couleurs ; à étendre revealedCount) ; app/page.tsx:88-95 (montage #surface-spin)]
- [Source: daily-wheel/lib/store/participants-store.tsx:655-679 (generate() : seed aléatoire AD-2, setSchedule, sans persistance — NON modifié) ; :140-141 (schedule/generate exposés)]
- [Source: daily-wheel/app/globals.css:26-28 (--gold-soft/--gold-border ; --gold à AJOUTER) ; :908 (.day.blocked) ; :967-969 (bloc reduced-motion à étendre)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev-story)

### Debug Log References

- `npx vitest run tests/wheel.unit.test.ts` → **15/15** (segmentAngle, easeOutCubic, finalAngle alignement sous pointeur 12h pour n∈{1,2,3,5,8}, buildWheelSegments, targetIndexInRemaining, remainingSegments).
- `npx vitest run tests/timeline.unit.test.ts` → **25/25** (18 cas 5.3 inchangés + 5 cas révélation 5.4 + rétro-compat `revealedCount` absent ⇒ tout révélé + couleurs).
- `npx vitest run tests/schedule.golden.test.ts` → **2/2 sans modification** (domaine intact, AD-12).
- `npx tsc --noEmit` → **0** · `npx eslint .` → **0** · `npm test` → **300/300 sur 30 fichiers** · `npm run build` → **OK** (page `/` compilée, tree `ScheduleResult`→`SpinWheel`+`ScheduleTimeline`).
- Itération eslint : la règle projet `react-hooks/set-state-in-effect` (et `react-hooks/refs`) interdit le `setState`/refs en rendu/effet → refonte de l'orchestration (voir Completion Notes §Déviations).

### Completion Notes List

- **AC-1/AC-2 (roue + révèle≠tire).** `SpinWheel.tsx` (canvas piloté par props) dessine un segment par animateur ; au spin, `finalAngle` (pur) calcule l'angle qui amène le segment de `planning[revealedCount]` sous le pointeur or 12h. La roue **ne tire rien** : aucun `Math.random`/`generateSchedule` pendant l'animation (UX-DR9). Ease-out cubique, 2,1 s, `requestAnimationFrame`.
- **AC-3 (retrait segment).** `remainingSegments(segments, revealedCount)` (pur, testé) retire les révélés ; la roue se redessine (un segment de moins) après chaque révélation et se vide exactement quand la rotation est complète.
- **AC-4 (pop + région live).** La cellule passe `pending`→`working` avec `@keyframes pop` + halo `.justpicked` (~0,9 s) ; annonce dans `<p className="reveal" role="status" aria-live="polite">` (« {prénom} animera le standup du {date} », `formatDateFr`). Canvas + pointeur + hub `aria-hidden`.
- **AC-5 (reduced-motion) — double garde.** JS : `window.matchMedia('(prefers-reduced-motion: reduce)')` → saut direct à l'angle final, sans RAF. CSS : bloc `@media (prefers-reduced-motion: reduce)` neutralise pop/halo. Résultat identique, mouvement supprimé.
- **AC-6 (clavier + aria-busy).** Déclencheur = bouton CTA natif (Entrée/Espace gérés par le navigateur) ; canvas non focusable (`aria-hidden`). CTA `disabled` + `aria-busy={busy}` pendant l'animation.
- **AC-7 (couleur partagée).** Réutilisation stricte de `buildColorIndexMap`/`colorForIndex`/`WHEEL_SEGMENT_COLORS` (5.3) — aucune nouvelle palette. Une personne garde sa couleur roue/avatar/timeline.
- **AC-8 (périmètre protégé).** `lib/domain/` non touché → golden 2/2 sans modification. Bouton « 🎲 Lancer la sélection » inchangé (gelé 5.8). Compteur/avertissement/états vides 4.3 conservés à l'identique.
- **AC-10/AC-11 (tests + non-régression).** +20 tests purs (15 wheel + 5 timeline) ; `buildTimeline` étendu rétro-compatible (les 18 tests 5.3 restent verts). tsc 0 · eslint 0 · 300/300 · build OK.
- **Déviations assumées vs spec de la story (contraintes lint / qualité, dans le périmètre) :**
  1. **Auto-spin du 1er jour SANS effet.** La story prévoyait un `useEffect` (`pendingSpin`) ; la règle projet `react-hooks/set-state-in-effect` l'interdit. Remplacé par le pattern React sanctionné « **ajuster l'état pendant le rendu** » (garde `prevSchedule`) : reset de la révélation + amorçage du 1er spin dès qu'un nouveau plan est prêt. Comportement net : **un clic** (re)génère ET lance la 1re révélation ; chaque clic suivant révèle le jour suivant (baseline ; 5.5 ajoutera les modes).
  2. **Déclenchement du spin par `spinNonce` (state)**, incrémenté uniquement depuis des gestionnaires d'évènement / le pattern de rendu — jamais depuis un effet. `onRevealed` est appelé depuis la boucle rAF (ou le chemin reduced-motion), pas depuis un effet.
  3. **Ordre d'affichage de la roue = par `colorIndex`** (ordre stable des actifs), extrait en helper PUR `remainingSegments` (testé). L'ordre de **révélation** reste chronologique (`planning`). ⇒ la roue garde une disposition fixe et s'arrête à des positions **variées** (plus théâtral) tout en révélant le bon animateur EDF.
  4. **`pop`/halo scopés à `.day.justpicked .av-lg`** (et non à tout `.av-lg`) pour éviter un re-pop parasite au re-render — déviation vs mockup, justifiée par le rendu React.
- **⚠ Contrôle navigateur NON exécuté (job sans navigateur/jsdom/canvas).** Le cœur (géométrie/easing/segments/cible/projection placeholder) est prouvé par 20 tests purs ; le build Next compile la page entière. **Restent à vérifier en passe humaine** (`npm run dev`) : le spin réel s'arrête bien sur l'animateur annoncé, le retrait de segment, le `pop`+halo, le saut sous `prefers-reduced-motion`, le focus clavier et l'`aria-busy`. C'est aussi l'objet du `code-review`.

### File List

- `daily-wheel/lib/ui/wheel.ts` — **NEW** : cœur PUR de la roue — `WheelSegment`, `buildWheelSegments`, `segmentAngle`, `easeOutCubic`, `finalAngle` (révèle≠tire), `targetIndexInRemaining`, `remainingSegments`. Réutilise le contrat couleur 5.3.
- `daily-wheel/components/SpinWheel.tsx` — **NEW** : roue `<canvas>` (`'use client'`) pilotée par props (RAF, DPR 2, branche reduced-motion, `aria-hidden`). Aucun store/domaine (AD-11).
- `daily-wheel/tests/wheel.unit.test.ts` — **NEW** : 15 tests purs (géométrie, easing, cible, segments, restants).
- `daily-wheel/lib/ui/timeline.ts` — **MODIFIÉ** : type de cellule `pending` + param **optionnel** `revealedCount` (additif, rétro-compatible) ; AD-3 préservé (aucun nouveau prédicat).
- `daily-wheel/components/ScheduleResult.tsx` — **MODIFIÉ** : orchestrateur de la révélation (`revealedCount`/`spinNonce`/`busy`/`autoSpin`/`justRevealedDate`/`revealMessage`), CTA→spin (texte inchangé, `aria-busy`), région live, montage `<SpinWheel>` + `<ScheduleTimeline revealedCount/justRevealedDate>`. Périmètre 4.3 conservé. Reset/auto-spin via pattern de rendu (pas d'effet).
- `daily-wheel/components/ScheduleTimeline.tsx` — **MODIFIÉ** : props `revealedCount`/`justRevealedDate` ; rendu cellule `pending` (« à tirer ») + classe `justpicked`. Couleurs/initiale réutilisées tel quel.
- `daily-wheel/tests/timeline.unit.test.ts` — **MODIFIÉ** : 5 cas révélation 5.4 (pending/working selon `revealedCount`, rétro-compat absent, WE/bloqués toujours rendus).
- `daily-wheel/app/globals.css` — **MODIFIÉ** : token `--gold` + `.wheel-stage`/`.wheel`/`.pointer`/`.hub` + `.day .slot` (« à tirer ») + `.reveal` + `@keyframes pop`/`.day.justpicked` + neutralisation pop/halo dans le bloc reduced-motion.

### Change Log

- 2026-06-23 — Story 5.4 contextée (Amelia/create-story) : décision d'archi (séparer « calculer » de « révéler » ; `revealedCount` local à `ScheduleResult` ; roue = composant pur-piloté `SpinWheel` ; cœur géométrie/easing/segments extrait pur dans `lib/ui/wheel.ts` ; `buildTimeline` étendu d'un état `pending` additif/rétro-compatible). Contrat couleur 5.3 réutilisé tel quel, domaine/golden intacts (AC-8), UX-DR9 « révèle≠retire » au cœur, double garde reduced-motion (JS+CSS), microcopie/modes/persistance/exports différés (5.5→5.9). Statut → ready-for-dev.
- 2026-06-23 — Story 5.4 implémentée (Amelia/dev-story) : `lib/ui/wheel.ts` (cœur pur révèle≠tire, 15 tests) ; `SpinWheel.tsx` (canvas RAF + reduced-motion + aria-hidden, piloté par props) ; `buildTimeline` étendu (`pending`/`revealedCount`, rétro-compat) ; `ScheduleResult` orchestrateur (reset + auto-spin via pattern de rendu — pas d'effet, contrainte `react-hooks/set-state-in-effect`) ; `ScheduleTimeline` placeholder « à tirer » + halo `justpicked` ; CSS roue/pointeur/hub/pop. Contrat couleur 5.3 réutilisé, domaine/golden intacts (golden 2/2). +20 tests purs ; tsc 0 · eslint 0 · vitest 300/300 (30 fichiers) · build OK. Contrôle navigateur (spin/pop/reduced-motion/clavier) recommandé en passe humaine. Statut → review.
