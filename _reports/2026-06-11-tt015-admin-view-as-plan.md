---
venture: tidy-tails
doc-type: plan
ticket: TT-015
created: 2026-06-11
status: PLAN APPROVED (decisions locked 2026-06-11). NO code/migrations yet — build, then re-review the built plan before enabling.
branch: feat/tt015-admin-view-as
security-sensitive: true
---

# TT-015 — Admin "view-as" / support impersonation — PLAN

> **Plan-first, security-sensitive.** This deliberately crosses the tenant
> isolation boundary to give the platform owner a controlled, audited support
> view of a tenant org. It is **not** an RLS hole. This document is for review
> only — no code, migration, or RLS change lands until Cowork + Russell approve.
> PR off `main`; do not deploy.

## 1. Problem & goal

Today there is no way for the platform owner to see a tenant's app for support
without that tenant's login. We need a path that lets **only the platform owner**
view a tenant org's account, **read-only**, **time-boxed**, **explicitly
entered/exited**, and **fully audit-logged** — disclosed in the ToS/Privacy
drafts.

This is the first platform-admin capability in v2; no super-admin concept exists
yet (confirmed: all current identities are org owners via
`organization_memberships`).

## 2. Core safety thesis

**Impersonation is read-only by construction at the database layer — not by app
convention.** We grant the admin's session an extra *read* visibility term on
SELECT policies only. INSERT/UPDATE/DELETE policies stay member-only and
untouched, so the admin **physically cannot write** tenant rows even if app-layer
guards were bypassed. And because the extra term resolves to the empty set for
any non-admin, **tenant isolation for normal operators is mathematically
unchanged** (`A OR ∅ = A`).

Three independent layers must all agree before a row is visible to an admin:
1. caller's `auth.uid()` is in `platform_admins`,
2. an **active, unexpired** impersonation session exists for that admin → org,
3. the row's `org_id` matches that session's target.

## 3. Architecture map (current state — what we build on)

- **Auth:** Supabase Auth via `@supabase/ssr`; `getCurrentUser()` server-validates
  every call (`lib/supabase/server.ts`). Session refreshed in `lib/supabase/proxy.ts`.
- **Org context:** `currentOrgId()` reads the caller's `organization_memberships`
  row; `requireOrgId()` fails closed for writes (`lib/data/repo.ts:78-106`).
- **RLS:** per-org predicate `org_id in (select public.user_org_ids())` on 10
  tenant tables; `user_org_ids()` is SECURITY DEFINER, STABLE, search_path-pinned
  (`supabase/migrations/20260606000004_per_org_rls.sql`).
- **Reads are double-scoped:** app code filters `.eq("groomer_id", auth.uid())`
  on top of RLS — this is the seam impersonation must pivot (see §6).
- **Write gating:** private server-only env flags, exact string `"on"`, default
  off (`lib/writeGate.ts`).
- **Staging vs prod:** the org cutover is **done** — prod is now org-aware
  (`organizations`/`org_id`/per-org RLS applied 2026-06-09). So this feature is
  **not** blocked on schema; it follows the normal **staging-first, then gated
  prod** rollout (same shape as TT-014): rehearse on staging, then apply to prod
  behind the feature flag with the prod admin uid seeded at apply time. This PR
  still does **not** deploy (per task) — it lands the gated migration + app code
  off `main` for review.

## 4. Data model (new — gated migration, staging-first)

### `platform_admins`
```
user_id    uuid  primary key  references auth.users(id)
created_at timestamptz default now()
```
- RLS **enabled**. SELECT: `using (user_id = auth.uid())` (an admin may confirm
  their own status; nothing else). **No INSERT/UPDATE/DELETE policy at all** →
  with RLS enabled, all writes are denied for `anon`/`authenticated`. The owner
  uid is seeded by the migration itself (service-role/SQL, bypasses RLS).
  **No tenant can self-promote.**
- Seed uid **differs staging vs prod** — follow the precedent in
  `_reports/2026-05-18-ship-2.2b-production-uid.md` (seed staging now; prod uid
  captured at prod cutover time, not hard-coded here).

### `admin_impersonation_sessions`  ← this **is** the append-only audit log
```
id             uuid primary key default gen_random_uuid()
admin_user_id  uuid not null references auth.users(id)   -- WHO
target_org_id  uuid not null references organizations(id) -- WHICH ORG
reason         text                                       -- support context
started_at     timestamptz not null default now()         -- WHEN
expires_at     timestamptz not null                       -- time-box
ended_at       timestamptz                                -- explicit exit / DURATION
```
- Captures exactly the required audit fields: **who, which org, when, duration.**
- RLS **enabled**. SELECT: `using (admin_user_id = auth.uid())`. **No public
  INSERT/UPDATE/DELETE policy** — rows are created/ended only via the SECURITY
  DEFINER RPCs in §5. Absence of UPDATE/DELETE = **append-only**, same immutability
  pattern as `audit_events`.

## 5. Mechanism — SECURITY DEFINER helpers & RPCs

All SECURITY DEFINER, STABLE where applicable, `search_path` pinned to `public`,
execute granted to `authenticated`.

- `is_platform_admin() → boolean` — `exists(select 1 from platform_admins where user_id = auth.uid())`.
- `active_impersonated_org_ids() → setof uuid` — returns `target_org_id` for
  sessions where `admin_user_id = auth.uid() and ended_at is null and expires_at > now()`,
  **and** `is_platform_admin()` is true (inner double-check — makes a stray
  session row harmless). This is the read-visibility seam consumed by RLS.
- `admin_start_impersonation(p_org uuid, p_reason text) → uuid` — asserts
  `is_platform_admin()` (raises otherwise); ends any existing active session for
  this admin (enforces **single active session**); inserts a new session with
  `expires_at = now() + interval '30 minutes'`; returns session id.
- `admin_end_impersonation()` — sets `ended_at = now()` on the admin's active
  session(s). Idempotent.

Time-box (30 min, tunable at approval) + single-active-session + explicit end =
the "time-boxed, explicit enter/exit" requirement.

## 6. RLS change (the crux — SELECT only)

On each tenant table **in the impersonation read scope** (§7), replace the SELECT
policy predicate with:
```sql
using (
  org_id in (select public.user_org_ids())            -- member (unchanged)
  or org_id in (select public.active_impersonated_org_ids())  -- admin read-only
)
```
**INSERT / UPDATE / DELETE policies are NOT touched** — they remain
`org_id in (select public.user_org_ids())` (member-only). The admin is never a
member of the target org, so every write check fails for them. `audit_events`
INSERT additionally keeps `actor_id = auth.uid()`.

This is the entire RLS surface area of the feature: additive OR-terms on SELECT
policies, nothing subtractive.

## 7. Table scope — DECIDED (2026-06-11)

"View the account for support" does not require credential material. Final
admin-read scope:

| Table | Admin read? | Note |
|---|---|---|
| clients, pets, appointments, booking_requests | ✅ | core account view |
| day_closeout_overrides, automations_log | ✅ | operational history |
| audit_events | ✅ | support needs the activity trail |
| sms_messages | ✅ **(sensitive)** | message **bodies are PII** but often the exact support case. **In scope, read-only.** Marked **sensitive** in the audit trail and called out explicitly in the ToS/Privacy disclosure (§11). |
| **google_calendar_connections** | ❌ **excluded** | holds **OAuth refresh tokens** — never exposed to a support session. Connection *status* (if ever needed) is surfaced without token material. |
| **client_accounts** | ❌ **excluded** | pet-owner account links; out of support scope. |

The two excluded tables simply do **not** get the admin-read OR-term in §6 — their
SELECT policies stay member-only. Because `sms_messages` is in scope and sensitive,
the impersonation-session record and the legal disclosure both note that support
view-as can include text-message content.

## 8. App layer

Keep the security-load-bearing seams **pure**; add impersonation as a *separate*
read/display concept (advisor point 1).

- **`currentOrgId()` / `requireOrgId()` unchanged** — still member-only. Their
  null-fails-closed-on-write property is a load-bearing invariant; do not make
  them impersonation-aware.
- **New `lib/admin/impersonation.server.ts`:** `isPlatformAdmin()`,
  `requirePlatformAdmin()`, `activeImpersonation()` (reads the session →
  `{ sessionId, orgId, orgName, expiresAt }` via a SECURITY DEFINER context fn so
  org name resolves without touching `organizations` RLS), `startImpersonation()`,
  `endImpersonation()` (call the RPCs).
- **New `effectiveOrgId()`** (read/display only): impersonated org when a session
  is active, else `currentOrgId()`. Read seams pivot from `groomer_id = auth.uid()`
  to `org_id = effectiveOrgId()` **only while impersonating**.
- **Read seams to pivot** (full footprint — advisor point 2; each is fail-closed,
  wrong scope → empty, never a leak):
  - `lib/data/repo.ts` (clients/pets/appointments/day_closeout_overrides)
  - `lib/bookingRequests.server.ts:23`
  - `lib/smsMessages.server.ts:30,150` (if sms in scope)
  - `lib/audit.server.ts:57` (`loadRecentAuditEvents`)
  - `lib/actions/inbox.ts` read paths; `lib/actions/dayCapacity.ts`
  - `lib/googleCalendar.server.ts:326` — **not** pivoted (table excluded).
- **Write guard (defense in depth):** a server-side check in every write action —
  if `activeImpersonation()` is present, hard-return a blocked/gated result and
  record nothing. RLS already blocks the write; this makes the read-only contract
  explicit and user-legible.
- **Routing/`/admin`:** a platform admin has no org membership, so today the
  `(app)` layout would bounce them to onboarding. Add a branch: platform admin →
  `/admin`. `/admin` route group guarded by `requirePlatformAdmin()`; lists orgs,
  "View as" → `startImpersonation` → redirect into the app.
- **Banner:** persistent top banner in the `(app)` layout whenever
  `activeImpersonation()` is set: **"Viewing as <org> — admin · read-only ·
  expires in N min · Exit."** Exit posts to `endImpersonation`.
- **Feature flag:** entire feature behind private server-only
  `TIDYTAILS_ENABLE_ADMIN_VIEW_AS` (exact `"on"`, default off), matching
  `lib/writeGate.ts`. Flag off → `/admin`, RPCs' app entry points, and banner are
  all inert.

## 9. Threat model / isolation analysis

- **Tenant cannot invoke:** `platform_admins` has no public write policy (RLS on);
  `admin_start_impersonation` asserts `is_platform_admin()`; `/admin` guarded.
- **Tenant cannot be impersonated by another tenant:** `active_impersonated_org_ids()`
  returns rows only when the caller is a platform admin with an active session.
- **No membership-escalation path (advisor point 4):** an admin **cannot** grant
  themselves a real membership in a tenant org — `membership_self_owner_insert`
  requires `org_created_by_me()` and the admin did not create that org. This is
  precisely why we add a SELECT-only OR-term rather than minting a temp
  membership (which would also confer writes).
- **Read-only proven:** admin org ∉ `user_org_ids()` ⇒ all INSERT `with check` /
  UPDATE+DELETE `using` fail. App write guard is the redundant second layer.
- **Blast radius of a stolen admin session:** read-only, time-boxed (≤30 min),
  single active session, explicitly endable, fully logged. Inner `is_platform_admin()`
  check means a leftover session row alone grants nothing.
- **Trust-critical new code:** `active_impersonated_org_ids()` — SECURITY DEFINER,
  STABLE, pinned search_path; only **widens** SELECT, never narrows. Reviewed as
  carefully as `user_org_ids()`.
- **No service-role anywhere in this path** — no RLS-bypass surface introduced.

## 10. Rejected alternatives (advisor point 5)

- **Service-role reads scoped in app code** — rejected: service role bypasses all
  RLS; a single scoping bug = full cross-tenant breach. Our design keeps RLS as
  the enforcing boundary.
- **Grant the admin a temporary real membership** — rejected: confers write
  access too (member predicate covers writes), and is blocked anyway by the
  `org_created_by_me()` check in §9. SELECT-only OR-term is strictly safer.
- **Edit `user_org_ids()` to include impersonated orgs** — rejected: that helper
  feeds write checks too; editing it would grant writes and mutate the most
  safety-critical function in the schema.

## 11. Legal / disclosure — BLOCKING SHIP GATE (2026-06-11)

The Privacy draft (`tidy-tails/2026-06-10-PRIVACY-POLICY-draft.md`) §3 says
"provide support" and §8 lists access controls, but neither discloses that
**authorized platform personnel may access an Operator's account to provide
support.** A clause must be added to **both** Privacy (§3/§8) and ToS stating that
access is **read-only, logged, time-boxed, limited to authorized personnel, and
may include SMS/text-message content** (§7).

**Ownership:** Russell + counsel own the wording. **The clause must be live in
ToS/Privacy BEFORE view-as ships** — this is a hard gate on flipping the prod
flag, not a parallel nicety. **Agents do not edit the legal drafts** — this is
flagged for the lawyer. Implementation can proceed in parallel; the flag stays
off until the disclosure lands.

## 12. Tenant transparency — DECIDED (2026-06-11)

**MVP: not operator-visible.** The session log is admin-SELECT-only; the operator
does not see they were viewed in-app. This is acceptable because it is
**ToS/Privacy-disclosed** (§11). An **operator-facing access log** ("your account
was accessed by support on <date>") is explicitly **roadmap/later**, not this
ship.

## 13. Test coverage (to write during implementation)

- RLS: a non-admin gets empty from `active_impersonated_org_ids()`; member reads
  unchanged with feature present (isolation regression).
- RLS: admin with active session reads target org's in-scope tables; **cannot**
  INSERT/UPDATE/DELETE any tenant row (read-only proof).
- RLS: admin with **expired** / **ended** / **no** session reads nothing.
- RPC: non-admin calling `admin_start_impersonation` is rejected; single-active-
  session invariant holds; `expires_at` honored.
- App: write guard blocks every mutation while impersonating; banner renders;
  exit clears scope; excluded tables (calendar) never appear in view-as.
- Seed: staging uid only; no prod uid committed.

## 14. Scope / sequencing

- **Migration** (gated, staging-first): tables, RLS SELECT edits, helpers, RPCs.
- **App**: admin route, impersonation lib, `effectiveOrgId()` read pivots, write
  guard, banner — all behind `TIDYTAILS_ENABLE_ADMIN_VIEW_AS`.
- **Legal**: handed to Cowork/counsel (§11).
- PR off `main`. **Do not deploy.** Rollout is staging-first then gated prod
  (prod is already org-aware as of 2026-06-09); the flag stays off until Russell
  flips it for a real support session.

## 15. Decisions — LOCKED (2026-06-11, Russell)

1. **Table scope:** exclude `google_calendar_connections` (OAuth tokens) and
   `client_accounts`; include `sms_messages` read-only, marked **sensitive** in
   the audit trail + ToS (§7).
2. **Time-box:** 30 min (§5).
3. **Tenant transparency:** MVP invisible, ToS-disclosed; operator-facing access
   log = roadmap/later (§12).
4. **Legal:** Russell + counsel own the "authorized support access" wording;
   **must be live in ToS/Privacy before view-as ships** (blocking gate on the prod
   flag). Agents do not edit the drafts (§11).
5. **Rollout:** staging-first rehearsal → gated prod (prod is org-aware); flag
   stays off until a real support session (§3).

**Next gate:** build the migration + app code on this branch, then **re-review the
built plan** before anything is enabled. No code/migration has been written yet.
