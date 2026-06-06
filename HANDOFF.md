---
last-updated: 2026-06-06
current-owner: Russell
lane: FOUNDER
active-app: tidy-tails-v2
hold-fire: true
---

# HANDOFF - Tidy Tails

## Right Now

- **READY TO SHIP (awaiting your review/merge):** PR #11 — "Supabase migration
  framework + staging schema (WS1)". CI green expected; not merged. Staging is
  already provisioned (see below); the PR is the committed framework files.
- **JUST MERGED:** PR #10 (WS0 ship 2, service-role write scoping) — **WS0
  complete**. Earlier: PR #9 (consent), PR #8/#7/#6 (read-scoping + dedupe).
- **IN FLIGHT:** nothing else. No deploy; no prod writes.

## Next Action

Russell reviews PR #11. It delivers the **staging + migration-framework** half
of WS1. Remaining WS1 items need the Supabase CLI authenticated (see Blockers):
a CLI `db pull`/`db push` round-trip, per-tenant Sentry context, and a
backup-restore rehearsal. After WS1 fully closes, WS2 (multi-tenancy core:
org model, per-org RLS, the cross-tenant isolation CI test) is next per
2026-06-04-cheryl-delivery-program.md.

## Authorized Actions

(empty — expires at next update)

No mutation, deploy, merge, prod schema/RLS change, migration apply to prod, or
live-data operation is authorized. Each requires Russell's explicit go for that
exact action in-thread. (WS1 applied migrations to STAGING only.)

## Current Production State

- Production v2 app: `https://tidy-tails-v2.vercel.app` (Vercel `tidy-tails-v2`).
- `main` HEAD: `4d3b4ab` (after PR #10). WS1 lives on branch
  `chore/migration-framework-and-staging` (PR #11), not merged.
- **Supabase PROD** `pgkwovokciaqnbhpttba`: unchanged. The `clients.sms_consent`
  columns are still NOT applied to prod (consent migration is review-only).
- **Supabase STAGING** `exemhetaxosklljbrzeh` (new, us-east-1): now carries the
  prod public schema + the consent columns + a synthetic seed (3 clients / 4
  pets / 4 appointments). Verified byte-identical to prod (+ the 2 consent cols)
  by a per-category schema fingerprint.
- Tests: 827 on the WS1 branch and `main` (WS1 changed no app code). CI
  (`verify`: typecheck + lint + vitest) must be green before merge.

## Active Blockers

- **Supabase CLI is not installed/authenticated** in this environment (no access
  token, no DB passwords). This blocks the CLI `db pull`/`db push` round-trip and
  any operator-gated prod migration apply. To unblock: install the CLI + provide
  a Supabase access token (or `supabase login`) + the staging (and, for prod
  apply, prod) DB passwords. WS1 used the Supabase MCP instead for staging.
- `MASTER-BUSINESS-PLAN.md` missing at the venture root — flagged, not blocking.

## Safety Rules In Force

- Hold-fire default: no deploy, prod data mutation, live SMS, prod schema/RLS
  changes or migrations, or integration-setting changes without Russell's
  explicit go for that exact action.
- **Prod is read-only for schema work**: `db pull`/introspection only; never
  `db push`/`db reset`/DDL against prod. Staging is the push/rehearsal target.
- WS0 consent migration deploy ordering still applies (apply the migration before
  deploying the PR #9 code).
- Permission does not carry across agents/threads. CI green before merge.
  Preserve unrelated dirty root docs; stage only task-scope files.

## Most Recent User Intent (verbatim)

> "WS1 — migration framework + staging schema. ... Replace ad-hoc SQL with a
> versioned Supabase migration framework, and bring the new staging project to a
> schema matching production-plus-the-pending-consent-migration."

## Last High-Signal Exchanges

- WS1 kickoff authorized: branch `chore/migration-framework-and-staging`; author
  files; apply to STAGING only; open PR; update HANDOFF. NOT authorized: prod
  writes, merge, deploy. Operator chose the MCP-driven path (no CLI creds).
- WS1 delivered (PR #11): versioned baseline + consent migrations, staging
  provisioned + seeded, schema fingerprint gate PASSED (staging = prod + 2
  consent cols). Prod was read-only (introspection SELECTs only).
- WS0 complete (PR #9 + #10 merged).

## Recently Shipped (last 14 days)

- PR #11 (open): Supabase migration framework + staging schema (WS1).
- PR #10 (merged): service-role write scoping (WS0 ship 2).
- PR #9 (merged): SMS consent capture (WS0 ship 1).
- PR #8 (merged): scope remaining server reads (slice 3).
- PR #7 (merged): explicit operator read-scoping in repo.ts (slice 2).

## Action Queue (queue, not license)

1. Review/merge PR #11.
2. **Finish WS1** (needs CLI auth — see Blockers): CLI `db pull`/`db push`
   round-trip through staging + re-validate the committed baseline against a
   `pg_dump`; per-tenant Sentry context; backup-restore rehearsal.
3. **WS2 — multi-tenancy core:** organizations + memberships, `org_id` on every
   tenant table, RLS switched per-org, the cross-tenant isolation CI test, then
   Sam's rehearsed silent migration. Staging (now live) is the rehearsal ground.
4. SMS consent compliance follow-ups (before A2P go-live): STOP -> consent=false
   wiring; consent re-check at send time; view/edit/revoke consent surface.
5. Operator-gated: apply the consent migration to prod (after a rehearsal +
   backup), then deploy PR #9 code.

## Reading List

1. `tidy-tails/2026-06-04-cheryl-delivery-program.md` (WS1 done-ish; WS2 next).
2. PR #11 description (baseline capture + the acceptance-gate proof).
3. `tidy-tails/v2/supabase/README.md` (the migration workflow).

## Cross-References

- `tidy-tails/START_HERE.md` — entrypoint + reading order.
- `tidy-tails/v2/AGENTS.md` — app product/data/write rules.
- Studio doctrine: `.koya/AGENTS.md` (Continuity Loop), `.koya/VOLATILE.md`.
