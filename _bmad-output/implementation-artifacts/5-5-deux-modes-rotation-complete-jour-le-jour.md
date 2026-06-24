---
baseline_commit: 88871173f9c21c109adb2457b40b461e74a9e436
---
# Story 5.5: Deux modes — Rotation complète / Jour le jour

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want choisir entre **tout révéler d'un coup** ou **un jour à la fois**,
so that j'adapte le rituel : planning de la semaine vs suspense quotidien au standup (FR16, axe A).

## Acceptance Criteria

> Reformulées depuis `epics.md#Story 5.5` (l. 470-483) et la spec autoritaire `EXPERIENCE.md` (l. 83-84 enchaînement ~0,6 s ; l. 61-75 microcopie ; l. 102 reduced-motion ; l. 104/107 tablist + reset ; l. 115-117 a11y) / `DESIGN.md` (l. 145-155 sélecteur `.modes`) / `mockups/spin-rotation.html` (l. 294-297 markup tablist, l. 508-545 logique `runRotation`/`runDay`/routing, l. 547-581 `resetAll`/`setMode`). Chaque AC porte un ID pour le suivi des tâches. **Principe directeur Epic 5 (`epics.md:138-141`, `:398`) : ÉVOLUTION, pas réécriture — `generateSchedule` reste la SOURCE DE VÉRITÉ ; la roue n'est qu'une MISE EN SCÈNE du résultat EDF (animation et planning coïncident TOUJOURS — UX-DR9). 5.5 ne fait qu'orchestrer le RYTHME de la révélation ; elle ne touche NI le domaine, NI la géométrie de la roue, NI la projection timeline.**

**AC-1 — Sélecteur de mode `role="tablist"` à deux onglets (DESIGN.md:145-155, mockup:294-297, EXPERIENCE.md:104).** La section Spin affiche, **au-dessus du CTA de tirage**, un sélecteur `<div role="tablist" aria-label="Mode de sélection">` contenant **exactement deux** boutons `role="tab"` : **« Rotation complète »** et **« Jour le jour »** (libellés au mot près). L'onglet actif porte `aria-selected="true"` (+ classe visuelle active : fond blanc, texte `{colors.primary}`, ombre douce) ; l'inactif `aria-selected="false"` (texte muted, fond transparent). **Le mode par défaut au montage est « Rotation complète »** (`mockup:295` — `modeWeek` porte `aria-selected="true"`). Voir Dev Notes §« Décision : mode par défaut ».

**AC-2 — Navigation clavier du tablist (EXPERIENCE.md:104, a11y).** Le sélecteur est pilotable au clavier selon le pattern ARIA tablist : **flèches ← / →** déplacent la sélection entre les deux onglets (et activent le mode), **Entrée/Espace** activent l'onglet focalisé, le focus est visible (`outline 2px {colors.primary}`). Les deux onglets restent atteignables au `Tab` dans un ordre logique (sélecteur → CTA). Aucun mode n'est verrouillé (cohérent avec la navigation non bloquante de 5.1).

**AC-3 — Mode « Rotation complète » : enchaînement automatique jour par jour, ~0,6 s (epics.md:480, EXPERIENCE.md:83-84, mockup:508-522).** En mode « Rotation complète », activer le CTA **(re)génère le plan si besoin** puis **enchaîne automatiquement les révélations, un jour ouvré après l'autre**, avec un **délai de ~600 ms entre la fin d'un spin et le départ du suivant** (chaque spin garde sa durée ~2,1 s ease-out héritée de 5.4 — AC inchangé). Le CTA est **désactivé (`disabled` + `aria-busy="true"`) pendant toute la séquence**. La roue retire chaque animateur révélé (invariant 5.4 inchangé) et chaque cellule de la timeline se remplit dans l'ordre. À la fin, **toute la timeline est remplie** et un **message de fin** est annoncé en région live : **« Rotation complète ! Chacun anime une fois. »** (`epics.md:480`, `EXPERIENCE.md:68`).

**AC-4 — Mode « Jour le jour » : une révélation par clic, CTA évolutif (epics.md:481, mockup:524-539).** En mode « Jour le jour », **chaque activation du CTA révèle UN SEUL jour** — le suivant dans l'ordre chronologique des slots (`planning[revealedCount]`) — puis le CTA redevient actif (aucun enchaînement). Le **libellé du CTA évolue** au mot près :
- avant tout tirage (`revealedCount === 0`) → **« Tirer le premier jour »** ;
- entre deux jours (`0 < revealedCount < planningLen`) → **« Tirer le jour suivant »** ;
- rotation terminée (`revealedCount === planningLen`) → **« ✓ Rotation complète »**, CTA **désactivé**.

**AC-5 — Libellés du CTA en mode « Rotation complète » (mockup:299/514, EXPERIENCE.md:63-64).** En mode « Rotation complète », le libellé du CTA est : **« Lancer la rotation »** quand aucune rotation n'est en cours et que rien n'est encore révélé (`revealedCount === 0`) ; **« Relancer la rotation »** une fois la rotation terminée (`revealedCount === planningLen`) ; pendant l'enchaînement, le bouton est désactivé (le texte peut rester « Lancer la rotation »). Le **préfixe emoji** du CTA suit la décision de branding **Story 5.8** — voir Dev Notes §« Emoji & microcopie (frontière 5.8) ».

**AC-6 — Changer de mode réinitialise PROPREMENT la rotation (epics.md:482, EXPERIENCE.md:107, mockup:547-569).** Basculer d'un onglet à l'autre **réinitialise la rotation en cours** : `revealedCount` revient à `0` (roue redessinée avec **tous** les segments, timeline entièrement repassée en cellules `pending` « à tirer »), toute **séquence d'enchaînement en cours est annulée** (timer `~600 ms` nettoyé), `busy` repasse à `false`, le halo `justpicked` et le message de révélation sont remis à l'état initial. **Le plan (`schedule`) lui-même n'est PAS recalculé** par un simple changement de mode : seul le **curseur de révélation** est remis à zéro (le re-tirage reste l'affaire du CTA « (Re)lancer »). Aucune réinitialisation silencieuse du planning.

**AC-7 — Région live conservée, annonce par jour + message de fin (EXPERIENCE.md:67/68/115).** Chaque jour révélé reste annoncé dans la **région live existante `role="status" aria-live="polite"`** au format hérité de 5.4 : **« {prénom} animera le standup du {jour} {date} »**. À la complétion (dans les **deux** modes), le message de fin **« Rotation complète ! Chacun anime une fois. »** est annoncé. Le `<canvas>` reste `aria-hidden` (l'info passe par la région live + la timeline). La couleur n'est jamais le seul signal (badges/texte hérités — UX-DR13).

**AC-8 — `prefers-reduced-motion` respecté dans les deux modes (EXPERIENCE.md:102, UX-DR13, sacré a11y).** Sous `prefers-reduced-motion: reduce` :
- **Mode « Rotation complète »** : la rotation se résout **immédiatement, sans spins animés ni délai de 600 ms** — la timeline se remplit d'un coup et **seul le message de fin** « Rotation complète ! Chacun anime une fois. » est annoncé une fois (pas de cascade d'annonces ni de halos). Voir Dev Notes §« Reduced-motion en mode auto ».
- **Mode « Jour le jour »** : chaque clic révèle **un** jour **sans rotation animée** (saut direct au résultat, hérité de 5.4) ni `pop`/halo ; une annonce par clic.
Le résultat (segments retirés, cellules remplies, messages) est **identique** au mode animé ; seul le mouvement est supprimé.

**AC-9 — Cœur pur testable extrait + tests (pattern maison 5.2/5.3/5.4).** La logique **décidable** du rythme/des libellés est extraite dans un **module pur** `lib/ui/spin-mode.ts` (aucun import React/DOM/Supabase — esprit AD-1, voisin de `wheel.ts`/`timeline.ts`). Des tests Vitest (env `node`, purs) couvrent :
- (a) `ctaLabelFor(mode, revealedCount, planningLen)` rend les libellés EXACTS des AC-4/AC-5 pour les trois états × deux modes (y compris `revealedCount === 0`, `0 < rc < len`, `rc === len`) ;
- (b) `isRotationComplete(revealedCount, planningLen)` ⇔ `revealedCount >= planningLen` (et `false` si `planningLen === 0`) ;
- (c) `shouldChainNext(mode, revealedCount, planningLen)` ⇒ `true` **seulement** en mode « Rotation complète » tant que `revealedCount < planningLen`, `false` en « Jour le jour » et à la complétion ;
- (d) `CHAIN_DELAY_MS === 600` (constante exportée, valeur figée du mockup `:519`) ;
- (e) `isCtaDisabled(mode, revealedCount, planningLen, busy)` ⇒ `true` pendant `busy`, et `true` en « Jour le jour » une fois `rc === len` (état terminal « ✓ Rotation complète »).

**AC-10 — Périmètre PROTÉGÉ (sacré).** Le **domaine `lib/domain/` n'est PAS touché** ; `lib/ui/wheel.ts`, `lib/ui/timeline.ts`, `components/SpinWheel.tsx` et `components/ScheduleTimeline.tsx` **ne changent PAS de contrat** (5.5 ne fait que piloter `spinNonce`/`revealedCount`/`onRevealed` autrement). Les tests **golden** (`schedule.golden.test.ts`), domaine, `wheel.unit.test.ts`, `timeline.unit.test.ts` restent **verts sans modification** (parité NFR9, AD-12). Le **compteur de sessions**, l'**avertissement non-planifiés** et les **états vides** de 4.3 restent inchangés. La couleur partagée roue↔timeline (contrat 5.3, AC-7 de 5.4) est inchangée.

**AC-11 — Hors-périmètre 5.5 (différés).** Sont **STRICTEMENT différés** et **ne doivent PAS être implémentés ici** : la **persistance** de la rotation/curseur « Jour le jour » (reprise après reload / autre poste) → **Story 5.6** (flag archi #2) ; les **exports Slack/CSV + aperçu** → **5.7** ; le **gel final de la microcopie & du branding** (mark 🎡 vs 🎲, favicon, « Lancer la roue », titres/descriptions contextuels « On fait tourner ? » / « Un jour, un suspense », message d'attente « Le suspense fait partie du job. », tutoiement sobre-joueur) → **5.8** ; le **clic chip → popover d'édition + nudge « relancer la roue »** → **5.9**. 5.5 livre le **mécanisme** des deux modes et les **libellés de CTA évolutifs** (texte au mot près), pas l'habillage éditorial complet.

**AC-12 — Non-régression globale.** `npx tsc --noEmit` → 0 erreur ; `npx eslint .` → 0 erreur ; **toute** la suite Vitest verte (existants 5.2/5.3/5.4 inclus + nouveaux `spin-mode`) ; `npm run build` OK.

## Tasks / Subtasks

- [x] **T1 — Cœur pur du rythme & des libellés (NEW `lib/ui/spin-mode.ts`, pur)** (AC: 3, 4, 5, 9)
  - [x] Créer `daily-wheel/lib/ui/spin-mode.ts` — **PUR** (aucun import React/DOM/Supabase ; esprit AD-1, voisin de `lib/ui/wheel.ts` et `lib/ui/timeline.ts`). Commenter en tête : « 5.5 — rythme de révélation. Pas de logique de planning ici (le domaine reste la source de vérité, UX-DR9) ; ce module ne décide que des LIBELLÉS et du RYTHME (mode, curseur). »
  - [x] Exporter :
    ```ts
    export type SpinMode = 'rotation-complete' | 'jour-le-jour'

    // Délai entre la fin d'un spin et le départ du suivant en mode « Rotation complète ».
    // Valeur figée du mockup (spin-rotation.html:519 → setTimeout(next, 600)).
    export const CHAIN_DELAY_MS = 600

    export function isRotationComplete(revealedCount: number, planningLen: number): boolean
    // revealedCount >= planningLen && planningLen > 0

    // Vrai uniquement en mode auto tant qu'il reste des jours à révéler.
    export function shouldChainNext(mode: SpinMode, revealedCount: number, planningLen: number): boolean

    // Libellé EXACT du CTA selon le mode et l'avancement (voir AC-4/AC-5).
    // NB : le PRÉFIXE emoji (🎡/🎲) est ajouté par le composant et tranché par 5.8 ; ce module
    // renvoie le TEXTE. Décider en Dev Notes si on inclut l'emoji ici (recommandé : oui, 🎡).
    export function ctaLabelFor(mode: SpinMode, revealedCount: number, planningLen: number): string

    // CTA désactivé : pendant une animation/enchaînement (busy) OU état terminal « Jour le jour ».
    export function isCtaDisabled(
      mode: SpinMode, revealedCount: number, planningLen: number, busy: boolean,
    ): boolean
    ```
  - [x] `ctaLabelFor` — tables de vérité (texte au mot près) :
    - `rotation-complete` : `rc === 0` → `« Lancer la rotation »` ; `isRotationComplete` → `« Relancer la rotation »` ; sinon (en cours, bouton désactivé) → `« Lancer la rotation »`.
    - `jour-le-jour` : `rc === 0` → `« Tirer le premier jour »` ; `isRotationComplete` → `« ✓ Rotation complète »` ; sinon → `« Tirer le jour suivant »`.
  - [x] `isCtaDisabled` : `busy === true` ⇒ `true` ; `mode === 'jour-le-jour' && isRotationComplete(rc, len)` ⇒ `true` ; sinon `false`. (En « Rotation complète », le bouton reste **actionnable** après complétion pour « Relancer ».)

- [x] **T2 — Sélecteur de mode `tablist` (UPDATE `components/ScheduleResult.tsx`)** (AC: 1, 2, 6)
  - [x] Ajouter l'état `const [mode, setMode] = useState<SpinMode>('rotation-complete')` (défaut = « Rotation complète », `mockup:295` — voir Dev Notes §« Décision : mode par défaut »).
  - [x] Rendre, **au-dessus du CTA** dans `.schedule-actions` (ou un nouveau conteneur juste avant), le tablist :
    ```tsx
    <div className="modes" role="tablist" aria-label="Mode de sélection">
      <button type="button" role="tab" id="mode-rotation"
        aria-selected={mode === 'rotation-complete'}
        tabIndex={mode === 'rotation-complete' ? 0 : -1}
        className={mode === 'rotation-complete' ? 'sel' : undefined}
        onClick={() => switchMode('rotation-complete')}>
        Rotation complète
      </button>
      <button type="button" role="tab" id="mode-jour"
        aria-selected={mode === 'jour-le-jour'}
        tabIndex={mode === 'jour-le-jour' ? 0 : -1}
        className={mode === 'jour-le-jour' ? 'sel' : undefined}
        onClick={() => switchMode('jour-le-jour')}>
        Jour le jour
      </button>
    </div>
    ```
  - [x] **Navigation clavier** (AC-2) : `onKeyDown` sur le tablist gérant `ArrowLeft`/`ArrowRight` (bascule + focus l'onglet cible) ; le pattern « roving tabindex » (`tabIndex` 0 sur l'actif, -1 sur l'autre) est suffisant pour deux onglets. `Entrée`/`Espace` sont gérés nativement par `<button>`.
  - [x] **`switchMode(next)`** (AC-6) : si `next === mode` → no-op ; sinon `setMode(next)` **et reset propre** (voir T3 `resetReveal()`), **sans** appeler `generate()` (le plan reste). Annuler tout timer d'enchaînement en cours.

- [x] **T3 — Reset propre & orchestration bi-mode (UPDATE `components/ScheduleResult.tsx`)** (AC: 3, 4, 5, 6, 7, 8)
  - [x] Extraire un helper **`resetReveal()`** qui remet `revealedCount = 0`, `busy = false`, `justRevealedDate = null`, `revealMessage = ''`, **annule** `justPickedTimer` **et** le nouveau `chainTimer` (voir ci-dessous). Réutilisé par : le pattern « ajuster pendant le rendu » (reset au nouveau `schedule`, déjà présent l. 54-67) **et** `switchMode`.
  - [x] Ajouter `const chainTimer = useRef<ReturnType<typeof setTimeout> | null>(null)` ; le nettoyer dans le `useEffect` de démontage existant (l. 70-75) à côté de `justPickedTimer`.
  - [x] **`handleSpin` bifurqué par mode** (remplace l. 82-90) :
    - **(re)génération** : si `schedule === null` **ou** `isRotationComplete(revealedCount, planningLen)` → `setAutoSpin(true); generate()`. Le pattern de rendu (l. 54-67) amorce alors le **1er** spin une fois le plan prêt. **Important** : ce qui se passe ensuite dépend du mode (voir `handleRevealed`).
    - **sinon** (plan en cours, mode « Jour le jour » uniquement — en « Rotation complète » le bouton est désactivé pendant l'enchaînement) → `setBusy(true); setSpinNonce(n => n + 1)` (un spin de plus).
  - [x] **`handleRevealed(slotIndex)` étendu** (remplace/étend l. 94-106) — après avoir avancé le curseur, annoncé la révélation, déclenché le halo (logique 5.4 conservée) :
    - calculer `nextCount = slotIndex + 1` ;
    - **mode « Rotation complète »** : si `shouldChainNext('rotation-complete', nextCount, planningLen)` → **garder `busy = true`** et programmer le spin suivant : `chainTimer.current = setTimeout(() => setSpinNonce(n => n + 1), reduced ? 0 : CHAIN_DELAY_MS)` ; sinon (dernier jour) → `setBusy(false)` + `setRevealMessage('Rotation complète ! Chacun anime une fois.')` ;
    - **mode « Jour le jour »** : `setBusy(false)` ; si `isRotationComplete(nextCount, planningLen)` → `setRevealMessage('Rotation complète ! Chacun anime une fois.')` (le CTA passe à « ✓ Rotation complète » via `ctaLabelFor`).
    - `reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches` (lu au moment du chaînage).
  - [x] **Reduced-motion en mode auto** (AC-8) — voir Dev Notes §« Reduced-motion en mode auto » : implémentation recommandée = **délai d'enchaînement à 0 ms** (la cascade `onRevealed` se résout en une poignée de ticks). Variante plus stricte (remplir d'un coup + une seule annonce) documentée en Dev Notes ; choisir la plus simple qui satisfait l'AC.
  - [x] **CTA piloté par le cœur pur** : remplacer le label statique l. 128-130 par `{ctaLabelFor(mode, revealedCount, planningLen)}` (avec préfixe emoji selon §5.8) ; `disabled={!canGenerate || isCtaDisabled(mode, revealedCount, planningLen, busy)}` ; `aria-busy={busy}`.
  - [x] **Région live** : conserver `<p className="reveal" role="status" aria-live="polite">{revealMessage}</p>` (inchangé) ; veiller à ce que le message de fin soit posé une seule fois (pas à chaque frame).
  - [x] **Roue visible** : conserver `{!rotationComplete && <SpinWheel … />}` (inchangé). Après reset (`switchMode`), `revealedCount = 0` ⇒ roue de nouveau visible avec tous les segments.

- [x] **T4 — Styles du sélecteur de mode (UPDATE `app/globals.css`)** (AC: 1)
  - [x] Ajouter `.modes` + `.modes button` + `.modes button.sel` en répliquant `mockups/spin-rotation.html:150-155` avec les tokens existants : conteneur `display:inline-flex; background:#f1f5f9; border-radius:11px; padding:4px; margin-bottom:16px;` ; bouton `border:0; background:none; font-weight:700; font-size:.85rem; color:var(--muted); padding:8px 14px; border-radius:8px; cursor:pointer; transition:all .2s;` ; actif `.sel { background:#fff; color:var(--primary); box-shadow:0 1px 3px rgba(15,23,42,.12); }`. **Réutiliser les variables CSS existantes** (`--primary`, `--muted`, `--font`) ; ne pas réintroduire de couleurs en dur si un token existe. Vérifier que le `:focus-visible` global (`outline 2px var(--primary)`) s'applique aux onglets.
  - [x] Mobile (≤ 520 px) : s'assurer que `.modes` reste lisible (inline-flex, les deux libellés tiennent ; sinon réduire le padding) — NFR5/UX-DR13.

- [x] **T5 — Tests purs `spin-mode` (NEW `tests/spin-mode.unit.test.ts`)** (AC: 9)
  - [x] Créer `daily-wheel/tests/spin-mode.unit.test.ts` (Vitest env `node`, **pur**, style maison : helpers en tête, `describe('… (Story 5.5, AC-9x)')`, assertions explicites — pas de snapshot). Couvrir AC-9 (a)→(e) :
    - `ctaLabelFor` : les 6 cas (2 modes × {rc=0, mid, complete}) avec les libellés EXACTS ;
    - `isRotationComplete` : `len=0` ⇒ false ; `rc=len` ⇒ true ; `rc<len` ⇒ false ;
    - `shouldChainNext` : auto + reste ⇒ true ; auto + complet ⇒ false ; jour-le-jour ⇒ toujours false ;
    - `CHAIN_DELAY_MS === 600` ;
    - `isCtaDisabled` : `busy` ⇒ true (les deux modes) ; jour-le-jour complet sans busy ⇒ true ; rotation-complete complet sans busy ⇒ false (« Relancer » actionnable).
  - [x] Vérifier que `tests/wheel.unit.test.ts` et `tests/timeline.unit.test.ts` **passent sans modification** (AC-10).

- [x] **T6 — Vérification finale & non-régression** (AC: 12)
  - [x] `cd daily-wheel && npx tsc --noEmit` → 0 erreur.
  - [x] `npx eslint .` → 0 erreur.
  - [x] `npm run test` (ou la commande de la suite) → **toute** la suite verte (existants + `spin-mode`).
  - [x] `npm run build` → OK.
  - [x] **Contrôle navigateur recommandé en passe humaine** (le projet n'a pas de tests de composant React) : (a) défaut = « Rotation complète » ; (b) Lancer la rotation → enchaînement ~0,6 s jusqu'au message de fin ; (c) bascule en « Jour le jour » → reset visuel complet (roue pleine, cellules « à tirer ») ; (d) clics successifs « Tirer le premier jour » → « Tirer le jour suivant » → « ✓ Rotation complète » (désactivé) ; (e) flèches ←/→ basculent le mode ; (f) `prefers-reduced-motion` actif → pas de spin animé, résolution immédiate, message de fin annoncé.

## Dev Notes

### État actuel du code (post-5.4) — ce que 5.5 fait évoluer
`components/ScheduleResult.tsx` (HEAD `8887117`) est déjà l'**orchestrateur de la révélation** (commentaire d'en-tête l. 11-20). État local : `revealedCount`, `spinNonce`, `busy`, `justRevealedDate`, `revealMessage`, `autoSpin`, refs `justPickedTimer`. Comportement actuel = **baseline « jour le jour » SANS sélecteur** : un seul bouton **« 🎲 Lancer la sélection »** (l. 128-130) ; `handleSpin` (l. 82-90) régénère si besoin puis amorce un spin via le pattern « ajuster l'état pendant le rendu » (l. 54-67) ; `handleRevealed` (l. 94-106) avance le curseur d'un cran, débloque le CTA, annonce en région live et lance le halo `justpicked` (~900 ms). La roue disparaît dès `rotationComplete` (l. 151). **5.5 remplace le bouton mono-mode par le sélecteur + l'enchaînement automatique**, exactement comme annoncé par l'AC-9 de 5.4 (`5-4-*.md` : « 5.5 remplacera ce déclencheur mono-bouton par le sélecteur de mode + l'enchaînement »).

### Ce qui est PRÉSERVÉ (contrats à ne pas casser)
- **Domaine intact** : aucun appel/modif de `generateSchedule` (sauf `generate()` du store, déjà utilisé). Source de vérité = `schedule.planning` (ordre chronologique). UX-DR9 : la roue révèle, ne tire pas.
- **`SpinWheel` inchangé** : contrat de props `{ segments, revealedCount, onRevealed, spinNonce }` (composant pur piloté). 5.5 ne fait que **piloter `spinNonce` à un rythme différent** et **brancher `onRevealed` sur une logique d'enchaînement**. Le reduced-motion de la roue (saut direct + `onRevealed` immédiat) est déjà géré dans `SpinWheel` (5.4).
- **`buildWheelSegments`, `lib/ui/wheel.ts`, `buildTimeline`, `lib/ui/timeline.ts`, `ScheduleTimeline.tsx`** : **zéro modification**. `revealedCount=0` ⇒ tous segments / toutes cellules `pending` (déjà le cas). Le contrat couleur partagé 5.3 (`participant-colors.ts`) est consommé tel quel.
- **Périmètre 4.3** : compteur de sessions (l. 142-148), avertissement non-planifiés (l. 111-123), états vides (l. 136-176) — logique et texte inchangés.
- **Région live** existante `role="status" aria-live="polite"` (l. 161-163) réutilisée pour les annonces par jour + le message de fin.

### Décision : mode par défaut
La spec UX (**autoritaire**) met `aria-selected="true"` sur **« Rotation complète »** au chargement (`mockups/spin-rotation.html:295`, `setMode` initial l. 583 du mockup). On retient donc **« Rotation complète » comme mode par défaut**, ce qui **change le comportement au premier clic** par rapport à la baseline 5.4 (qui révélait un seul jour) : désormais le premier « Lancer la rotation » enchaîne toute la rotation. C'est conforme à l'intention produit (planning de la semaine d'abord). ⚠ **Question ouverte pour Solo** (voir §Questions) — si l'on préfère « Jour le jour » par défaut, seul l'état initial `useState` change.

### Emoji & microcopie (frontière 5.8)
La microcopie est **figée par la Story 5.8** (`epics.md:483` : « les libellés suivent la microcopie figée (Story 5.8) »), mais 5.5 a **besoin** des libellés de CTA pour exister. On implémente donc les **textes EXACTS déjà spécifiés dans `EXPERIENCE.md`/le mockup** (« Lancer la rotation », « Relancer la rotation », « Tirer le premier jour », « Tirer le jour suivant », « ✓ Rotation complète », message de fin « Rotation complète ! Chacun anime une fois. »). **Recommandation pour le préfixe emoji** : utiliser **🎡** (le mockup l'utilise déjà partout : `:299`, `:514`, `:534`, `:537`, `:555`), ce qui est cohérent puisque 5.5 remplace de toute façon l'ancien bouton 🎲. 5.8 fera la passe de gel finale (mark global 🎡, favicon, et le reste de l'habillage). **Hors-périmètre 5.5** : titres/descriptions contextuels par mode (« On fait tourner ? » / « Un jour, un suspense », `EXPERIENCE.md:61-75`) et message d'attente « Le suspense fait partie du job. » — laissés à 5.8 ; 5.5 garde le message de révélation factuel hérité de 5.4.

### Reduced-motion en mode auto (AC-8)
`SpinWheel` (5.4) sous `prefers-reduced-motion` **saute déjà** à l'angle final et appelle `onRevealed` **immédiatement** (pas de boucle rAF). Il reste à neutraliser le **délai d'enchaînement** de 600 ms côté `ScheduleResult` :
- **Option A (recommandée, minimale)** : `chainTimer = setTimeout(spinNonce++, reduced ? 0 : CHAIN_DELAY_MS)` — la cascade se résout en quelques ticks ; chaque jour passe quand même par `onRevealed`. Simple, peu de code. Risque mineur : annonces `aria-live` rapprochées (acceptable, `polite` coalesce).
- **Option B (stricte « instantané »)** : sous reduced-motion + auto, **remplir d'un coup** (`setRevealedCount(planningLen)`) sans cascade et annoncer **uniquement** le message de fin. Plus fidèle à « pas de cascade d'annonces », un peu plus de code.
Choisir l'option A par défaut ; basculer en B si le contrôle navigateur révèle une cascade d'annonces gênante. Documenter le choix dans les Completion Notes.

### Garde-fous d'implémentation (pièges React)
- **Ne pas** mettre `busy=false` entre deux spins enchaînés en mode auto : le CTA doit rester désactivé toute la séquence (sinon double-clic possible). `busy` ne repasse à `false` qu'à la complétion (ou au reset).
- **Nettoyage** : `chainTimer` ET `justPickedTimer` doivent être annulés à `switchMode`, au reset (nouveau `schedule`) et au démontage — sinon un spin fantôme se déclenche après changement de mode.
- **Conserver le pattern « ajuster l'état pendant le rendu »** (l. 54-67) pour l'amorçage post-`generate()` ; ne pas le convertir en `useEffect` (le projet évite délibérément les setState-in-effect ici). `resetReveal()` est appelé **dans** ce bloc et dans `switchMode`.
- **`handleRevealed` doit voir le `mode` courant** : l'inclure dans les dépendances du `useCallback`, ou lire via une ref si une fermeture obsolète pose problème avec l'enchaînement. Tester le scénario « basculer de mode pendant un enchaînement » (le timer doit être tué).
- **Le cœur pur `spin-mode.ts` ne lit jamais le DOM ni `matchMedia`** : la détection reduced-motion reste **dans le composant** (comme en 5.4). Le module pur ne décide que mode/curseur → libellé/booléens.

### Structure & conventions (rappel architecture)
- Couches (`ARCHITECTURE-SPINE.md:40-46`) : UI (`components/`) → state (`lib/store/`) → data → domaine pur. `lib/ui/` héberge la projection/présentation pure (timeline, wheel, participant-colors) — `spin-mode.ts` s'y range naturellement (pur, sans dépendance descendante interdite). **Aucun accès Supabase/store** dans `spin-mode.ts` ni dans `SpinWheel`.
- Dates métier = chaînes `YYYY-MM-DD` en local (jamais UTC) — non concerné directement par 5.5 (réutilise `formatDateFr` hérité).
- Tests = **Vitest** ; le projet n'a **aucun test de composant React** (jsdom non utilisé pour les composants) → la couverture 5.5 porte sur le **module pur** `spin-mode.ts`. Le comportement d'orchestration (enchaînement, reset, reduced-motion) est validé par **contrôle navigateur humain** (T6).

### Project Structure Notes
- **NEW** `daily-wheel/lib/ui/spin-mode.ts` (pur) — aligné avec `lib/ui/wheel.ts`, `lib/ui/timeline.ts`.
- **NEW** `daily-wheel/tests/spin-mode.unit.test.ts` — aligné avec `tests/wheel.unit.test.ts`, `tests/timeline.unit.test.ts`.
- **UPDATE** `daily-wheel/components/ScheduleResult.tsx` — ajoute le tablist + l'orchestration bi-mode ; **n'élargit pas** son rôle au-delà de l'UI (AD-11).
- **UPDATE** `daily-wheel/app/globals.css` — bloc `.modes` (réplique mockup, tokens existants).
- Pas de nouveau composant requis : le tablist est léger (deux `<button>`), inutile d'extraire un composant dédié pour deux onglets. (Si la lisibilité l'exige, un petit `components/ModeSelector.tsx` piloté reste acceptable — au choix du dev, sans logique métier dedans.)
- **Aucune** migration SQL, **aucun** changement `lib/data/`/`app/api/`/`lib/store/` : 5.5 est purement présentationnelle (la persistance est 5.6).

### References
- [Source: epics.md#Story 5.5 (l. 470-483)] — AC source, deux modes, ~0,6 s, libellés CTA, reset au changement de mode.
- [Source: epics.md#Epic 5 (l. 396-398)] — principe directeur : évolution, `generateSchedule` source de vérité, la roue met en scène.
- [Source: ux-designs/.../EXPERIENCE.md (l. 61-75, 83-84, 102, 104, 107, 115-117)] — microcopie CTA/messages, enchaînement ~0,6 s, reduced-motion, tablist + reset, a11y.
- [Source: ux-designs/.../DESIGN.md (l. 145-155)] — apparence/position du sélecteur `.modes`.
- [Source: ux-designs/.../mockups/spin-rotation.html (l. 150-155, 294-299, 508-545, 547-581)] — CSS `.modes`, markup tablist, `runRotation`/`runDay`/routing CTA, `resetAll`/`setMode`, `CHAIN_DELAY_MS=600`, libellés exacts.
- [Source: components/ScheduleResult.tsx (HEAD 8887117)] — orchestrateur actuel à étendre (revealedCount/spinNonce/busy/handleSpin/handleRevealed, pattern reset l. 54-67).
- [Source: components/SpinWheel.tsx (Story 5.4)] — contrat de props piloté + reduced-motion roue (inchangé).
- [Source: lib/ui/wheel.ts, lib/ui/timeline.ts (Stories 5.3/5.4)] — cœurs purs réutilisés sans modification ; modèle pour `spin-mode.ts`.
- [Source: ARCHITECTURE-SPINE.md (AD-1 pur, AD-11 contact data, l. 40-46 couches)] — placement de `spin-mode.ts` et garde-fous de dépendance.
- [Source: 5-4-roue-animee-theatre-revelation-resultat-edf.md (AC-9)] — différé explicite du sélecteur/enchaînement vers 5.5 (continuité).

### Questions ouvertes (pour Solo, après lecture)
1. **Mode par défaut** : on retient « Rotation complète » (conforme UX autoritaire `mockup:295`). OK pour toi, ou tu préfères démarrer en « Jour le jour » ? (1 ligne à changer.)
2. **Préfixe emoji du CTA** : on utilise 🎡 dès 5.5 (cohérent avec le mockup) plutôt que d'attendre le swap global 5.8 ? (Recommandé : oui.)
3. **Reduced-motion mode auto** : option A (délai 0 ms, cascade rapide) ou B (remplissage d'un coup + une seule annonce) ? (Recommandé : A.)

## Dev Agent Record

### Agent Model Used

Amelia (Senior Software Engineer) — Opus 4.8 (1M context). TDD red→green→refactor.

### Debug Log References

- `npx vitest run tests/spin-mode.unit.test.ts` → RED (module absent) puis GREEN (14/14).
- Suite unitaire complète (hors intégration Supabase) : `npx vitest run tests/*.unit.test.ts tests/schedule.golden.test.ts` → **296/296 verts** (23 fichiers ; golden 2/2, wheel/timeline intacts → zéro régression).
- `npx tsc --noEmit` → 0 erreur ; `npx eslint .` → 0 erreur ; `npm run build` → OK (9 routes générées).

### Completion Notes List

- **UI PURE, périmètre respecté** : domaine, `lib/ui/wheel.ts`, `lib/ui/timeline.ts`, `components/SpinWheel.tsx`, `components/ScheduleTimeline.tsx` **inchangés**. 5.5 n'orchestre que le RYTHME via `ScheduleResult` + un cœur pur extrait.
- **T1/T5 — `lib/ui/spin-mode.ts` (NEW, pur)** : `SpinMode`, `CHAIN_DELAY_MS=600`, `isRotationComplete`, `shouldChainNext`, `ctaLabelFor`, `isCtaDisabled`. 14 tests Vitest couvrant AC-9 (a→e), libellés au mot près.
- **T2/T3 — `ScheduleResult.tsx` (UPDATE)** : ajout `mode` (défaut « Rotation complète »), tablist `role="tablist"` + nav clavier ←/→ (roving tabindex), `switchMode` → `resetReveal()` (curseur 0, roue/timeline réinitialisées, timer d'enchaînement annulé, plan conservé). `handleRevealed` étendu : en « Rotation complète » programme le spin suivant via `chainTimer` (~600 ms) en restant `busy` ; sinon débloque et, à la complétion, annonce « Rotation complète ! Chacun anime une fois. ». CTA piloté par `ctaLabelFor`/`isCtaDisabled`. `handleSpin` inchangé (le mode n'agit qu'à la révélation/aux libellés). Nettoyage `chainTimer` ajouté au démontage.
- **T4 — `app/globals.css` (UPDATE)** : bloc `.modes` / `.modes button` / `.modes button.sel` répliquant le mockup avec les tokens du projet (`--text-muted`, `--primary`, `font-family: inherit`). Reduced-motion déjà couvert par la règle globale `button { transition: none }`.
- **Décisions confirmées par Solo** : (1) défaut = « Rotation complète » (UX autoritaire `mockup:295`) ; (2) mark **🎡** dès 5.5 (porté par `ctaLabelFor`, source unique) ; (3) reduced-motion mode auto = **option A** (délai d'enchaînement à 0 ms → cascade quasi instantanée, chaque jour passe par `onRevealed`).
- **Différés intacts** (AC-11) : persistance 5.6, exports 5.7, gel microcopie/branding 5.8 (titres contextuels « On fait tourner ? »/« Un jour, un suspense », message d'attente « Le suspense fait partie du job. »), popover+nudge 5.9.
- **Note pour la review/passe humaine** : aucun test de composant React dans ce projet → l'orchestration (enchaînement ~600 ms, reset au changement de mode, reduced-motion) est validée par tsc/eslint/build + cœur pur testé ; un **contrôle navigateur** reste recommandé (cf. T6).

### File List

- `daily-wheel/lib/ui/spin-mode.ts` (NEW) — cœur pur : rythme + libellés des deux modes.
- `daily-wheel/tests/spin-mode.unit.test.ts` (NEW) — 14 tests Vitest (AC-9).
- `daily-wheel/components/ScheduleResult.tsx` (UPDATE) — sélecteur de mode + orchestration bi-mode.
- `daily-wheel/app/globals.css` (UPDATE) — styles `.modes` (sélecteur tablist).

### Change Log

- 2026-06-24 — Story 5.5 implémentée (deux modes « Rotation complète » / « Jour le jour ») : sélecteur `tablist` + nav clavier, enchaînement auto ~600 ms vs un clic = un jour, libellés CTA évolutifs (cœur pur `spin-mode.ts`), reset au changement de mode, reduced-motion option A. +14 tests ; tsc 0 / eslint 0 / 296 tests unitaires / build OK. Domaine/wheel/timeline/SpinWheel/golden intacts.
