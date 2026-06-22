# Spine Review — Daily Wheel (rubric walk)

**Verdict: PASS-WITH-FIXES**

Spine is well-targeted, layered, and most ADs are genuinely enforceable. A handful of gaps could let epics/stories diverge — notably the EDF deadline-parity nuance, an under-specified test stack, and a partly-contradicted PRD assumption that isn't flagged as a deliberate override.

---

## 1. Fixes the real divergence points for the level below

Largely yes. The spine identifies the genuine fork-in-the-road decisions:
- WHERE the domain logic lives (AD-1, pure leaf) — prevents the single biggest brownfield risk (algo soldered to DOM).
- WHERE writes go (AD-7/AD-8 asymmetric paths + server passphrase) — this is the real architectural pivot vs. the PRD's "client-direct, no API routes" assumption.
- The deadline/generation predicate coupling (AD-3) — the subtle bug surface.

**Gap [MEDIUM]:** No AD owns the **data-shape boundary between DB rows and domain input**. The domain takes "données + rng" (AD-1) but nothing fixes the mapping contract (snake_case rows → camelCase domain input, `unavailabilities.kind` → domain `indispos`, settings row → flags). The original uses `ind.type`/`ind.date1`; the new schema uses `kind`/`date1`. Two stories (Epic 2 data-access vs. Epic 4 domain) could each invent their own adapter shape and diverge silently. Recommend an AD or convention: "`lib/data/` is the only adapter; it returns domain-shaped objects; domain never sees snake_case."

## 2. Every AD's Rule is enforceable and prevents its divergence

Mostly strong. Enforceable-by-grep or by-test:
- AD-1, AD-11 (no React/Supabase import in domain; no `supabase.from(` outside `lib/data/`) — grep-enforceable. Good.
- AD-10 (no `service_role`/passphrase without `NEXT_PUBLIC_` discipline) — grep-enforceable. Good.
- AD-12 (golden test) — the strongest enforcement; ties NFR9 to a passing test. Excellent.
- AD-2 (no `Math.random()` in domain) — grep-enforceable. Good.

Weaker:
- **AD-3 [HIGH]:** The rule is correct and names the real bug (deadline calc must use the same `isTeamNonSessionDay`). But it is **stated as prose discipline with no enforcement hook**. This is the single most fragile invariant in the system — a dev wiring a new constraint into the generation loop but not into `getLastConsecAvailDay` is exactly the silent-divergence the spine warns about. There is no test mandated for it. Recommend: a required test asserting deadline-window calc and generation-skip agree on every constraint type (parametrized over weekend/exclusion/holiday/off).
- **AD-5/AD-6 [MEDIUM]:** "rollback + message d'erreur", "déduplication par id (et si nécessaire version)" — the "si nécessaire" leaves the version/ordering rule open. Two stories could implement last-write-wins differently. Acceptable for v1 scope but the conflict-resolution rule should be pinned, not optional.

## 3. Nothing under Deferred could let two units diverge

Mostly clean. The deferred items (localStorage import, holiday API prefill, real auth, holidays/off table merge, pagination/scale) are genuinely additive and gated.

**Watch [LOW]:** "Fusion holidays/team_off_days via colonne category" is deferred, but AD-3 already mandates they fuse *into a single predicate*. That's fine and consistent (table separation deferred, predicate fusion adopted) — just confirm stories don't read the deferral as license to branch generation logic per-table.

## 4. Named tech verified-current / pinned

- Next.js **16.2.x** — pinned. Plausible as current for a 2026-06 cutoff. Node 20+ noted as imposed.
- React **19** — pinned major. Fine.
- @supabase/supabase-js **2.108.x** — pinned. Plausible.
- TypeScript "dernière stable (via create-next-app)" — **[LOW] not pinned**. Acceptable (delegated to starter) but means the spine doesn't actually fix this dimension; a story could end up on a different TS major. Minor.

**[HIGH] Test stack is entirely unnamed.** AD-12 and the whole testing strategy (golden test, unit, CRUD integration) are load-bearing, yet no test runner/framework is in the Stack table (Vitest? Jest? Playwright for integration?). Testing is a structural dimension the spine leans on heavily for its primary parity guarantee — leaving it silent means Epic 4's golden-test story and Epic 2's integration-test story can pick different, possibly incompatible toolchains. Pin at least the unit/golden runner.

## 5. Ratifies vs. contradicts original code behavior (parity NFR9)

The flowchart matches the original loop faithfully:
- `start` advanced to first valid day (original lines 1005-1013) — matches.
- shuffle then map id→index for tie-break (1015-1019) — matches AD-2 + flowchart "ordre shuffle".
- skip-if-all-active-absent as a non-hole (1033-1036) — matches "ALLABS" node.
- `avail` filter, empty → STOP/break (1039-1045) — matches "EMPTY → STOP (placer créerait un trou)".
- EDF sort by `getLastConsecAvailDay` deadline, tie-break by shuffle index (1050-1059) — matches "EDF" node.
- one-shot queue drain, place-once invariant — matches the stated invariant.

**[HIGH] — the one real parity nuance the spine under-states:** In the original, `getLastConsecAvailDay` (deadline calc, lines 979-992) checks **skipWE + isDateGroupExcluded + isDateIndispo** but, critically, it `break`s on the person's own indispo while it `continue`s past weekends/exclusions. The new `isTeamNonSessionDay` *adds* holidays + team-off to the neutralized set. AD-3 correctly says to plug `isTeamNonSessionDay` into both loop and deadline — but this is a **behavioral extension, not pure parity**: the golden fixture derived from the old page (AD-12) cannot exercise holidays/team-off (they didn't exist). So AD-12 proves parity only on the *legacy* constraint set. The spine should state explicitly that the golden test pins legacy parity, and that holiday/off deadline-interaction needs *new* test cases (this is exactly the AD-3 enforcement gap above). As written, a reader could believe AD-12 covers the new constraints — it cannot.

Also note original `getLastConsecAvailDay` uses a **1-year horizon from `fromDay`** (not from start); the flowchart's "cur ≤ start+1an" is the *loop* bound, which is correct, but the deadline-window horizon detail should survive into the domain port. [LOW]

## 6. Covers PRD capabilities (FR1-14, NFR1-9, Epics 1-4)

Capability map is solid. Spot-check:
- FR1-5 → Epic 2, AD-5/7/11. Covered.
- FR6/7/8 → AD-3 + data CRUD, Epic 3. Covered (new tables present in seed).
- FR9/10 → settings upsert convention. Covered.
- FR11/12/14 → AD-1/2/3/12, Epic 4. Covered.
- FR13 → AD-4/5/6. Covered.
- NFR1/2/8 → Stack + AD-10/13. Covered.
- NFR3 → **[MEDIUM] PRD CONTRADICTION not flagged.** PRD NFR3 and §4 explicitly say writes go via the **anon key with RLS allowing read/write**, and "pas d'API routes obligatoires en v1." The spine *correctly overrides this* (AD-7/8/9: writes via server Route Handler + service_role, anon write **denied**) because the PRD's own §4 flags the security risk. This is a good call — but the spine presents it as settled fact without noting it deliberately overrides a stated PRD assumption. A spine should name where it diverges from its driving doc so the PM/architect ratify it. Recommend an explicit "Override of PRD NFR3/§4" note.
- NFR4 (français) → convention row. Covered.
- NFR5 (responsive ≤520px) → **[MEDIUM] silent.** Stated in PRD/Structural seed comment only ("cartes, panneaux repliables") but no AD or convention owns the responsive/layout contract. It's a feature-altitude concern the spine should at least defer explicitly.
- NFR6 (perf ≤50/≤1an) → addressed via Deferred (scale) + the 1-year loop bound. OK.
- NFR7/9 → AD-2/12. Covered.

## 7. Every structural dimension decided / deferred / open

Strong on code-structure dimensions (layering, dependency direction, data-access, secrets, RNG, naming, dates). 

**Operational/environmental envelope — partially covered, with gaps:**
- Deployment/hosting: AD-13 + Stack (Vercel, one Supabase project, env-per-environment, migrations in `supabase/migrations/`). Good — this dimension is decided.
- **[HIGH] CI / migration application is silent.** Schema "vit dans `supabase/migrations/`" but nothing says **how migrations get applied** (Supabase CLI? manual? on deploy?) or whether there's any CI gate (the golden test in AD-12 is the parity guarantee — is it run in CI before deploy?). For a Vercel+Supabase app this is a real divergence surface: Story 1.2 (provision schema) and the deploy story could apply schema by different means. Decide or defer explicitly.
- **[MEDIUM] Environments collapsed.** AD-13 says "Production = Preview, même base." That's a deliberate (and risky — preview writes hit prod data) decision; it's stated but its consequence isn't called out. Fine for mono-team toy scope, but should be an explicit accepted trade-off, not a parenthetical.
- **[MEDIUM] Observability / error-handling envelope is silent.** No dimension owns how write failures surface beyond AD-5's "message d'erreur", no logging/monitoring posture. Likely acceptable to *defer* at this altitude, but it's currently fully silent — flag it as deferred.
- Backup/data-loss: silent. Low priority for this scope; note as out-of-scope.

---

## Summary of findings (by severity)

- **[HIGH] AD-3 has no enforcement hook** — the highest-risk silent-divergence invariant (deadline calc vs. generation must share the neutralized-day predicate) is prose-only; mandate a parametrized test.
- **[HIGH] Test stack unnamed** — AD-12/golden test is the parity keystone but no runner is pinned in Stack; a whole load-bearing dimension is silent.
- **[HIGH] AD-12 parity scope overstated** — golden fixture from the old page covers only legacy constraints; holiday/team-off deadline interaction is a behavioral *extension* needing new tests, not "parity."
- **[HIGH] CI / migration-application dimension silent** — how schema is applied and whether the golden test gates deploy is undecided.
- **[MEDIUM] DB-row ↔ domain-input adapter contract unowned** — mapping shape could diverge between data and domain stories.
- **[MEDIUM] PRD NFR3/§4 override not flagged** — spine correctly replaces anon-write with server passphrase but doesn't name the deliberate divergence from its driving doc.
- **[MEDIUM] NFR5 responsive/layout dimension silent**; **observability/error envelope silent**; **prod=preview-same-base trade-off** stated but not owned.
- **[LOW] TypeScript version not pinned** (delegated to starter); deadline-window 1-year-from-fromDay horizon detail should survive the port; holidays/off table-merge deferral vs. predicate-fusion adoption — confirm stories don't misread.

The spine is a genuine spine (invariants, not a design doc) and its core calls are right. Fix the four HIGH items — chiefly turning AD-3 and the parity-scope nuance into mandated tests, naming the test runner, and deciding CI/migration — and it's a clean PASS.
