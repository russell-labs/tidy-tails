---
last-updated: 2026-06-06
current-owner: Russell
lane: FOUNDER
active-app: tidy-tails-v2
hold-fire: true
---

# HANDOFF - Tidy Tails

## Right Now

- **READY TO SHIP (awaiting your review/merge):** PR #15 — "Thread org context
  through writes for per-org RLS (WS2.3)". App is now org-aware: every tenant
  insert/upsert stamps `org_id`, via `currentOrgId()`/`requireOrgId()` (fail
  closed). 834 unit tests (+7), typecheck/lint/build green; CI incl. the
  isolation gate runs on the PR. **Not deployed to prod** — ships with the WS2.4
  cutover. Verified on STAGING per-org RLS (both tenants; null + foreign org
  rejected 42501; non-destructive).
- **JUST MERGED:** PR #14 (WS2.2b isolation gate in CI). Earlier: PR #13 (WS2.2
  per-org RLS), PR #12 (WS2.1), PR #11 (WS1), PR #10/#9 (WS0).
- **IN FLIGHT:** nothing else. No deploy; no prod writes. Staging writes this
  slice were RLS-contract probes only, all rolled back (0 rows persisted).

## Next Action

Russell reviews/merges PR #15 (WS2.3). It does **not** change behavior for the
current single operator and does **not** touch prod. After merge, the only
remaining gate before the app can run on per-org RLS is **WS2.4** — Sam's
rehearsed silent prod migration (membership + org_id backfill BEFORE the policy
swap; see ordering constraint in Blockers). The WS2.3 app code and the WS2.4
prod backfill must go live together. Also still open from WS2.2b: add the
`isolation` job as a **required** status check in branch protection.

## Authorized Actions

(empty — expires at next update)

No mutation, deploy, merge, prod/staging schema change, migration apply to prod,
or live-data operation is authorized. Each requires Russell's explicit go for
that exact action in-thread. (WS2.2b is CI-only — no DB writes.)

## Current Production State

- Production v2 app: `https://tidy-tails-v2.vercel.app` (Vercel `tidy-tails-v2`).
- `main` HEAD: `4050654` (after PR #14). WS2.3 on branch
  `feat/app-org-context` (PR #15), not merged.
- **Supabase PROD** `pgkwovokciaqnbhpttba`: UNCHANGED. Still per-user RLS, no
  org_id populated. WS2.3 is app code only — not deployed; it goes live with the
  WS2.4 cutover.
- **Supabase STAGING** `exemhetaxosklljbrzeh`: per-org RLS live, two tenants
  (org#1 3/4/4, org#2 2/2/2). Unchanged by WS2.3 (verification probes rolled back).
- CI: `verify` (typecheck+lint+**834** tests) **plus** the `isolation` gate
  (ephemeral Postgres + Supabase auth shim → migrations → seed → isolation test).
  Running on PR #15.

## Active Blockers

- **WS2.4 prod-cutover ORDERING (safety-critical):** Sam's prod rows have
  groomer_id = her uid but org_id = null. WS2.4 must atomically (1) create her
  org + membership, (2) backfill org_id on all her rows, (3) THEN swap the
  policies — swapping first locks her out. Rehearse on staging; back up first.
- **~~App is org-unaware (WS2.3)~~ — RESOLVED in PR #15 (pending merge):** the
  app now threads org context; every tenant insert sets org_id via
  `requireOrgId()` (fail closed). Remaining WS2.3-adjacent follow-up: the
  inbound-sms webhook's phone-match read of `clients` is still unscoped (service
  role) — scope it to the resolved org during/after WS2.4 so it can't match a
  foreign org's client once multiple orgs exist.
- **`org_id` is nullable with no DB default:** a missed insert site writes NULL
  silently (no error) until per-org RLS is enforced. WS2.3 covered all current
  sites; per-org RLS is the durable backstop post-cutover.
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

> "WS2.3 — thread org context through the app. ... Make the app org-aware so it
> works under WS2.2's per-org RLS: every tenant-row INSERT sets org_id, and the
> data layer resolves the current operator's org. Verified against STAGING ...
> NOT deployed to prod ... this app code + the prod backfill go live together in
> WS2.4."

## Last High-Signal Exchanges

- WS2.2b delivered (PR #14): isolation gate wired into CI via a Postgres service
  + Supabase auth shim. Proven green-on-correct and **red-on-breach** (an `or
  true` leak on clients → behavioral assertion `FAIL t1 read: clients leaked`,
  exit 3), then restored to green. Harness faithfulness certified by the red run.
- WS2.2 (PR #13) merged: per-org RLS + the isolation test it now wires into CI.

## Recently Shipped (last 14 days)

- PR #15 (open): thread org context through writes — org_id on every tenant
  insert (WS2.3).
- PR #14 (merged): wire isolation test into CI (WS2.2b).
- PR #13 (merged): per-org RLS + isolation test (WS2.2).
- PR #12 (merged): org + membership schema (WS2.1).
- PR #11 (merged): migration framework + staging (WS1).
- PR #10/#9 (merged): WS0.

## Action Queue (queue, not license)

1. Review/merge PR #15 (WS2.3 — org context through writes).
2. Add the `isolation` job as a **required** status check in branch protection
   so it blocks merges + the WS2.4 cutover.
3. Isolation-gate coverage follow-up: seed ≥1 row per tenant table (or assert
   policy `qual` equality) so the behavioral layer covers all 10, not just 3.
4. **WS2.4:** Sam's rehearsed silent prod migration — membership + org_id
   backfill BEFORE the policy swap, with a backup. Must ship together with the
   WS2.3 app code (PR #15). Operator-gated. Also scope the inbound-sms webhook's
   clients match-read to the org as part of this.
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
