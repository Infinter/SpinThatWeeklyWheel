---
title: 'Bandeau « personne du jour » persistant'
type: 'feature'
created: '2026-07-01'
status: 'done'
context: []
baseline_commit: 'fec0d0a0a3a1f1f4ace3340f73dae728d4b40092'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'animateur du standup d'aujourd'hui n'est visible qu'en ouvrant l'étape 3 « Spin » puis en parcourant la timeline pour repérer la case du jour — trop d'étapes pour une info consultée quotidiennement.

**Approach:** Un bandeau persistant sous le header, visible sur les 3 étapes (Équipe/Contraintes/Spin), qui « remonte » l'animateur du jour. Il respecte le suspense : le nom n'apparaît que si ce jour a déjà été tiré (curseur de révélation persisté `rotationCursor`), sinon « à tirer 🎡 ».

## Boundaries & Constraints

**Always:**
- La résolution « qui anime aujourd'hui » est une fonction PURE isolée dans `lib/ui/` (aucun React/DOM/Supabase), testable en env node (AD-1).
- Réutiliser le contrat couleur partagé (`buildColorIndexMap` sur les participants actifs, ordre du store) — même index que roue/timeline.
- Le nom d'aujourd'hui n'est révélé que si son jour ouvré est déjà tiré selon `rotationCursor` (respect du suspense 5.4).
- Pastille couleur `aria-hidden`, nom en clair : la couleur n'est jamais le seul signal (UX-DR13).
- « Aujourd'hui » = `todayYMD()` (heure locale, jamais `toISOString()` — convention dates).

**Ask First:**
- Ajouter un « prochain standup » quand aujourd'hui n'a pas de session (hors périmètre par défaut, cf. Never).

**Never:**
- Ne PAS ajouter de nouvelle région `aria-live` : la région `.reveal` de `ScheduleResult` gère déjà les annonces (éviter la double-annonce).
- Ne PAS modifier le domaine (`generateSchedule`), le type `ScheduleResult`, ni la mécanique de révélation de `ScheduleResult`.
- Ne PAS afficher le « prochain » animateur ni de compte à rebours (différé).
- Ne PAS écrire côté serveur (100 % lecture du store).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Jour tiré | `today` est le jour ouvré d'index `i` dans `planning`, `i < rotationCursor` | Pastille couleur + « {nom} anime le standup d'aujourd'hui » + date longue | N/A |
| Jour non tiré | `today` = jour ouvré d'index `i`, `i >= rotationCursor` | « Aujourd'hui : à tirer 🎡 » (nom caché) | N/A |
| Pas de session | `today` absent du `planning` (WE / férié / jour off / hors période) | « Pas de standup aujourd'hui » | N/A |
| Aucune rotation | `schedule === null` ou `planning` vide | Aucun bandeau rendu (retourne `null`) | N/A |

</frozen-after-approval>

## Code Map

- `daily-wheel/lib/format/date-fr.ts` -- fournit `todayYMD()` et `dateLongNoWeekdayFr()` (réutilisés, ne pas dupliquer).
- `daily-wheel/lib/domain/schedule.ts` -- type `ScheduleRow` (`{ date, participantId, name }`) consommé par le helper.
- `daily-wheel/lib/ui/participant-colors.ts` -- `buildColorIndexMap`, `colorForIndex`, `initialOf` (contrat couleur partagé).
- `daily-wheel/lib/store/participants-store.tsx` -- `useParticipants()` expose `schedule`, `rotationCursor`, `participants`.
- `daily-wheel/app/page.tsx` -- point de montage du bandeau (dans le provider store, hors StepNav).
- `daily-wheel/app/globals.css` -- classes `.app-header` / `.day .av-lg` existantes à imiter pour le style.
- `daily-wheel/tests/timeline.unit.test.ts` -- gabarit de test pour la nouvelle feuille pure.

## Tasks & Acceptance

**Execution:**
- [x] `daily-wheel/lib/ui/today-standup.ts` -- helper pur `resolveTodayStandup(planning, revealedCount, todayYmd)` renvoyant l'union `{ kind: 'none' } | { kind: 'pending' } | { kind: 'revealed', participantId, name }` -- isole la logique (AD-1). Trouve l'index `i` tel que `planning[i].date === todayYmd` ; absent → `none` ; `i < revealedCount` → `revealed` ; sinon → `pending`.
- [x] `daily-wheel/tests/today-standup.unit.test.ts` -- couvre les 4 scénarios de la matrice + bornes : `revealedCount = 0`, today == premier/dernier jour ouvré, planning vide. (8 cas, verts)
- [x] `daily-wheel/components/TodayStandupBanner.tsx` -- composant client `'use client'` : lit `schedule`, `rotationCursor`, `participants` via `useParticipants()`. `schedule` null / planning vide → rend `null`. Sinon appelle le helper avec `todayYMD()` et rend le bandeau (pastille via le contrat couleur pour `revealed`, libellés « à tirer » / « pas de standup »).
- [x] `daily-wheel/app/page.tsx` -- monter `<TodayStandupBanner />` entre `</header>` et `<StepNavProvider>` (dans `ParticipantsStoreProvider`, hors des `StepPanel`).
- [x] `daily-wheel/app/globals.css` -- styles `.today-banner` : compact, theme-aware (variables CSS existantes), pastille réutilisant l'aspect `.av-lg`.

**Acceptance Criteria:**
- Given une rotation tirée dont un jour ouvré == aujourd'hui et déjà révélé, when la page s'affiche sur n'importe quelle étape, then le bandeau nomme l'animateur du jour avec sa pastille couleur, sans ouvrir l'étape 3.
- Given aujourd'hui est un jour ouvré non encore tiré, when la page s'affiche, then le bandeau affiche « à tirer » sans révéler le nom.
- Given aujourd'hui n'a pas de session (WE/férié/hors période), when la page s'affiche, then le bandeau affiche « Pas de standup aujourd'hui ».
- Given aucune rotation lancée, when la page s'affiche, then aucun bandeau n'est rendu.

## Design Notes

`rotationCursor` (persisté) est la source de révélation du bandeau : en « jour le jour » il avance à chaque tirage (bandeau à jour immédiatement) ; en « rotation complète » il n'est persisté qu'au terme de l'enchaînement — le bandeau bascule alors de « à tirer » au nom en fin d'animation. Choix assumé : le bandeau reflète l'état RÉVÉLÉ/persisté, pas le curseur d'animation local de `ScheduleResult` (découplage, pas de lifting d'état).

## Verification

**Commands:**
- `cd daily-wheel && npm test` -- expected: `today-standup.unit.test.ts` vert + suite existante intacte.
- `cd daily-wheel && npm run lint` -- expected: 0 erreur.
- `cd daily-wheel && npm run build` -- expected: build + types OK.

**Manual checks:**
- `npm run dev` : le bandeau est visible et identique sur les 3 étapes ; nommé après tirage du jour, « à tirer » avant, « pas de standup » un week-end.

## Suggested Review Order

**Décision « personne du jour » (cœur pur)**

- Point d'entrée : la logique métier, isolée et testable — comprendre les 3 issues avant tout.
  [`today-standup.ts:18`](../../daily-wheel/lib/ui/today-standup.ts#L18)

- L'échelle décisive : `-1 → none`, `index < curseur → revealed`, sinon `pending` (suspense respecté).
  [`today-standup.ts:23`](../../daily-wheel/lib/ui/today-standup.ts#L23)

**Rendu & liaison au store**

- Le composant : garde « aucune rotation », appel du cœur pur avec `todayYMD()`, branchement des 3 états.
  [`TodayStandupBanner.tsx:23`](../../daily-wheel/components/TodayStandupBanner.tsx#L23)

- Contrat couleur partagé (actifs, `?? 0`) — même index que roue/timeline ; point du finding déféré.
  [`TodayStandupBanner.tsx:31`](../../daily-wheel/components/TodayStandupBanner.tsx#L31)

- Montage PERSISTANT hors StepNav → visible sur les 3 étapes.
  [`page.tsx:78`](../../daily-wheel/app/page.tsx#L78)

**Périphérie (style, tests)**

- Styles `.today-banner` : 100 % variables CSS (thème clair/sombre), pastille façon `.av-lg`.
  [`globals.css:106`](../../daily-wheel/app/globals.css#L106)

- 8 cas unitaires : matrice I/O + bornes (curseur 0, premier/dernier jour, planning vide, curseur > longueur).
  [`today-standup.unit.test.ts:11`](../../daily-wheel/tests/today-standup.unit.test.ts#L11)
