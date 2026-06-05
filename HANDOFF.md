---
last-updated: 2026-06-05
current-owner: Russell
lane: FOUNDER
active-app: tidy-tails-v2
hold-fire: true
---

# HANDOFF - Tidy Tails

## Right Now

- **READY TO SHIP (awaiting your review/merge):** PR #7 — "Explicit operator
  scoping at the data read layer (Phase 2 slice 2)". CI green expected; not
  merged (merge is not authorized).
- **JUST MERGED:** PR #6 — "Dedupe shared helpers and form primitives (Phase 2
  slice 1)". On `main` as of this update.
- **IN FLIGHT:** nothing else. No deploy has been triggered by these slices.

## Next Action

Russell reviews PR #7 and decides whether to merge. Both slices are
behavior-preserving refactors with no schema/RLS/production changes; neither has
been deployed. After merge, the natural next slice is the `SchedulingStrategy`
seam (Phase 2) or expanding read-scoping to the out-of-scope reads reported in
PR #7 (see Action Queue).

## Authorized Actions

(empty — expires at next update)

No mutation, deploy, merge, schema/RLS change, or live-data operation is
authorized. Each requires Russell's explicit go for that exact action in-thread.

## Current Production State

- Production v2 app: `https://tidy-tails-v2.vercel.app` (Vercel project
  `tidy-tails-v2`).
- `main` HEAD: `7769387` (after PR #6 merge). Slice 2 lives on branch
  `refactor/explicit-read-scoping` (PR #7), not yet merged.
- Supabase project: `pgkwovokciaqnbhpttba`. Live RLS SELECT on `clients`,
  `pets`, `appointments`, `day_closeout_overrides` is `groomer_id = auth.uid()`
  (verified read-only during slice 2).
- Tests: 804 on `main`; 814 on the slice-2 branch. CI (`verify`: typecheck +
  lint + vitest) runs on every push/PR and must stay green before merge.

## Active Blockers

- None technical. PR #7 awaits operator review (process gate, not a defect).
- `MASTER-BUSINESS-PLAN.md` is missing at the venture root — a "must-carry"
  Continuity-Loop file. Flagged, not blocking this engineering work.

## Safety Rules In Force

- Hold-fire default: do not deploy, mutate production data, send live SMS, run
  schema/RLS changes, or change Supabase/Twilio/Google production settings
  without Russell's explicit go for that exact action.
- Permission does not carry across agents or across threads.
- New server actions must re-verify the operator session server-side.
- CI must be green before merge. Preserve unrelated dirty/untracked root docs;
  stage only files in the current task scope.

## Most Recent User Intent (verbatim)

> "Phase 2 slice 2 — explicit operator scoping at the data read layer. ... reads
> must filter to the authenticated operator and fail closed when there is no
> session. Defense in depth now; multi-tenant prerequisite later."

## Last High-Signal Exchanges

- Slice 2 kickoff authorized: branch `refactor/explicit-read-scoping`; author,
  commit, push, open PR; update this HANDOFF. NOT authorized: merge, deploy,
  schema/RLS, production data.
- Slice 2 delivered: `lib/data/repo.ts` reads now filter `.eq("groomer_id", …)`
  and fail closed; +10 tests (814 total). Reported 3 out-of-scope unscoped reads
  + 2 webhook reads as defense-in-depth follow-ups.
- Slice 1 (PR #6) merged: shared helpers + `FormPrimitives` consolidated.

## Recently Shipped (last 14 days)

- PR #7 (open): explicit operator read-scoping in `repo.ts`.
- PR #6 (merged): dedupe shared helpers + `FormPrimitives`.
- PR #5/#4/#3: Sentry plumbing, dependency advisories, action-test slices.
- PR #1: Phase 0 hardening (CI gate, settings auth re-check, payout tests).

## Action Queue (queue, not license)

1. Review/merge PR #7 (operator decision).
2. Follow-up read-scoping slice: scope the reads reported out-of-scope in PR #7
   — `bookingRequests.server.ts`, `smsMessages.server.ts` (list read),
   `audit.server.ts`. (Webhook reads in `app/api/twilio/*` are session-less by
   design; leave as-is.)
3. Phase 2 remaining seams: `SchedulingStrategy`, decompose the big forms.

## Reading List

1. `tidy-tails/ENGINEERING-ROADMAP.md` (Phase 2).
2. PR #7 description (table inventory + behavior-identity argument).
3. `tidy-tails/v2/lib/data/repo.ts` (the scoped read layer).

## Cross-References

- `tidy-tails/START_HERE.md` — entrypoint + reading order.
- `tidy-tails/v2/AGENTS.md` — app product/data/write rules.
- Studio doctrine: `.koya/AGENTS.md` (Continuity Loop), `.koya/VOLATILE.md`
  (doctrine-changes).
