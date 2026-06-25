---
baseline_commit: 2867432
---

# Story 5.11: Durée de rotation de la roue réduite

Status: done

<!-- Story rétroactive (Amelia, 2026-06-25) : changement réalisé en quick-flow à la demande de Solo, puis
     documenté ici a posteriori. Livré au commit 7520ef0. -->

## Story

As a animateur qui lance la roue,
I want que l'animation de la roue soit plus courte (plus nerveuse),
so that le résultat tombe plus vite sans attendre une longue rotation.

## Contexte & décision (échange Solo 2026-06-25)

- Solo a d'abord demandé d'« augmenter » la durée, puis a corrigé : il voulait la **réduire**.
- **Décision** : durée de spin passée de **2 100 ms → 1 200 ms** (valeur explicitement choisie par Solo).
- Hors périmètre : le délai d'enchaînement `CHAIN_DELAY_MS` (600 ms entre deux spins en « Rotation complète », `lib/ui/spin-mode.ts`) reste inchangé. L'easing reste *ease-out cubic*.

## Acceptance Criteria

1. **AC-1** — La durée de l'animation d'un spin est **1 200 ms** (constante `DURATION_MS`, `components/SpinWheel.tsx`). Avant : 2 100 ms.
2. **AC-2** — L'easing (`easeOutCubic`, `lib/ui/wheel.ts`) et la géométrie de la roue sont **inchangés** : seul le temps total change.
3. **AC-3** — Le chemin `prefers-reduced-motion` reste correct (révélation immédiate sans dépendre de la valeur de durée) — aucune régression d'accessibilité.
4. **AC-4** — Aucun test ne fige `DURATION_MS` ; la suite reste verte (la roue est un composant canvas non testé en env node — contrôle visuel navigateur).

## Tasks / Subtasks

- [x] Task 1 — Réduire la durée (AC: #1, #2)
  - [x] `components/SpinWheel.tsx` : `DURATION_MS` 2100 → 1200.
- [x] Task 2 — Vérifications (AC: #3, #4)
  - [x] `tsc` 0, `eslint` 0, suite Vitest verte ; easing/reduced-motion intacts.

## Dev Notes

- Point unique : `const DURATION_MS = 1200` (`components/SpinWheel.tsx:28`). La boucle d'animation calcule la progression `p = min(1, (ts - t0) / DURATION_MS)` puis `angle = start + (end - start) * easeOutCubic(p)` (`SpinWheel.tsx:130-131`). Réduire la constante raccourcit proportionnellement toute la course sans toucher la courbe.
- `DURATION_MS` est local au composant (pas dans un cœur pur) car c'est un paramètre d'animation canvas impératif ; aucun test unitaire node ne le couvre (cohérent avec le découpage 5.4).
- Le délai d'enchaînement en « Rotation complète » est une constante DISTINCTE (`CHAIN_DELAY_MS = 600`, `lib/ui/spin-mode.ts`) — non modifiée.

### References

- [Source: daily-wheel/components/SpinWheel.tsx#DURATION_MS (28)]
- [Source: daily-wheel/components/SpinWheel.tsx#boucle rAF (130-131)]
- [Source: daily-wheel/lib/ui/wheel.ts#easeOutCubic]
- [Source: échange Solo 2026-06-25]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / quick-flow)

### Completion Notes List

- ✅ AC-1/2 : `DURATION_MS` 2100 → 1200 ; easing et géométrie intacts.
- ✅ AC-3/4 : tsc 0 / eslint 0 / suite verte ; aucun test ne dépendait de la durée.
- Livré et poussé : commit `7520ef0` (`feat(wheel): réduit la durée de rotation à 1200 ms (depuis 2100 ms)`).

### Change Log

- 2026-06-25 — `DURATION_MS` 2100 → 1200 ms (`SpinWheel.tsx`). 1 fichier, +1/-1.

### File List

- `daily-wheel/components/SpinWheel.tsx` (MODIFIED — DURATION_MS)
