---
last-updated: 2026-06-06
current-owner: Russell
lane: FOUNDER
active-app: tidy-tails-v2
hold-fire: true
---

# HANDOFF - Tidy Tails

## Right Now

- **READY TO SHIP (awaiting your review/merge):** PR #10 — "Scope the
  service-role SMS status-refresh write to the operator (WS0)". CI green
  expected; not merged.
- **JUST MERGED:** PR #9 (WS0 SMS consent capture). Earlier: PR #8/#7/#6 (Phase 2
  read-scoping + dedupe slices).
- **IN FLIGHT:** nothing else. No deploy triggered.

## Next Action

Russell reviews PR #10. **WS0's gate is now closeable:** both WS0 prerequisites
are delivered — SMS consent (PR #9, merged) and service-role write scoping
(PR #10, open). Once PR #10 merges with CI green, WS0 is complete and the next
workstream (WS1 — staging environment + migration framework, per
2026-06-04-cheryl-delivery-program.md) is unblocked. Note: the consent migration
from PR #9 is still **unapplied**; applying it + deploy ordering is a separate
operator decision.

## Authorized Actions

(empty — expires at next update)

No mutation, deploy, merge, schema/RLS change, migration apply, or live-data
operation is authorized. Each requires Russell's explicit go for that exact
action in-thread.

## Current Production State

- Production v2 app: `https://tidy-tails-v2.vercel.app` (Vercel project
  `tidy-tails-v2`).
- `main` HEAD: `b252a6f` (after PR #9). WS0 ship 2 lives on branch
  `refactor/scope-service-role-write` (PR #10), not merged.
- Supabase project: `pgkwovokciaqnbhpttba`. The `clients.sms_consent` columns
  from PR #9 do **not** exist in prod yet (migration unapplied).
- Tests: 825 on `main`; 827 unit + 6 e2e on the WS0 ship-2 branch. CI (`verify`:
  typecheck + lint + vitest) must be green before merge; CI does not run e2e.

## Active Blockers

- None technical. PR #10 awaits operator review.
- `MASTER-BUSINESS-PLAN.md` missing at the venture root — a "must-carry"
  Continuity-Loop file. Flagged, not blocking.

## Safety Rules In Force

- Hold-fire default: do not deploy, mutate production data, send live SMS, run
  schema/RLS changes or migrations, or change Supabase/Twilio/Google production
  settings without Russell's explicit go for that exact action.
- WS0 (PR #9) deploy ordering: the consent migration must be applied **before**
  the PR #9 code is deployed (its write paths reference the new columns).
- Permission does not carry across agents or threads. CI green before merge.
  Preserve unrelated dirty/untracked root docs; stage only task-scope files.

## Most Recent User Intent (verbatim)

> "WS0 ship 2 — scope the service-role write. ... refreshOutboundDeliveryStatuses
> uses a service-role client that bypasses RLS ... scope it now while
> single-tenant. ... fail closed with no session."

## Last High-Signal Exchanges

- WS0 ship-2 kickoff authorized: branch `refactor/scope-service-role-write`;
  author, commit, push, open PR; update this HANDOFF. NOT authorized: merge,
  deploy.
- WS0 ship 2 delivered (PR #10): the RLS-bypassing service-role status-refresh
  UPDATE now filters by `groomer_id` and fails closed with no session. Path is
  not session-reachable in practice (defense in depth). +2 tests (827), e2e
  green.
- WS0 ship 1 (PR #9) merged: SMS consent capture.

## Recently Shipped (last 14 days)

- PR #10 (open): scope the service-role SMS status-refresh write (WS0 ship 2).
- PR #9 (merged): SMS consent capture (WS0 ship 1).
- PR #8 (merged): scope remaining server reads (slice 3).
- PR #7 (merged): explicit operator read-scoping in repo.ts (slice 2).
- PR #6 (merged): dedupe shared helpers + FormPrimitives (slice 1).

## Action Queue (queue, not license)

1. Review/merge PR #10. With it, WS0 is complete (both ships).
2. **WS1 — environment & tooling** (next workstream once WS0 closes): staging
   Supabase project + Vercel preview seeded with synthetic data; adopt Supabase
   CLI migrations; per-tenant Sentry context + backup-restore rehearsal.
3. SMS consent compliance follow-ups (before A2P go-live): wire STOP →
   `sms_consent=false` (inbound-SMS webhook); re-check consent at send time in
   `reminders.ts` and EditAppointment update/cancel texts; add a view/edit/revoke
   consent surface (EditClient).
4. Phase 2 seams: `SchedulingStrategy`, decompose the big forms.

## Reading List

1. `tidy-tails/2026-06-04-cheryl-delivery-program.md` (WS0 done; WS1 next).
2. PR #10 description (service-role scoping + session-reachability).
3. `tidy-tails/v2/lib/smsMessages.server.ts` (the scoped refresh).

## Cross-References

- `tidy-tails/START_HERE.md` — entrypoint + reading order.
- `tidy-tails/v2/AGENTS.md` — app product/data/write rules.
- Studio doctrine: `.koya/AGENTS.md` (Continuity Loop), `.koya/VOLATILE.md`.
