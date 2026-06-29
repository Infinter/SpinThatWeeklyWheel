---
baseline_commit: cf232b3a42a26261d79434e71af96ae50e96b2d0
---

# Story 5.17: 🐛 Fix — Ancrer la date de départ d'une rotation persistée (décalage des jours au rechargement)

Status: review

<!-- TYPE: BUG FIX (correction de défaut, PAS une nouvelle feature). Régression de la Story 5.6
     (recompute-from-seed), latente jusqu'à l'application de la migration rotation_state (2026-06-25),
     devenue observable dès que la reprise fonctionne. Investigation : voir case file ci-dessous. -->
<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur de Daily Wheel qui a tiré une rotation un jour donné,
I want que le planning rouvert un autre jour reste ancré à la date du tirage (les mêmes personnes restent sur les mêmes dates),
so that la personne tirée pour vendredi reste sur vendredi et ne « glisse » pas sur lundi au prochain chargement.

## Bug — symptôme, root cause, preuve

**Symptôme (rapporté par Solo, 2026-06-29)** : roll tiré le vendredi 26/06. Le lundi 29/06, le roll est inchangé (mêmes personnes, même ordre) **mais tous les jours d'affectation ont glissé** : la personne tirée pour vendredi se retrouve placée lundi, celle qui était lundi passe mardi, etc.

**Root cause (CONFIRMÉ, déterministe — confiance haute)** :
La reprise de rotation (Story 5.6) persiste `seed` + `cursor` + `mode` **mais jamais la date d'ancrage du tirage**. Au replay, `buildScheduleInput` résout `startDate: settings.start_date ?? todayYMD()` — or `settings.start_date` vaut `null` par défaut → `startDate` retombe sur **la date du jour à chaque rechargement**. Le seed fige l'ORDRE des personnes (shuffle déterministe), pas les dates : les dates découlent de `startDate` via la Phase 0/2 de `generateSchedule`. Seed identique + `startDate` différent ⇒ mêmes animateurs, planning ré-ancré sur `today`.

**Chaîne de preuve** :
- `lib/data/rotation-state.ts:12-19` + `:36-40` — schéma persisté = `seed`/`cursor`/`mode` UNIQUEMENT (aucune date d'ancrage).
- `lib/store/participants-store.tsx:148` — `startDate: settings.start_date ?? todayYMD()`.
- `lib/store/settings-reducer.ts:18` — `start_date: null` (défaut quand la table est vide).
- `lib/store/participants-store.tsx:270-283` (replay au montage) et `:1032-1042` (`recomputeFromSeed` Realtime) — rejouent `generateSchedule(input, createRng(seed))` avec ce `startDate` recalculé.
- `lib/store/participants-store.tsx:837-850` — `generate()` persiste `{ seed, cursor: 0 }`, jamais le `startDate` résolu.
- `lib/domain/schedule.ts:110-171` — Phase 0/2 ancrent le planning sur `startDate`.

**Donnée correcte disponible mais non utilisée** : le journal d'audit `confirmed_rolls` (Story 5.10) stocke la VRAIE date historique en snapshot (`lib/ui/confirmed-roll.ts:26`), mais l'affichage repose sur le recompute-from-seed et ne le consulte pas.

**Case file complet** : `_bmad-output/implementation-artifacts/investigations/roll-date-shift-investigation.md`

## Décision de correction (option 1 du case file — validée Solo)

Persister la **date d'ancrage RÉSOLUE** au moment du roll dans `rotation_state` (nouvelle colonne `start_date`, text YMD nullable), puis la **consommer au replay** (montage + `recomputeFromSeed`) en surchargeant `input.startDate`. `generateSchedule` reste PUR et inchangé (l'ancrage est une entrée, pas une nouvelle règle de domaine).

**Rejeté (option 2)** : figer `settings.start_date` au tirage — couple l'ancrage de rotation à un réglage global et surprendrait les tirages suivants. L'ancrage appartient à la rotation, pas aux réglages.

## Acceptance Criteria

1. **AC-1 — Ancrage persisté au tirage.** `generate()` persiste, en plus de `seed`/`cursor`/`mode`, la date de départ RÉSOLUE du tirage (`input.startDate`, c.-à-d. `settings.start_date ?? todayYMD()` au moment du roll) dans `rotation_state.start_date`.
2. **AC-2 — Replay ancré.** Au montage ET dans `recomputeFromSeed`, quand `seed != null` et `rotation_state.start_date` est présent, le planning rejoué est ancré sur cette date persistée — **pas** sur `todayYMD()`. Conséquence vérifiable : recharger un autre jour ne décale plus les affectations.
3. **AC-3 — Déterminisme préservé (NFR7/AD-2).** `generateSchedule` reste pur et inchangé ; même `(input, seed)` ⇒ même résultat. L'ancrage est injecté côté store via `input.startDate`, sans modifier la signature ni la logique du domaine.
4. **AC-4 — Dégradation gracieuse / rétrocompat.** `start_date` est nullable. Une rotation persistée sans ancrage (ligne antérieure au fix, ou colonne absente si migration non encore appliquée) retombe sur le comportement actuel (fallback `settings.start_date ?? todayYMD()`) sans crash. La persistance reste best-effort (5.16, `silent: true`).
5. **AC-5 — Migration appliquée et vérifiée + backfill du roll en cours.** La colonne `start_date` est ajoutée par une nouvelle migration qui **backfille la ligne `singleton` existante à `'2026-06-29'`** (ré-ancrage du roll en cours à aujourd'hui — décision Solo), appliquée à la base distante (`supabase db push`), puis vérifiée (cf. mémoire `supabase-migration-apply` : la migration 5.6 avait drifté).
6. **AC-6 — Garde de régression (test domaine).** Un test verrouille le mécanisme : `generateSchedule` avec **même seed** et **deux `startDate` distincts** (ex. un vendredi vs le lundi suivant) ⇒ **mêmes `participantId` dans le même ordre**, dates décalées. Plus un test du helper pur de résolution d'ancrage (anchor persisté ⇒ utilisé ; null ⇒ fallback).
7. **AC-7 — Aucune régression.** tsc 0 / eslint 0 / suite de tests verte / build OK. Domaine/wheel/timeline/spin-mode/exports/golden INTACTS.

## Tasks / Subtasks

- [x] **Task 1 — Migration : colonne d'ancrage (AC-1, AC-5)** — appliquée + vérifiée en distant (autorisée Solo 2026-06-29).
  - [x] Nouvelle migration `supabase/migrations/20260629120000_add_rotation_state_start_date.sql` : `add column if not exists start_date text` (nullable, text YMD — anti-UTC, cf. `confirmed_rolls.date`).
  - [x] **Backfill (DÉCISION Solo 2026-06-29) — ré-ancrer le roll EN COURS à AUJOURD'HUI.** Dans la même migration : `update public.rotation_state set start_date = '2026-06-29' where id = 'singleton' and seed is not null and start_date is null;`. Gèle l'état affiché aujourd'hui (1er slot = lundi 29/06) comme ancrage permanent → aucun saut visible. Date littérale (déterministe vs TZ/minuit). NON retenu : backfill rétroactif vendredi depuis `confirmed_rolls`.
  - [x] **APPLIQUÉE** (autorisée Solo) — `npx supabase db push` → migration `20260629120000` appliquée. VÉRIFIÉ via REST : ligne `singleton` (seed 692787706, cursor 11) porte `start_date: "2026-06-29"`. Le warning Docker (cache catalogue local) est non bloquant.

- [x] **Task 2 — Couche données : étendre le contrat rotation_state (AC-1, AC-4)**
  - [x] `lib/data/rotation-state.ts` : `start_date: string | null` ajouté à `RotationState` ; `start_date?: string` ajouté à `RotationStateWritePayload`.
  - [x] `lib/store/rotation-state-reducer.ts` : `start_date: null` ajouté à `DEFAULT_ROTATION_STATE`.
  - [x] `lib/store/reconcile.ts` (`reconcileRotationState`) vérifié : LWW scalaire générique, aucun champ codé en dur → `start_date` transite sans modification. (+ `toServerRotationState` étendu pour ne pas perdre l'ancre au rollback RESTORE.)

- [x] **Task 3 — Route proxy : allowlist + validation (AC-1)**
  - [x] `app/api/rotation_state/route.ts` : `'start_date'` ajouté à `ALLOWED` ; constante `YMD` ajoutée.
  - [x] `validateUpsert` : `if ('start_date' in picked)` → string format YMD (sinon 400) ; message « colonnes autorisées » mis à jour.

- [x] **Task 4 — Store : persister l'ancrage au roll + l'utiliser au replay (AC-1, AC-2, AC-3, AC-4)**
  - [x] `generate()` : `updateRotationState({ seed, cursor: 0, start_date: input.startDate })`.
  - [x] Replay au montage : input de reprise factorisé (`initialReplay`), `input.startDate` ancré via `resolveReplayStartDate(initialRotationState.start_date, …)`, PARTAGÉ par `schedule` ET `signatureAtGenerate` (pas de faux positif rerun-nudge 5.9).
  - [x] `recomputeFromSeed(seed, anchor)` : ancre passée EXPLICITEMENT (depuis `event.new.start_date` / `row.start_date`), PAS via la ref miroir (mise à jour async après re-rendu → porterait l'ancienne valeur sur un écho Realtime). Garde « recalcul seulement si la graine change » préservée.
  - [x] Helper pur `resolveReplayStartDate(persisted, fallback)` dans `lib/ui/rotation-resume.ts` (ancre TDD ; `persisted` non vide ⇒ utilisé, sinon fallback).

- [x] **Task 5 — Tests (AC-6, AC-7)**
  - [x] `tests/schedule.unit.test.ts` : même seed + startDate vendredi (26/06) vs lundi (29/06) ⇒ mêmes `participantId` ordonnés, dates décalées, 1er slot = startDate fourni.
  - [x] `tests/rotation-resume.unit.test.ts` : `resolveReplayStartDate` (persisté / null / undefined / chaîne vide). + `tests/rotation-state-reducer.unit.test.ts` : fixtures étendues + assertion transit `start_date` via HYDRATE.
  - [x] Gates : tsc 0 / eslint 0 / **376 tests** / build OK.

- [ ] **Task 6 — ⏳ PASSE HUMAINE (AC-2, AC-5)**
  - [ ] Contrôle navigateur : tirer un roll, recharger un autre jour, confirmer que le 1er slot ne glisse plus ; vérifier reprise depuis un 2ᵉ navigateur ; confirmer migration appliquée en distant.

## Dev Notes

### État actuel des fichiers UPDATE (à préserver)

- **`lib/domain/schedule.ts`** — FEUILLE PURE, NE PAS MODIFIER : aucun `Date`, dates YMD comparées lexicographiquement, aléa injecté. Le fix ne touche pas le domaine ; il lui fournit le bon `startDate`. Le « glissement » selon `startDate` est le comportement CORRECT du domaine — le bug est l'absence d'ancrage en amont.
- **`lib/store/participants-store.tsx`** — `buildScheduleInput` (`:128-150`) résout `startDate`. Deux sites de replay : montage (`:270-283`) et `recomputeFromSeed` (`:1032-1042`). `recomputeFromSeed` ne recalcule QUE si la GRAINE change (`:1057-1059`) — un écho de curseur/mode ne doit pas réinitialiser la vue ; ne pas casser cette garde. Refs miroir : `stateRefR` = rotation_state, `stateRefS` = settings.
- **`lib/data/rotation-state.ts`** / **`rotation-state-reducer.ts`** / **`reconcile.ts`** — patron SCALAIRE singleton calqué sur `settings`. Le cycle OPTIMISTIC→CONFIRM|RESTORE et le LWW (`updated_at`) doivent rester intacts ; `start_date` est un simple champ scalaire de plus.
- **`app/api/rotation_state/route.ts`** — allowlist AVANT écriture (AD-14) + validation défensive (AD-17:400). Garde passphrase (AD-8) inchangée.

### Pourquoi l'ancrage, pas un planning figé

Le principe 5.6 (UX-DR9/NFR7/AD-2) reste sacré : on ne persiste JAMAIS le planning figé, seulement un mécanisme reproductible. Ajouter `start_date` à ce mécanisme (seed + cursor + mode + **ancrage**) est cohérent : `generateSchedule(input{startDate}, createRng(seed))` redevient pleinement déterministe à travers les jours.

### Contexte régression

Régression latente de la 5.6 : la migration `rotation_state` n'a été appliquée en distant que le 2026-06-25 (cf. note sprint-status, mémoire `supabase-migration-apply`). Tant que la persistance était KO (REST 404), aucune reprise ⇒ bug invisible. Depuis l'application + best-effort (5.16), la reprise fonctionne et expose le décalage. À noter au prochain retro Epic 5.

### Convention dates (CRITIQUE)

`start_date` en **text YMD**, jamais `date`/`timestamptz`, pour éviter toute conversion UTC (même choix que `confirmed_rolls.date`). Comparaisons/itérations via `addDays` (entier civil), jamais `Date`.

### Recherche web

Non applicable — bug interne, aucune lib/API externe nouvelle. Étape sautée.

### References

- [Source: investigations/roll-date-shift-investigation.md — root cause confirmé, chaîne de preuve]
- [Source: daily-wheel/lib/store/participants-store.tsx#buildScheduleInput (:148), replay montage (:270-283), generate (:837-850), recomputeFromSeed (:1032-1042)]
- [Source: daily-wheel/lib/data/rotation-state.ts#RotationState + RotationStateWritePayload]
- [Source: daily-wheel/lib/store/rotation-state-reducer.ts#DEFAULT_ROTATION_STATE]
- [Source: daily-wheel/app/api/rotation_state/route.ts#ALLOWED (:12) + validateUpsert (:53-72)]
- [Source: daily-wheel/supabase/migrations/20260624120000_add_rotation_state.sql — schéma 5.6 à étendre]
- [Source: daily-wheel/lib/domain/schedule.ts#Phase0/Phase2 (:110-171) — ancrage sur startDate, NE PAS modifier]
- [Source: daily-wheel/lib/ui/confirmed-roll.ts:38 — motif validation YMD à réutiliser ; :26 — date historique snapshot]
- [Source: daily-wheel/lib/ui/rotation-resume.ts — contrat replay déterministe, hôte du helper resolveReplayStartDate]
- [Source: mémoire supabase-migration-apply — appliquer via supabase db push + vérifier le distant]
- [Source: échange Solo 2026-06-29 ; story 5.6 (persistance) ; story 5.16 (best-effort silent)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev-story)

### Debug Log References

- Phase ROUGE : `vitest run tests/rotation-resume.unit.test.ts tests/schedule.unit.test.ts` → 4 échecs `resolveReplayStartDate is not a function` (helper absent) ; garde domaine 5.17 verte d'emblée (caractérisation du mécanisme existant — attendu).
- Phase VERTE/refactor : `tsc --noEmit` a flagué uniquement `tests/rotation-state-reducer.unit.test.ts` (littéraux `RotationState` sans `start_date`) → fixtures corrigées.
- Validation finale : tsc 0 / eslint 0 / `vitest run` 376/376 / `npm run build` OK (route `/api/rotation_state` inchangée côté contrat public).

### Completion Notes List

- ✅ **AC-1** — `generate()` persiste `start_date: input.startDate` (date résolue du tirage) ; route allowlist + validation YMD.
- ✅ **AC-2** — Replay ancré aux DEUX sites (montage `initialReplay` + `recomputeFromSeed(seed, anchor)`), via `resolveReplayStartDate`. Le planning ne retombe plus sur `todayYMD()`.
- ✅ **AC-3** — `generateSchedule` PUR/inchangé ; l'ancrage est injecté côté store via `input.startDate`. Déterminisme NFR7 préservé (test rejouabilité 5.6 toujours vert).
- ✅ **AC-4** — `start_date` nullable ; `resolveReplayStartDate(null|undefined|'', fallback)` ⇒ fallback (comportement 5.6). Persistance best-effort 5.16 intacte (`silent: true`).
- ✅ **AC-5** — Migration + backfill appliqués en distant (autorisé Solo) ; vérifié via REST : `singleton.start_date = "2026-06-29"`. Le roll en cours est ré-ancré à aujourd'hui (ne glisse plus).
- ✅ **AC-6** — Garde domaine (même seed / 2 startDate) + tests helper + assertion transit HYDRATE.
- ✅ **AC-7** — tsc 0 / eslint 0 / 376 tests / build OK. Domaine/wheel/timeline/spin-mode/exports/golden INTACTS.
- **Décision de conception** : ancre passée EXPLICITEMENT à `recomputeFromSeed` (depuis `event.new`/`row`) plutôt que lue via `stateRefR` — la ref miroir est mise à jour en `useEffect` (après re-rendu), donc obsolète au moment d'un écho Realtime. Évite un replay sur l'ancienne ancre.
- **Effet de bord corrigé** : `toServerRotationState` (snapshot RESTORE) étendu à `start_date`, sinon l'ancre serait perdue au rollback optimiste (et tsc l'aurait refusé).

### Change Log

- 2026-06-29 — Story 5.17 (bug fix) implémentée (Amelia/dev-story) : ancrage de la date de départ d'une rotation persistée. Colonne `rotation_state.start_date` (migration + backfill `'2026-06-29'`) ; contrat data/reducer/route étendus ; `generate()` persiste l'ancre ; replay (montage + recompute Realtime) la rejoue via helper pur `resolveReplayStartDate`. +6 tests (helper ×4, garde domaine, transit HYDRATE), fixtures reducer mises à jour. tsc 0 / eslint 0 / 376 tests / build OK. ⏳ Reste passe humaine : `supabase db push` + vérif distant + contrôle navigateur.

### File List

- `daily-wheel/supabase/migrations/20260629120000_add_rotation_state_start_date.sql` (NEW — colonne `start_date` + backfill roll en cours à 2026-06-29)
- `daily-wheel/lib/data/rotation-state.ts` (MODIFIED — `start_date` dans `RotationState` + `RotationStateWritePayload`)
- `daily-wheel/lib/store/rotation-state-reducer.ts` (MODIFIED — `start_date: null` dans `DEFAULT_ROTATION_STATE`)
- `daily-wheel/app/api/rotation_state/route.ts` (MODIFIED — `ALLOWED` + regex `YMD` + validation `start_date`)
- `daily-wheel/lib/ui/rotation-resume.ts` (MODIFIED — helper pur `resolveReplayStartDate`)
- `daily-wheel/lib/store/participants-store.tsx` (MODIFIED — import helper ; `toServerRotationState` ; `initialReplay` ancré ; `generate()` persiste l'ancre ; `recomputeFromSeed(seed, anchor)`)
- `daily-wheel/tests/rotation-resume.unit.test.ts` (MODIFIED — tests `resolveReplayStartDate`)
- `daily-wheel/tests/schedule.unit.test.ts` (MODIFIED — garde de régression du décalage)
- `daily-wheel/tests/rotation-state-reducer.unit.test.ts` (MODIFIED — fixtures `start_date` + assertion HYDRATE)
