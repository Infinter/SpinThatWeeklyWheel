# Spine Review — Technology Currency

**Spine:** `ARCHITECTURE-SPINE.md` (Daily Wheel / Spin That Wheel)
**Reviewer focus:** Technology currency — every committed technology verified against the live web (June 2026), not asserted from training data.
**Date:** 2026-06-22

---

## Verdict

The spine is **fundamentally sound and current**. Next.js 16, React 19, supabase-js 2.x, App Router + Route Handlers, and the anon/RLS/service_role model are all live and appropriate. **One HIGH finding** must be addressed: Supabase is mid-migration from legacy `anon`/`service_role` keys to new `sb_publishable_`/`sb_secret_` keys, and **a project created today (post-Nov 2025) will not have legacy keys at all**, so the spine's key naming and env-var assumptions (AD-10) are out of date. A second item (Realtime's 24-hour public-connection cap) is worth a one-line note. Versions need minor corrections.

---

## Per-technology verification

### 1. Next.js — committed `16.2.x` → CONFIRMED, version is current

- Next.js 16 was released stable in **October 2025**. The `16.2.x` line is current in June 2026; latest stable is **16.2.9** (released ~June 9, 2026), with 16.2.7 cited as current a few days earlier. There is also a **16.2.x LTS** designation.
- **Verdict:** `16.2.x` is accurate and current. No change required, though you may want to pin a concrete patch (e.g. 16.2.9) at scaffold time.

### 2. App Router + Route Handlers (`app/api/route.ts`) → CONFIRMED, correct pattern

- Route Handlers defined in `app/api/.../route.ts` exporting HTTP method functions (`GET`, `POST`, …) are the supported, recommended App Router API pattern in Next.js 16. They use the Web `Request`/`Response` standard (extended by `NextRequest`/`NextResponse`).
- This directly validates **AD-7 / AD-8** (write proxy via a Route Handler) and the `app/api/` structural seed.
- **Verdict:** Correct and current.

### 3. React 19 (committed `19`) → CONFIRMED with a precision note

- Next.js 16's App Router runs on the latest React **Canary**, which ships **React 19.2** features (View Transitions, `useEffectEvent`, `<Activity/>`). React 19 is correct; the precise pairing is **React 19.2 / React Compiler 1.0** (compiler support is stable but **off by default**).
- **Verdict:** "React 19" is accurate. Optionally tighten to "React 19.2 (ships with Next 16)". The React Compiler is available but not required by this spine — no action.

### 4. `@supabase/supabase-js` — committed `2.108.x` → CONFIRMED, version is current

- Latest published is **2.108.2** (published ~June 2026, on the 2.x line). `2.108.x` is accurate and current.
- **Verdict:** No change required.

### 5. anon-key + RLS + Realtime + service_role server-side → MODEL VALID, but key naming is OUTDATED (HIGH)

The *architecture* (low-privilege client role for reads governed by RLS SELECT; elevated server role that bypasses RLS for guarded writes) is **still the standard, supported model**. However, the *keys themselves* are being replaced:

- **Legacy `anon` / `service_role` JWT keys are being deprecated.** New key formats: **publishable** `sb_publishable_...` (replaces `anon`) and **secret** `sb_secret_...` (replaces `service_role`).
- **New projects created after Nov 1, 2025 no longer have `anon`/`service_role` keys available.** Legacy keys are slated for full deprecation **by end of 2026**.
- Crucially, the new keys map to the **same Postgres roles** — "the publishable key carries the same low privileges as the `anon` key, so your Row Level Security policies behave the same." So **AD-4, AD-7, AD-8, AD-9, AD-11 (the RLS/asymmetric-data-flow invariants) all remain valid as written.** The migration is a *credential-naming* change, not an architectural one.
- **Impact on the spine:** **AD-10** and the Consistency Conventions / Stack hardcode `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `service_role`. A project scaffolded today will be issued `sb_publishable_` / `sb_secret_` keys instead. The invariants survive; the literal key names and env-var labels are stale.

**Recommendation (HIGH):** Reword AD-10 and the secrets convention to be key-format-agnostic, e.g. "client publishable key (formerly anon) in `NEXT_PUBLIC_SUPABASE_*`; secret key (formerly service_role), server-only." Keep the role-level reasoning of AD-9 (SELECT to the low-privilege role; no INSERT/UPDATE/DELETE) unchanged — it is correct.

### 6. Supabase Realtime via anon key + RLS SELECT → WORKS, with a 24-hour caveat (LOW/MEDIUM)

- Realtime Postgres Changes works with the low-privilege key (anon/publishable) **provided an RLS SELECT policy grants the role read access to the relevant rows** — exactly what AD-9 specifies. The model in **AD-6** is valid.
- **New caveat:** "Public Realtime connections are limited to 24 hours unless upgraded with user-level authentication." This applies to anon/publishable (and secret) keys regardless of legacy vs new format. For this app (no per-user login, AD-8 uses a shared passphrase, not Supabase Auth), a long-lived open browser tab will have its Realtime socket capped at ~24h and must **reconnect**. The supabase-js client reconnects automatically, and after reconnect it re-subscribes — but any reconnection gap means the store should **re-hydrate on (re)subscribe**, not rely solely on the live stream.
- **Verdict:** Not a blocker. Worth one explicit line in AD-6: "on Realtime (re)connect — including the ~24h public-connection cap — re-hydrate the store, don't assume an unbroken stream."

### 7. `create-next-app` defaults → PARTIALLY MISALIGNED with the spine (MEDIUM)

The spine's Stack row says: *Starter — `create-next-app` (App Router, TS, ESLint)*. Live defaults (Next 16, June 2026) scaffold **more** than that:

| Default | Live `create-next-app` (Next 16) | Spine assumption |
| --- | --- | --- |
| App Router | ✅ default | ✅ matches |
| TypeScript | ✅ default | ✅ matches |
| ESLint | ✅ default | ✅ matches |
| **Tailwind CSS** | ✅ **default** | ❌ not mentioned |
| **Turbopack** | ✅ **default** (dev + build) | ❌ not mentioned |
| **`src/` dir** | ❌ **not** default | spine uses non-`src/` layout — ✅ matches |
| React Compiler | ❌ not default | not used — ✅ matches |
| AGENTS.md / CLAUDE.md | ✅ scaffolded | n/a |

- **`src/` directory:** The spine's structural seed places `app/`, `components/`, `lib/`, `supabase/` at the repo root (no `src/`). This **matches** the current default (src/ is opt-in). Good — but be explicit, because anyone running the interactive prompt could choose `src/` and break the documented import paths.
- **Tailwind CSS** is now scaffolded by default. The spine is silent on styling. Either accept Tailwind (it's harmless and present) or pass `--no-tailwind`. Worth a one-line decision so the scaffold isn't surprising.
- **Turbopack** is the default bundler in Next 16 (stable). No action needed; just be aware `next build` uses Turbopack unless `--webpack` is passed.

**Recommendation (MEDIUM):** Update the Starter row to reflect reality, e.g. "`create-next-app` (App Router, TS, ESLint, Tailwind, Turbopack — default flags; **no `src/`**, no React Compiler)." Pin the choices so the scaffold is reproducible.

---

## Deprecations / breaking changes that touch this spine

Checked Next.js 16 breaking changes against the spine's decisions:

- **`next lint` removed** — `next build` no longer lints. Spine doesn't depend on this; CI should call ESLint/Biome directly if linting is wanted. (Informational.)
- **Async `params` / `searchParams` / `cookies()` / `headers()`** — now must be `await`ed. The write Route Handler (AD-8) reading the passphrase from the request body is unaffected (body parsing was always async), but **any** use of `cookies()`/`headers()` in `app/api/` must use the async form. (Informational — low risk given the design.)
- **`middleware.ts` → `proxy.ts`** — middleware renamed/deprecated. The spine uses **no** middleware (the write guard is an explicit Route Handler, per AD-8), so this does **not** affect it. Good design choice — confirmed compatible.
- **`revalidateTag()` signature change / Cache Components** — the spine's reads are client-direct via supabase-js (not Next data cache), so Next's caching API changes are largely irrelevant. (Informational.)
- **Can a Route Handler safely hold `service_role`/secret server-side?** — **Yes, confirmed.** Route Handlers execute server-side only; importing an admin client there (and never prefixing its key with `NEXT_PUBLIC_`) keeps the secret out of the client bundle. AD-10's enforcement is correct. The only correction is the key *name* (secret vs service_role), per finding #5.
- **Node.js requirement:** Next 16 minimum is **Node 20.9.0+** (Node 18 dropped). Spine says "Node 20+" — accurate; tighten to **20.9+** to be precise. TypeScript minimum is **5.1+**.

---

## Findings summary

| # | Severity | Finding |
| --- | --- | --- |
| 5 | **HIGH** | Supabase legacy `anon`/`service_role` keys are being deprecated (gone for new projects post-Nov 2025; full deprecation end of 2026). New keys are `sb_publishable_`/`sb_secret_`. The **model is unchanged** (publishable = same low privileges as anon; RLS behaves identically), but AD-10 + secrets convention hardcode the old key names. Reword to be key-format-agnostic. |
| 7 | MEDIUM | `create-next-app` now also defaults to **Tailwind + Turbopack**; the Starter row understates this. `src/` is correctly NOT used (matches default). Pin the flags. |
| 6 | LOW/MED | Realtime public connections (anon/publishable) cap at **~24h** without Supabase Auth; client auto-reconnects. AD-6 should state "re-hydrate store on (re)connect." Not a blocker for this no-login app. |
| 3 | LOW | "React 19" is correct; precise pairing is **React 19.2** with Next 16. Optional tightening. |
| — | LOW | Node requirement is **20.9+** (not just "20+"); TypeScript **5.1+**. Minor precision. |

## Version corrections

- **Next.js:** `16.2.x` ✅ current (latest patch 16.2.9). No change; optionally pin a patch.
- **@supabase/supabase-js:** `2.108.x` ✅ current (latest 2.108.2). No change.
- **React:** `19` ✅ → optionally `19.2`.
- **Node.js:** `20+` → **`20.9+`** (and TS `5.1+`).
- **Starter:** add Tailwind + Turbopack defaults; note no `src/`.
- **Supabase keys (HIGH):** `anon`/`service_role` naming → publishable/secret (role-level invariants unchanged).

## Things NOT independently confirmed

- Exact latest supabase-js patch beyond what web search reported (npm page returned HTTP 403; relied on search-indexed npm result stating 2.108.2). The `2.108.x` line is confirmed current regardless.

---

## Sources

- https://nextjs.org/blog/next-16
- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://nextjs.org/blog/next-16-2
- https://abhs.in/blog/nextjs-current-version-march-2026-stable-release-whats-new
- https://eosl.date/eol/product/nextjs/
- https://nextjs.org/docs/app/getting-started/route-handlers
- https://nextjs.org/docs/app/api-reference/file-conventions/route
- https://nextjs.org/docs/app/getting-started/installation
- https://nextjs.org/docs/app/api-reference/cli/create-next-app
- https://github.com/vercel/next.js/discussions/90051
- https://www.npmjs.com/package/@supabase/supabase-js
- https://github.com/supabase/supabase-js/releases
- https://supabase.com/docs/guides/api/securing-your-api
- https://github.com/orgs/supabase/discussions/29260
- https://supabase.com/docs/guides/api/api-keys
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys
- https://supabase.com/docs/guides/realtime/postgres-changes
- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/docs/guides/database/postgres/row-level-security
