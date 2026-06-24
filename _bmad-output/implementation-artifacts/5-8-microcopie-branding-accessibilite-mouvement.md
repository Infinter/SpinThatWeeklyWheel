---
baseline_commit: f8f89f5550430e6207998980971e92870c11fc36
---

# Story 5.8: Microcopie, branding et accessibilité du mouvement

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur de Daily Wheel,
I want une interface cohérente, joueuse mais sobre, et respectueuse de mes préférences de mouvement,
so that le redesign est fini et confortable pour tous (UX-DR12, UX-DR13).

> **Nature de la story** : couche de **finition + conformité** appliquée rétroactivement à tout le redesign (5.1→5.7). Ce n'est **pas** une feature isolée ni une réécriture : on harmonise le vocabulaire, on pose le mark 🎡, on garantit `prefers-reduced-motion` et les signaux non-colorés. **Évolution, pas refonte** (AC-6).

## Acceptance Criteria

Source autoritaire : `_bmad-output/planning-artifacts/epics.md#L520-535` (Story 5.8) + spec UX `ux-designs/.../EXPERIENCE.md` + `DESIGN.md`. ACs numérotés pour traçabilité.

**AC-1 — CTA & mark 🎡 (UX-DR12)**
**Given** l'ensemble du redesign
**When** je parcours l'application
**Then** le CTA principal de tirage affiche **« Lancer la roue »** (remplace l'ancien « Lancer la sélection » / l'actuel « Lancer la rotation »)
**And** le mark applicatif est **🎡** au **favicon ET au header** (remplace le dé 🎲).

**AC-2 — Tutoiement sobre-joueur & vocabulaire produit**
**And** la microcopie suit le **tutoiement** (« tu », jamais « vous ») sur un ton sobre-joueur
**And** le **vocabulaire produit** est employé partout : *animateur*, *tirage/planning*, *jours fériés*, *jours off d'équipe*, *indisponibilités*, *exclusions de groupe*.

**AC-3 — Cohérence des noms & empty states**
**And** une action **garde son nom dans tout le flux** (bouton « Copier » → toast « Copié »)
**And** les empty states sont des **invitations à agir** (pas de « Aucune donnée » sec).

**AC-4 — `prefers-reduced-motion` partout (UX-DR13)**
**And** `prefers-reduced-motion: reduce` est respecté **partout** : roue (saut direct au résultat, déjà géré JS), `pop` des cellules, halos/soulèvements désactivés.

**AC-5 — Couleur jamais seul signal + focus/clavier**
**And** la **couleur n'est jamais le seul signal** (badges/texte : « WE », « Férié », « sauté », état participant)
**And** les **focus visibles** (`outline 2px var(--primary)`) et la **navigation clavier** sont conservés (hérités 5.1→5.7).

**AC-6 — Aucune régression visuelle de l'ADN**
**And** aucune régression de l'ADN existant (bleu `#0078d4`, teal `#38b2ac`, Segoe UI, cartes blanches) — c'est une évolution, pas une réécriture.

## Tasks / Subtasks

- [x] **Task 1 — Mark 🎡 au header et au favicon (AC-1, AC-6)**
  - [x] 1.1 `app/page.tsx:57` : `🎲` → `🎡` dans `.app-header-icon`. `<h1>Daily Wheel</h1>` et sous-titre intacts.
  - [x] 1.2 Favicon : `app/icon.svg` créé (emoji 🎡 centré). App Router Next 16 l'a détecté → route `/icon.svg` générée au build (confirmé), `layout.tsx` non touché.
  - [x] 1.3 `app/favicon.ico` (ancien dé) supprimé via `git rm` → plus aucun 🎲 résiduel (décision Q1 par défaut appliquée).

- [x] **Task 2 — CTA « Lancer la roue » (AC-1) — ANCRE TDD**
  - [x] 2.1 **[RED]** `tests/spin-mode.unit.test.ts:64-65` attendu → `'🎡 Lancer la roue'` ; vérifié rouge (1 échec : Received `'🎡 Lancer la rotation'`).
  - [x] 2.2 **[GREEN]** `lib/ui/spin-mode.ts:35` → `'🎡 Lancer la roue'` (état initial/en-cours). `'🎡 Relancer la rotation'` conservé à l'état complet (UX). Préfixe 🎡 conservé. 14/14 verts.
  - [x] 2.3 `ScheduleResult.tsx:330` consomme `ctaLabelFor(mode, 0, 0)` → libellé propagé dynamiquement, aucune chaîne en dur (« Cliquez » traité en Task 3.2).
  - [x] 2.4 Libellés jour-le-jour `spin-mode.ts:37-38` intacts (déjà conformes UX).

- [x] **Task 3 — Tutoiement + vocabulaire produit (AC-2)**
  - [x] 3.1 `ScheduleResult.tsx:324` → « Ajoute au moins un participant actif pour lancer la roue. » (tutoiement + invitation, fusion Task 4.2).
  - [x] 3.2 `ScheduleResult.tsx:330` → « Clique sur « … » pour lancer le tirage. ».
  - [x] 3.3 `use-write-queue.ts:138` → « … tu peux réessayer. ».
  - [x] 3.4 **Audit tutoiement** : grep exhaustif components/+lib/ → 2 occurrences supplémentaires trouvées et corrigées : `use-write-queue.ts:142` « réessayez » → « réessaie », `:110` « Réessayez » → « Réessaie ». Plus aucun résidu vouvoiement UI.
  - [x] 3.5 **Audit vocabulaire produit** : lexique conforme (*animateur*, *tirage/planning*, *jours fériés*, *jours off d'équipe*, *indisponibilités*, *exclusions de groupe*) ; aucun « responsable »/« leader » côté UI. Aucun écart à corriger.

- [x] **Task 4 — Cohérence des noms & empty states = invitations (AC-3)**
  - [x] 4.1 « Copier » → toast « Copié dans le presse-papier » cohérent (5.7) ; aucune variante.
  - [x] 4.2 Empty states éditables réécrits en invitations (tutoiement) :
    - `ParticipantsCard.tsx:116` → « Ajoute ton premier participant ci-dessus pour lancer la roue. ».
    - `ScheduleResult.tsx:324` → fusionné en Task 3.1.
    - `UnavailabilityPanel.tsx:75` → « Aucune indisponibilité — ajoute une date ou une plage si besoin. ».
    - `HolidaysPanel.tsx:73` → « Aucun jour férié — ajoute-en un si la rotation en croise. ».
    - `TeamOffDaysPanel.tsx:100` → « Aucun jour off d'équipe — ajoute-en un si besoin. ».
    - `GroupExclusionsPanel.tsx:94` → « Aucune exclusion de groupe — ajoute une règle si besoin. ».
    - `ScheduleResult.tsx:402/:406` (résultats de tirage) : laissés factuels — pas de fausse invitation (déjà sans vouvoiement).
  - [x] 4.3 Invitations appliquées aux empty states éditables (participants + 4 panneaux de contraintes). Degré « léger » retenu (Q2/Q3).

- [x] **Task 5 — `prefers-reduced-motion` partout (AC-4)**
  - [x] 5.1 **Vérifié intact** : roue saute au résultat (`SpinWheel.tsx:110-121`), `pop`/halos désactivés (`globals.css:1067-1068`), aperçu/toast sans animation (`:1070-1071`), scroll stepper `auto` (`GuidedStepper.tsx`), chaînage sans délai (`ScheduleResult.tsx`). Aucun changement.
  - [x] 5.2 **Balayage additif** : ajout sous `@media (prefers-reduced-motion: reduce)` de `transition: none` pour `.step .num`, flèches dépliables (`.group-excl-arrow/.holidays-arrow/.team-off-arrow`), `.toggle-active` + `::before`. Transitions hors media query conservées.

- [x] **Task 6 — Couleur jamais seul signal + focus/clavier (AC-5)**
  - [x] 6.1 **Audit OK** : timeline badges « WE » (`timeline.ts:97`), « Férié »/« Jour off »/« Exclusion » (`:91-101`), « sauté » (`ScheduleTimeline.tsx:90`), pastille `aria-hidden`+prénom ; participant « inactif » texte (`ParticipantsCard.tsx:135`) ; onglets `aria-selected` ; badges stepper numéro/✓. Aucun écart.
  - [x] 6.2 **Vérifié intact** : `:focus-visible outline 2px var(--primary)` global (`globals.css:172`) + 10 surcharges cohérentes, jamais désactivé ; nav clavier modes ←/→ et stepper intactes ; canvas `aria-hidden` + région live `role="status"` intacts.

- [x] **Task 7 — Non-régression ADN & gates (AC-6)**
  - [x] 7.1 **Interdits respectés** : tokens CSS (`globals.css:1-31`), nom « Daily Wheel », police Segoe UI, layout, palette (#0078d4/#38b2ac/cartes blanches) — aucun changement.
  - [x] 7.2 Gates : `tsc` 0, `eslint` 0, **328/328** tests unitaires+golden (26 fichiers), `next build` OK. Route `/icon.svg` ajoutée ; **8 routes API intactes** ; domaine/wheel/timeline/rotation-resume/exports/spin-mode inchangés (seul test modifié = `spin-mode.unit.test.ts`).
  - [x] 7.3 Passe humaine navigateur **à faire** (non automatisable) : onglet+header 🎡, CTA « Lancer la roue », tutoiement, empty states invitants, `prefers-reduced-motion` (roue/pop/halos/micro-transitions calmes), focus clavier, aucun écart visuel couleurs/typo/layout.

## Dev Notes

### Contexte & source de vérité
- **Story de finition transverse** : applique microcopie, branding et a11y du mouvement à TOUT le redesign Epic 5 (5.1→5.7, déjà en `review`). Spec UX autoritaire : `_bmad-output/planning-artifacts/ux-designs/ux-SpinThatWeeklyWheel-2026-06-23/` (`DESIGN.md` branding/couleurs/typo, `EXPERIENCE.md` microcopie/a11y).
- **`generateSchedule` reste la source de vérité du planning** (AD-1/2/3) ; cette story ne touche ni domaine ni données.

### Stack & conventions (architecture)
- Next.js **16.2.x** (App Router), React **19.2**, TypeScript **5.1+**, Supabase JS **2.108.x**. **Pas de Tailwind** : CSS maison, tokens dans `app/globals.css:1-31` (`:root`). [Source: architecture/.../ARCHITECTURE-SPINE.md#L202-211]
- **UI 100% français** (NFR4) ; dates `YYYY-MM-DD` en local (jamais UTC). [Source: ARCHITECTURE-SPINE.md#L189-197]
- Tests **Vitest** (`describe/it/expect`, env `node`) dans `tests/*.unit.test.ts`. Logique pure isolée dans `lib/ui/` (zéro import React/DOM/Supabase).
- **App Router favicon** : `app/icon.svg` (ou `icon.png`/`icon.tsx`) est détecté automatiquement par Next 16 et injecté en `<link rel="icon">` ; il prime sur `favicon.ico` côté navigateurs modernes. Un SVG avec `<text>🎡</text>` rend l'emoji comme favicon — zéro dépendance, zéro runtime.

### Cartographie de l'existant — fichiers à TOUCHER (état actuel + ce qui change)

| Fichier:ligne | État actuel | Changement 5.8 |
|---|---|---|
| `app/page.tsx:57` | `🎲` dans `.app-header-icon` | → `🎡` (Task 1.1) |
| `app/favicon.ico` | icône dé générique | remplacé par `app/icon.svg` 🎡 (Task 1.2-1.3) |
| `lib/ui/spin-mode.ts:35` | `'🎡 Lancer la rotation'` | → `'🎡 Lancer la roue'` (initial uniquement) (Task 2.2) |
| `tests/spin-mode.unit.test.ts:64-65` | attend `'🎡 Lancer la rotation'` | → `'🎡 Lancer la roue'` (RED→GREEN) (Task 2.1) |
| `components/ScheduleResult.tsx:324` | « Ajoutez au moins un participant actif. » | tutoiement + invitation (Tasks 3.1/4.2) |
| `components/ScheduleResult.tsx:330` | « Cliquez sur … » | « Clique sur … » (Task 3.2) |
| `lib/store/use-write-queue.ts:138` | « … vous pouvez réessayer. » | « … tu peux réessayer. » (Task 3.3) |
| `components/ParticipantsCard.tsx:116` | « Aucun participant pour le moment. » | invitation (Task 4.2) |
| `components/UnavailabilityPanel.tsx:75` | « Aucune indisponibilité enregistrée. » | invitation légère (Task 4.2) |
| `components/HolidaysPanel.tsx:73` | « Aucun jour férié défini. » | invitation légère (Task 4.2) |
| `components/TeamOffDaysPanel.tsx:100` | « Aucun jour off défini. » | invitation légère (Task 4.2) |
| `components/GroupExclusionsPanel.tsx:94` | « Aucune règle définie. » | invitation légère (Task 4.2) |
| `app/globals.css:1063-1072` | reduced-motion : roue/pop/halos/aperçu/toast | + micro-transitions (step num, flèches, toggles) — ADDITIF (Task 5.2) |

### Déjà conforme — NE PAS retoucher (vérifier seulement)
- **Mark CTA** : les libellés jour-le-jour `spin-mode.ts:37-38` portent déjà 🎡 et le bon vocabulaire.
- **Toast « Copié »** : chaîne « Copier » → « Copié dans le presse-papier » posée en 5.7 (cohérente AC-3).
- **reduced-motion roue/pop/halos** : double garde JS+CSS déjà en place (5.4/5.7) — c'est exactement ce que nomme l'AC-4.
- **Focus visible** : `globals.css:172` `:focus-visible outline 2px var(--primary)` = exactement l'AC-5.
- **Couleur non-seule** : badges WE/Férié/sauté + pastilles `aria-hidden`+texte + « · inactif » déjà posés (5.3) — auditer, pas refaire.
- **Région live + canvas aria-hidden** : `ScheduleResult.tsx:353` + `SpinWheel.tsx:156` (5.4).
- **Tokens / palette / police / layout** : intacts (AC-6).

### Apprentissages stories précédentes (5.5→5.7)
- **Noms de tokens RÉELS** : `--text-color` et `--text-muted` (PAS `--text`/`--muted`), `--primary` (PAS `--font`/`--accent` inexistant côté nom). Erreur déjà commise et corrigée en 5.7 — utiliser les noms exacts de `globals.css:1-31`.
- **Police** : `font-family: inherit` (Segoe UI système), pas de variable `--font`.
- **Pattern reduced-motion** : double garde JS (`window.matchMedia('(prefers-reduced-motion: reduce)').matches`, guard SSR `typeof window !== 'undefined'`) + CSS `@media`. Réutiliser tel quel si un nouveau point JS était nécessaire (peu probable ici : Task 5.2 est purement CSS additif).
- **Stories 5.x = surtout UI** : peu/pas de tests composant React ; la validation se fait en **passe humaine navigateur**. Ici, le seul test unitaire impacté est `spin-mode.unit.test.ts` (libellé CTA).

### Approche TDD
- **Seule logique pure modifiée = `spin-mode.ts` (libellé CTA)** → cycle rouge/vert sur `tests/spin-mode.unit.test.ts` (Task 2). C'est l'ancre test-first de la story.
- Microcopie composants, CSS, header emoji, favicon : non unitairement testables (React/DOM/CSS/asset) → couverts par audit + passe navigateur. Ne PAS inventer de tests de rendu : ce n'est pas le pattern du projet.

### Project Structure Notes
- Tous les chemins ci-dessus sont relatifs à `daily-wheel/` (racine de l'app Next dans le repo). Aucune nouvelle arborescence ; un seul nouveau fichier : `app/icon.svg`.
- Aucune migration SQL, aucune route API, aucune écriture serveur. Story **100% client/présentation**.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#L520-535] — Story 5.8 (user story + ACs verbatim, UX-DR12/UX-DR13)
- [Source: ux-designs/ux-SpinThatWeeklyWheel-2026-06-23/DESIGN.md#L67-115] — nom « Daily Wheel », mark 🎡, palette, typo Segoe UI
- [Source: ux-designs/ux-SpinThatWeeklyWheel-2026-06-23/EXPERIENCE.md#L61-120] — table microcopie (« Lancer la roue », tutoiement), plancher a11y (région live, couleur+badge, focus 2px, reduced-motion)
- [Source: architecture/.../ARCHITECTURE-SPINE.md#L189-211] — stack, conventions, CSS sans Tailwind, NFR4 français
- [Source: app/globals.css#L1-31] — tokens RÉELS ; #L172 focus-visible ; #L1063-1072 reduced-motion
- [Source: lib/ui/spin-mode.ts#L31-44] — `ctaLabelFor` ; [tests/spin-mode.unit.test.ts#L64-66]
- [Source: app/page.tsx#L55-69] — header (🎲 actuel) ; app/layout.tsx#L9-13 (metadata « Daily Wheel »)

### Hors périmètre (ne PAS faire — anti gold-plating)
- ❌ `theme-color` meta, `manifest.json`, PWA, icônes Apple-touch (non demandés par l'AC).
- ❌ Mode sombre / theme switcher.
- ❌ Nouvelle police, nouvelle palette, refonte layout, audit contraste au-delà de WCAG **AA raisonnable** (UX-DR6).
- ❌ Renommer le produit « Daily Wheel ».
- ❌ Story 5.9 (popover indispos, nudge « relancer la roue ») — séparée.
- ❌ Toucher domaine / données / routes API / persistance.

### Questions ouvertes (décisions par défaut prises ; à confirmer avec Solo)
- **Q1 — Favicon** : défaut retenu = ajouter `app/icon.svg` (🎡) **et supprimer** `app/favicon.ico` pour purger le dé sur tous les navigateurs. Alternative : garder le `.ico` (le SVG prime sur navigateurs modernes mais le dé peut subsister sur anciens/onglets épinglés).
- **Q2 — CTA** : défaut = garder le préfixe emoji → **« 🎡 Lancer la roue »** et conserver **« 🎡 Relancer la rotation »** à l'état complet (conforme UX). À confirmer : veut-on plutôt « Relancer la roue » par symétrie ?
- **Q3 — Empty states** : défaut = invitations sur participants + panneaux de contraintes ; messages de **résultat de tirage** (« Aucune session planifiée », « Non planifié·s ») gardés factuels (juste tutoiement). À confirmer : degré d'« invitation » souhaité sur les panneaux de contraintes secondaires.

## Dev Agent Record

### Agent Model Used

Amelia (Senior Software Engineer) — claude-opus-4-8[1m]

### Debug Log References

- `npx vitest run tests/spin-mode.unit.test.ts` → RED (1 échec : attendu `🎡 Lancer la roue`, reçu `🎡 Lancer la rotation`) puis GREEN (14/14) après modif `spin-mode.ts:35`.
- `npx tsc --noEmit` → 0 ; `npx eslint .` → 0.
- `npx vitest run tests/*.unit.test.ts tests/*.golden.test.ts` → 328/328 (26 fichiers).
- `npm run build` → OK ; route `/icon.svg` générée ; 8 routes API présentes.

### Completion Notes List

Story de **finition transverse** (microcopie + branding + a11y mouvement) livrée 100 % côté présentation — 0 domaine / 0 données / 0 route / 0 migration.

- **AC-1 (CTA + mark 🎡)** : header `page.tsx` 🎲→🎡 ; favicon migré via `app/icon.svg` (convention App Router, route `/icon.svg` au build) + suppression de l'ancien `favicon.ico` ; CTA `rotation-complete` initial « 🎡 Lancer la roue » (ancre TDD sur `spin-mode.ts`/`spin-mode.unit.test.ts`), « 🎡 Relancer la rotation » conservé (UX).
- **AC-2 (tutoiement + vocabulaire)** : 5 chaînes vouvoiement → tutoiement (`ScheduleResult.tsx:324/330`, `use-write-queue.ts:110/138/142`). Vocabulaire produit audité conforme (animateur/tirage/planning/jours fériés/jours off d'équipe/indisponibilités/exclusions de groupe).
- **AC-3 (noms + empty states)** : « Copier »→« Copié » confirmé ; 5 empty states éditables réécrits en invitations ; messages de résultat de tirage laissés factuels (pas de fausse invitation).
- **AC-4 (reduced-motion)** : roue/pop/halos déjà couverts (vérifié intact) ; balayage additif des micro-transitions (badge étape, flèches, toggles) sous le media query.
- **AC-5 (couleur non-seule + focus)** : audit — badges texte WE/Férié/Jour off/Exclusion/sauté, état participant « inactif », `:focus-visible 2px var(--primary)` global + nav clavier intacts. Aucun écart.
- **AC-6 (non-régression ADN)** : tokens CSS, nom produit, Segoe UI, layout, palette inchangés. tsc 0 / eslint 0 / 328 tests / build OK / 8 routes API intactes.

**À FAIRE en passe humaine** : contrôle navigateur (favicon+header 🎡 dans l'onglet, CTA « Lancer la roue », tutoiement, empty states invitants, `prefers-reduced-motion` réellement calme, focus clavier, aucun écart visuel).

**Décisions par défaut appliquées (questions ouvertes de la story)** : Q1 = `icon.svg` + suppression `favicon.ico` ; Q2 = préfixe 🎡 conservé sur « Lancer la roue », « Relancer la rotation » gardé ; Q3 = invitations légères sur panneaux de contraintes, résultats de tirage factuels. Réversibles si Solo préfère un autre arbitrage.

### File List

- `daily-wheel/app/page.tsx` — modifié (header mark 🎲→🎡)
- `daily-wheel/app/icon.svg` — **ajouté** (favicon 🎡, convention App Router)
- `daily-wheel/app/favicon.ico` — **supprimé** (ancien dé)
- `daily-wheel/lib/ui/spin-mode.ts` — modifié (CTA « Lancer la roue »)
- `daily-wheel/tests/spin-mode.unit.test.ts` — modifié (attendu CTA)
- `daily-wheel/components/ScheduleResult.tsx` — modifié (tutoiement + invitation, l. 324/330)
- `daily-wheel/lib/store/use-write-queue.ts` — modifié (tutoiement, l. 110/138/142)
- `daily-wheel/components/ParticipantsCard.tsx` — modifié (empty state invitation)
- `daily-wheel/components/UnavailabilityPanel.tsx` — modifié (empty state)
- `daily-wheel/components/HolidaysPanel.tsx` — modifié (empty state)
- `daily-wheel/components/TeamOffDaysPanel.tsx` — modifié (empty state)
- `daily-wheel/components/GroupExclusionsPanel.tsx` — modifié (empty state)
- `daily-wheel/app/globals.css` — modifié (reduced-motion : micro-transitions additives)

## Change Log

- 2026-06-24 — Story 5.8 implémentée (Amelia/dev-story) : in-progress → review. Finition transverse microcopie/branding/a11y mouvement. Mark 🎡 (header + `app/icon.svg`, `favicon.ico` supprimé) ; CTA « 🎡 Lancer la roue » (ancre TDD `spin-mode`) ; 5 chaînes → tutoiement ; 5 empty states → invitations ; reduced-motion étendu aux micro-transitions ; audits couleur-non-seule/focus/vocabulaire OK. tsc 0 / eslint 0 / 328 tests / build OK ; 8 routes API + domaine/wheel/timeline/exports/rotation-resume INTACTS. 100 % présentation (0 domaine/données/route/migration). Passe navigateur à faire.
