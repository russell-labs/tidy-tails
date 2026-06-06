---
last-updated: 2026-06-06
current-owner: Russell
lane: FOUNDER
active-app: tidy-tails-v2
hold-fire: true
---

# HANDOFF - Tidy Tails

## Right Now

- **READY TO SHIP (awaiting your review/merge):** PR #13 — "Per-org RLS +
  cross-tenant isolation test (WS2.2, staging-first)". CI green expected; not
  merged. Applied to STAGING only.
- **JUST MERGED:** PR #12 (WS2.1 org schema). Earlier: PR #11 (WS1), PR #10/#9
  (WS0), PR #8/#7/#6.
- **IN FLIGHT:** nothing else. No deploy; no prod writes.

## Next Action

Russell reviews PR #13 (safety-critical: tenant RLS is now per-org on staging,
proven isolated both directions, read+write). Next: **WS2.2b** (wire the
isolation test into CI — needs a Supabase auth shim; see the grants trap below)
and **WS2.3** (thread org context through the app so writes set org_id — required
before the app can run against per-org RLS).

## Authorized Actions

(empty — expires at next update)

No mutation, deploy, merge, prod schema/RLS change, migration apply to prod, or
live-data operation is authorized. Each requires Russell's explicit go for that
exact action in-thread. (WS2.2 applied to STAGING only.)

## Current Production State

- Production v2 app: `https://tidy-tails-v2.vercel.app` (Vercel `tidy-tails-v2`).
- `main` HEAD: `939f571` (after PR #12). WS2.2 on branch
  `feat/per-org-rls-isolation` (PR #13), not merged.
- **Supabase PROD** `pgkwovokciaqnbhpttba`: UNCHANGED, read-only this slice.
  Still per-user RLS, no org_id populated. **Not** switched to per-org.
- **Supabase STAGING** `exemhetaxosklljbrzeh`: per-org RLS LIVE on all 10 tenant
  tables; `user_org_ids()` helper + memberships user_id FK; two tenants
  (org#1 aa: 3/4/4, org#2 bb: 2/2/2). Cross-tenant isolation proven. Migrations
  tracked 0001–0004.
- Tests: 827 on the WS2.2 branch and `main` (zero app code changed).

## Active Blockers

- **WS2.4 prod-cutover ORDERING (safety-critical — do not get wrong):** Sam's
  prod rows have `groomer_id = her uid` but `org_id = null`. `user_org_ids()`
  needs a membership row for her uid, and the per-org policies need her rows'
  `org_id` populated. So WS2.4 MUST, atomically: (1) create her organization +
  her membership, (2) backfill `org_id` on all her rows, (3) THEN swap the
  policies. Swapping before the backfill locks Sam out of her own data the
  instant RLS flips. Rehearse on staging; take a backup first.
- **App is org-unaware (WS2.3):** with per-org RLS, an INSERT that doesn't set
  org_id fails closed. The app must thread org context (set org_id on writes)
  before it can run against per-org RLS. Not changed here.
- **Supabase CLI still not authenticated** — blocks CLI round-trips + the WS2.2b
  CI harness needs building (no DB secrets in CI; use a self-contained Postgres
  service + auth shim).
- `MASTER-BUSINESS-PLAN.md` missing at venture root — flagged, not blocking.

## Safety Rules In Force

- Hold-fire default: no deploy, prod data mutation, live SMS, prod schema/RLS
  changes or migrations, or integration-setting changes without Russell's
  explicit go for that exact action.
- **Prod is read-only for schema work**; never push/reset/DDL against prod.
  Staging is the push/rehearsal target.
- WS0 consent migration still unapplied to prod.
- Permission does not carry across agents/threads. CI green before merge.
  Preserve unrelated dirty root docs; stage only task-scope files.

## Most Recent User Intent (verbatim)

> "WS2.2 — per-org RLS + cross-tenant isolation test. ... Switch tenant-table row
> security from per-user (groomer_id = auth.uid()) to per-ORG membership, and
> prove with an automated test that one tenant can never read or write another's
> data. Apply and prove on STAGING ONLY."

## Last High-Signal Exchanges

- A duplicate WS2.1 kickoff was re-pasted; held fire (WS2.1 already merged as
  PR #12), confirmed, then ran WS2.2 per Russell's answer.
- WS2.2 delivered (PR #13): per-org RLS on all 10 tenant tables (staging),
  `user_org_ids()` helper, fail-loud cross-tenant isolation test (structural +
  behavioral, both directions). Proven on staging. CI-wiring split to WS2.2b.
- WS2.1 (PR #12) merged.

## Recently Shipped (last 14 days)

- PR #13 (open): per-org RLS + isolation test (WS2.2).
- PR #12 (merged): org + membership schema (WS2.1).
- PR #11 (merged): migration framework + staging (WS1).
- PR #10/#9 (merged): WS0 (service-role scoping, consent).
- PR #8 (merged): scope remaining server reads.

## Action Queue (queue, not license)

1. Review/merge PR #13.
2. **WS2.2b:** wire `cross_tenant_isolation.sql` into CI — Postgres service +
   Supabase auth shim. **Trap:** plain Postgres lacks Supabase's default grants,
   so an `authenticated` session errors before RLS evaluates; the shim must GRANT
   table privileges to anon/authenticated. Plan in `v2/supabase/tests/README.md`.
3. **WS2.3:** thread org context through the app (writes set org_id; reads need
   no change once RLS is per-org). Required before the app runs on per-org RLS.
4. **WS2.4:** Sam's rehearsed silent prod migration — membership + org_id
   backfill BEFORE the policy swap (see Blockers), with a backup. Operator-gated.
5. Finish WS1 leftovers (CLI round-trip, Sentry, backup rehearsal); SMS consent
   compliance follow-ups; operator-gated consent migration to prod.

## Reading List

1. `tidy-tails/2026-06-04-cheryl-delivery-program.md` (WS2 chain).
2. PR #13 description (isolation proof + WS2.4 ordering).
3. `tidy-tails/v2/supabase/tests/cross_tenant_isolation.sql` + its README.

## Cross-References

- `tidy-tails/START_HERE.md` — entrypoint + reading order.
- `tidy-tails/v2/AGENTS.md` — app product/data/write rules.
- Studio doctrine: `.koya/AGENTS.md` (Continuity Loop), `.koya/VOLATILE.md`.
