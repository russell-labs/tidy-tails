---
venture: tidy-tails
doc-type: cc-plan
ticket: WS3 — Slice B
created: 2026-06-08
owner: Russell
reviewer: Cowork
branch: feat/ws3-front-door
environment: staging only (no production deploy)
status: PLAN — awaiting review; do not execute until PR #18 (Slice A) merges to main
depends-on: 2026-06-07-codex-kickoff-ws3-front-door.md, 2026-06-07-ws3-slice-a-plan.md
---

# WS3 Slice B — onboarding wizard + org creation (implementation plan)

## Where this sits

Slice A (PR #18, OPEN, green) retired the operator allowlist, added a
membership-based gate (`postAuthDestination` in `lib/authRouting.ts`), added
signUp / requestPasswordReset / updatePassword, and shipped a **placeholder**
onboarding page (`app/(onboarding)/onboarding/page.tsx`). A confirmed user with
**no membership** is already routed there by the `(app)` layout.

Slice B replaces that placeholder with a real wizard, and adds the one server
action + one additive RLS migration that lets an org-less user create exactly
one organization, their own owner membership, and seeded per-org settings — so
`currentOrgId()` resolves and they can use the app. **Cross-tenant isolation
gate stays green.** Staging only; the migration is rehearsed on staging with a
backup before any promotion; nothing touches production.

**Execution order:** wait for PR #18 to merge → `git checkout main && git pull`
→ continue on `feat/ws3-front-door` → build Slice B → open as its own PR for
Cowork review → Russell approves before merge.

---

## Design decisions (locked after advisor review)

1. **Per-org settings live in a dedicated `org_settings` table, not JSONB on
   `organizations`.** Its INSERT rides the *standard* `user_org_ids()` tenant
   policy once the membership exists, so only `organizations` and
   `organization_memberships` need new bootstrap INSERT policies. Keeps
   `organizations` as pure identity.

2. **Direct inserts via the session Supabase client (the WS2.3 write pattern),
   NOT a SECURITY DEFINER RPC.** The spec requires real, tightly-scoped INSERT
   policies that the isolation test proves; an RPC would bypass them and make
   them app-dead-code. The app is the real policy path.

3. **A partial unique index is the correctness guard, not the app guard.**
   `currentOrgId()` is a read-then-write check and cannot stop a double-submit
   (double-click / retried POST) — two concurrent calls both see null and both
   create an org+membership (different orgs, so `unique(org_id,user_id)` does not
   catch it). A partial unique index on `organization_memberships(user_id) where
   role='owner'` makes "exactly one owner membership per user" a database
   invariant. An RPC would have the same race without this index, which is the
   tell that the index — not the RPC — is the right tool.

4. **`org_settings` is a write-only seam in Slice B.** Onboarding writes it;
   nothing reads it yet. **Do NOT rewire the ~10 cookie-based operator-settings
   read sites** (`lib/operatorSettings.server.ts` cookie `tt_operator_settings_v1`;
   read in 8 Server Components + `appointments.ts` / `editAppointment.ts` /
   `settings.ts` / `googleCalendar.server.ts`). That is WS4. WS3 *captures and
   stores*; WS4 *consumes*. (This is also why Sam, onboarded via the WS2.4
   cutover rather than the wizard, has no `org_settings` row and is unaffected —
   her app still reads the cookie.)

---

## 1. Onboarding wizard — steps & fields

New client component `components/OnboardingWizard.tsx`, rendered by the
`(onboarding)/onboarding/page.tsx` route (replacing the placeholder). Multi-step,
client-side step state, single final submit to the server action. Style mirrors
`SignupForm.tsx` / `LoginForm.tsx` (same Tailwind tokens, error surface).

| Step | Fields | Notes |
|------|--------|-------|
| 1. Business | `businessName` (required, trimmed, 1–120 chars) | → `organizations.name` |
| 2. Scheduling style | `schedulingStyle` ∈ {`batched`, `one_to_one`} radio | Batched = Sam (load-based); one_to_one = Cheryl (duration blocks). **WS3 records the choice only — no 1:1 engine (WS4).** → `org_settings.scheduling_style` |
| 3. Locations | repeatable rows: `name` (required), `address` (required). 1..N, default 1, "add location" / remove. | **Generic** — no hardcoded `gina`/`annette`. → `org_settings.settings.locations[]` |
| 4. Economics (per location) | per location: `payoutType` ∈ {`percent`,`daily_rate`} + value. `percent` → `salonKeepsPercent` (0–100); `daily_rate` → `dailyRate` (≥0). | Reuses the existing `LocationPayoutType` shape from `lib/operatorSettings.ts`. → folded into each `locations[]` entry |
| 5. Review & create | read-only summary + "Create my business" submit | calls `createOrganization` server action |

- Client-side validation mirrors server validation (server is authoritative).
- A new pure module `lib/onboarding.ts` holds the typed input shape + a
  `normalizeOnboardingInput()` / `buildOrgSettings()` mapper (parallel to
  `operatorSettings.ts` normalizers) so capture → settings-shape mapping is
  unit-testable without a DB. The generic `locations[]` shape:
  `{ name: string; address: string; payoutType: 'percent'|'daily_rate';
  salonKeepsPercent: number; dailyRate: number|null }`.

---

## 2. The server action — `lib/actions/onboarding.ts`

One `"use server"` action `createOrganization(input)`. Follows the WS2.3 write
pattern (`sendCustomerSms.ts`): resolve session, use `createServerSupabase()`
(session client, **not** service role), validate server-side.

```
createOrganization(input):
  user = await getCurrentUser()
  if (!user) redirect('/login')                       // unauthenticated
  if (await currentOrgId()) redirect('/')             // idempotent: already onboarded → refuse 2nd org
  parsed = normalizeOnboardingInput(input)            // server-authoritative validation
  if (!parsed.ok) return { status: 'error', errors }  // re-render wizard with messages

  supabase = await createServerSupabase()
  orgId = crypto.randomUUID()                          // app-generated; do NOT rely on INSERT..RETURNING
                                                       // (SELECT policy hides the row pre-membership)
  // 1. org identity
  { error } = supabase.from('organizations')
      .insert({ id: orgId, name: parsed.businessName, created_by: user.id })
  if (error) return { status: 'error', ... }
  // 2. own owner membership  (partial unique index makes a concurrent 2nd attempt fail here)
  { error } = supabase.from('organization_memberships')
      .insert({ org_id: orgId, user_id: user.id, role: 'owner' })
  if (error) return { status: 'error', ... }           // see orphan note below
  // 3. seeded per-org settings (now user_org_ids() resolves → standard tenant policy)
  { error } = supabase.from('org_settings')
      .insert({ org_id: orgId, scheduling_style: parsed.schedulingStyle,
                settings: { locations: parsed.locations } })
  if (error) return { status: 'error', ... }
  revalidatePath('/', 'layout')
  redirect('/')                                        // usable first screen (empty-state = Slice C)
```

**Idempotency / "exactly one org":**
- The upfront `currentOrgId()` guard makes re-submission after success a no-op
  redirect, and refuses a second org for an already-onboarded user.
- The **partial unique index** (§3) is the race-safe backstop: a double-submit
  that slips past the guard fails the second membership insert at the DB. The
  user still ends with exactly one owner membership.

**Orphan note (known, harmless):** if step 1 succeeds but step 2 fails (rare DB
error), the org row has no membership → invisible to everyone via
`org_member_select`, no data attached. Retry creates a fresh org+membership; the
unique index guarantees one owner membership. We accept the invisible orphan
rather than add an org DELETE policy or a definer RPC. (If clutter ever matters,
a later janitor or RPC can reclaim member-less orgs — explicitly out of scope.)

---

## 3. Migration `v2/supabase/migrations/20260606000005_self_serve_org_bootstrap.sql`

Additive only. Adds the self-serve bootstrap surface. **Touches none of the 10
tenant tables' existing policies**, so the isolation gate's structural check
(which scans those 10 for `groomer_id` / `user_org_ids`) is unaffected.

```sql
-- WS3 Slice B — self-serve org bootstrap (ADDITIVE ONLY). Staging-first.
-- Lets a brand-new, org-less authenticated user create exactly one organization,
-- their own owner membership, and seeded settings — without weakening per-org
-- isolation. Adds NO change to any existing tenant-table policy.

-- (a) org provenance: who created the org. Nullable, no default (avoid a
--     table rewrite evaluating auth.uid() per existing row); the app sets it.
alter table public.organizations add column created_by uuid;

-- (b) one owner membership per user — the race-safe "exactly one org" invariant.
--     Catches concurrent double-submits that the app's read-then-write guard
--     cannot. PRECONDITION: existing data must already satisfy this (see rehearsal).
create unique index org_one_owner_per_user
  on public.organization_memberships (user_id)
  where role = 'owner';

-- (c) SECURITY DEFINER helper: bypasses org RLS so the creator can be validated
--     before they have a membership (org_member_select would otherwise hide the
--     row they just inserted — the bootstrap chicken-and-egg).
create or replace function public.org_created_by_me(p_org uuid)
  returns boolean language sql security definer set search_path to 'public' stable
as $$ select exists (
  select 1 from public.organizations where id = p_org and created_by = auth.uid()
); $$;
grant execute on function public.org_created_by_me(uuid) to authenticated;

-- (d) bootstrap INSERT policies (the tight surface the isolation test proves).
create policy "org_self_create" on public.organizations
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "membership_self_owner_insert" on public.organization_memberships
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and public.org_created_by_me(org_id)   -- only into an org YOU created
  );

-- (e) per-org settings store. Standard tenant pattern: scoped by user_org_ids(),
--     which resolves the moment the owner membership above exists.
create table public.org_settings (
  org_id uuid not null,
  scheduling_style text not null default 'batched',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint org_settings_pkey primary key (org_id),
  constraint org_settings_org_id_fkey foreign key (org_id)
    references public.organizations(id) on delete cascade,
  constraint org_settings_scheduling_style_chk
    check (scheduling_style in ('batched','one_to_one'))
);
alter table public.org_settings enable row level security;
create policy "org_settings_select" on public.org_settings
  for select to authenticated using (org_id in (select public.user_org_ids()));
create policy "org_settings_insert" on public.org_settings
  for insert to authenticated with check (org_id in (select public.user_org_ids()));
create policy "org_settings_update" on public.org_settings
  for update to authenticated using (org_id in (select public.user_org_ids()))
                                 with check (org_id in (select public.user_org_ids()));
```

**Why isolation stays green:** `organizations` and `organization_memberships`
are not in the structural check's 10-table list; `org_settings` is new and is
**deliberately not added** to `cross_tenant_isolation.sql` (that file also runs
in the cutover-rehearsal job, where this migration is not applied — see §6).
The behavioral part touches only clients/pets/appointments. So
`cross_tenant_isolation.sql` passes unchanged in both CI jobs.

---

## 4. Tests

### Unit (vitest)
- `lib/onboarding.test.ts` — `normalizeOnboardingInput` / `buildOrgSettings`:
  generic location capture (name+address, N locations) maps correctly into the
  settings shape; payout `percent` vs `daily_rate` resolves the right field;
  rejects missing business name / empty locations; clamps ranges.
- `lib/actions/onboarding.test.ts` (mock `createServerSupabase`, `getCurrentUser`,
  `currentOrgId`, `redirect` — mirroring `authSettingsActions.test.ts`):
  - happy path inserts **one** `organizations` row, **one** owner
    `organization_memberships` row, and **one** `org_settings` row, with
    app-generated `id` and `created_by = user.id`;
  - **idempotent / refuses a second org**: when `currentOrgId()` resolves,
    performs no inserts and redirects to `/`;
  - unauthenticated → redirects to `/login`, no inserts;
  - membership insert error surfaces an error and does not attempt the settings
    insert.
- Membership-gate unit coverage already exists from Slice A
  (`authRouting.test.ts`); extend only if the wizard adds a new branch.

### SQL / isolation — sibling file, wired ONLY into the `isolation` CI job
New `v2/supabase/tests/self_serve_bootstrap_isolation.sql`, added as a step in
`ci.yml`'s `isolation` job **after** `cross_tenant_isolation.sql` (that job
applies all migrations incl. 0005). **Never** added to the `cutover-rehearsal`
job and **never** merged into `cross_tenant_isolation.sql`. Runs in a rolled-back
transaction, fails loud. Proves, as `set role authenticated` with a synthetic
org-less user:
- a user CAN create exactly one org (`created_by = self`), then their own
  `role='owner'` membership, then an `org_settings` row;
- the user CANNOT insert an owner membership into **another existing org**
  (org #1/#2 from `seed.sql`) — `org_created_by_me` is false → blocked;
- the user CANNOT insert a membership with `user_id <> auth.uid()` — blocked;
- a user **with an existing owner membership** attempting a second org+owner
  membership has the membership insert rejected by `org_one_owner_per_user`
  (the index the partial-unique guard creates);
- the freshly self-created org is fully isolated: its `org_settings` are
  invisible to org #1/#2 and vice-versa.

### E2E (Playwright, `e2e/`)
New `e2e/onboarding.spec.ts` alongside `sam-workflows.spec.ts`, using the
existing `TIDYTAILS_E2E_AUTH_BYPASS=on` seam (`lib/e2eAuth.ts`).
**Idempotency wrinkle to handle:** `e2eAuth.ts` returns a **fixed** user UUID,
so the first run creates that user's org and subsequent runs find them already
onboarded (wizard won't trigger). Plan handles it by **asserting the
already-onboarded redirect on a repeat visit** (visit `/onboarding` → expect
redirect to `/`) AND gating the create-path assertion on a clean DB, rather than
assuming a fresh user every run. (Per-run org cleanup is the alternative; we
prefer the redirect assertion to avoid staging mutation in CI.) Decide finally
at implementation; flagged here so review can weigh in.

---

## 5. Replace the Slice A placeholder

`app/(onboarding)/onboarding/page.tsx` keeps its server-side guard (live mode +
`currentOrgId()` → redirect `/`) but renders `<OnboardingWizard />` instead of
the placeholder copy. No change to the `(app)` layout redirect or
`authRouting.ts` — the routing seam from Slice A is reused as-is.

---

## 6. Slice A review cleanups (fold into this PR)

- `v2/.env.local.example:24` — remove the stale
  `TIDYTAILS_ALLOWED_EMAILS=sammclennan143@gmail.com` line (allowlist retired).
- `v2/README.md:32` — remove/replace the `lib/operatorAccess.ts` operator-allowlist
  sentence; describe the membership-based gate instead.
  (Grep confirms these are the only two remaining `operatorAccess` /
  `TIDYTAILS_ALLOWED_EMAILS` references in the repo.)

---

## Staging rehearsal & guardrails (DB change)

- **Before applying 0005 to staging, take/confirm a backup** (PITR not enabled;
  `venture-ops/dump_supabase.py`). This is a DB/RLS change.
- **The partial unique index will fail to create if existing data violates it.**
  Pre-flight on staging: confirm no `user_id` already has >1 `role='owner'`
  membership (`select user_id, count(*) from organization_memberships where
  role='owner' group by 1 having count(*) > 1;` must return zero rows). Check
  Sam's cutover membership and `seed.sql`'s two synthetic users (each ≤1 owner),
  and any orgs left over from earlier WS3 testing on staging. In the `isolation`
  CI job this is safe by construction (migrations hit an empty DB before
  `seed.sql`), so the only real risk is staging's pre-existing data.
- **HARD STOP-GATE (addendum 2026-06-08) — two pre-checks must both pass before
  0005 touches staging:**
  1. the backup is taken and **confirmed**, and
  2. the precondition query returns **zero** rows (no user with >1 owner
     membership) and there are **no stray leftover WS3 test orgs/memberships**.

  If **either** check fails — backup unconfirmed, OR the query returns any row,
  OR stray WS3 test data is present — **STOP and report back. Do NOT clean up or
  mutate staging data myself.** Apply 0005 to staging **only when both pre-checks
  pass cleanly**. (Cleanup of leftover staging test data, if needed, is Russell's
  call, not an autonomous step.)
- **Do not apply anything to production.** Sam's production experience is
  unchanged. Production promotion is a separate gated decision after WS2.4.
- **Auth dashboard config is unchanged for Slice B** (Slice A already flagged the
  staging Site URL / redirect allowlist / email templates as a manual step).
- Open the PR for **Cowork gate-review**; **Russell approves** before merge.
  Never enter Russell's or Sam's credentials.

## CI gates this PR must pass before review
typecheck · lint · unit (vitest) · cross-tenant isolation gate (unchanged, green)
· **new** self-serve bootstrap isolation step in the `isolation` job · prod-cutover
rehearsal (unchanged, green — 0005 is not applied there).
