---
last-updated: 2026-06-06
current-owner: Russell
lane: FOUNDER
active-app: tidy-tails-v2
hold-fire: true
---

# HANDOFF - Tidy Tails

## Right Now

- **READY TO SHIP (awaiting your review/merge):** PR #16 — "Author + rehearse the
  prod org cutover (WS2.4a)". The production cutover migration is authored and
  **fully rehearsed in CI** on a prod-like throwaway DB (all assertions green:
  email→uid→membership→org chain, all 10 tables backfilled, consent grandfathered,
  Sam reads+writes under per-org RLS, second tenant isolated, idempotent re-run,
  fail-loud abort). A prod execution runbook is included. **Nothing applied to
  prod or staging.**
- **JUST MERGED:** PR #15 (WS2.3 app org context). Earlier: PR #14 (WS2.2b), #13
  (WS2.2), #12 (WS2.1), #11 (WS1), #10/#9 (WS0).
- **IN FLIGHT:** nothing else. No deploy; no prod/staging writes. (Prod touched
  only by read-only introspection this slice.)

## ‼️ Corrected prod-state premise (verified 2026-06-06)

Earlier notes (and the WS2.4 kickoff) assumed prod had migrations 0001–0003. **It
does not.** Read-only introspection of prod shows it is on its **original baseline
only**: no `sms_consent` column, no `organizations`/`organization_memberships`
tables, no `org_id` columns, per-user RLS. The WS-series migrations were all
**staging-first** — prod has a separate, older `schema_migrations` lineage. So the
cutover takes prod from that **true baseline** all the way to multi-tenant in one
atomic migration (it now *creates* the org schema + consent column, not just swaps
policies). This is the corrected basis for everything below.

## Next Action

Review PR #16 (WS2.4a). It changes nothing on prod/staging — it authors + proves
the cutover. The **execution** of the cutover (WS2.4b) is the next, operator-gated
step, per `_reports/2026-06-06-ws2.4-prod-cutover-runbook.md`:

1. Pre-flight (read-only): Sam email→uid **must equal** `TIDYTAILS_OPERATOR_USER_ID`
   (expected `88413167-0799-49a7-ba4c-c1c29403e038`); confirm single `groomer_id`;
   capture the per-table count manifest.
2. Backup (Nano = no auto-backups): fresh `venture-ops/dump_supabase.py` dump.
3. Apply the cutover migration (`psql -f …/cutover/…prod_org_cutover.sql`).
4. Verify (zero null-org rows; counts == manifest; consent grandfathered).
5. **Then** deploy the app (`vercel --prod`) — never before the migration.
6. Smoke test incl. the inbound-SMS webhook.

⚠️ Ordering is load-bearing: the WS2.3 app hard-requires Sam's membership, and the
always-on inbound-SMS webhook 500s without it. Migration (creates membership +
backfill) **before** app deploy, always.

Also still open from WS2.2b: add the `isolation` job (and now `cutover-rehearsal`)
as **required** status checks in branch protection.

## Authorized Actions

(empty — expires at next update)

No mutation, deploy, merge, prod/staging schema change, migration apply to prod,
or live-data operation is authorized. Each requires Russell's explicit go for
that exact action in-thread. (WS2.2b is CI-only — no DB writes.)

## Current Production State

- Production v2 app: `https://tidy-tails-v2.vercel.app` (Vercel `tidy-tails-v2`).
- `main` HEAD: `6ec44c1` (after PR #15). WS2.4a on branch
  `feat/prod-cutover-rehearsal` (PR #16), not merged.
- **Supabase PROD** `pgkwovokciaqnbhpttba`: **baseline only** (see the corrected
  premise above) — no org schema, no `org_id`, no `sms_consent`, per-user RLS.
  UNCHANGED this slice (read-only introspection only). Single operator confirmed.
- **Supabase STAGING** `exemhetaxosklljbrzeh`: per-org RLS live, two tenants
  (org#1 3/4/4, org#2 2/2/2). Untouched this slice.
- CI: `verify` (834 tests) + `isolation` gate + **new `cutover-rehearsal`** job
  (ephemeral PG at prod's true baseline → seed Sam → run cutover → assert
  backfill/consent/RLS/isolation/idempotent/fail-loud). All green on PR #16.

## Active Blockers

- **WS2.4b prod-cutover EXECUTION (safety-critical, operator-gated):** the cutover
  is authored + rehearsed (PR #16) but NOT applied. Execute via
  `_reports/2026-06-06-ws2.4-prod-cutover-runbook.md`: pre-flight (email→uid ==
  `TIDYTAILS_OPERATOR_USER_ID`, single groomer_id, capture count manifest) → fresh
  backup (Nano, no PITR) → apply cutover → verify (zero null-org, counts ==
  manifest, consent grandfathered) → deploy app → smoke test incl. webhook →
  rollback = revert deploy + restore dump. Migration strictly before app deploy.
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

> "WS2.4a — author + REHEARSE the production cutover. ... author the production
> cutover as ONE atomic, idempotent, fail-loud transaction, and PROVE it on a
> prod-like throwaway DB. ... Zero writes to prod or staging." (Refined mid-slice
> after introspection showed prod is on its true baseline, not 0001–0003.)

## Last High-Signal Exchanges

- WS2.2b delivered (PR #14): isolation gate wired into CI via a Postgres service
  + Supabase auth shim. Proven green-on-correct and **red-on-breach** (an `or
  true` leak on clients → behavioral assertion `FAIL t1 read: clients leaked`,
  exit 3), then restored to green. Harness faithfulness certified by the red run.
- WS2.2 (PR #13) merged: per-org RLS + the isolation test it now wires into CI.

## Recently Shipped (last 14 days)

- PR #16 (open): author + rehearse the prod org cutover (WS2.4a).
- PR #15 (merged): thread org context through writes (WS2.3).
- PR #14 (merged): wire isolation test into CI (WS2.2b).
- PR #13 (merged): per-org RLS + isolation test (WS2.2).
- PR #12 (merged): org + membership schema (WS2.1).
- PR #11 (merged): migration framework + staging (WS1).
- PR #10/#9 (merged): WS0.

## Action Queue (queue, not license)

1. Review/merge PR #16 (WS2.4a — cutover authored + rehearsed). Nothing applied.
2. **WS2.4b — execute the cutover** (operator-gated) via the runbook
   `_reports/2026-06-06-ws2.4-prod-cutover-runbook.md`. Migration before app
   deploy. This single window does: create org + Sam membership, add the org
   schema + consent column, backfill org_id (+ grandfather consent), swap to
   per-org RLS — then `vercel --prod` + smoke test incl. webhook.
3. Add `isolation` + `cutover-rehearsal` as **required** status checks in branch
   protection so they block merges + the cutover PR.
4. Isolation-gate coverage follow-up: seed ≥1 row per tenant table (or assert
   policy `qual` equality) so the behavioral layer covers all 10, not just 3.
   (The new `cutover-rehearsal` job already seeds all 10.)
5. Post-cutover follow-up: scope the inbound-sms webhook's `clients` phone-match
   read to the resolved org (still unscoped — service role reads all orgs).
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
