---
baseline_commit: 232bf3f231080a438271a26ae7df46b265040552
---
# Story 5.1: Parcours guidé (stepper) et protection annoncée

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want une page organisée en trois étapes claires (Équipe → Contraintes → Spin) et savoir d'emblée que l'équipe est protégée,
so that je sais où je suis dans le réglage et je ne suis pas surpris par la demande de passphrase (UX-DR8).

## Acceptance Criteria

> Reformulées depuis `epics.md#Story 5.1` (l. 400-416). Chaque AC porte un ID pour le suivi tâches.

**AC-1 — Stepper présent et libellé.** Quand la page principale se charge, un **stepper** affiche trois étapes — `1 Équipe` · `2 Contraintes` · `3 Spin` — chacune avec sa pastille (numéro) et son libellé (« Étape N » + titre).

**AC-2 — Trois états visuels.** Chaque étape rend un des états suivants, conformes aux tokens :
- **à faire** : pastille bordure grise `{colors.border}` + texte `{colors.text-muted}` (numéro) ;
- **complétée** : pastille pleine `{colors.accent}` (#38b2ac) + glyphe **✓** blanc ;
- **active** : pastille pleine `{colors.primary}` (#0078d4) + **halo** `box-shadow: 0 0 0 4px {colors.primary-light}` (#e8f4ff) + libellé-titre en `{colors.primary}`.
L'état **active** (surface actuellement en vue) prime sur le fond ; le glyphe affiché est **✓** si la condition de complétion de l'étape est remplie, sinon le **numéro**.

**AC-3 — Stepper collant + scroll doux au clic.** Le stepper est `position: sticky; top: 0` (fond `{colors.card-bg}` opaque, filet inférieur `1px solid {colors.border}`, léger surcroît d'ombre à l'épinglage) et reste fixé au défilement. Un clic sur une étape — **depuis n'importe où dans la page** — fait défiler **en douceur** vers la surface correspondante.

**AC-4 — Navigation non bloquante (pas un wizard).** Aucune étape n'est verrouillée ; les trois surfaces (Équipe, Contraintes, Spin) restent accessibles à tout moment, quel que soit l'état de complétion.

**AC-5 — Règles de complétion.** L'étape `1 Équipe` est marquée **complétée** dès qu'il existe **≥ 1 participant actif** ; l'étape `2 Contraintes` est **toujours satisfaite** (optionnelle) donc affichée complétée ; l'étape `3 Spin` est marquée complétée **dès qu'une rotation a été lancée** (planning généré au moins une fois).

**AC-6 — Bandeau « 🔒 Équipe protégée » annoncé d'emblée.** Une pilule discrète est visible dans la **barre supérieure dès le chargement** : `🔒 Équipe protégée · <état>`, où `<état>` ∈ { `verrouillée`, `déverrouillée` }. Convention tranchée (voir Dev Notes §Décision UX-DR8) : **`verrouillée`** = aucune passphrase mémorisée pour la session (état initial) ; **`déverrouillée`** = passphrase mémorisée en `sessionStorage` (les écritures passent sans re-prompt).

**AC-7 — Saisie paresseuse de la passphrase inchangée.** La saisie effective de la passphrase reste **paresseuse** (déclenchée au premier write via le `.passphrase-prompt` existant — `PassphrasePrompt.tsx`), mémorisée en `sessionStorage`. **Aucune régression** du circuit `useWriteQueue` (file partagée, un seul prompt pour N écritures, taxonomie d'erreurs AD-17, rollback optimiste AD-5). Le bandeau passe à `déverrouillée` après `submitPassphrase`, et repasse à `verrouillée` si la passphrase est effacée (401, `cancelPassphrase`).

**AC-8 — Responsive ≤ 520 px.** La mise en page reste responsive : à `max-width: 520px`, le stepper reste lisible — **libellés condensés** (les sous-libellés textuels masqués, pastilles + états conservés) — et le bandeau reste visible (NFR5, UX-DR13).

**AC-9 — Accessibilité.** Le stepper est navigable au clavier (chaque étape est un `<button>` focusable, actionnable Entrée/Espace), focus visible `outline: 2px solid {colors.primary}`. La couleur n'est jamais le seul signal (le glyphe ✓ / numéro distingue les états). Le défilement « doux » respecte `prefers-reduced-motion` (saut direct sans animation).

**AC-10 — Tests.** Un helper **pur** (sans DOM/React) calcule l'état de chaque étape à partir de `{ hasActiveParticipant, hasLaunchedSchedule, activeSurface }` ; il est couvert par des tests Vitest (env `node`) prouvant : étape 1 `à faire`→`complétée` au franchissement de ≥1 actif ; étape 2 toujours complétée ; étape 3 complétée après lancement ; précédence de l'état `active`.

## Tasks / Subtasks

- [x] **T1 — Helper pur d'état des étapes** (AC: 2, 5, 10)
  - [x] Créé `lib/ui/stepper.ts` : type `StepKey`, `computeStepStates`, `STEP_ORDER`, `STEP_LABELS`, type `StepState`. Pur, aucun import React/DOM.
  - [x] Règles implémentées : `equipe.completed = hasActiveParticipant` ; `contraintes.completed = true` ; `spin.completed = hasLaunchedSchedule` ; `active = (activeSurface === key)` ; `glyph = completed ? '✓' : numéro`.
  - [x] `tests/stepper-states.unit.test.ts` (8 cas) — RED confirmé (module absent) puis GREEN. `npm test` (unitaires) → vert.
- [x] **T2 — Exposer l'état « unlocked » réactif depuis le store** (AC: 6, 7)
  - [x] **Écart d'implémentation assumé** : au lieu de `useState`+`useEffect`+`setUnlocked` (qui déclenche l'erreur lint `react-hooks/set-state-in-effect`), `unlocked` est dérivé via **`useSyncExternalStore`** dans `use-write-queue.ts` — snapshot serveur `false` (hydratation-safe), snapshot client `readPassphrase() !== null`. Un mini pub/sub module (`subscribePassphrase`/`emitPassphraseChange`) notifie le re-render.
  - [x] `storePassphrase`/`clearPassphrase` émettent le changement → `submitPassphrase` (déverrouillée) et le chemin 401 (verrouillée) sont couverts sans `setState` impératif. `cancelPassphrase` ne touche pas la session → état cohérent.
  - [x] `unlocked: boolean` ajouté au type `WriteQueue` + retourné ; ré-exposé via `StoreValue`/contexte de `participants-store.tsx` et `useParticipants()`.
- [x] **T3 — Composant `ProtectionBanner` (bandeau barre supérieure)** (AC: 6, 9)
  - [x] `components/ProtectionBanner.tsx` (`'use client'`) lit `unlocked` ; rend `🔒 Équipe protégée · <b>{unlocked ? 'déverrouillée' : 'verrouillée'}</b>`.
  - [x] `<b>` en `var(--text-color)` poids 600 ; pilule en `var(--text-muted)` (styles `.lock`).
- [x] **T4 — Composant `GuidedStepper` (stepper collant + scroll-spy + scroll doux)** (AC: 1, 2, 3, 4, 9)
  - [x] `components/GuidedStepper.tsx` (`'use client'`) : `hasActiveParticipant = participants.some(p => p.active)`, `hasLaunchedSchedule = schedule !== null` (le `schedule` est éphémère et n'est jamais remis à `null` → suffit, cf. Dev Notes) ; état via `computeStepStates`.
  - [x] 3 `<button class="step …">` (`.num`/`.lbl`+`<b>`), classes `done`/`active` dérivées du helper, `aria-current="step"` + `aria-label` descriptif.
  - [x] Scroll-spy `IntersectionObserver` sur `surface-equipe|contraintes|spin` (rootMargin décalé sous le stepper) → `activeSurface`.
  - [x] Clic : `scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })` (respect `prefers-reduced-motion`).
  - [x] Observer déconnecté au démontage (`observer.disconnect()`).
- [x] **T5 — Intégration dans la page + ancres de surface** (AC: 1, 3, 4, 6, 8)
  - [x] `app/page.tsx` : `<ParticipantsStoreProvider>` englobe désormais header + stepper + main ; `<ProtectionBanner/>` ajouté dans le `<header className="app-header">` existant (marque 🎲 « Daily Wheel » **inchangée** — 🎡 reste pour 5.8).
  - [x] `<GuidedStepper/>` placé sous le header, avant les cartes, dans le provider.
  - [x] Ancres : `id="surface-equipe"` (wrapper de `ParticipantsCard`), `id="surface-contraintes"` (section Options), `id="surface-spin"` (section Résultat) ; classe `.surface-anchor` avec `scroll-margin-top: 84px`.
- [x] **T6 — Styles `globals.css`** (AC: 2, 3, 8, 9)
  - [x] Ajouté `.lock`, `.lock b`, `.stepper`, `.step`, `.step::after` (filet), `.step .num`, `.step .lbl`, `.step .lbl b`, `.step.done .num`, `.step.active .num` (+ halo `0 0 0 4px var(--primary-light)`), `.step.active .lbl b` — variables CSS existantes réutilisées (aucune couleur redéfinie).
  - [x] Sticky : `.stepper { position: sticky; top: 0; z-index: 10; background: var(--card-bg); … }`.
  - [x] Bloc `@media (max-width: 520px)` étendu : `.step .lbl span { display: none; }` (libellés condensés), padding/bandeau ajustés. **520px conservé**.
  - [x] `:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }` ajouté ; `@media (prefers-reduced-motion: reduce)` existant respecté.
- [x] **T7 — Vérification non-régression** (AC: 7)
  - [x] `npx tsc --noEmit` → 0 erreur ; `npx eslint .` → 0 erreur ; suite unitaire complète **238 tests / 19 fichiers verts** (dont 8 nouveaux). `npm run build` → compilé OK.
  - [x] Smoke-test SSR (serveur de prod + curl) : HTML rend `class="stepper"`, les 3 ancres `surface-*`, les 3 boutons d'étape (aria-labels « Aller à l'étape N… »), et le bandeau `🔒 Équipe protégée · verrouillée` (état initial correct). Les comportements purement DOM (scroll-spy, scroll doux, bascule `verrouillée↔déverrouillée` au write/401, rechargement) n'ont **pas** de couverture auto (env de test `node`, pas de jsdom) → **smoke-test navigateur recommandé en revue** (cf. Completion Notes).

## Dev Notes

### Périmètre & principe directeur
- **Évolution, pas réécriture** (Epic 5, `epics.md:398`). On ajoute un stepper de repérage + un bandeau d'état **par-dessus** la page existante ; on ne touche ni au domaine (`lib/domain/`), ni au circuit d'écriture (sauf l'ajout du signal `unlocked`), ni au store métier.
- **Hors périmètre 5.1** (différés, ne PAS faire ici) : passage de la marque 🎲 → 🎡 et CTA « Lancer la roue » (**Story 5.8**) ; roue/canvas (**5.4**) ; timeline visuelle (**5.3**) ; popover d'édition rapide + nudge (**5.9**) ; carte enveloppante `border-radius: 22px` de l'app-shell (branding, **5.8**). 5.1 livre uniquement : stepper collant, scroll-spy + scroll doux, bandeau de protection, responsive ≤ 520 px, a11y clavier.

### Décision UX-DR8 — sémantique verrouillée/déverrouillée (TRANCHÉE)
La spec liste les deux libellés sans les définir formellement (`EXPERIENCE.md:69` : « 🔒 Équipe protégée · déverrouillée / verrouillée »). Décision retenue, alignée sur le sens naturel **et** sur le mockup (qui montre étapes 1 & 2 complétées ⇒ des écritures ont eu lieu ⇒ passphrase saisie ⇒ bandeau « déverrouillée ») :
- **verrouillée** = `readPassphrase() === null` (aucune passphrase en `sessionStorage`) → le prochain write ouvrira le prompt. **État initial / première visite.**
- **déverrouillée** = `readPassphrase() !== null` → écritures fluides, pas de re-prompt.
Le mockup statique affiche « déverrouillée » par défaut car il représente un moment post-édition ; ce n'est pas l'état au tout premier chargement.

### Fichiers à TOUCHER (lecture obligatoire faite — état actuel)
- `app/page.tsx` (composant **serveur** `async`, `force-dynamic`) — `app/page.tsx:39-82`. Le `<header className="app-header">` (l. 41-52) est **hors** du `<ParticipantsStoreProvider>` (qui ne wrappe que `<main>`, l. 55-78). **À changer** : englober la barre supérieure dans le provider pour que `<ProtectionBanner/>` lise le store. Préserver le SSR des 5 `fetch` parallèles + `initialSettings`.
- `lib/store/use-write-queue.ts` — passphrase en `sessionStorage` sous la clé `'team-passphrase'` (`PASSPHRASE_KEY`, l. 16) ; helpers privés `readPassphrase`/`storePassphrase`/`clearPassphrase` (l. 17-26). Seul `passphraseNeeded` (flag « prompt ouvert ») est exposé aujourd'hui — **il N'indique PAS** si une passphrase est mémorisée. Ajouter le signal `unlocked` (T2). Préserver intégralement la file (`runWrite`, `submitPassphrase` l. 135-147, `cancelPassphrase` l. 149-155, taxonomie AD-17 l. 88-120).
- `lib/store/participants-store.tsx` — provider Context+reducer ; expose `participants`, `schedule` (`useState<ScheduleResult | null>(null)`), et le résultat de `useWriteQueue` via `useParticipants()`. Y ré-exposer `unlocked`. `schedule !== null` ⇒ rotation déjà lancée (mais voir note ci-dessous).
- `app/globals.css` — variables CSS existantes (`:root`, l. 2-26) **à réutiliser** (ne PAS redéfinir de couleurs). Bloc `@media (max-width: 520px)` à l. 763, `@media (prefers-reduced-motion: reduce)` à l. 812. `.passphrase-prompt` stylé l. 260-274 (inchangé).
- `components/PassphrasePrompt.tsx` — formulaire de saisie paresseuse ; rend `null` si `!passphraseNeeded`. **Inchangé** ; le bandeau ne le remplace pas, il l'**annonce**.

### Fichiers à CRÉER
- `lib/ui/stepper.ts` — helper pur `computeStepStates` (testable, sans DOM).
- `tests/stepper-states.unit.test.ts` — tests Vitest du helper.
- `components/ProtectionBanner.tsx` — bandeau (`'use client'`).
- `components/GuidedStepper.tsx` — stepper collant + scroll-spy (`'use client'`).

### Point d'attention — « rotation lancée » (étape 3)
`schedule` est `null` tant qu'aucun « Lancer » n'a été cliqué, et **redevient potentiellement pertinent** selon le cycle de vie. Pour l'étape 3, la condition est « **a été lancée au moins une fois** ». Si `schedule` peut être remis à `null` (reset), `schedule !== null` ne suffit pas. **Décision dev** : si un reset existe, introduire un booléen `hasLaunchedSchedule` (passe `true` au 1er lancement, ne redescend pas avant un reset explicite) ; sinon `schedule !== null` suffit. Vérifier le comportement de `ScheduleResult.tsx` / store avant de choisir, et tracer le choix dans les Completion Notes.

### Architecture compliance (ARCHITECTURE-SPINE.md)
- **AD-1 / dépendance descendante** (spine l. 40-73) : UI → store → data → domain ; jamais de remontée. Le helper `computeStepStates` est **pur** (esprit AD-1) : aucune logique de planning dans le composant. Le stepper ne connaît pas `generateSchedule`.
- **AD-5 écritures optimistes** (l. 96-100) / **AD-8 passphrase** (l. 121-125) / **AD-14 contrat d'écriture** (l. 157-161) / **AD-17 taxonomie** (l. 175-183) : **inchangés**. La story n'ajoute qu'un *miroir lecture-seule* (`unlocked`) de l'état passphrase déjà géré par `useWriteQueue` ; aucune nouvelle écriture, aucun nouveau header, aucune validation côté client de confiance.
- **AD-11** (l. 139-143) : aucun `supabase.from(...)` direct ajouté — les nouveaux composants ne touchent pas `lib/data/`.
- **Stack** (l. 199-211) : Next 16.2 / React 19.2 / TS 5.1+ / Vitest (env `node`, pas de jsdom) → la couche testable est le **helper pur** ; les comportements DOM (sticky, IntersectionObserver, scrollIntoView) sont vérifiés manuellement (T7).
- **Conventions** (l. 185-197) : UI 100 % français (NFR4) ; `camelCase`/`PascalCase` TS ; CSS = charte existante (pas de Tailwind).

### Tokens & extraits CSS de référence (mockup `mockups/spin-rotation.html`)
Variables CSS existantes équivalentes : `--primary #0078d4`, `--primary-dark #005ea2`, `--primary-light #e8f4ff`, `--accent #38b2ac`, `--card-bg #ffffff`, `--text-color #1e293b`, `--text-muted #64748b`, `--border #e2e8f0` (globals.css l. 2-26). Le mockup utilise `--text`/`--muted`/`--font` ; **mapper** vers les variables du projet (`--text-color`, `--text-muted`, police héritée Segoe UI).

Bandeau (mockup l. 63-80) :
```css
.app-bar { display:flex; align-items:center; gap:12px; padding:16px 22px;
  border-bottom:1px solid var(--border); background:linear-gradient(180deg,#fff,#fbfdff); }
.lock { margin-left:auto; display:inline-flex; align-items:center; gap:7px;
  font-size:.76rem; color:var(--text-muted); background:#f8fafc;
  border:1px solid var(--border); padding:6px 11px; border-radius:999px; }
.lock b { color:var(--text-color); font-weight:600; }
```
```html
<div class="app-bar">
  <div class="brand"><span class="mark">🎲</span> Daily Wheel</div>
  <span class="lock">🔒 Équipe protégée · <b>déverrouillée</b></span>
</div>
```

Stepper (mockup l. 82-103) :
```css
.stepper { display:flex; gap:0; padding:18px 22px 6px;
  position:sticky; top:0; z-index:10; background:var(--card-bg); border-bottom:1px solid var(--border); }
.step { flex:1; display:flex; align-items:center; gap:10px; padding:6px 4px;
  position:relative; cursor:pointer; background:none; border:0; text-align:left; color:var(--text-muted); }
.step:not(:last-child)::after { content:""; position:absolute; right:0; top:50%;
  width:calc(100% - 56px); height:2px; background:var(--border); transform:translateX(28px); }
.step .num { width:30px; height:30px; border-radius:50%; flex:none; display:grid; place-items:center;
  font-weight:700; font-size:.9rem; background:#fff; border:2px solid var(--border); color:var(--text-muted);
  z-index:1; transition:all .25s; }
.step .lbl { font-size:.82rem; line-height:1.2; }
.step .lbl b { display:block; color:var(--text-color); font-size:.92rem; }
.step.done .num { background:var(--accent); border-color:var(--accent); color:#fff; }
.step.active .num { background:var(--primary); border-color:var(--primary); color:#fff; box-shadow:0 0 0 4px var(--primary-light); }
.step.active .lbl b { color:var(--primary); }
```
```html
<div class="stepper">
  <button class="step done"><span class="num">✓</span><span class="lbl">Étape 1<b>Équipe</b></span></button>
  <button class="step done"><span class="num">✓</span><span class="lbl">Étape 2<b>Contraintes</b></span></button>
  <button class="step active"><span class="num">3</span><span class="lbl">Étape 3<b>Spin</b></span></button>
</div>
```
> Responsive : la spec impose **≤ 520 px** (le mockup teste à 640 px — l'ignorer). Sous 520 px : `.step .lbl span { display:none; }` (condenser). NB : pour masquer le « Étape N » tout en gardant le titre `<b>`, envelopper « Étape N » dans un `<span>` et garder le `<b>` hors du span.

### Microcopie figée (EXPERIENCE.md l. 58-76)
- Stepper : « Étape 1 » + **Équipe** · « Étape 2 » + **Contraintes** · « Étape 3 » + **Spin**.
- Bandeau : « 🔒 Équipe protégée · **verrouillée** » / « 🔒 Équipe protégée · **déverrouillée** ».

### Accessibilité (UX-DR13, EXPERIENCE.md l. 113-120)
- Chaque étape = `<button>` (clavier natif). Considérer `aria-current="step"` sur l'étape active et un `aria-label` explicite (« Aller à l'étape 1 : Équipe — complétée/active/à faire »).
- Couleur jamais seul signal : ✓ vs numéro distingue complétée/à faire ; ne pas se reposer sur la seule teinte.
- `prefers-reduced-motion` : `scrollIntoView({ behavior: 'auto' })` au lieu de `'smooth'` ; pas de transition de halo.
- Focus visible 2px `{colors.primary}`.

### Project Structure Notes
- Racine de l'app : `daily-wheel/` (le repo a la spec BMad à la racine et l'app Next dans `daily-wheel/`). Alias TS `@/*` → `daily-wheel/*` (`tsconfig.json:22`).
- Nouveau dossier `lib/ui/` cohérent avec l'arborescence existante (`lib/domain`, `lib/data`, `lib/store`, `lib/format`). Alternative acceptable : colocaliser `stepper.ts` près des composants ; garder la **pureté** (pas d'import React/DOM) pour la testabilité Vitest node.
- Tests dans `tests/` (convention existante : `*.unit.test.ts`, `*.integration.test.ts`). Lancer `npm test` (`vitest run --no-file-parallelism`).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 / Story 5.1 (l. 396-416)]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-SpinThatWeeklyWheel-2026-06-23/DESIGN.md#colors (l. 80-99)]
- [Source: …/DESIGN.md#{components.stepper} (l. 142-143)]
- [Source: …/DESIGN.md#{components.passphrase-banner} (l. 159-160)]
- [Source: …/DESIGN.md (cadre app, l. 120)]
- [Source: …/EXPERIENCE.md#voice-and-tone (l. 58-76, bandeau l. 69)]
- [Source: …/EXPERIENCE.md#component-patterns (stepper collant l. 80 ; passphrase paresseuse l. 88)]
- [Source: …/EXPERIENCE.md#accessibility-floor (l. 113-120)]
- [Source: …/mockups/spin-rotation.html (app-bar l. 63-80 & 262-265 ; stepper l. 82-103 & 268-272 ; media l. 239-247)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-1,AD-5,AD-8,AD-11,AD-14,AD-17 ; stack l. 199-211 ; conventions l. 185-197]
- [Source: daily-wheel/app/page.tsx:39-82]
- [Source: daily-wheel/lib/store/use-write-queue.ts:16-157]
- [Source: daily-wheel/app/globals.css:2-26, 763, 812]

## Dev Agent Record

### Agent Model Used

Amelia (bmad-agent-dev) — Claude Opus 4.8 (1M context), `claude-opus-4-8[1m]`.

### Debug Log References

- RED : `npx vitest run tests/stepper-states.unit.test.ts` → `Cannot find package '@/lib/ui/stepper'` (avant création du helper).
- GREEN : même commande → 8/8 verts.
- Lint initial : `react-hooks/set-state-in-effect` sur `use-write-queue.ts` (pattern `setState` dans `useEffect`) → refactor `useSyncExternalStore`, lint repassé à 0.
- `npx tsc --noEmit` → 0 ; `npx eslint .` → 0 ; suite unitaire → 238/238 ; `npm run build` → OK.
- Smoke-test SSR : `npm run start` (port 3199) + `curl /` → markers `class="stepper"`, `id="surface-{equipe,contraintes,spin}"`, 3 aria-labels d'étape, bandeau `🔒 Équipe protégée · verrouillée`.

### Completion Notes List

- **Helper pur** `computeStepStates` (`lib/ui/stepper.ts`) isole toute la logique d'état des étapes → testable en env `node` (esprit AD-1). Les composants client ne portent aucune règle de complétion en dur.
- **Décision `unlocked` via `useSyncExternalStore`** (écart vs le plan littéral `useState/useEffect`) : pattern idiomatique React 19, hydratation-safe (snapshot serveur `false`), lint-clean, et reflète les changements same-tab via un mini pub/sub. `submitPassphrase`/401 sont couverts par les émissions de `storePassphrase`/`clearPassphrase` — **circuit d'écriture AD-5/AD-8/AD-17 inchangé** (aucune nouvelle écriture ni header ; juste un miroir lecture-seule).
- **`schedule !== null` = rotation lancée** : vérifié dans `participants-store.tsx`/`ScheduleResult.tsx`, le `schedule` éphémère n'est jamais remis à `null` (un rechargement le vide, ce qui est le comportement attendu) → pas de flag `hasLaunchedSchedule` séparé nécessaire.
- **Provider étendu** à header+stepper+main (il ne wrappait que `<main>`) pour que le bandeau lise le store ; SSR des 5 fetchs + settings préservé. Marque 🎲 et CTA « Lancer la sélection » **inchangés** (différés en 5.8).
- **À vérifier en revue (navigateur)** — comportements DOM non couverts par les tests `node` : (1) scroll-spy met l'étape active à jour au défilement ; (2) clic sur une étape défile en douceur (saut direct sous `prefers-reduced-motion`) ; (3) 1er write → `.passphrase-prompt` paresseux → après saisie le bandeau passe `verrouillée → déverrouillée` ; (4) rechargement même onglet conserve `déverrouillée` ; (5) 401 repasse `verrouillée` ; (6) lisibilité ≤ 520 px (libellés condensés).

### File List

**Créés :**
- `daily-wheel/lib/ui/stepper.ts`
- `daily-wheel/tests/stepper-states.unit.test.ts`
- `daily-wheel/components/ProtectionBanner.tsx`
- `daily-wheel/components/GuidedStepper.tsx`

**Modifiés :**
- `daily-wheel/lib/store/use-write-queue.ts` (signal `unlocked` via `useSyncExternalStore` + pub/sub passphrase)
- `daily-wheel/lib/store/participants-store.tsx` (expose `unlocked` dans `StoreValue`/contexte)
- `daily-wheel/app/page.tsx` (provider étendu, `<ProtectionBanner/>` dans le header, `<GuidedStepper/>`, ancres de surface)
- `daily-wheel/app/globals.css` (styles `.lock`, `.stepper`/`.step`, `.surface-anchor`, `:focus-visible`, responsive ≤ 520 px)

### Change Log

- 2026-06-23 — Story 5.1 implémentée (Amelia/dev-story) : parcours guidé en stepper collant 3 étapes (scroll-spy + scroll doux), bandeau « 🔒 Équipe protégée · verrouillée/déverrouillée » annoncé d'emblée, helper pur testé (8 cas), signal `unlocked` réactif (`useSyncExternalStore`). Circuit passphrase/écriture inchangé. tsc/eslint/238 tests/build verts. Statut → review.
</content>
</invoke>
