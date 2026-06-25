---
baseline_commit: b61cf4d3a0eb64728100037569ba754c935217f9
---

# Story 5.10: Journal d'audit des rolls validés (`confirmed_rolls`)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> ⚠️ Story HORS `epics.md` — née d'un échange avec Solo (2026-06-25). Rattachée à l'Epic 5
> (prolonge la persistance serveur de la Story 5.6). Renumérotable si un epic dédié est préféré.

## Story

As a animateur d'équipe utilisant la roue,
I want que le résultat de chaque tirage soit enregistré en base **au moment où il est révélé/validé** (pas à l'amorce du spin),
so that l'historique « qui a animé le standup de quelle date » survive aux re-tirages et aux changements de contraintes — sans jamais altérer le comportement actuel de la roue ni de l'affichage.

## Contexte & décisions (échange Solo, 2026-06-25)

- **Problème résolu : le drift.** Aujourd'hui le planning n'est JAMAIS figé — il est recalculé depuis `seed` + contraintes vivantes (Story 5.6, AC-2 ; `lib/store/participants-store.tsx:261-279`). Si une contrainte change après une révélation, le recalcul peut réattribuer une date déjà passée → l'historique réel se perd. Ce journal capture la vérité **au moment de la validation**.
- **Décision 1 — Rôle = journal d'audit PASSIF.** Le journal n'influence NI l'affichage NI le re-roll. Le modèle « recompute-from-seed » reste l'unique source de vérité d'affichage (5.6 AC-2 préservé). Rejeté : « source autoritaire » (le figé prévaudrait sur le recalcul).
- **Décision 2 — Aucun verrou.** Pas de re-roll partiel, pas de « lock des dates passées ». Un re-roll régénère tout comme aujourd'hui (`generate()`, nouveau seed, curseur 0). Le journal ne fait que tracer.
- **Décision 3 — Clé composite `(seed, date)`.** Re-révéler le même slot dans la MÊME génération → idempotent (upsert, zéro doublon). Re-roll → nouveau `seed` → NOUVELLES lignes conservées → historique des décisions successives préservé. (Évite l'écrasement qu'aurait causé un upsert par `date` seul.)
- **Décision 4 — `name` + `participant_id` = snapshot dénormalisé** (anti-drift). La ligne survit au renommage/suppression du participant.

## Acceptance Criteria

1. **AC-1 — Écriture à la validation, pas au roll.** Lorsqu'un slot est révélé dans `handleRevealed` (`components/ScheduleResult.tsx:205-238`), le roll correspondant est persisté dans `confirmed_rolls`. Aucune écriture à l'amorce du spin (`handleSpin`) ni pendant l'animation.
2. **AC-2 — Schéma & idempotence.** Ligne = `{ seed, date, participant_id, name, confirmed_at }`, PK composite `(seed, date)`. L'écriture est un `upsert` `onConflict: 'seed,date'` : re-valider le même `(seed, date)` met à jour la ligne existante (zéro doublon) ; un nouveau `seed` (re-roll) crée de NOUVELLES lignes (append, historique conservé).
3. **AC-3 — Snapshot anti-drift, aucune FK cascade.** `name` et `participant_id` sont des valeurs littérales figées à l'écriture. **AUCUNE foreign key avec `ON DELETE CASCADE`** vers `participants` : renommer OU supprimer le participant ensuite ne modifie NI n'efface la ligne historisée.
4. **AC-4 — Journal 100 % passif.** Le journal n'introduit aucun verrou, n'impacte pas `generate()` (re-roll inchangé) ni l'affichage du planning (recompute-from-seed inchangé, 5.6 AC-2 intact). Aucune lecture du journal côté UI dans cette story.
5. **AC-5 — Chaque slot révélé journalisé exactement une fois, dans les DEUX modes.** En « Rotation complète » (enchaînement auto) comme en « Jour le jour », chaque révélation produit une écriture — **indépendamment** de la granularité du curseur de la 5.6 (qui, lui, n'écrit qu'au curseur final en mode complet). Ne PAS gater l'écriture du journal derrière `shouldChainNext`.
6. **AC-6 — Best-effort silencieux.** Écriture via le proxy passphrase + `useWriteQueue` avec `silent: true` : un échec NE lève PAS le bandeau d'erreur global ; la roue et le planning continuent de fonctionner (cohérent avec la persistance 5.6, décision Solo 2026-06-24).
7. **AC-7 — Sécurité (calquée sur le patron existant).** RLS : `SELECT to anon using (true)`, aucune policy insert/update/delete (seule la Route Handler à clé secrète écrit). Allowlist serveur stricte `[seed, date, participant_id, name]` ; `confirmed_at` posé SERVEUR ; garde passphrase `timingSafeEqual` (AD-8) ; validation défensive → 400 (AD-17).
8. **AC-8 — `seed` null → no-op.** Si aucune rotation n'est persistée (`seed == null` dans la slice rotation du store — cas migration absente / best-effort échoué), `recordConfirmedRoll` ne tente AUCUNE écriture (rien à estampiller).
9. **AC-9 — Tests (Vitest).** (a) Unit pur sur le cœur de validation/mapping du payload (ancre TDD rouge→vert) ; (b) intégration write round-trip de la route (gated env, modèle `settings.write.integration.test.ts`) couvrant : passphrase absente → 401, upsert → 200, idempotence `(seed,date)` (2 upserts → 1 ligne), op invalide → 400, allowlist (champ hors liste ignoré / data vide → 400). Domaine/wheel/timeline/spin-mode/rotation-resume/golden/exports INTACTS.

## Tasks / Subtasks

- [x] **Task 1 — Cœur pur + tests (ancre TDD)** (AC: #2, #7, #9a)
  - [x] Créer `lib/ui/confirmed-roll.ts` : `buildConfirmedRollPayload(seed: number, row: ScheduleRow)` → `{ seed, date, participant_id, name }` (mapping `participantId → participant_id`) + `validateConfirmedRoll(picked)` (seed uint32, date string non vide, participant_id/name strings) réutilisable par la route.
  - [x] Écrire `tests/confirmed-roll.unit.test.ts` AVANT l'implémentation (rouge → vert) : mapping correct des champs, rejet seed hors [0, 2^32-1], rejet champs manquants/typés faux.
- [x] **Task 2 — Migration** (AC: #2, #3, #7)
  - [x] Créer `supabase/migrations/<timestamp>_add_confirmed_rolls.sql` (timestamp > `20260624120000`). Table `public.confirmed_rolls` : `seed bigint not null`, `date text not null`, `participant_id text not null`, `name text not null`, `confirmed_at timestamptz not null default now()`, **PK `(seed, date)`**. Convention `text` pour `date` (YMD, JAMAIS type `date` Postgres → évite le décalage UTC ; cf. `lib/format/date-fr.ts`).
  - [x] **AUCUNE FK** vers `participants` (AC-3). Commentaire SQL explicite : le journal doit survivre à la suppression d'un participant.
  - [x] RLS : `enable row level security` + `create policy "public read confirmed_rolls" ... for select to anon using (true)`. Aucune policy d'écriture.
  - [x] **PAS** d'ajout à `supabase_realtime` ni de `replica identity full` : journal write-only, aucun abonnement (≠ rotation_state).
- [x] **Task 3 — Route proxy** (AC: #2, #6, #7)
  - [x] Créer `app/api/confirmed_rolls/route.ts` calqué sur `app/api/rotation_state/route.ts` : `runtime = 'nodejs'`, garde passphrase `safeEqual`, op UNIQUE `'upsert'`, `pickAllowed` avec `ALLOWED = ['seed','date','participant_id','name']`, validation défensive (réutiliser `validateConfirmedRoll`), `confirmed_at` posé serveur, `.upsert({...picked, confirmed_at}, { onConflict: 'seed,date' })`.
- [x] **Task 4 — Data-access** (AC: #1, #6)
  - [x] Créer `lib/data/confirmed-rolls.ts` : `type ConfirmedRollWritePayload`, `writeConfirmedRoll(payload, passphrase)` (POST `/api/confirmed_rolls`, corps `{ op:'upsert', data }`, `WriteError` via `write-error.ts`) — calqué sur `lib/data/rotation-state.ts:writeRotationState`. Ajouter `fetchConfirmedRolls()` (lecture low-privilege, utilisée par les tests d'intégration uniquement — pas câblée à l'UI).
- [x] **Task 5 — Store : `recordConfirmedRoll`** (AC: #1, #5, #6, #8)
  - [x] Dans `participants-store.tsx`, exposer `recordConfirmedRoll(row: ScheduleRow)`. Lit `seed` courant via `stateRefR.current` (slice rotation). Si `seed == null` → return (AC-8). Sinon `runWrite({ write: pp => writeConfirmedRoll(buildConfirmedRollPayload(seed, row), pp), onConfirm: () => {}, rollback: () => {}, retryKey: 'confirmed_rolls', silent: true })`. AUCUN dispatch optimiste (pas de slice à muter — write-only).
  - [x] Déclarer `recordConfirmedRoll` dans le type du contexte + le `value` du provider.
- [x] **Task 6 — Branchement `handleRevealed`** (AC: #1, #5)
  - [x] Dans `components/ScheduleResult.tsx`, récupérer `recordConfirmedRoll` depuis `useParticipants()`. Dans `handleRevealed`, à l'intérieur du bloc `if (r) { ... }` (≈ lignes 210-215, là où `r = schedule.planning[slotIndex]` est résolu, AVANT le branchement `shouldChainNext`), appeler `recordConfirmedRoll(r)`. Ajouter `recordConfirmedRoll` aux deps du `useCallback`.
- [x] **Task 7 — Tests d'intégration** (AC: #9b)
  - [x] `tests/confirmed-rolls.write.integration.test.ts` (gated `SUPABASE_TEST_LIVE` + `TEAM_PASSPHRASE`, modèle `settings.write.integration.test.ts`) : 401 sans passphrase ; upsert 200 ; **idempotence** (2 upserts même `(seed,date)` → `fetchConfirmedRolls` filtré ne renvoie qu'une ligne) ; re-roll (autre `seed`, même `date`) → 2 lignes distinctes ; op invalide → 400 ; champ hors allowlist ignoré / data vide → 400. Nettoyage : utiliser un `seed` de test élevé/réservé puis supprimer (ou documenter).
- [x] **Task 8 — Vérifications finales**
  - [x] `tsc` 0 erreur, `eslint` 0, suite Vitest verte (domaine/golden/wheel/timeline/spin-mode/rotation-resume/exports INTACTS), `build` OK.
  - [x] Passe humaine : appliquer la migration (`supabase db push`) ; contrôle navigateur (un spin en chaque mode écrit bien les lignes ; échec d'écriture ne nagge pas).

### Review Findings (code review 2026-06-25)

- [x] [Review][Patch] `retryKey: 'confirmed_rolls'` partagé sur une table MULTI-LIGNES — clé conceptuellement fausse (calquée du singleton `rotation_state`). Bénin en pratique (une écriture `silent` n'est jamais rejouée : `retry()` ne part que de la bannière, supprimée par `silent`), mais fait churner une entrée morte dans `failedWritesRef`. Fix sans ambiguïté : `retryKey: null` (fire-and-forget assumé). [lib/store/participants-store.tsx → recordConfirmedRoll]
- [x] [Review][Patch] `validateConfirmedRoll` ne vérifie pas le FORMAT YMD de `date` — le message d'erreur annonce « chaîne YMD non vide » mais n'accepte que « non vide ». Défensif uniquement (le client envoie toujours un `ScheduleRow.date` du domaine), mais `date` est composante de PK : une chaîne malformée deviendrait une clé permanente. Fix sans ambiguïté : ajouter un test `/^\d{4}-\d{2}-\d{2}$/`. [lib/ui/confirmed-roll.ts → validateConfirmedRoll]

## Dev Notes

### Patron de référence : Story 5.6 (`rotation_state`)
Cette story REUTILISE 1:1 la mécanique d'écriture serveur de la 5.6, MAIS diverge sur un point structurant : `rotation_state` est un **singleton** (1 ligne, upsert par `id`), alors que `confirmed_rolls` est **multi-lignes** (upsert par `(seed, date)`) et **write-only** (rien ne le lit côté store/UI).

**Conséquences de « write-only multi-lignes » — ce qu'on NE fait PAS (contrairement à 5.6) :**
- ❌ Pas d'abonnement Realtime (pas de 8ᵉ canal), pas de `replica identity full`, pas d'ajout à `supabase_realtime`.
- ❌ Pas de reducer (`confirmed-rolls-reducer.ts` n'existe pas), pas de `reconcile`, pas de slice d'état, pas d'hydratation au montage.
- ❌ Pas de dispatch optimiste / RESTORE / CONFIRM / MARK_FAILED (rien à réconcilier — `onConfirm`/`rollback` sont des no-op).
- ✅ On garde : proxy passphrase, allowlist, validation défensive, `WriteError`/taxonomie AD-17, `runWrite` best-effort `silent:true`.

### Fichiers à TOUCHER / CRÉER
| Fichier | Action | Rôle |
|---|---|---|
| `supabase/migrations/<ts>_add_confirmed_rolls.sql` | NEW | Table multi-lignes PK `(seed,date)`, RLS select public, **sans FK, sans Realtime** |
| `app/api/confirmed_rolls/route.ts` | NEW | Proxy upsert `onConflict:'seed,date'`, clone de `rotation_state/route.ts` |
| `lib/data/confirmed-rolls.ts` | NEW | `writeConfirmedRoll` + `fetchConfirmedRolls` (tests), clone de `rotation-state.ts` |
| `lib/ui/confirmed-roll.ts` | NEW | Cœur pur `buildConfirmedRollPayload` + `validateConfirmedRoll` (ancre TDD) |
| `lib/store/participants-store.tsx` | UPDATE | Expose `recordConfirmedRoll(row)` (best-effort silent, no-op si seed null) |
| `components/ScheduleResult.tsx` | UPDATE | Appelle `recordConfirmedRoll(r)` dans le bloc `if (r)` de `handleRevealed` |
| `tests/confirmed-roll.unit.test.ts` + `tests/confirmed-rolls.write.integration.test.ts` | NEW | AC-9 |

### Lecture du code existant (état actuel à préserver)
- **`handleRevealed` (`ScheduleResult.tsx:205-238`)** : avance le curseur local, déclenche pop/halo + annonce live, puis branche selon le mode. **Point d'insertion** = bloc `if (r) {` (≈ 210-215) où `r = schedule.planning[slotIndex]` (type `ScheduleRow`) est disponible — AVANT `shouldChainNext`, donc exécuté pour TOUTE révélation des deux modes (AC-5). Ne PAS toucher la logique de curseur 5.6 (`persistRotationCursor`, lignes 228-234) : elle reste telle quelle ; le journal est additif.
- **`ScheduleRow`** (`lib/domain/schedule.ts:48-52`) : `{ date: string /* YMD */, participantId: string, name: string }`. Le mapping `participantId → participant_id` se fait dans `buildConfirmedRollPayload`.
- **`generate()` (`participants-store.tsx:807-829`)** : tire `seed = Math.floor(Math.random()*0x100000000)` (uint32), `setSchedule(...)`, `updateRotationState({ seed, cursor: 0 })` (optimiste → `stateRefR.current.seed` est dispo immédiatement). **Ne pas modifier** : le journal lit ce seed, il ne le produit pas.
- **`runWrite` / `WriteSpec` (`use-write-queue.ts:43-59, 93-…`)** : table-agnostique, `silent?: boolean` déjà supporté (5.6). File passphrase partagée → un seul prompt (AD-8) ; les writes journal s'y ajoutent naturellement à côté du write curseur.
- **`writeRotationState` / route `rotation_state`** : gabarits exacts pour la data-access et la route. Reprendre `safeEqual`, `pickAllowed`, `mapDbError`, `json`, `runtime='nodejs'`.

### Pièges à éviter (anti-disasters)
- 🚫 **FK cascade** vers `participants` → effacerait l'historique à la suppression. INTERDIT (AC-3). Le journal est délibérément dénormalisé et autonome.
- 🚫 **Type `date` Postgres** pour la colonne `date` → conversions UTC parasites. Utiliser `text` (YMD), cohérent avec `ScheduleRow.date`, `lib/format/date-fr.ts` (parsing LOCAL) et les exports 5.7 (« dates ISO = row.date SANS UTC »).
- 🚫 **Upsert par `date` seul** → écraserait l'historique au re-roll. La clé DOIT être `(seed, date)` (Décision 3).
- 🚫 **Gater l'écriture journal derrière `shouldChainNext`** → en mode « Rotation complète » seuls le 1ᵉʳ et le dernier seraient écrits. Écrire dans le bloc `if (r)` commun (AC-5).
- 🚫 **Lever le bandeau d'erreur** sur échec → `silent: true` obligatoire (AC-6).
- 🚫 **Ajouter un abonnement Realtime / reducer / slice** → hors besoin (write-only). Ne pas sur-construire.

### Note de portée
- `seed` est la graine de la rotation entière ; toutes les lignes d'une même génération partagent le même `seed`. C'est voulu (groupe une rotation), et c'est ce qui rend `(seed, date)` unique par jour-de-rotation.
- Volume d'écritures : en « Rotation complète », N révélations ⇒ N writes journal (+1 write curseur final). N = horizon standup (petit), writes espacés ~600 ms par l'enchaînement → acceptable. Si un jour le volume gêne, batcher au curseur final serait l'optimisation (hors périmètre).

### Project Structure Notes
- Respecte le découpage existant : domaine pur sous `lib/domain/`, cœurs UI purs testables sous `lib/ui/`, data-access sous `lib/data/`, routes sous `app/api/<table>/`, migrations sous `supabase/migrations/`. `confirmed-roll.ts` va sous `lib/ui/` (cœur pur sans I/O), aligné sur `wheel.ts`, `spin-mode.ts`, `exports.ts`, `schedule-signature.ts`.
- Nom de table `confirmed_rolls` en `snake_case` (convention DB du projet). Route dossier `confirmed_rolls` (souligné, comme `rotation_state` et `team-off-days` qui suit le nom de table).

### References
- [Source: daily-wheel/components/ScheduleResult.tsx#handleRevealed (205-238)] — point d'insertion AC-1/AC-5
- [Source: daily-wheel/lib/domain/schedule.ts#ScheduleRow (48-52)] — forme du roll
- [Source: daily-wheel/lib/store/participants-store.tsx#generate (807-829), updateRotationState (762-786), persistRotationCursor (791-794)] — seed + mécanique write
- [Source: daily-wheel/lib/data/rotation-state.ts] — gabarit data-access
- [Source: daily-wheel/app/api/rotation_state/route.ts] — gabarit route proxy (allowlist, passphrase, upsert)
- [Source: daily-wheel/supabase/migrations/20260624120000_add_rotation_state.sql] — gabarit migration (RLS) ; ICI : PK composite + sans Realtime + sans FK
- [Source: daily-wheel/lib/store/use-write-queue.ts#WriteSpec (43-59)] — `silent` best-effort
- [Source: daily-wheel/tests/settings.write.integration.test.ts] — gabarit test d'intégration write
- [Source: daily-wheel/lib/format/date-fr.ts] — convention dates LOCAL/YMD (jamais UTC)
- [Source: échange Solo 2026-06-25] — Décisions 1-4 (audit passif, aucun verrou, clé `(seed,date)`, snapshot)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev-story)

### Debug Log References

- `npx vitest run tests/confirmed-roll.unit.test.ts` : RED (module absent) → GREEN 9/9.
- `npx tsc --noEmit` = 0 ; `npx eslint .` = 0.
- `npm test` : **369/370 verts**. Unique échec = `confirmed-rolls.write.integration` round-trip → `500` à l'upsert car la **table n'existe pas encore** (migration non appliquée). L'env local a `SUPABASE_TEST_LIVE=1` + `TEAM_PASSPHRASE`, donc ce test LIVE s'exécute (≠ skip CI). Le sous-cas 401 (garde passphrase, avant accès DB) passe. **Échec environnemental, pas un défaut de code.**
- `npm run build` : OK ; route `/api/confirmed_rolls` enregistrée (9 routes API).

### Completion Notes List

- ✅ AC-1/AC-5 : `recordConfirmedRoll(r)` appelé dans `handleRevealed`, bloc `if (r)`, AVANT `shouldChainNext` → chaque slot révélé journalisé une fois, dans les deux modes (indépendant de la granularité curseur 5.6).
- ✅ AC-2 : table multi-lignes PK `(seed, date)` ; route `upsert onConflict: 'seed,date'` → idempotent par génération, append au re-roll (nouveau seed = nouvelles lignes).
- ✅ AC-3 : `name`/`participant_id` snapshots dénormalisés ; migration SANS FK vers `participants` (commentaire SQL explicite) → survit suppression/renommage.
- ✅ AC-4 : journal passif — aucune modif de `generate()` ni de l'affichage ; aucune lecture UI (`fetchConfirmedRolls` réservé aux tests).
- ✅ AC-6 : `runWrite({ ..., silent: true })`, `onConfirm`/`rollback` no-op (write-only, aucun état store).
- ✅ AC-7 : route clonée de `rotation_state` — passphrase `timingSafeEqual`, allowlist `[seed,date,participant_id,name]`, `confirmed_at` serveur, validation défensive (`validateConfirmedRoll`) → 400 ; RLS select public, aucune policy d'écriture ; PAS de Realtime.
- ✅ AC-8 : `recordConfirmedRoll` no-op si `stateRefR.current.seed == null`.
- ✅ AC-9a : 9 tests unitaires purs (mapping + validation). AC-9b : test d'intégration write écrit (401, upsert, idempotence, re-roll append, op invalide, allowlist vide, champ manquant, seed hors uint32).
- ✅ **Passe humaine effectuée (Amelia, autorisée par Solo 2026-06-25)** : `npx supabase db push --db-url $SUPABASE_DB_URL`. **DÉCOUVERTE** : la migration `20260624120000_add_rotation_state.sql` (Story 5.6) n'avait **jamais été appliquée** en prod (REST → 404 sur `rotation_state`) → la persistance rotation 5.6 échouait silencieusement (best-effort `silent:true`) depuis le 24/06 ; la reprise après reload / cross-device ne fonctionnait pas. Le push a appliqué **les deux** migrations (tables absentes → aucun conflit) : `rotation_state` ET `confirmed_rolls` existent désormais (REST → 200/200). Effet de bord bénéfique : la persistance 5.6 est maintenant active. Suite complète : **370/370 vert** (live `confirmed-rolls.write.integration` inclus). RESTE : contrôle navigateur (spin en chaque mode → lignes créées ; échec d'écriture ne nagge pas) + vérifier que la reprise rotation 5.6 fonctionne enfin.
- INTACTS : domaine/wheel/timeline/spin-mode/rotation-resume/golden/exports (aucune modif ; suite verte hors le live ci-dessus).

### Change Log

- 2026-06-25 — Story 5.10 implémentée (Amelia/dev-story) : journal d'audit `confirmed_rolls` (écriture à la validation). 4 fichiers créés (migration, route, data-access, cœur pur), 2 modifiés (store, ScheduleResult), 2 fichiers de tests (+9 unit, +1 intégration). tsc 0 / eslint 0 / 369 tests verts (+ 1 intégration live en attente de migration) / build OK.
- 2026-06-25 — Revue de code (Amelia/code-review, 3 couches) : 0 decision-needed, 2 patches LOW appliqués, 9 écartées. Patch 1 : `retryKey: null` (journal multi-lignes fire-and-forget ≠ singleton). Patch 2 : validation du format YMD de `date` (`/^\d{4}-\d{2}-\d{2}$/`) + 2 assertions de test. tsc 0 / eslint 0 / 370 tests verts. Aucun bug bloquant ; statut → done.

### File List

- `daily-wheel/lib/ui/confirmed-roll.ts` (NEW)
- `daily-wheel/supabase/migrations/20260625120000_add_confirmed_rolls.sql` (NEW)
- `daily-wheel/app/api/confirmed_rolls/route.ts` (NEW)
- `daily-wheel/lib/data/confirmed-rolls.ts` (NEW)
- `daily-wheel/lib/store/participants-store.tsx` (MODIFIED — imports, type contexte `recordConfirmedRoll`, callback, value)
- `daily-wheel/components/ScheduleResult.tsx` (MODIFIED — destructure + appel dans `handleRevealed` + deps)
- `daily-wheel/tests/confirmed-roll.unit.test.ts` (NEW)
- `daily-wheel/tests/confirmed-rolls.write.integration.test.ts` (NEW)
- `_bmad-output/implementation-artifacts/5-10-journal-audit-rolls-valides.md` (MODIFIED — frontmatter baseline, statut, Dev Agent Record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED — statut + log)
