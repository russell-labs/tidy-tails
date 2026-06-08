-- WS3 Slice B — self-serve org bootstrap (ADDITIVE ONLY). Staging-first.
--
-- Lets a brand-new, org-less authenticated user create exactly ONE organization,
-- their OWN owner membership, and a seeded settings row — the front door's
-- "from confirmed email to usable account" step. Adds NO change to any existing
-- tenant-table policy, so the cross-tenant isolation gate is unaffected:
-- `organizations` / `organization_memberships` are not in that gate's 10-table
-- structural list, and `org_settings` is new and deliberately not added to it.
--
-- STAGING-FIRST: applied to staging only, rehearsed with a backup taken first.
-- PRECONDITION for the partial unique index (e): no user may already hold more
-- than one role='owner' membership. Verify on staging before applying:
--   select user_id, count(*) from public.organization_memberships
--   where role = 'owner' group by 1 having count(*) > 1;   -- must return zero rows
-- PROD IS NOT TOUCHED in this workstream.

-- ---------------------------------------------------------------------------
-- (a) Org provenance. Who created the org — the predicate the bootstrap INSERT
--     policies key on. Nullable with NO default: `add column ... default
--     auth.uid()` would force a table rewrite evaluating auth.uid() (null in
--     migration context) for every existing row. The app sets created_by
--     explicitly on insert; existing rows stay null and are unaffected.
-- ---------------------------------------------------------------------------
alter table public.organizations add column created_by uuid;

-- ---------------------------------------------------------------------------
-- (b) "Exactly one org per user" as a DATABASE invariant. The app's
--     currentOrgId() pre-check is a read-then-write guard that a double-submit
--     (double-click / retried POST) races past — both calls see no membership
--     and both create an org. The composite unique (org_id, user_id) does NOT
--     catch that (different orgs). This partial unique index does: a user can
--     hold at most one role='owner' membership, full stop. Non-owner roles
--     (future staff) are unconstrained.
-- ---------------------------------------------------------------------------
create unique index org_one_owner_per_user
  on public.organization_memberships (user_id)
  where role = 'owner';

-- ---------------------------------------------------------------------------
-- (c) Bootstrap helper. SECURITY DEFINER so it bypasses RLS on `organizations`:
--     at membership-insert time the creator has NO membership yet, so the
--     org_member_select policy would hide the org row they just created (the
--     bootstrap chicken-and-egg). This lets the membership INSERT policy verify
--     "you created this org" without that visibility gap. STABLE; pinned
--     search_path; granted only to authenticated.
-- ---------------------------------------------------------------------------
create or replace function public.org_created_by_me(p_org uuid)
  returns boolean
  language sql
  security definer
  set search_path to 'public'
  stable
as $$
  select exists (
    select 1 from public.organizations
    where id = p_org and created_by = auth.uid()
  );
$$;

grant execute on function public.org_created_by_me(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- (d) Bootstrap INSERT policies — the tight surface the sibling isolation test
--     proves. These are the ONLY way an org-less user gains an org:
--       * organizations: you may insert an org only stamped as yourself.
--       * memberships:    you may insert only YOUR OWN, as 'owner', and ONLY
--                         into an org YOU created — never into someone else's.
--     No new SELECT/UPDATE/DELETE policies: the existing org_member_select /
--     membership_self_select still scope reads; there is no self-serve update or
--     delete of orgs/memberships in WS3.
-- ---------------------------------------------------------------------------
create policy "org_self_create" on public.organizations
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "membership_self_owner_insert" on public.organization_memberships
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and public.org_created_by_me(org_id)
  );

-- ---------------------------------------------------------------------------
-- (e) Per-org settings store. WS3 CAPTURES and STORES the new business's
--     scheduling style + generic locations + economics here; WS4 consumes it.
--     It is a WRITE-ONLY seam in WS3 — onboarding writes it, nothing reads it
--     yet, and the existing cookie-based operator settings are untouched.
--
--     Standard per-org tenant pattern: scoped by user_org_ids(), which resolves
--     the moment the owner membership in (d) exists — so the settings INSERT in
--     the onboarding action needs no special bootstrap policy, just membership.
--     scheduling_style is a first-class column (WS4 queries by it); locations /
--     economics live in the generic `settings` jsonb.
-- ---------------------------------------------------------------------------
create table public.org_settings (
  org_id uuid not null,
  scheduling_style text not null default 'batched',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint org_settings_pkey primary key (org_id),
  constraint org_settings_org_id_fkey foreign key (org_id)
    references public.organizations(id) on delete cascade,
  constraint org_settings_scheduling_style_chk
    check (scheduling_style in ('batched', 'one_to_one'))
);

alter table public.org_settings enable row level security;

create policy "org_settings_select" on public.org_settings
  for select to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "org_settings_insert" on public.org_settings
  for insert to authenticated
  with check (org_id in (select public.user_org_ids()));

create policy "org_settings_update" on public.org_settings
  for update to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));
