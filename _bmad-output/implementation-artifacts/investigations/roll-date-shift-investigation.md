# Investigation: Décalage des jours d'un roll figé au rechargement

## Hand-off Brief

1. **What happened.** Un roll tiré vendredi 26/06 réaffiche, lundi 29/06, les mêmes personnes dans le même ordre mais ancrées à partir de lundi au lieu de vendredi — tous les jours ont glissé (Confirmed).
2. **Where the case stands.** Root cause CONFIRMÉ et déterministe : le recompute-from-seed (5.6) ne persiste PAS la date d'ancrage ; `startDate` retombe sur `todayYMD()` à chaque rechargement (`participants-store.tsx:148`).
3. **What's needed next.** Persister la date d'ancrage du tirage et l'utiliser au replay — voir « Fix direction ». Action recommandée : `bmad-create-story` (gap architectural 5.6, pas un one-liner).

## Case Info

| Field            | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Ticket           | N/A                                                                        |
| Date opened      | 2026-06-29                                                                 |
| Status           | Concluded                                                                  |
| System           | daily-wheel (Next.js / React / Supabase) — recompute-from-seed Story 5.6   |
| Evidence sources | Code source (`lib/store`, `lib/domain`, `lib/ui`, `lib/data`)              |

## Problem Statement

Roll effectué vendredi 26/06. Lundi 29/06, le roll est inchangé (mêmes personnes assignées) mais tous les jours d'affectation se sont décalés : la personne rollée vendredi apparaît maintenant lundi, celle qui était sur lundi est passée mardi, etc. Hypothèse initiale (Solo) : placement des jours recalculé relativement à `today` au lieu d'être ancré à une date stockée au roll.

## Evidence Inventory

| Source                              | Status     | Notes                                                                 |
| ----------------------------------- | ---------- | --------------------------------------------------------------------- |
| `lib/domain/schedule.ts`            | Available  | Génération pure ; `startDate` = entrée externe (`:44`, `:99`, `:111`) |
| `lib/store/participants-store.tsx`  | Available  | `buildScheduleInput` + recompute au montage + handler `generate`      |
| `lib/data/rotation-state.ts`        | Available  | Schéma persisté : seed/cursor/mode UNIQUEMENT (`:12-19`)              |
| `lib/ui/rotation-resume.ts`         | Available  | `replayRotation(input, seed)` — replay déterministe (`:13`)          |
| `lib/ui/confirmed-roll.ts`          | Available  | Journal d'audit passif — porte la VRAIE date historique (`:26`)      |
| État réel de `settings.start_date`  | Missing    | Présumé `null` (défaut) — à confirmer sur la base distante           |

## Timeline of Events

| Time              | Event                                                                                          | Source                          | Confidence |
| ----------------- | ---------------------------------------------------------------------------------------------- | ------------------------------- | ---------- |
| Ven. 26/06        | Roll tiré : `generate()` résout `startDate = todayYMD() = 2026-06-26`, persiste `{seed, cursor}` | `participants-store.tsx:837-850` | Deduced    |
| Ven.→Lun.         | Rechargement(s) ; `settings.start_date` resté `null`                                           | `settings-reducer.ts:18`        | Deduced    |
| Lun. 29/06        | Recompute au montage : `startDate = todayYMD() = 2026-06-29` → planning ré-ancré à lundi        | `participants-store.tsx:270-283,148` | Confirmed  |

## Confirmed Findings

### Finding 1: La persistance de rotation ne stocke pas la date d'ancrage

**Evidence:** `lib/data/rotation-state.ts:12-19` (type `RotationState` = `id`, `seed`, `cursor`, `mode`, `updated_at`) ; commentaire `:8` « on persiste (graine + curseur + mode), pas le planning figé ».

**Detail:** Seuls seed, cursor et mode survivent. Aucune colonne ne fige la date de départ du tirage. Le handler `generate()` (`participants-store.tsx:850`) ne persiste que `{ seed, cursor: 0 }`.

### Finding 2: `startDate` est résolu dynamiquement à `todayYMD()`

**Evidence:** `participants-store.tsx:148` — `startDate: settings.start_date ?? todayYMD()` ; `settings-reducer.ts:18` — `start_date: null` (défaut quand la table est vide) ; `lib/format/date-fr.ts:59` — `todayYMD()`.

**Detail:** Quand `settings.start_date` est `null` (défaut), `buildScheduleInput` injecte la date du jour. Cette résolution se rejoue à CHAQUE construction de l'input.

### Finding 3: Le replay re-exécute `generateSchedule` depuis cet input à chaque chargement

**Evidence:** `participants-store.tsx:270-283` (recompute au montage si `seed != null`) et `:1032-1042` (recompute Realtime), tous deux via `buildScheduleInput(...)`. `lib/ui/rotation-resume.ts:13` confirme le contrat replay = `generateSchedule(input, createRng(seed))`.

**Detail:** Le seed fige l'ORDRE des personnes (shuffle déterministe), mais PAS les dates : celles-ci découlent de `startDate` via la Phase 0 / Phase 2 de `generateSchedule` (`schedule.ts:110-171`). Seed identique + `startDate` différent ⇒ mêmes personnes, dates décalées.

## Deduced Conclusions

### Deduction 1: Le glissement est exactement `today - jour_du_roll`

**Based on:** Findings 1, 2, 3.

**Reasoning:** Vendredi, Phase 0 part de `2026-06-26` → 1er slot vendredi. Lundi, le même seed est rejoué mais Phase 0 part de `2026-06-29` → 1er slot lundi (le WE 27-28 est de toute façon neutralisé). L'ordre des personnes est inchangé (seed identique), donc chaque personne « avance » au prochain jour ouvré disponible.

**Conclusion:** Symptôme reproduit à l'identique : décalage de l'ancrage du planning, pas une corruption du tirage. La prémisse de Solo est CONFIRMÉE.

## Hypothesized Paths

### Hypothesis 1: Placement recalculé relativement à `today` au lieu d'une date ancrée (prémisse Solo)

**Status:** Confirmed

**Theory:** Le replay ré-ancre le planning sur la date du jour faute de date de départ persistée.

**Supporting indicators:** Findings 1-3 ; chaîne `generate → rotation_state(seed only) → reload → buildScheduleInput(startDate=today) → generateSchedule`.

**Would confirm:** Recharger avec `settings.start_date = null` un autre jour ⇒ le planning suit `today`. (cf. Reproduction Plan)

**Would refute:** Un planning qui resterait ancré à vendredi malgré le changement de jour ⇒ aurait infirmé. Non observé.

**Resolution:** Confirmé par le code : `participants-store.tsx:148` + absence d'ancrage persisté (`rotation-state.ts:12-19`).

## Missing Evidence

| Gap                                       | Impact                                                         | How to Obtain                                  |
| ----------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| Valeur réelle de `settings.start_date`    | Si non-null, le bug ne se déclencherait pas (workaround connu) | Lire la ligne `settings` (table distante)      |

## Source Code Trace

| Element       | Detail                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Error origin  | `lib/store/participants-store.tsx:148` — `startDate: settings.start_date ?? todayYMD()`         |
| Trigger       | Rechargement / réabonnement Realtime un jour différent du tirage, avec `settings.start_date` null |
| Condition     | `rotation_state.seed != null` ET `settings.start_date == null` ⇒ replay ré-ancré à `today`      |
| Related files | `lib/data/rotation-state.ts` (schéma sans ancrage), `lib/ui/rotation-resume.ts` (contrat replay), `lib/domain/schedule.ts:110-171` (Phase 0/2), `lib/store/participants-store.tsx:837-850` (`generate`), `lib/ui/confirmed-roll.ts` (journal porte la vraie date) |

## Conclusion

**Confidence:** High

Root cause CONFIRMÉ et déterministe. La fonctionnalité « reprise de rotation » (Story 5.6) persiste la graine, le curseur et le mode mais **pas la date d'ancrage** du tirage. Comme `buildScheduleInput` résout `startDate` à `todayYMD()` dès que `settings.start_date` est `null` (le défaut), rejouer le seed un autre jour ré-ancre tout le planning sur la date courante. Le seed garantit le même ordre de personnes, d'où le symptôme exact : mêmes animateurs, jours décalés.

Détail clé : le journal d'audit `confirmed_rolls` (Story 5.10) stocke, lui, la VRAIE date historique en snapshot (`confirmed-roll.ts:26`), mais l'affichage repose sur le recompute-from-seed (5.6 AC-2) et ne le consulte pas — la donnée correcte existe mais n'est pas utilisée pour le rendu.

## Recommended Next Steps

### Fix direction

Le mécanisme est unique : **ancrer la date de départ au moment du roll et la rejouer**. Options (par mécanisme) :

1. **Persister l'ancrage dans `rotation_state`** (recommandé, aligné 5.6) — ajouter une colonne `start_date` (ou `anchor_date`) écrite par `generate()` avec le `startDate` RÉSOLU, et la consommer au replay (`buildScheduleInput` au montage + `recomputeFromSeed`). Nécessite une migration Supabase (cf. mémoire : vérifier l'application distante après ajout).
2. **Figer `settings.start_date` au tirage** — au `generate()`, faire `updateSettings({ start_date: résolu })`. Plus léger, mais couple l'ancrage de rotation à un réglage global et peut surprendre sur les tirages suivants.

Option 1 préférée : l'ancrage appartient à la rotation, pas aux réglages.

### Diagnostic

- Confirmer `settings.start_date` distant (si déjà renseigné, le bug ne se manifeste pas — utile comme workaround immédiat : poser `start_date` = date voulue).
- Test domaine : `generateSchedule` avec même seed et deux `startDate` (vendredi vs lundi) ⇒ assert mêmes `participantId` dans le même ordre, dates décalées (verrouille le diagnostic et la régression future).

## Reproduction Plan

1. État : participants actifs, `settings.start_date = null`, aucune indispo bloquante.
2. Jour J (ex. vendredi) : tirer un roll → noter dates + personnes ; `rotation_state` = `{seed, cursor:0}`.
3. Jour J+n (lundi) : recharger la page (montage → recompute-from-seed).
4. Attendu (bug) : mêmes personnes/ordre, 1er slot = lundi au lieu de vendredi (décalage = jours ouvrés écoulés).
5. Attendu (après fix option 1) : 1er slot reste vendredi, indépendamment du jour de rechargement.

## Side Findings

- `confirmed_rolls` (5.10) contient la date historique exacte par roll (`confirmed-roll.ts:26`) — réutilisable pour un affichage « historique fidèle » ou une vérification croisée, mais hors périmètre du recompute-from-seed actuel. (Confirmed)
- Le `scheduleSignature` (5.9, rerun-nudge) n'inclut vraisemblablement pas `startDate` dans sa notion de « périmé » sinon le nudge aurait alerté au changement de jour — à vérifier si on touche à l'ancrage. (Hypothesized)
