---
last-updated: 2026-06-06
current-owner: Russell
lane: FOUNDER
active-app: tidy-tails-v2
hold-fire: true
---

# HANDOFF - Tidy Tails

## Right Now

- **READY TO SHIP (awaiting your review/merge):** PR #12 — "Org + membership
  schema (WS2.1, additive, staging-first)". CI green expected; not merged.
  Applied to STAGING only.
- **JUST MERGED:** PR #11 (WS1, migration framework + staging). Earlier: PR #10/#9
  (WS0), PR #8/#7/#6 (read-scoping + dedupe).
- **IN FLIGHT:** nothing else. No deploy; no prod writes.

## Next Action

Russell reviews PR #12. It adds the additive org/membership model + nullable
`org_id` on every tenant table, applied to staging with two synthetic tenants.
One decision needs your call (see Blockers/looked-wrong): whether
`organization_memberships.user_id` should get an `auth.users(id)` FK. Next
workstream is **WS2.2** (switch RLS from per-user `groomer_id` to per-org
membership + the cross-tenant isolation CI test); staging now has two tenants to
prove isolation against.

## Authorized Actions

(empty — expires at next update)

No mutation, deploy, merge, prod schema/RLS change, migration apply to prod, or
live-data operation is authorized. Each requires Russell's explicit go for that
exact action in-thread. (WS2.1 applied to STAGING only.)

## Current Production State

- Production v2 app: `https://tidy-tails-v2.vercel.app` (Vercel `tidy-tails-v2`).
- `main` HEAD: `43846d6` (after PR #11). WS2.1 on branch `feat/org-tenant-schema`
  (PR #12), not merged.
- **Supabase PROD** `pgkwovokciaqnbhpttba`: unchanged (read-only this slice). No
  org tables, no `org_id`, no consent columns on prod yet.
- **Supabase STAGING** `exemhetaxosklljbrzeh`: prod schema + consent + the WS2.1
  org/membership model, seeded with **two tenants** (org#1 = operator aa: 3
  clients/4 pets/4 appts; org#2 = operator bb: 2/2/2; each 1 member). Migrations
  tracked: 20260606000001/002/003.
- Tests: 827 on the WS2.1 branch and `main` (zero app code changed). CI
  (`verify`: typecheck+lint+vitest) must be green before merge.

## Active Blockers

- **Decision needed:** `organization_memberships.user_id` has no `auth.users(id)`
  FK (followed the kickoff spec, which named a FK only for `org_id`). Recommend
  adding it for membership integrity unless intentional — your call.
- **Supabase CLI still not authenticated** (no token/DB passwords) — blocks the
  WS1 CLI `db pull`/`db push` round-trip + any operator-gated prod apply. Staging
  work uses the MCP.
- `MASTER-BUSINESS-PLAN.md` missing at the venture root — flagged, not blocking.

## Safety Rules In Force

- Hold-fire default: no deploy, prod data mutation, live SMS, prod schema/RLS
  changes or migrations, or integration-setting changes without Russell's
  explicit go for that exact action.
- **Prod is read-only for schema work**: introspection only; never push/reset/DDL
  against prod. Staging is the push/rehearsal target.
- WS0 consent migration is still unapplied to prod (apply before deploying PR #9).
- Permission does not carry across agents/threads. CI green before merge.
  Preserve unrelated dirty root docs; stage only task-scope files.

## Most Recent User Intent (verbatim)

> "WS2.1 — org + membership schema (additive, staging-only). ... Introduce the
> multi-tenant data model as ADDITIVE schema only. No RLS change, no app behavior
> change yet — those are WS2.2/WS2.3."

## Last High-Signal Exchanges

- WS2.1 kickoff authorized: branch `feat/org-tenant-schema`; author migration +
  seed; apply to STAGING only; open PR; update HANDOFF. NOT authorized: prod
  writes, RLS changes to existing tables, app changes, merge, deploy.
- WS2.1 delivered (PR #12): additive org/membership schema + nullable org_id on
  10 tables, two staging tenants, gate passed (additive-only + delta exactly the
  intended objects). Flagged the user_id-FK decision + placeholder-policy caveats.
- WS1 (PR #11) merged: migration framework + staging.

## Recently Shipped (last 14 days)

- PR #12 (open): org + membership schema (WS2.1).
- PR #11 (merged): migration framework + staging (WS1).
- PR #10 (merged): service-role write scoping (WS0 ship 2).
- PR #9 (merged): SMS consent capture (WS0 ship 1).
- PR #8 (merged): scope remaining server reads (slice 3).

## Action Queue (queue, not license)

1. Review/merge PR #12; confirm the `user_id`-FK decision.
2. **WS2.2 — per-org isolation:** switch RLS on tenant tables from `groomer_id =
   auth.uid()` to per-org membership; add the **cross-tenant isolation CI test**
   (tenant A can never read/write tenant B) — staging's two tenants are the
   fixture. Still staging-only until rehearsed.
3. WS2.3 (app cutover to org model) and WS2.4 (prod backfill + Sam's rehearsed
   silent migration). Finish WS1 leftovers (CLI round-trip, Sentry, backup
   rehearsal) — needs CLI auth.
4. SMS consent compliance follow-ups (STOP wiring, send-time re-check, consent
   management UI); operator-gated consent migration apply to prod.

## Reading List

1. `tidy-tails/2026-06-04-cheryl-delivery-program.md` (WS2 dependency chain).
2. PR #12 description (additive model + the two-part acceptance gate).
3. `tidy-tails/v2/supabase/migrations/20260606000003_org_tenant_schema.sql`.

## Cross-References

- `tidy-tails/START_HERE.md` — entrypoint + reading order.
- `tidy-tails/v2/AGENTS.md` — app product/data/write rules.
- Studio doctrine: `.koya/AGENTS.md` (Continuity Loop), `.koya/VOLATILE.md`.
