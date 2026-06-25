---
baseline_commit: 7520ef0
---

# Story 5.12: Timeline alignée sur une grille calendaire (lun→dim)

Status: done

<!-- Story rétroactive (Amelia, 2026-06-25) : changement réalisé en quick-flow à la demande de Solo, puis
     documenté ici a posteriori. Livré au commit 20dc6a1. -->

## Story

As a personne qui lit le planning de la rotation,
I want que la timeline s'affiche comme un calendrier hebdomadaire (lundi→dimanche) plutôt que collée à la date de début,
so that chaque ligne corresponde à une vraie semaine, le dimanche finissant toujours la ligne, ce qui rend le planning plus lisible.

## Contexte & décisions (échange Solo 2026-06-25)

- **Problème** : la grille était en `repeat(auto-fit, minmax(96px,1fr))` → elle empilait les jours bord à bord depuis le premier jour rollé, sans rapport avec le jour de semaine, et le nombre de colonnes variait selon la largeur.
- **Demande Solo** : « ne décale pas toute la semaine à la date de début, mais garde du vide jusqu'au jour rollé, ainsi le dimanche est toujours le dernier jour de la ligne affichée. »
- **Décision 1** : grille **calendaire à 7 colonnes (lun→dim)** ; la première cellule (premier jour rollé) est décalée à sa colonne de jour de semaine via `grid-column-start`. Comme `buildTimeline` émet déjà **tous les jours contigus** (week-ends inclus), chaque ligne devient une semaine lun→dim et le dimanche finit toujours la ligne.
- **Décision 2 (responsive)** : sur **mobile ≤520px**, abandon de l'alignement hebdo → reflux en empilage `auto-fit` lisible (forcer 7 colonnes y rendrait les cellules illisibles ~45px). Choisi par Solo (« reflux auto sur mobile »).
- **Décision 3** : aucun changement à `buildTimeline` ni à ses tests — l'alignement est **purement CSS** (décalage de la 1ʳᵉ cellule). Rejeté : ajouter des cellules « vides » au cœur pur (aurait modifié l'union `TimelineCell` et le contrat testé).

## Acceptance Criteria

1. **AC-1** — Sur desktop/tablette, la timeline est une grille à **7 colonnes** (`grid-template-columns: repeat(7, 1fr)`), une par jour de semaine lun→dim.
2. **AC-2** — La **première cellule** (premier jour rollé) est positionnée dans sa colonne de jour de semaine réelle via `grid-column-start` ; les jours qui précèdent dans la semaine restent **vides**.
3. **AC-3** — Les jours suivants étant contigus (week-ends inclus émis par `buildTimeline`), **le dimanche termine toujours une ligne complète** et la semaine suivante repart au lundi.
4. **AC-4** — Le décalage est calculé par un helper **pur et testé** `mondayIndex(ymd)` (0 = lundi … 6 = dimanche), exposé en variable CSS `--first-col` (= `mondayIndex + 1`) par le composant.
5. **AC-5 (mobile)** — En `@media (max-width: 520px)`, la grille repasse en `repeat(auto-fit, minmax(96px,1fr))` et le décalage de la première cellule est neutralisé (`grid-column-start: auto`) → empilage lisible, **aucune scrollbar horizontale**.
6. **AC-6** — Aucune scrollbar horizontale sur aucun écran (`1fr` sans plancher en mode 7 colonnes).
7. **AC-7** — `buildTimeline` et `tests/timeline.unit.test.ts` **inchangés** (l'alignement n'est pas dans le cœur pur).

## Tasks / Subtasks

- [x] Task 1 — Helper pur + test (AC: #4)
  - [x] `lib/format/date-fr.ts` : `mondayIndex(ymd)` = `(parseYMD(ymd).getDay() + 6) % 7` (parsing LOCAL, jamais UTC).
  - [x] `tests/date-fr.unit.test.ts` : lundi=0 … dimanche=6 (ancrage 2026-06-22 = lundi).
- [x] Task 2 — Décalage côté composant (AC: #2, #4)
  - [x] `components/ScheduleTimeline.tsx` : `firstCol = mondayIndex(cells[0].date) + 1` ; pose `style={{ '--first-col': firstCol }}` (typé `CSSProperties`) sur `.timeline`.
- [x] Task 3 — CSS grille + reflux mobile (AC: #1, #3, #5, #6)
  - [x] `app/globals.css` : `.timeline` → `repeat(7, 1fr)` ; `.timeline > .day:first-child { grid-column-start: var(--first-col, 1) }` ; `@media (max-width:520px)` → `auto-fit` + `grid-column-start: auto`.
- [x] Task 4 — Vérifications (AC: #6, #7)
  - [x] `tsc` 0, `eslint` 0, suite Vitest verte (timeline/golden intacts) ; contrôle visuel desktop + mobile (passe humaine).

## Dev Notes

- **Pourquoi l'alignement est purement CSS** : `buildTimeline` (`lib/ui/timeline.ts`) démarre déjà la bande au premier jour planifié et émet TOUS les jours contigus jusqu'au dernier (week-ends/bloqués inclus, invariant no-hole). Donc, en grille 7 colonnes, il suffit de décaler la 1ʳᵉ cellule à sa colonne de jour de semaine : tout le reste s'enchaîne naturellement, chaque ligne = une semaine lun→dim. Aucune cellule « vide » à matérialiser dans le DOM (les colonnes avant la 1ʳᵉ cellule restent simplement non remplies).
- **`mondayIndex`** : `getDay()` est dimanche-first (0=dim) ; `(getDay()+6)%7` le tourne en lundi-first (0=lun…6=dim). Parsing LOCAL via `parseYMD` (convention dates du projet, jamais UTC).
- **Variable CSS** : le composant passe `--first-col` (1-based) ; le CSS l'applique au `:first-child` de `.timeline`. Le `var(--first-col, 1)` a un repli à 1 (colonne lundi) si la variable manque.
- **Mobile** : le media-query ≤520px réinitialise `grid-column-start: auto` ET repasse en `auto-fit` — sinon le décalage hérité casserait l'empilage. `1fr` (mode 7 col) et `minmax(96px,1fr)` (mode mobile) garantissent l'absence de scrollbar (UX-DR10).
- La 1ʳᵉ cellule rendue correspond à `planning[0].date` (premier jour ouvré rollé) — `buildTimeline` ne place aucun week-end/bloqué avant elle.

### References

- [Source: daily-wheel/lib/format/date-fr.ts#mondayIndex]
- [Source: daily-wheel/components/ScheduleTimeline.tsx#--first-col]
- [Source: daily-wheel/app/globals.css#.timeline (878+) + media (max-width:520px)]
- [Source: daily-wheel/lib/ui/timeline.ts#buildTimeline (jours contigus, inchangé)]
- [Source: échange Solo 2026-06-25]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / quick-flow)

### Completion Notes List

- ✅ AC-1→4 : grille 7 colonnes + décalage de la 1ʳᵉ cellule via `--first-col` / `mondayIndex` (helper pur, testé).
- ✅ AC-5 : reflux `auto-fit` + `grid-column-start: auto` sous 520px.
- ✅ AC-6 : `1fr` / `minmax(96px,1fr)` → aucune scrollbar.
- ✅ AC-7 : `buildTimeline` et son test intacts (alignement purement CSS).
- tsc 0 / eslint 0 / 371 tests verts (+1 `mondayIndex`). Contrôle visuel desktop + mobile = passe humaine.
- Livré et poussé : commit `20dc6a1` (`feat(timeline): grille calendaire alignée lun→dim`).

### Change Log

- 2026-06-25 — Timeline alignée calendaire lun→dim (dimanche en fin de ligne) + reflux mobile. 4 fichiers, +50/-6.

### File List

- `daily-wheel/lib/format/date-fr.ts` (MODIFIED — +mondayIndex)
- `daily-wheel/components/ScheduleTimeline.tsx` (MODIFIED — --first-col + import CSSProperties)
- `daily-wheel/app/globals.css` (MODIFIED — grille 7 col + média mobile)
- `daily-wheel/tests/date-fr.unit.test.ts` (MODIFIED — +1 test mondayIndex)
