-- ============================================================================
-- WS2.4 — PRODUCTION CUTOVER: baseline → fully multi-tenant, in ONE atomic
-- transaction. Takes a Tidy Tails production database that is on its ORIGINAL
-- baseline (no sms_consent, no org tables, no org_id columns, per-USER RLS) all
-- the way to per-ORG RLS with every existing row stamped with Sam's org.
--
-- THIS FILE IS DELIBERATELY NOT UNDER v2/supabase/migrations/. The CI isolation
-- gate applies migrations/*.sql in order; this cutover assumes the BASELINE
-- starting state and would mis-sequence / fail-loud there. It is applied exactly
-- once, by hand, against production (see the runbook), and against the throwaway
-- rehearsal database in CI. Never against staging (staging already took the
-- staging-first 0002/0003/0004 path).
--
-- PROPERTIES
--   * ATOMIC      — wrapped in its own BEGIN/COMMIT. Any error (incl. the
--                   fail-loud guard) rolls the whole thing back: production is
--                   untouched. Apply with: psql -v ON_ERROR_STOP=1 -f <this file>
--                   (do NOT add -1 — the file already opens its own transaction).
--   * IDEMPOTENT  — safe to re-run. Schema adds are IF NOT EXISTS / guarded;
--                   org + membership use ON CONFLICT DO NOTHING; the backfill and
--                   the consent grandfather only touch rows not yet org-tagged.
--   * FAIL-LOUD   — if Sam's email resolves to no auth.users row, the owner
--                   membership is never created and the script RAISEs and aborts
--                   rather than half-cutting-over.
--
-- ORDER MATTERS: every tenant row is given an org BEFORE RLS flips to per-org,
-- so there is no window in which a row is invisible under the new policies.
-- ============================================================================

begin;

-- The production Tidy Tails organization id. Stable + known (not generated) so
-- re-runs never create a second org and the runbook/rollback are deterministic.
-- Sam is resolved by EMAIL (not a hardcoded uuid) per the membership step below.

-- ----------------------------------------------------------------------------
-- 1. Consent columns on clients (the WS0 / 0002 change prod never received).
--    Existing rows get false now; step 5 grandfathers them to true.
-- ----------------------------------------------------------------------------
alter table public.clients add column if not exists sms_consent boolean not null default false;
alter table public.clients add column if not exists sms_consent_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2. Org model: tables, the membership FK to auth.users, and the per-org RLS
--    helper. (The 0003 + 0004 org infrastructure prod never received.)
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid not null default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  constraint organizations_pkey primary key (id)
);

create table if not exists public.organization_memberships (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  role text not null default 'owner',
  created_at timestamptz default now(),
  constraint organization_memberships_pkey primary key (id),
  constraint organization_memberships_org_id_fkey foreign key (org_id) references public.organizations(id) on delete cascade,
  constraint organization_memberships_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint organization_memberships_org_user_key unique (org_id, user_id)
);
create index if not exists organization_memberships_user_id_idx on public.organization_memberships using btree (user_id);

-- The org_ids the current user belongs to. SECURITY DEFINER so it bypasses RLS
-- on organization_memberships (no policy recursion); STABLE; pinned search_path.
create or replace function public.user_org_ids()
  returns setof uuid
  language sql
  security definer
  set search_path to 'public'
  stable
as $$
  select org_id from public.organization_memberships where user_id = auth.uid();
$$;
grant execute on function public.user_org_ids() to anon, authenticated, service_role;

-- RLS + member-read policies on the two new tables (idempotent).
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;

drop policy if exists "org_member_select" on public.organizations;
create policy "org_member_select" on public.organizations
  for select to authenticated
  using (id in (select m.org_id from public.organization_memberships m where m.user_id = auth.uid()));

drop policy if exists "membership_self_select" on public.organization_memberships;
create policy "membership_self_select" on public.organization_memberships
  for select to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. Nullable org_id (+ FK -> organizations) on all 10 tenant tables. Guarded
--    so a re-run is a no-op (constraints have no IF NOT EXISTS; check pg_constraint).
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  tbls text[] := array[
    'clients','pets','appointments','booking_requests','client_accounts',
    'day_closeout_overrides','google_calendar_connections','sms_messages',
    'audit_events','automations_log'
  ];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I add column if not exists org_id uuid', t);
    if not exists (select 1 from pg_constraint where conname = t || '_org_id_fkey') then
      execute format(
        'alter table public.%I add constraint %I foreign key (org_id) references public.organizations(id)',
        t, t || '_org_id_fkey'
      );
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 4. The Tidy Tails org + Sam's owner membership. Sam is resolved BY EMAIL
--    (never a hardcoded uuid). FAIL LOUD if that email matches no auth.users row.
-- ----------------------------------------------------------------------------
insert into public.organizations (id, name)
values ('11111111-1111-4111-8111-111111111111', 'Tidy Tails')
on conflict (id) do nothing;

insert into public.organization_memberships (org_id, user_id, role)
select '11111111-1111-4111-8111-111111111111', u.id, 'owner'
from auth.users u
where u.email = 'sammclennan143@gmail.com'
on conflict (org_id, user_id) do nothing;

do $$
begin
  if not exists (
    select 1 from public.organization_memberships
    where org_id = '11111111-1111-4111-8111-111111111111'
  ) then
    raise exception
      'CUTOVER ABORTED: no auth.users row for sammclennan143@gmail.com — owner membership not created. Refusing to half-cut-over (nothing committed).';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Backfill. Grandfather consent FIRST (only rows not yet org-tagged = those
--    that existed at cutover), THEN stamp org_id on every still-null row across
--    all 10 tables. Gating on `org_id is null` is what makes BOTH idempotent and
--    correct: a re-run, and any client created after cutover (already org-tagged,
--    default not-consented), are never touched.
-- ----------------------------------------------------------------------------
update public.clients
  set sms_consent = true,
      sms_consent_at = coalesce(sms_consent_at, now())
  where org_id is null;

do $$
declare
  t text;
  org constant uuid := '11111111-1111-4111-8111-111111111111';
  tbls text[] := array[
    'clients','pets','appointments','booking_requests','client_accounts',
    'day_closeout_overrides','google_calendar_connections','sms_messages',
    'audit_events','automations_log'
  ];
begin
  foreach t in array tbls loop
    execute format('update public.%I set org_id = %L where org_id is null', t, org);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 6. ONLY NOW swap RLS from per-USER (groomer_id = auth.uid()) to per-ORG
--    (org_id in (select user_org_ids())) on all 10 tenant tables. Policy names,
--    commands and roles match 0004 exactly (and thus staging); only the
--    predicate changes. audit_events INSERT keeps actor_id = auth.uid().
-- ----------------------------------------------------------------------------

-- clients
drop policy if exists "groomer_select" on public.clients;
drop policy if exists "groomer_insert" on public.clients;
drop policy if exists "groomer_update" on public.clients;
drop policy if exists "groomer_delete" on public.clients;
create policy "groomer_select" on public.clients for select to public using (org_id in (select public.user_org_ids()));
create policy "groomer_insert" on public.clients for insert to public with check (org_id in (select public.user_org_ids()));
create policy "groomer_update" on public.clients for update to public using (org_id in (select public.user_org_ids())) with check (org_id in (select public.user_org_ids()));
create policy "groomer_delete" on public.clients for delete to public using (org_id in (select public.user_org_ids()));

-- pets
drop policy if exists "groomer_select" on public.pets;
drop policy if exists "groomer_insert" on public.pets;
drop policy if exists "groomer_update" on public.pets;
drop policy if exists "groomer_delete" on public.pets;
create policy "groomer_select" on public.pets for select to public using (org_id in (select public.user_org_ids()));
create policy "groomer_insert" on public.pets for insert to public with check (org_id in (select public.user_org_ids()));
create policy "groomer_update" on public.pets for update to public using (org_id in (select public.user_org_ids())) with check (org_id in (select public.user_org_ids()));
create policy "groomer_delete" on public.pets for delete to public using (org_id in (select public.user_org_ids()));

-- appointments
drop policy if exists "groomer_select" on public.appointments;
drop policy if exists "groomer_insert" on public.appointments;
drop policy if exists "groomer_update" on public.appointments;
drop policy if exists "groomer_delete" on public.appointments;
create policy "groomer_select" on public.appointments for select to public using (org_id in (select public.user_org_ids()));
create policy "groomer_insert" on public.appointments for insert to public with check (org_id in (select public.user_org_ids()));
create policy "groomer_update" on public.appointments for update to public using (org_id in (select public.user_org_ids())) with check (org_id in (select public.user_org_ids()));
create policy "groomer_delete" on public.appointments for delete to public using (org_id in (select public.user_org_ids()));

-- booking_requests
drop policy if exists "groomer_select" on public.booking_requests;
drop policy if exists "groomer_insert" on public.booking_requests;
drop policy if exists "groomer_update" on public.booking_requests;
drop policy if exists "groomer_delete" on public.booking_requests;
create policy "groomer_select" on public.booking_requests for select to public using (org_id in (select public.user_org_ids()));
create policy "groomer_insert" on public.booking_requests for insert to public with check (org_id in (select public.user_org_ids()));
create policy "groomer_update" on public.booking_requests for update to public using (org_id in (select public.user_org_ids())) with check (org_id in (select public.user_org_ids()));
create policy "groomer_delete" on public.booking_requests for delete to public using (org_id in (select public.user_org_ids()));

-- client_accounts
drop policy if exists "groomer_select" on public.client_accounts;
drop policy if exists "groomer_insert" on public.client_accounts;
drop policy if exists "groomer_update" on public.client_accounts;
drop policy if exists "groomer_delete" on public.client_accounts;
create policy "groomer_select" on public.client_accounts for select to public using (org_id in (select public.user_org_ids()));
create policy "groomer_insert" on public.client_accounts for insert to public with check (org_id in (select public.user_org_ids()));
create policy "groomer_update" on public.client_accounts for update to public using (org_id in (select public.user_org_ids())) with check (org_id in (select public.user_org_ids()));
create policy "groomer_delete" on public.client_accounts for delete to public using (org_id in (select public.user_org_ids()));

-- day_closeout_overrides
drop policy if exists "groomer_select" on public.day_closeout_overrides;
drop policy if exists "groomer_insert" on public.day_closeout_overrides;
drop policy if exists "groomer_update" on public.day_closeout_overrides;
drop policy if exists "groomer_delete" on public.day_closeout_overrides;
create policy "groomer_select" on public.day_closeout_overrides for select to public using (org_id in (select public.user_org_ids()));
create policy "groomer_insert" on public.day_closeout_overrides for insert to public with check (org_id in (select public.user_org_ids()));
create policy "groomer_update" on public.day_closeout_overrides for update to public using (org_id in (select public.user_org_ids())) with check (org_id in (select public.user_org_ids()));
create policy "groomer_delete" on public.day_closeout_overrides for delete to public using (org_id in (select public.user_org_ids()));

-- automations_log
drop policy if exists "groomer_select" on public.automations_log;
drop policy if exists "groomer_insert" on public.automations_log;
drop policy if exists "groomer_update" on public.automations_log;
drop policy if exists "groomer_delete" on public.automations_log;
create policy "groomer_select" on public.automations_log for select to public using (org_id in (select public.user_org_ids()));
create policy "groomer_insert" on public.automations_log for insert to public with check (org_id in (select public.user_org_ids()));
create policy "groomer_update" on public.automations_log for update to public using (org_id in (select public.user_org_ids())) with check (org_id in (select public.user_org_ids()));
create policy "groomer_delete" on public.automations_log for delete to public using (org_id in (select public.user_org_ids()));

-- audit_events (select + insert only; insert keeps actor_id = auth.uid() integrity)
drop policy if exists "groomer_select" on public.audit_events;
drop policy if exists "groomer_insert" on public.audit_events;
create policy "groomer_select" on public.audit_events for select to public using (org_id in (select public.user_org_ids()));
create policy "groomer_insert" on public.audit_events for insert to public with check ((org_id in (select public.user_org_ids())) and (actor_id = auth.uid()));

-- google_calendar_connections (roles: authenticated)
drop policy if exists "google_calendar_connections_groomer_select" on public.google_calendar_connections;
drop policy if exists "google_calendar_connections_groomer_insert" on public.google_calendar_connections;
drop policy if exists "google_calendar_connections_groomer_update" on public.google_calendar_connections;
drop policy if exists "google_calendar_connections_groomer_delete" on public.google_calendar_connections;
create policy "google_calendar_connections_groomer_select" on public.google_calendar_connections for select to authenticated using (org_id in (select public.user_org_ids()));
create policy "google_calendar_connections_groomer_insert" on public.google_calendar_connections for insert to authenticated with check (org_id in (select public.user_org_ids()));
create policy "google_calendar_connections_groomer_update" on public.google_calendar_connections for update to authenticated using (org_id in (select public.user_org_ids())) with check (org_id in (select public.user_org_ids()));
create policy "google_calendar_connections_groomer_delete" on public.google_calendar_connections for delete to authenticated using (org_id in (select public.user_org_ids()));

-- sms_messages (select + insert + update; roles: authenticated)
drop policy if exists "sms_messages_operator_select" on public.sms_messages;
drop policy if exists "sms_messages_operator_insert" on public.sms_messages;
drop policy if exists "sms_messages_operator_update" on public.sms_messages;
create policy "sms_messages_operator_select" on public.sms_messages for select to authenticated using (org_id in (select public.user_org_ids()));
create policy "sms_messages_operator_insert" on public.sms_messages for insert to authenticated with check (org_id in (select public.user_org_ids()));
create policy "sms_messages_operator_update" on public.sms_messages for update to authenticated using (org_id in (select public.user_org_ids())) with check (org_id in (select public.user_org_ids()));

commit;
