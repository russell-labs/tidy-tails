---
venture: tidy-tails
doc-type: build-rereview
ticket: TT-015
created: 2026-06-11
status: BUILT on feat/tt015-admin-view-as. Flag OFF. Re-review for approval BEFORE enabling. Not deployed.
branch: feat/tt015-admin-view-as
security-sensitive: true
supersedes-gate: "_reports/2026-06-11-tt015-admin-view-as-plan.md §15 'Next gate: build then re-review'"
---

# TT-015 — Admin "view-as" — BUILT, re-review before enable

The locked plan (`_reports/2026-06-11-tt015-admin-view-as-plan.md`) is built on this
branch. **Nothing about the locked decisions changed.** This document is the
"re-review the built plan before anything is enabled" gate. The feature is dark:
`TIDYTAILS_ENABLE_ADMIN_VIEW_AS` is unset, so every entry point is inert and the
build is byte-identical to pre-feature behaviour. This PR does **not** deploy.

## 1. What was built

**Migration** `v2/supabase/migrations/20260611000002_admin_view_as.sql` (gated,
staging-first, structural only — seed is a separate per-env step):
- `platform_admins` (RLS on; SELECT self-only; **no write policy** → no
  self-promotion) and `admin_impersonation_sessions` (= the append-only audit
  log: who / org / when / duration; SELECT self-only; **no write policy** →
  append-only, mutated only via the RPCs).
- Helpers `is_platform_admin()` and `active_impersonated_org_ids()` — SECURITY
  DEFINER, STABLE, `search_path` pinned, mirroring `user_org_ids()` exactly; the
  latter has the inner `is_platform_admin()` double-check.
- RPCs (SECURITY DEFINER, assert `is_platform_admin()`): `admin_start_impersonation`
  (30-min time-box, single active session), `admin_end_impersonation` (idempotent),
  `admin_active_impersonation` (org name resolved), `admin_list_orgs` (picker).
- **Additive OR-term on SELECT policies only**, on the 10 in-scope tables
  (`clients, pets, appointments, booking_requests, day_closeout_overrides,
  automations_log, audit_events, sms_messages, org_settings, daily_income`).
  INSERT/UPDATE/DELETE untouched everywhere. `google_calendar_connections` +
  `client_accounts` excluded.

**App** (all behind the flag):
- `v2/lib/admin/impersonation.server.ts` — `isPlatformAdmin`, `activeImpersonation`,
  `isImpersonating`, `startImpersonation`, `endImpersonation`, `listOrgsForAdmin`.
  Flag-off returns the inert value on the **first line, with no DB call**.
- `v2/lib/writeGate.ts` — `isAdminViewAsEnabled()` (exact `"on"`, default off).
- `v2/lib/data/repo.ts` — new `liveReadScope()` + `effectiveOrgId()` (read/display
  only); loaders thread a `LiveReadScope` instead of a groomer id. `requireOrgId()`
  / `currentOrgId()` kept **pure / impersonation-unaware** (the invariant that
  makes admin writes impossible).
- Read seams pivoted: repo loaders, `bookingRequests.server.ts`, `audit.server.ts`
  (read only), `smsMessages.server.ts` recent-list.
- `v2/app/(app)/layout.tsx` — gate reworked: impersonating → render scoped to the
  org with a banner; else admin-without-membership → `/admin`; else no-org →
  onboarding.
- `v2/app/admin/page.tsx` (outside `(app)`), `v2/components/ImpersonationBanner.tsx`,
  `v2/lib/actions/adminImpersonation.ts` (start/exit).
- Per-action read-only write guards (23 sites, 18 files): `if (await isImpersonating())`
  returns that action's existing gated shape.

**Tests:** `lib/admin/impersonation.server.test.ts` (flag-off inertness incl.
non-exact flag values; active-session mapping; fail-closed on RPC error) and
`lib/data/repoImpersonation.test.ts` (read pivots to org_id; operator path
unchanged; fail-closed). Full suite green (see §5).

## 2. Read-only proof — service-role write audit (the §2 thesis)

RLS only enforces read-only for the anon/authenticated client; every
`createServiceSupabase()` write bypasses RLS. The thesis holds iff no such write
is reachable while impersonating. Enumerated all three call sites:

| Site | Reachable while impersonating? | Disposition |
|---|---|---|
| `smsMessages.server.ts:~150` (delivery-status refresh) | Yes — admin opens inbox | **Suppressed**: `refreshOutboundDeliveryStatuses` early-returns when `activeImpersonation()` is set. (Also naturally inert — scoped to the admin's own `groomer_id`, which owns no rows.) |
| `app/api/twilio/message-status/route.ts` | No — Twilio webhook, no admin session | n/a |
| `app/api/twilio/inbound-sms/route.ts` | No — Twilio webhook, no admin session | n/a |

No service-role write is reachable from an impersonating session. Combined with:
admin org ∉ `user_org_ids()` ⇒ every INSERT/UPDATE/DELETE check fails; the admin
has no membership ⇒ `requireOrgId()` throws on any write; the per-action guard
returns a clean "nothing saved" — the read-only contract holds at three layers.

## 3. Deviations from the literal plan text (none change a locked decision)

1. **`smsMessages.server.ts:150` not pivoted; suppressed instead.** Plan §8 lists
   "30,150" as seams to pivot. Pivoting :150 (a service-role *write*) to org scope
   would write tenant rows — violating the §2 read-only thesis. The thesis wins;
   :150 is suppressed while impersonating. (Pre-agreed in build review.)
2. **Two tables added to scope after first review (Russell, 2026-06-11).** Both
   post-date the locked §7 list; Russell approved adding both to the admin-read
   OR-term (read-only, INSERT/UPDATE/DELETE untouched), so a support view is
   faithful. **In scope (10 tables total now):**
   - **`org_settings`** (scheduling style + economics) — OR-term added;
     `loadOrgSettings()` follows `effectiveOrgId()`, so a `one_to_one` tenant now
     renders correctly (not the batched default) in a support view.
   - **`daily_income`** (TT-014 rented-chair lump-sum) — OR-term added. **App-seam
     caveat:** the daily_income *reader* lives in the TT-014 app layer, which is
     **not on this branch** (this branch forked from main before that shipped). The
     OR-term is correct and harmless here, but when this branch meets the TT-014
     app layer, that reader must adopt `liveReadScope()`/`effectiveOrgId()` — else
     the admin filters by their own empty `groomer_id` and sees no rows despite the
     OR-term. Flagged in the migration and in §4 below.
   Still **excluded** (member-only): `google_calendar_connections` (OAuth tokens),
   `client_accounts` (pet-owner links).
3. **`(app)` layout impersonation render branch.** The plan named the `/admin`
   branch but not the "render-while-impersonating" branch; without it the layout's
   existing no-membership redirect bounces the admin straight back out. Added as
   the layout's first check. (Necessary for the feature to work at all.)
4. **Staging admin seed is a documented per-env step, not in the structural
   migration.** Honors the staging-vs-prod-uid precedent
   (`2026-05-18-ship-2.2b-production-uid.md`) and keeps the migration env-agnostic.
   **A staging admin `auth.users` uid must be captured and seeded before enabling.**
5. **Migration grant fix (caught in re-review):** `active_impersonated_org_ids()`
   is granted to `anon, authenticated, service_role` (not just authenticated),
   mirroring `user_org_ids()` — it appears in `to public` SELECT policies, so anon
   must hold EXECUTE or anon-role SELECTs would error.
6. **Write-guard wording.** Each guard reuses its action's existing gated copy
   ("…not switched on yet. Nothing was saved."), which is accurate-enough
   (nothing is saved) but not impersonation-specific. Minor; refine later if
   desired. Structural read-only does not depend on it.
7. **No React `cache()`** on the impersonation helpers (determinism in tests +
   avoids undefined memo scope). Cost: when the flag is ON, a support page issues
   a few extra RPCs/request; flag-off path is zero-cost (first-line short-circuit).
8. **Single-active-session is procedural** (end-then-insert in
   `admin_start_impersonation`), so a concurrent double-submit could briefly open
   two active sessions — **both the same admin's own**, so zero isolation impact
   (both resolve to that admin's target orgs only). Acceptable for MVP; a partial
   unique index on `(admin_user_id) where ended_at is null` would make it a DB
   invariant if ever wanted.

## 4. BLOCKING gates before flipping the flag (unchanged from plan)

- [ ] **Legal disclosure live in ToS + Privacy** (plan §11) — "authorized support
      access: read-only, logged, time-boxed, may include SMS content." Russell +
      counsel; agents do not edit the drafts. Hard gate on the prod flag.
- [ ] **Capture a staging admin `auth.users` uid and seed `platform_admins`**
      (§3.4) — without it the feature is inert even with the flag on.
- [ ] **Run the §13 DB-level RLS isolation tests on staging** (cannot be unit
      tests): non-admin gets ∅ from `active_impersonated_org_ids()`; admin with an
      active session reads in-scope tables but **cannot** INSERT/UPDATE/DELETE;
      expired/ended/no session reads nothing; excluded tables (calendar,
      client_accounts) never appear in view-as.
- [ ] **Introspect the live SELECT policies, don't trust the 0004 baseline.** The
      migration's `DROP...CREATE` overwrites whatever SELECT policy is live on each
      in-scope table; the member predicate was derived from migration 0004. Before
      relying on it, dump `pg_policies` for the 8 in-scope tables on staging
      *after* applying and confirm: (a) exactly one SELECT policy per table, and
      (b) its predicate is precisely `member OR admin-read` — i.e. no later
      migration (0005/0006/daily_income) had tightened a SELECT predicate that the
      recreate would silently drop (a visibility *widening*). The worst
      name-mismatch case is benign (a redundant OR'd policy, not a dropped member
      term), but verify to keep it clean.
- [ ] **Pivot the `daily_income` reader** when this branch meets the TT-014 app
      layer (rebase/merge): it must use `liveReadScope()`/`effectiveOrgId()`, or the
      admin sees no daily_income despite the OR-term (§3.2). (`org_settings` reader
      already pivoted; both tables are now in the OR-term scope.)
- [ ] Staging rehearsal of the full flow, then gated prod; flag stays off until a
      real support session.

## 5. Verification status (this build, flag off)

- `npm test` — **1081 passed** (79 files), incl. the two new suites.
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run build` — succeeds; `/admin` registered (dynamic).

All green at flag-off. The DB-layer guarantees (§4 staging tests) are the part a
green app build cannot prove and must be exercised on staging before enable.
