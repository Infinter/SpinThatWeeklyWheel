# Adversarial Spine Review — Daily Wheel

**Reviewer role:** adversarial spine reviewer (divergence hunter)
**Target:** `ARCHITECTURE-SPINE.md` (2026-06-22)
**Method:** For each seam, construct two units one level down (two stories / two agents) that each obey *every* AD to the letter, yet build incompatibly. Each surviving pair is a hole the spine must close.

**Verdict:** The spine is sound on *layering* and *security topology* (AD-7/8/9/10/11 are tight). It is **dangerously under-specified on every concrete contract that two parallel builders must agree on**: the write endpoint shape, the Realtime dedup key, the optimistic-state identity, the predicate signature, the settings id constant, and the error taxonomy. None of these is pinned. Multiple independent agents *will* diverge while each remaining provably AD-compliant. **10 divergence pairs found** (3 CRITICAL, 4 HIGH, 2 MEDIUM, 1 LOW).

---

## CRITICAL divergences

### C1 — The write endpoint shape is undefined: "one endpoint" vs "one per table" (AD-7, AD-8)

AD-7 says writes go via *"une Route Handler Next.js (`app/api/`)"* — singular grammatical article, but the structural seed says *"Route Handlers d'écriture"* (plural). The spine never decides whether there is **one generic write endpoint** or **one endpoint per table**. Nothing in any AD forbids either.

- **Unit A (Story 2.2 — participants):** builds `POST /api/participants` with body `{ action: 'update', id, fields: { active: false } }`. RPC-style, action-tagged.
- **Unit B (Story 3.2 — holidays):** builds `POST /api/write` generic, body `{ table: 'holidays', op: 'insert', row: {...} }`. Table-routed.

Both obey AD-7 (POST to `app/api/`, passphrase-checked, service_role write), AD-8 (server-side passphrase), AD-11 (`lib/data/` is the only caller). But `lib/data/` now has to speak **two different wire protocols**, and a third story (4.1 settings) will invent a third. The data layer fragments into per-table bespoke clients — the exact duplication AD-11 exists to prevent, re-introduced *above* the Supabase line instead of at it.

**Worse:** with two clients editing the same `participants` row, A's `{fields}` partial-merge semantics and B's `{row}` full-replace semantics produce **different persisted states** for the identical user gesture, depending on which story's endpoint shape won. This is a clashing shared-data shape at the wire level.

**Fix — new AD (write contract):** Pin exactly one shape. Recommend: **one Route Handler per table** at `POST /api/{table}` (matching `lib/data/` repo functions 1:1), with a **single canonical envelope**: `{ passphrase, op: 'insert'|'update'|'delete', id?, data? }` where `data` is a **full row for insert, a partial patch for update**, and the handler validates `table ∈ {6 known tables}`, `op ∈ enum`, and the column allowlist per table server-side. State explicitly: update is a **partial patch (PATCH semantics), never full-row replace**, so concurrent edits to disjoint columns don't clobber.

---

### C2 — The Realtime dedup key is not actually defined; UPDATE/DELETE echoes have no `id`-only solution (AD-5, AD-6)

AD-6 says dedup *"par `id` (et, si nécessaire, comparaison de version)"*. The parenthetical "si nécessaire" is the hole: it is left to the builder to decide whether version comparison exists at all, and **there is no `version`/`updated_at` column in the data model** (the ERD has only `created_at`, on one table). So "comparison de version" is unimplementable as written, and dedup-by-`id` alone is provably insufficient.

- **Unit A (optimistic INSERT, Story 2.1):** generates the row `id` **client-side** (`crypto.randomUUID()`) so it can put the optimistic row in the store immediately and dedup the echo by matching that id. Obeys AD-5 (store-first), AD-6 (dedup by id).
- **Unit B (optimistic INSERT, Story 3.2):** lets **Postgres** generate the `id` (`default gen_random_uuid()` per the ERD `uuid id PK`), inserts an optimistic row with a temporary local key, and reconciles when the server returns the real id. Also obeys AD-5 and AD-6 — but its echo arrives with an id the store has **never seen**, so dedup-by-id fails and the row **double-renders**.

Both are AD-legal. They are mutually exclusive at the data layer: A requires the write endpoint to **accept a client-supplied id**; B requires it to **ignore/reject** one. Nothing in the spine says which.

**The deeper hole — UPDATE/INSERT echo asymmetry:** dedup-by-id works for INSERT echoes (you know the id you inserted). For an **UPDATE echo it is useless**: two clients toggle `active` on the same participant within the Realtime round-trip window. Client 1 sees the echo of *its own* update (id matches → suppressed, correct) but **also** the echo of client 2's update (same id → wrongly suppressed as "my own echo"), so client 1 never sees client 2's change and the two clients **permanently diverge** — the exact failure AD-4 ("Supabase est la source canonique") swears to prevent. Dedup-by-id cannot distinguish "my echo" from "someone else's change to the same row."

**Fix — tighten AD-6 + add a column:**
1. Add `updated_at timestamptz` (and ideally a monotonic `rev int` bumped server-side) to **every** writable table in the data model.
2. Pin dedup as: suppress an echo **only if** `event.id` matches a pending optimistic op **and** `event.updated_at <= the op's expected stamp`; otherwise **always apply** (last-writer-wins by `updated_at`). This makes "my own echo" a precise predicate, not a heuristic.
3. Decide id ownership: **server generates ids** (B), optimistic rows carry a `_localTempId` reconciled on the write response. Forbid client-supplied PKs in the write contract.

---

### C3 — Two-client concurrent edit of the same row has no ordering rule; optimistic + LWW + echo race undefined (AD-4, AD-5, AD-6)

The seam the prompt names directly. Spine guarantees Supabase is canonical (AD-4) and writes are optimistic with rollback on failure (AD-5), but defines **no conflict-resolution policy** when two clients mutate the same row, and **no ordering guarantee** between (a) the HTTP write response and (b) the Realtime echo of that same write.

- **Unit A (Story 2.2 rename):** on write success, **trusts its optimistic value** and ignores any later Realtime echo for that id (dedup suppresses it). Rename to "Alice."
- **Unit B (Story 2.2 toggle active, same row, same instant):** does the same for its field. Toggle to inactive.

Sequence: A's PATCH lands first (`name='Alice'`), then B's PATCH lands (`active=false`). If C1's fix (partial patch) is **not** adopted and writes are full-row, B's write **resurrects the old name**, silently reverting A — and because both clients suppress the echo of their own write, **neither client's UI ever shows the regression** until a fresh hydrate. Two owners, one entity, conflicting mutation paths, lost update, invisible because of the dedup rule. All three units obey AD-4/5/6.

Even with partial patches (C1), the **ordering** of "did my write-response or my echo arrive first?" is unspecified, so two builders will write the reconciliation in opposite orders (apply-on-response-then-suppress-echo vs apply-on-echo-then-ignore-response), producing different transient states and different rollback timing.

**Fix — new AD (conflict + ordering):**
- **Last-writer-wins per column, ordered by server `updated_at`** (depends on C2's column). The store applies any echo whose `updated_at` is newer than its local copy, full stop — optimistic value included. Optimistic state is *provisional* until the echo or write-response (whichever carries the authoritative `updated_at`) confirms it.
- Pin the single reconciliation path: **the write-response is advisory; the Realtime echo (or a post-write refetch) is authoritative.** One source of truth for "the write happened," so two builders converge on the same ordering.

---

## HIGH divergences

### H1 — `isTeamNonSessionDay` signature: reads a store vs takes args (AD-3)

AD-3 pins the *name*, the *boolean*, and *where it must be wired* (gen loop **and** `getLastConsecAvailDay`). It does **not** pin the **signature**. The rule shows `isTeamNonSessionDay(date, settings)` — but `settings` (per ERD) holds only `skip_weekends` and `start_date`. Holidays, team_off_days, and group_exclusions are **separate tables**, not in `settings`. So the shown signature **cannot compute** what AD-3 says the predicate must compute (weekend OR exclusion OR holiday OR off-day).

- **Unit A (Epic 4 dev):** implements `isTeamNonSessionDay(date, settings)` and, to honor AD-1 purity, **passes pre-resolved Set/lookup structures inside an extended `settings`-shaped context object** → `(date, { skipWeekends, holidays: Set, offRanges: [], exclusions: [] })`.
- **Unit B (Epic 3 dev):** implements `isTeamNonSessionDay(date, holidays, teamOffDays, groupExclusions, settings)` — positional args, raw arrays.

Both are pure (AD-1/AD-2 satisfied), both are the single source of truth (AD-3 satisfied), both wired into both call sites. But they are **two different functions with the same name**; whichever lands second breaks the other's call sites and the golden test (AD-12) is written against one shape only. Two owners of one symbol.

**Fix — tighten AD-3:** Pin the exact signature, e.g. `isTeamNonSessionDay(date: string, ctx: ScheduleContext): boolean` where `ScheduleContext` is a **named domain type** (`{ skipWeekends, startDate, holidays, teamOffDays, groupExclusions }`) constructed **once** by the store from the loaded tables and passed into `generateSchedule`. State that the predicate **reads only from `ctx`, never a store/global** (preserves AD-1 purity) and that `generateSchedule` and the predicate share the **same `ctx` object**.

### H2 — `settings.id` constant value is not fixed; two devs pick two constants (Convention: Settings single-row)

The convention says *"`id` fixe constant + `upsert`."* It pins the **pattern** but never the **value**. `settings.id` is `text PK`.

- **Unit A (Story 4.1):** `const SETTINGS_ID = 'default'`.
- **Unit B (migration / seed, Story 1.2):** seeds the row with `id = 'singleton'` (or `'global'`, or a fixed uuid).

Both obey the convention (fixed constant, upsert). Result: the app upserts `id='default'` while the migration seeded `id='singleton'` → **two settings rows**, the read picks one arbitrarily (no `.single()` guarantee stated), `skip_weekends` and `start_date` diverge, and the "single-row" invariant is silently violated. The whole point of the convention defeated by an unpinned literal.

**Fix — tighten the convention:** Pin the literal: `settings.id === 'singleton'` (one canonical string, stated in the spine), enforce with a **`CHECK (id = 'singleton')` constraint** in the migration so a second row is impossible at the DB level, and require reads to use `.eq('id','singleton').single()`.

### H3 — Realtime may not be *enabled*, and RLS-SELECT-open is necessary-but-maybe-not-sufficient (AD-6 vs AD-9)

AD-9 grants `anon` `SELECT` and asserts the "policy surface exists for Realtime." But Supabase Postgres Changes delivery requires **two** things AD-9/AD-6 never state: (1) the table must be **added to the `supabase_realtime` publication** (`ALTER PUBLICATION ... ADD TABLE`), and (2) Realtime authorizes each change row against the subscriber's RLS **SELECT** policy — which is fine here, *but only if* the publication includes the table and `REPLICA IDENTITY` is set appropriately for UPDATE/DELETE payloads to carry the changed row's old values.

- **Unit A (Story 1.2 migration):** creates the 6 tables + RLS SELECT-for-anon. Obeys AD-9 to the letter. Does **not** touch the publication (AD-9 never mentions it).
- **Unit B (Story 4-ish, store):** subscribes via Realtime per AD-6, assumes echoes arrive.

Both AD-compliant. Result: **no Realtime events are ever delivered** because the tables aren't in the publication. FR13 ("immédiatement visibles par les autres") silently fails; the app degrades to refresh-only and **no AD is violated** — the spine simply forgot the enabling step. Additionally, with default `REPLICA IDENTITY`, DELETE/UPDATE echoes may not carry enough columns to run the dedup of C2/C3.

**Fix — tighten AD-9 (or new AD):** State explicitly: the migration **adds all 6 tables to `supabase_realtime` publication** and sets `REPLICA IDENTITY FULL` on writable tables (so UPDATE/DELETE echoes carry full rows for dedup). Add an AC to Story 1.2: "a Realtime subscription receives an INSERT/UPDATE/DELETE event for each table."

### H4 — Error/rollback taxonomy is undefined: auth-fail vs validation-fail vs conflict are indistinguishable (AD-5, AD-8)

AD-5 says "rollback + message d'erreur si l'écriture échoue." AD-8 says passphrase is checked server-side. Neither pins the **response shape** the Route Handler returns, nor how the client distinguishes failure classes. "Échoue" is treated as a single bucket.

- **Unit A (Route Handler, Story 2.2):** returns `401` for bad passphrase, `400` for validation, `500` for DB error; body `{ error: string }`.
- **Unit B (Route Handler, Story 3.2):** returns `200 { ok: false, reason: 'auth' }` for everything (always 200, status in body); validation failure → `{ ok: false, reason: 'invalid' }`.

Both "verrouillent réellement les écritures" (AD-8) and both let the client roll back (AD-5). But `lib/data/` cannot write **one** rollback handler — A throws on `!res.ok`, B never sees `!res.ok`. And the user experience diverges critically: a **bad passphrase must NOT be retried automatically and should prompt re-entry**, while a **transient 500 may be retried**, and a **validation error must roll back permanently and surface a field message**. With no taxonomy, one builder auto-retries an auth failure (locking the user out / hammering the endpoint) while another silently rolls back a retryable network blip (losing the user's edit). Ambiguous contract, opposite client behaviors.

**Fix — new AD (write-response contract):** Pin a single response envelope: HTTP status carries the class — `401` auth (→ client clears cached passphrase, prompts re-entry, **no retry, no rollback-loss beyond this op**), `400` validation (→ **rollback, show message, no retry**), `409` conflict (→ refetch + reconcile), `5xx`/network (→ **rollback, offer retry**). Body always `{ error: { code, message } }`. State that `lib/data/` maps these to a typed `WriteError` the store switches on.

---

## MEDIUM divergences

### M1 — "Dates en local, jamais UTC" vs Postgres `date` round-trip is unpinned (Convention: Dates)

The convention says business dates are `YYYY-MM-DD` strings, manipulated locally, never `toISOString()`. But the `@supabase/supabase-js` client returns `date` columns as strings while the **write path** lets a builder choose how to serialize.

- **Unit A:** sends `date1` as the raw `'2026-07-14'` string straight through. Local, no UTC. Compliant.
- **Unit B:** builds a `Date` object in a date picker, then — to avoid `toISOString()` per the rule — uses `date.toLocaleDateString()` which yields `'14/07/2026'` (FR locale, NFR4), and stores **that**.

Both honor "no toISOString / local format," but B writes a non-ISO string into a Postgres `date` column → **insert error or coercion**, and the golden test (AD-12), which compares string keys, mismatches. The convention forbids the *wrong* serialization but doesn't pin the *one right* one for the wire.

**Fix — tighten convention:** State that the **on-the-wire and in-DB representation is always `YYYY-MM-DD`** (ISO calendar date, no time, no locale formatting); locale formatting (`14 juillet 2026`) is **display-only** and never persisted or used as a map key. Provide one canonical `toISODate(d: Date): string` helper in `lib/domain` (local-time based, not UTC).

### M2 — Cascade delete owner: DB `ON DELETE CASCADE` vs app-level delete of unavailabilities (FR4, AD-7)

FR4 / Story 2.2 AC3: deleting a participant deletes its `unavailabilities`. The ERD/PRD says FK `on delete cascade`. But writes go through the Route Handler (AD-7), and a builder may implement the cascade in the app.

- **Unit A (Story 2.2):** relies on DB `ON DELETE CASCADE`; the Route Handler issues a single `DELETE participants WHERE id=...`.
- **Unit B (Story 2.3 owner of unavailabilities):** to keep "lib/data owns the schema mapping" (AD-11) explicit, deletes `unavailabilities` first via its own endpoint, then the participant.

Both reach the same end state on the happy path, but: B fires **two Realtime DELETE echoes** the store must handle (extra dedup load + C2 risk), and if the cascade exists **and** B deletes manually, the second delete is a no-op race; if a builder removes the FK cascade trusting the app path, and another path deletes only the participant, **orphan unavailabilities** persist. **Two owners of the unavailabilities lifecycle.**

**Fix — tighten AD/convention:** Declare the **DB FK `ON DELETE CASCADE` the single owner** of dependent-row deletion; the app issues only the parent delete and never deletes children directly. Note the resulting Realtime behavior (children vanish via DB cascade; store must reconcile by refetch or accept cascade echoes if `REPLICA IDENTITY FULL`).

---

## LOW divergence

### L1 — "rng" type/shape unpinned across domain and store (AD-1, AD-2)

AD-2 says inject an `rng` (e.g., mulberry32), prod = random seed, test = fixed seed. It names an example but not the **interface**.

- **Unit A (domain, Story 4.2):** expects `rng: () => number` (0..1), calls `rng()`.
- **Unit B (store, callsite):** passes a seeded generator object `{ next(): number }` or passes a **seed integer** and expects the domain to construct the generator.

Both "inject an rng, seedable." Mismatch breaks the call. Low because it's a one-line type, caught at compile time — but it still costs a round-trip between two agents and could desync the golden fixture if the generator construction differs.

**Fix — tighten AD-2:** Pin `type Rng = () => number` (uniform 0..1) and state the **seed→generator factory** (`mulberry32(seed): Rng`) lives in `lib/domain`, so prod and the golden test (AD-12) construct the identical generator from a seed.

---

## Summary table

| # | Sev | Seam | One-liner |
| --- | --- | --- | --- |
| C1 | CRITICAL | AD-7/8/11 | One write endpoint vs one-per-table, RPC-style vs table-routed payload → fragmented wire protocol + partial-vs-full-row clobber |
| C2 | CRITICAL | AD-5/6 | Dedup key undefined; client-id vs server-id; UPDATE echoes can't be deduped by id → permanent divergence; no version column exists |
| C3 | CRITICAL | AD-4/5/6 | No conflict-resolution/ordering rule for two clients editing one row → invisible lost update |
| H1 | HIGH | AD-3 | `isTeamNonSessionDay` signature unpinned (settings-shaped ctx vs positional arrays) → two functions, same name |
| H2 | HIGH | Conv. | `settings.id` literal value unpinned → two rows, broken single-row invariant |
| H3 | HIGH | AD-6/9 | Realtime publication + REPLICA IDENTITY never enabled → echoes never delivered, FR13 silently dead |
| H4 | HIGH | AD-5/8 | Error taxonomy undefined → client can't tell auth vs validation vs transient → wrong retry/rollback |
| M1 | MEDIUM | Conv. | Date wire-format unpinned (ISO vs locale string) → DB coercion error + golden mismatch |
| M2 | MEDIUM | FR4/AD-7 | Cascade-delete owner ambiguous (DB FK vs app) → orphans or double-delete race |
| L1 | LOW | AD-2 | `rng` interface unpinned (fn vs object vs seed-int) |

## Recommended new/tightened ADs (net)

- **New AD-14 — Write contract:** one Route Handler per table, single envelope `{passphrase, op, id?, data?}`, update = partial patch, server-side table+column allowlist. (Closes C1, part of C3, M2.)
- **New AD-15 — Echo identity & conflict resolution:** add `updated_at`(+`rev`) to all writable tables; server owns ids; dedup = id-match AND stamp-match; otherwise apply; LWW-per-column by `updated_at`; echo/refetch is authoritative over write-response. (Closes C2, C3.)
- **New AD-16 — Write-response taxonomy:** 401/400/409/5xx classes → typed `WriteError` → defined retry/rollback per class. (Closes H4.)
- **Tighten AD-3:** pin `isTeamNonSessionDay(date, ctx: ScheduleContext)`, named ctx type built once and shared with `generateSchedule`. (Closes H1.)
- **Tighten AD-6/AD-9:** migration adds all 6 tables to `supabase_realtime` publication + `REPLICA IDENTITY FULL`; Story 1.2 AC proves an event is received. (Closes H3.)
- **Tighten conventions:** `settings.id === 'singleton'` with `CHECK` constraint + `.single()`; dates are `YYYY-MM-DD` on wire/DB, locale formatting display-only, one `toISODate` helper; DB FK cascade is sole owner of child deletes; `type Rng = () => number` + `mulberry32` factory in `lib/domain`. (Closes H2, M1, M2, L1.)
