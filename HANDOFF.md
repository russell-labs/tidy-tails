---
last-updated: 2026-06-06
current-owner: Russell
lane: FOUNDER
active-app: tidy-tails-v2
hold-fire: true
---

# HANDOFF - Tidy Tails

## Right Now

- **READY TO SHIP (awaiting your review/merge):** PR #14 — "Wire cross-tenant
  isolation test into CI (WS2.2b)". CI green; the gate is proven green-on-correct
  and **red-on-breach**. CI-only; no real-project writes.
- **JUST MERGED:** PR #13 (WS2.2 per-org RLS). Earlier: PR #12 (WS2.1), PR #11
  (WS1), PR #10/#9 (WS0).
- **IN FLIGHT:** nothing else. No deploy; no prod/staging writes from this slice.

## Next Action

Russell reviews PR #14. With it merged, the cross-tenant isolation gate runs on
every PR/push. **To make it actually block merges/the cutover, add it as a
required status check in branch protection** (the workflow can't do that itself).
Next workstreams: **WS2.3** (thread org context through the app so writes set
org_id — required before the app can run on per-org RLS) and **WS2.4** (Sam's
rehearsed silent prod migration — see the ordering constraint in Blockers).

## Authorized Actions

(empty — expires at next update)

No mutation, deploy, merge, prod/staging schema change, migration apply to prod,
or live-data operation is authorized. Each requires Russell's explicit go for
that exact action in-thread. (WS2.2b is CI-only — no DB writes.)

## Current Production State

- Production v2 app: `https://tidy-tails-v2.vercel.app` (Vercel `tidy-tails-v2`).
- `main` HEAD: `a53db45` (after PR #13). WS2.2b on branch
  `ci/cross-tenant-isolation-gate` (PR #14), not merged.
- **Supabase PROD** `pgkwovokciaqnbhpttba`: UNCHANGED. Still per-user RLS, no
  org_id populated. Not touched by WS2.2b at all (CI uses an ephemeral DB).
- **Supabase STAGING** `exemhetaxosklljbrzeh`: per-org RLS live, two tenants
  (org#1 3/4/4, org#2 2/2/2). Unchanged by WS2.2b.
- CI: `verify` (typecheck+lint+827 tests) **plus** the new `isolation` gate
  (ephemeral Postgres + Supabase auth shim → migrations → seed → isolation test).
  Both green on PR #14.

## Active Blockers

- **WS2.4 prod-cutover ORDERING (safety-critical):** Sam's prod rows have
  groomer_id = her uid but org_id = null. WS2.4 must atomically (1) create her
  org + membership, (2) backfill org_id on all her rows, (3) THEN swap the
  policies — swapping first locks her out. Rehearse on staging; back up first.
- **App is org-unaware (WS2.3):** with per-org RLS, an INSERT not setting org_id
  fails closed. The app must thread org context before it can run on per-org RLS.
- **Isolation gate coverage:** the behavioral layer only exercises the 3 seeded
  tenant tables; the structural check (substring heuristic) covers the other 7. A
  malformed `… or true` policy on an empty table would slip both. Follow-up: seed
  ≥1 row per tenant table, or assert policy `qual` equality.
- **Supabase CLI still not authenticated** — blocks CLI round-trips / operator
  prod applies.
- `MASTER-BUSINESS-PLAN.md` missing at venture root — flagged, not blocking.

## Safety Rules In Force

- Hold-fire default: no deploy, prod data mutation, live SMS, prod schema/RLS
  changes or migrations, or integration-setting changes without Russell's
  explicit go for that exact action.
- Prod is read-only for schema work; never push/reset/DDL against prod. Staging
  is the push/rehearsal target. CI's isolation gate uses a throwaway DB only.
- WS0 consent migration still unapplied to prod.
- Permission does not carry across agents/threads. CI green before merge.
  Preserve unrelated dirty root docs; stage only task-scope files.

## Most Recent User Intent (verbatim)

> "WS2.2b — wire the cross-tenant isolation test into CI. ... Make the
> cross-tenant isolation test run automatically in CI and fail the build on any
> breach. This is the safety net that must be green before the WS2.4 prod cutover."

## Last High-Signal Exchanges

- WS2.2b delivered (PR #14): isolation gate wired into CI via a Postgres service
  + Supabase auth shim. Proven green-on-correct and **red-on-breach** (an `or
  true` leak on clients → behavioral assertion `FAIL t1 read: clients leaked`,
  exit 3), then restored to green. Harness faithfulness certified by the red run.
- WS2.2 (PR #13) merged: per-org RLS + the isolation test it now wires into CI.

## Recently Shipped (last 14 days)

- PR #14 (open): wire isolation test into CI (WS2.2b).
- PR #13 (merged): per-org RLS + isolation test (WS2.2).
- PR #12 (merged): org + membership schema (WS2.1).
- PR #11 (merged): migration framework + staging (WS1).
- PR #10/#9 (merged): WS0.

## Action Queue (queue, not license)

1. Review/merge PR #14; then add the `isolation` job as a **required** status
   check in branch protection so it blocks merges + the WS2.4 cutover.
2. Isolation-gate coverage follow-up: seed ≥1 row per tenant table (or assert
   policy `qual` equality) so the behavioral layer covers all 10, not just 3.
3. **WS2.3:** thread org context through the app (writes set org_id).
4. **WS2.4:** Sam's rehearsed silent prod migration — membership + org_id
   backfill BEFORE the policy swap, with a backup. Operator-gated.
5. WS1 leftovers (CLI round-trip, Sentry, backup rehearsal); SMS consent
   compliance follow-ups; operator-gated consent migration to prod.

## Reading List

1. `tidy-tails/2026-06-04-cheryl-delivery-program.md` (WS2 chain).
2. PR #14 description (harness rationale + the green/red/green proof).
3. `tidy-tails/v2/supabase/tests/cross_tenant_isolation.sql` + `ci_bootstrap.sql`.

## Cross-References

- `tidy-tails/START_HERE.md` — entrypoint + reading order.
- `tidy-tails/v2/AGENTS.md` — app product/data/write rules.
- Studio doctrine: `.koya/AGENTS.md` (Continuity Loop), `.koya/VOLATILE.md`.
