---
baseline_commit: fa01272
---

# Story 5.15: Restyle du stepper — retrait de l'ombre et du filet de liaison

Status: done

<!-- Story rétroactive (Amelia, 2026-06-25) : changement réalisé en quick-flow à la demande de Solo, puis
     documenté ici a posteriori. Livré au commit d10e4ff. Purement CSS. -->

## Story

As a utilisateur de Daily Wheel,
I want un stepper plus plat, sans ombre portée ni trait gris qui traverse les boutons au milieu,
so that la barre d'étapes est plus sobre et moins « flottante ».

## Contexte & décisions (échange Solo 2026-06-24)

- **Demande** : « Refais les boutons du stepper : retire l'effet d'ombre et les traits qui les parcourent au milieu. »
- **Décision 1** : suppression du `box-shadow: var(--shadow-card)` sur le conteneur `.stepper` (garde sa bordure et son fond → plus de « flottement »).
- **Décision 2** : suppression de la règle `.step:not(:last-child)::after` (le filet de liaison gris à `top:50%` qui traversait les boutons).
- **Décision 3 (conservé)** : le **halo bleu** de l'étape active (`.step.active .num { box-shadow: 0 0 0 4px … }`) est gardé — c'est l'indicateur d'état actif, pas une ombre décorative. Confirmé à Solo (réversible s'il veut l'enlever aussi).

## Acceptance Criteria

1. **AC-1** — Le conteneur `.stepper` n'a **plus d'ombre portée** (`box-shadow` retiré) ; bordure et fond conservés.
2. **AC-2** — Le **filet de liaison** entre pastilles (`.step::after`) est **supprimé**.
3. **AC-3** — Le **halo** de l'étape active est **conservé** (indicateur d'état).
4. **AC-4** — Aucune régression fonctionnelle ; build OK (changement purement CSS).

## Tasks / Subtasks

- [x] **Task 1 — Retrait de l'ombre (AC-1)**
  - [x] `app/globals.css` : suppression de `box-shadow: var(--shadow-card);` dans `.stepper`.
- [x] **Task 2 — Retrait du filet (AC-2)**
  - [x] `app/globals.css` : suppression complète de la règle `.step:not(:last-child)::after`.
- [x] **Task 3 — Vérification (AC-3, AC-4)**
  - [x] Halo actif conservé ; `npm run build` OK.

## Dev Notes

- Changement **purement CSS**, un seul fichier. `position: relative` sur `.step` devient inutile mais laissé en place (inoffensif).

### References

- [Source: daily-wheel/app/globals.css#.stepper (box-shadow retiré) + suppression .step::after]
- [Source: échange Solo 2026-06-24]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / quick-flow)

### Completion Notes List

- ✅ AC-1/2 : ombre du conteneur + filet de liaison retirés. AC-3 : halo actif conservé. AC-4 : build OK.
- Livré et poussé : commit `d10e4ff` (`style(stepper): retire l'ombre de la barre et le filet de liaison entre étapes`).

### Change Log

- 2026-06-24 — Stepper aplati (ombre de barre + filet de liaison retirés). 1 fichier, -12 lignes. Commit `d10e4ff`.
- 2026-06-25 — Story rétroactive rédigée a posteriori (Amelia) à la demande de Solo.

### File List

- `daily-wheel/app/globals.css` (MODIFIED — .stepper box-shadow retiré + .step::after supprimé)
