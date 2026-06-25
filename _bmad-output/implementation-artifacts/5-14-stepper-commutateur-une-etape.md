---
baseline_commit: 3827892
---

# Story 5.14: Stepper commutateur — une seule étape visible à la fois

Status: done

<!-- Story rétroactive (Amelia, 2026-06-25) : changement réalisé en quick-flow à la demande de Solo, puis
     documenté ici a posteriori. Livré au commit fa01272. -->

## Story

As a utilisateur de Daily Wheel,
I want que le parcours guidé n'affiche qu'une étape à la fois et que cliquer une étape bascule directement vers elle,
so that je ne me retrouve pas avec une longue page qui défile (« slider vers le bas ») mais avec des panneaux distincts, comme des onglets.

## Contexte & décisions (échange Solo 2026-06-24)

- **Problème signalé** : « le stepper ne fonctionne pas vraiment, je m'attendais à ce que les étapes soient cachées les unes sur les autres. Ça me fait un simple slider vers le bas. »
- **Constat** : le comportement livré en 5.1 était **conforme à la spec UX validée** — explicitement « **N'est pas un wizard** : toutes les surfaces restent accessibles » (`EXPERIENCE.md`, `epics.md`). Le stepper collant faisait défiler vers les surfaces empilées.
- **Décision Solo (déviation assumée)** : passer en **commutateur d'étapes** — une seule surface visible, clic = bascule (plus de défilement). Documenté comme déviation de la spec (à reporter en spec + rétro Epic 5). La **navigation reste LIBRE** : aucune étape verrouillée (on ne devient pas un vrai wizard séquentiel).
- **Décision technique — panneaux MONTÉS** : les surfaces inactives sont masquées par l'attribut `hidden` (et non démontées) → l'état local de l'étape Spin (révélation/roue/curseur 5.6/5.9) et le popover/nudge sont **préservés** à la bascule.
- **Décision technique — pas de provider lourd** : un contexte client léger `StepNav` (`activeStep` + `StepPanel`) suffit ; le **helper pur `lib/ui/stepper.ts` est inchangé** (aucun test cassé).

## Acceptance Criteria

1. **AC-1** — Une **seule étape** (surface) est visible à la fois ; les deux autres sont masquées.
2. **AC-2** — Cliquer une étape dans le stepper **bascule** vers son panneau, **sans défilement** (`setActiveStep`, plus de `scrollIntoView` ni scroll-spy).
3. **AC-3** — La navigation reste **libre** : aucune étape n'est verrouillée, on peut aller à n'importe quelle étape à tout moment.
4. **AC-4** — Les panneaux inactifs restent **montés** (masqués via `hidden`) → l'état de l'étape Spin (roue/révélation/curseur) et le popover/nudge sont préservés à la bascule.
5. **AC-5** — Le stepper reste **collant** en haut ; la pastille active reflète l'étape sélectionnée.
6. **AC-6** — Le helper pur `lib/ui/stepper.ts` (`computeStepStates`) et ses tests sont **inchangés** ; tsc/eslint/tests/build verts.

## Tasks / Subtasks

- [x] **Task 1 — Contexte de navigation (AC-1, AC-3, AC-4)**
  - [x] `components/StepNav.tsx` : `StepNavProvider` (état `activeStep`, défaut `equipe`), `useStepNav`, `StepPanel` (rend `<div hidden={activeStep!==step}>`).
- [x] **Task 2 — Stepper en commutateur (AC-2, AC-5)**
  - [x] `components/GuidedStepper.tsx` : retrait du scroll-spy (`IntersectionObserver`) et de `scrollIntoView` ; `activeStep` vient du contexte ; clic → `setActiveStep(key)`.
- [x] **Task 3 — Surfaces enveloppées (AC-1)**
  - [x] `app/page.tsx` : `StepNavProvider` autour du stepper + `<main>` ; chaque surface dans un `<StepPanel step="…">`.
- [x] **Task 4 — CSS (AC-1)**
  - [x] `app/globals.css` : `.step-panel[hidden] { display: none; }` (sauvegarde explicite) ; l'ancienne règle `.surface-anchor` (scroll-margin) remplacée.
- [x] **Task 5 — Gates (AC-6)**
  - [x] tsc 0 / eslint 0 / **354 tests** (helper stepper.ts intact) / build OK. Contrôle navigateur = passe humaine.

## Dev Notes

- **Source de vérité de l'étape active** : `StepNav` (contexte client). Pas dans le store (état purement UI).
- **Canvas non impacté** : `SpinWheel` dessine dans un backing fixe (560×560) — `display:none` n'altère pas le dessin, donc la roue reste correcte en revenant sur l'étape Spin.
- **Déviation assumée** : mémorisée dans la mémoire projet `[[stepper-wizard-deviation]]` pour la cohérence amont/aval et la rétro Epic 5.

### References

- [Source: daily-wheel/components/StepNav.tsx]
- [Source: daily-wheel/components/GuidedStepper.tsx (scroll-spy retiré → setActiveStep)]
- [Source: daily-wheel/app/page.tsx (StepNavProvider + StepPanel)]
- [Source: daily-wheel/app/globals.css#.step-panel[hidden]]
- [Source: échange Solo 2026-06-24 ; spec « pas un wizard » EXPERIENCE.md#L80]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / quick-flow)

### Completion Notes List

- ✅ AC-1→5 : commutateur une-étape-à-la-fois, clic = bascule, navigation libre, panneaux montés (état préservé), stepper collant.
- ✅ AC-6 : helper pur `stepper.ts` intact ; tsc 0 / eslint 0 / 354 tests / build OK.
- Livré et poussé : commit `fa01272` (`feat(stepper): commutateur d'étapes — une seule étape visible à la fois`).

### Change Log

- 2026-06-24 — Stepper en commutateur d'étapes (une visible, bascule sans scroll). 4 fichiers, +79/-86. Commit `fa01272`.
- 2026-06-25 — Story rétroactive rédigée a posteriori (Amelia) à la demande de Solo.

### File List

- `daily-wheel/components/StepNav.tsx` (ADDED — contexte activeStep + StepPanel)
- `daily-wheel/components/GuidedStepper.tsx` (MODIFIED — scroll-spy retiré → setActiveStep)
- `daily-wheel/app/page.tsx` (MODIFIED — StepNavProvider + surfaces en StepPanel)
- `daily-wheel/app/globals.css` (MODIFIED — .step-panel[hidden])
