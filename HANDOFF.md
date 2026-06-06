---
last-updated: 2026-06-06
current-owner: Russell
lane: FOUNDER
active-app: tidy-tails-v2
hold-fire: true
---

# HANDOFF - Tidy Tails

## Right Now

- **READY TO SHIP (awaiting your review/merge):** PR #9 — "Add SMS consent
  capture at booking/intake (WS0)". CI green expected; not merged. Includes a
  review-only migration that is **NOT** applied.
- **JUST MERGED:** PR #8 (slice 3, scope remaining server reads), PR #7 (slice 2,
  explicit read-scoping), PR #6 (slice 1, shared helpers + FormPrimitives).
- **IN FLIGHT:** nothing else. No deploy triggered by any Phase 2 / WS0 ship.

## Next Action

Russell reviews PR #9. WS0 has two ships: this one (SMS consent) and service-role
write scoping (still queued — see Action Queue). The WS0 gate is "both merged, CI
green" before any multi-tenant work (per 2026-06-04-cheryl-delivery-program.md).
PR #9 changes Sam's workflow once deployed (existing clients are not-consented
until re-confirmed) and requires the migration applied first — do not deploy
casually.

## Authorized Actions

(empty — expires at next update)

No mutation, deploy, merge, schema/RLS change, migration apply, or live-data
operation is authorized. Each requires Russell's explicit go for that exact
action in-thread.

## Current Production State

- Production v2 app: `https://tidy-tails-v2.vercel.app` (Vercel project
  `tidy-tails-v2`).
- `main` HEAD: `5f17bb9` (after PR #8). WS0 consent lives on branch
  `feat/sms-consent-capture` (PR #9), not merged.
- Supabase project: `pgkwovokciaqnbhpttba`. The `clients.sms_consent` /
  `sms_consent_at` columns do **not** exist in prod yet (migration unapplied).
- Tests: 820 on `main`; 825 unit + 6 e2e on the WS0 branch. CI (`verify`:
  typecheck + lint + vitest) must stay green before merge; CI does not run e2e.

## Active Blockers

- None technical. PR #9 awaits operator review.
- `MASTER-BUSINESS-PLAN.md` missing at the venture root — a "must-carry"
  Continuity-Loop file. Flagged, not blocking.

## Safety Rules In Force

- Hold-fire default: do not deploy, mutate production data, send live SMS, run
  schema/RLS changes or migrations, or change Supabase/Twilio/Google production
  settings without Russell's explicit go for that exact action.
- WS0 deploy ordering: the consent migration must be applied **before** the PR #9
  code is deployed (the write paths reference the new columns).
- Permission does not carry across agents or threads. CI green before merge.
  Preserve unrelated dirty/untracked root docs; stage only task-scope files.

## Most Recent User Intent (verbatim)

> "WS0 — add SMS consent capture at booking/intake. ... Add explicit, recorded
> SMS consent so reminder/booking texts are truthful for A2P registration and
> compliant with Canada's CASL."

## Last High-Signal Exchanges

- WS0 kickoff authorized: branch `feat/sms-consent-capture`; author, commit,
  push, open PR; update this HANDOFF. NOT authorized: merge, deploy, apply the
  migration.
- WS0 delivered (PR #9): consent captured at AddHousehold + AddAppointment,
  persisted on `clients`, and gating `createBooking` (block / allow-on-file /
  capture-and-persist). +5 unit tests (825), 6 e2e pass. Flagged: STOP not
  wired, send-paths don't re-check consent, deploy-after-migration, no
  view/edit/revoke surface.
- Slice 3 (PR #8) merged: scoped the remaining server reads.

## Recently Shipped (last 14 days)

- PR #9 (open): SMS consent capture (WS0).
- PR #8 (merged): scope remaining server reads (slice 3).
- PR #7 (merged): explicit operator read-scoping in repo.ts (slice 2).
- PR #6 (merged): dedupe shared helpers + FormPrimitives (slice 1).
- PR #5/#4/#3/#1 (merged): Sentry, advisories, action tests, Phase 0 hardening.

## Action Queue (queue, not license)

1. Review/merge PR #9 (operator decision).
2. **WS0 ship 2:** service-role write scoping (the other WS0 prerequisite;
   `refreshOutboundDeliveryStatuses` and similar RLS-bypassing writes). WS0 gate
   needs both merged before multi-tenant work.
3. SMS consent follow-ups (compliance, before A2P go-live): wire STOP →
   `sms_consent=false` (inbound-SMS webhook); re-check consent at send time in
   `reminders.ts` and EditAppointment update/cancel texts; add a view/edit/revoke
   consent surface (EditClient).
4. Phase 2 seams: `SchedulingStrategy`, decompose the big forms.

## Reading List

1. `tidy-tails/2026-06-04-cheryl-delivery-program.md` (WS0 + roadmap).
2. PR #9 description (consent model + the ranked compliance flags).
3. `tidy-tails/_reports/2026-06-06-sms-consent-migration.sql` (review-only).

## Cross-References

- `tidy-tails/START_HERE.md` — entrypoint + reading order.
- `tidy-tails/v2/AGENTS.md` — app product/data/write rules.
- Studio doctrine: `.koya/AGENTS.md` (Continuity Loop), `.koya/VOLATILE.md`.
