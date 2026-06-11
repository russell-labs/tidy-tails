-- TT-015 — Admin "view-as" / support impersonation.
--
-- SECURITY-SENSITIVE. This deliberately crosses the tenant isolation boundary to
-- give the platform owner a controlled, audited, READ-ONLY support view of a
-- tenant org. It is NOT an RLS hole.
--
-- SAFETY THESIS (see _reports/2026-06-11-tt015-admin-view-as-plan.md §2): the
-- admin's session gains an extra *read* visibility term on SELECT policies ONLY.
-- INSERT / UPDATE / DELETE policies are untouched and stay member-only, so the
-- admin PHYSICALLY CANNOT WRITE tenant rows. For any non-admin the extra term
-- resolves to the empty set, so tenant isolation for normal operators is
-- mathematically unchanged (A OR ∅ = A).
--
-- STAGING-FIRST, GATED. The app feature is dark behind
-- TIDYTAILS_ENABLE_ADMIN_VIEW_AS (default off); this migration only adds
-- structure. The platform-admin SEED is a separate per-environment step (see the
-- bottom of this file) — it is intentionally NOT in this structural migration so
-- the migration is env-agnostic and safe to apply unfilled. Apply to staging,
-- rehearse, then gated prod (prod is org-aware as of 2026-06-09). This does NOT
-- deploy.

-- ---------------------------------------------------------------------------
-- 1. platform_admins — the allowlist of platform-owner identities.
--    RLS enabled. SELECT: an admin may confirm THEIR OWN status, nothing else.
--    NO INSERT/UPDATE/DELETE policy at all -> with RLS on, every write is denied
--    for anon/authenticated. No tenant can self-promote. The owner uid is seeded
--    out-of-band (service-role SQL bypasses RLS) per the seed note below.
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  constraint platform_admins_pkey primary key (user_id),
  constraint platform_admins_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade
);

alter table public.platform_admins enable row level security;

create policy "platform_admins_self_select" on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. admin_impersonation_sessions — THIS IS the append-only audit log.
--    Captures exactly who / which org / when / duration. RLS enabled. SELECT:
--    an admin sees their own sessions. NO public INSERT/UPDATE/DELETE policy —
--    rows are created/ended ONLY via the SECURITY DEFINER RPCs in §4. Absence of
--    UPDATE/DELETE = append-only (same immutability shape as audit_events).
-- ---------------------------------------------------------------------------
create table public.admin_impersonation_sessions (
  id             uuid not null default gen_random_uuid(),
  admin_user_id  uuid not null,                    -- WHO
  target_org_id  uuid not null,                    -- WHICH ORG
  reason         text,                             -- support context
  started_at     timestamptz not null default now(),  -- WHEN
  expires_at     timestamptz not null,             -- time-box
  ended_at       timestamptz,                      -- explicit exit / DURATION
  constraint admin_impersonation_sessions_pkey primary key (id),
  constraint admin_impersonation_sessions_admin_user_id_fkey
    foreign key (admin_user_id) references auth.users(id) on delete cascade,
  constraint admin_impersonation_sessions_target_org_id_fkey
    foreign key (target_org_id) references public.organizations(id) on delete cascade
);

create index idx_admin_impersonation_sessions_active
  on public.admin_impersonation_sessions (admin_user_id, expires_at)
  where ended_at is null;

alter table public.admin_impersonation_sessions enable row level security;

create policy "admin_impersonation_sessions_self_select"
  on public.admin_impersonation_sessions
  for select to authenticated
  using (admin_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Helpers. SECURITY DEFINER (bypass RLS on the admin tables), STABLE, pinned
--    search_path — reviewed as carefully as user_org_ids(). They only ever
--    WIDEN read visibility; they never narrow it.
-- ---------------------------------------------------------------------------

-- Is the caller a platform admin?
create or replace function public.is_platform_admin()
  returns boolean
  language sql
  security definer
  set search_path to 'public'
  stable
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

grant execute on function public.is_platform_admin() to authenticated;

-- The org_ids the caller is CURRENTLY allowed to view-as: target orgs of their
-- own active, unexpired impersonation sessions — AND only when the caller really
-- is a platform admin (inner double-check makes a stray session row harmless).
-- This is the read-visibility seam consumed by the SELECT policies in §5.
-- Mirrors user_org_ids() exactly (definer/stable/pinned) so it is a drop-in
-- OR-term, evaluated once per query, not per row.
create or replace function public.active_impersonated_org_ids()
  returns setof uuid
  language sql
  security definer
  set search_path to 'public'
  stable
as $$
  select s.target_org_id
  from public.admin_impersonation_sessions s
  where s.admin_user_id = auth.uid()
    and s.ended_at is null
    and s.expires_at > now()
    and public.is_platform_admin();
$$;

-- Granted to the SAME roles as user_org_ids() — anon included. This function is
-- referenced directly in the `to public` SELECT policies below, so every role
-- that evaluates those policies (public = anon + authenticated) must hold
-- EXECUTE, or an anon-role SELECT would fail with "permission denied for
-- function". Safe: for anon (auth.uid() null) is_platform_admin() is false, so
-- the function returns the empty set — A OR ∅ = A, isolation unchanged.
grant execute on function public.active_impersonated_org_ids()
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RPCs — the ONLY way sessions are created/ended, and the only way an admin
--    enumerates orgs / reads their active session with the org name resolved
--    (the admin has no membership, so organizations RLS would otherwise hide
--    every org). All SECURITY DEFINER + is_platform_admin() asserted.
-- ---------------------------------------------------------------------------

-- Start a 30-minute, single-active impersonation session. Asserts admin; ends
-- any existing active session for this admin (single-active invariant); inserts
-- the new session; returns its id.
create or replace function public.admin_start_impersonation(
  p_org uuid,
  p_reason text default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;

  -- single active session: end anything currently open for this admin
  update public.admin_impersonation_sessions
    set ended_at = now()
    where admin_user_id = auth.uid() and ended_at is null;

  insert into public.admin_impersonation_sessions
    (admin_user_id, target_org_id, reason, expires_at)
    values (auth.uid(), p_org, p_reason, now() + interval '30 minutes')
    returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.admin_start_impersonation(uuid, text) to authenticated;

-- End the admin's active session(s). Idempotent.
create or replace function public.admin_end_impersonation()
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;

  update public.admin_impersonation_sessions
    set ended_at = now()
    where admin_user_id = auth.uid() and ended_at is null;
end;
$$;

grant execute on function public.admin_end_impersonation() to authenticated;

-- The admin's current active session with the target org NAME resolved. Returns
-- zero rows when there is no active session (or the caller is not an admin).
create or replace function public.admin_active_impersonation()
  returns table (
    session_id    uuid,
    target_org_id uuid,
    org_name      text,
    expires_at    timestamptz
  )
  language sql
  security definer
  set search_path to 'public'
  stable
as $$
  select s.id, s.target_org_id, o.name, s.expires_at
  from public.admin_impersonation_sessions s
  join public.organizations o on o.id = s.target_org_id
  where s.admin_user_id = auth.uid()
    and s.ended_at is null
    and s.expires_at > now()
    and public.is_platform_admin()
  order by s.started_at desc
  limit 1;
$$;

grant execute on function public.admin_active_impersonation() to authenticated;

-- Enumerate orgs for the /admin picker. Admin-only; the admin has no membership
-- so organizations RLS hides everything — this definer function is how /admin
-- lists tenants to choose from.
create or replace function public.admin_list_orgs()
  returns table (
    id         uuid,
    name       text,
    created_at timestamptz
  )
  language sql
  security definer
  set search_path to 'public'
  stable
as $$
  select o.id, o.name, o.created_at
  from public.organizations o
  where public.is_platform_admin()
  order by o.name asc;
$$;

grant execute on function public.admin_list_orgs() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RLS change — the crux. Additive OR-term on SELECT policies ONLY, for the
--    in-scope tables (plan §7). Each policy's name, command, and roles are
--    preserved EXACTLY; only the predicate gains the admin-read OR-term.
--    INSERT / UPDATE / DELETE policies are NOT touched anywhere.
--
--    IN SCOPE: clients, pets, appointments, booking_requests,
--              day_closeout_overrides, automations_log, audit_events,
--              sms_messages, org_settings, daily_income.
--              (org_settings + daily_income added 2026-06-11 by Russell so a
--              support view shows the tenant's scheduling style/economics and
--              rented-chair daily income — read-only, same OR-term shape.)
--    EXCLUDED (no OR-term, SELECT stays member-only):
--              google_calendar_connections (OAuth refresh tokens),
--              client_accounts (pet-owner account links).
-- ---------------------------------------------------------------------------

-- clients
drop policy if exists "groomer_select" on public.clients;
create policy "groomer_select" on public.clients for select to public
  using (
    org_id in (select public.user_org_ids())
    or org_id in (select public.active_impersonated_org_ids())
  );

-- pets
drop policy if exists "groomer_select" on public.pets;
create policy "groomer_select" on public.pets for select to public
  using (
    org_id in (select public.user_org_ids())
    or org_id in (select public.active_impersonated_org_ids())
  );

-- appointments
drop policy if exists "groomer_select" on public.appointments;
create policy "groomer_select" on public.appointments for select to public
  using (
    org_id in (select public.user_org_ids())
    or org_id in (select public.active_impersonated_org_ids())
  );

-- booking_requests
drop policy if exists "groomer_select" on public.booking_requests;
create policy "groomer_select" on public.booking_requests for select to public
  using (
    org_id in (select public.user_org_ids())
    or org_id in (select public.active_impersonated_org_ids())
  );

-- day_closeout_overrides
drop policy if exists "groomer_select" on public.day_closeout_overrides;
create policy "groomer_select" on public.day_closeout_overrides for select to public
  using (
    org_id in (select public.user_org_ids())
    or org_id in (select public.active_impersonated_org_ids())
  );

-- automations_log
drop policy if exists "groomer_select" on public.automations_log;
create policy "groomer_select" on public.automations_log for select to public
  using (
    org_id in (select public.user_org_ids())
    or org_id in (select public.active_impersonated_org_ids())
  );

-- audit_events (INSERT keeps actor_id = auth.uid() integrity, untouched here)
drop policy if exists "groomer_select" on public.audit_events;
create policy "groomer_select" on public.audit_events for select to public
  using (
    org_id in (select public.user_org_ids())
    or org_id in (select public.active_impersonated_org_ids())
  );

-- sms_messages (SENSITIVE — bodies are PII; in scope, read-only). Roles:
-- authenticated, preserved exactly from migration 0004.
drop policy if exists "sms_messages_operator_select" on public.sms_messages;
create policy "sms_messages_operator_select" on public.sms_messages for select to authenticated
  using (
    org_id in (select public.user_org_ids())
    or org_id in (select public.active_impersonated_org_ids())
  );

-- org_settings (scheduling style + economics). Roles: authenticated, preserved
-- exactly from migration 0005. NOTE: the daily_income app reader lives in the
-- TT-014 app layer (not on this branch); when this branch meets it, that read
-- seam must adopt liveReadScope()/effectiveOrgId() or the admin will filter by
-- their own (empty) groomer_id and see no rows despite this OR-term. The
-- org_settings reader (loadOrgSettings) already follows effectiveOrgId().
drop policy if exists "org_settings_select" on public.org_settings;
create policy "org_settings_select" on public.org_settings for select to authenticated
  using (
    org_id in (select public.user_org_ids())
    or org_id in (select public.active_impersonated_org_ids())
  );

-- daily_income (rented-chair lump-sum income; TT-014). Roles: public, preserved
-- exactly from migration 20260611000001.
drop policy if exists "groomer_select" on public.daily_income;
create policy "groomer_select" on public.daily_income for select to public
  using (
    org_id in (select public.user_org_ids())
    or org_id in (select public.active_impersonated_org_ids())
  );

-- ---------------------------------------------------------------------------
-- 6. SEED — per-environment, NOT applied by this structural migration.
--
--    The platform-owner uid DIFFERS staging vs prod (precedent:
--    _reports/2026-05-18-ship-2.2b-production-uid.md). Seed staging at rehearsal
--    time with the staging admin auth.users uid; capture the prod uid at prod
--    apply time. A UUID is not a secret. Run as a one-off service-role/SQL step:
--
--      insert into public.platform_admins (user_id)
--      values ('<ENVIRONMENT_ADMIN_AUTH_UID>')
--      on conflict (user_id) do nothing;
--
--    Until seeded, the feature is fully inert even with the flag on:
--    is_platform_admin() is false for everyone, so active_impersonated_org_ids()
--    is always empty and every SELECT OR-term resolves to ∅.
-- ---------------------------------------------------------------------------
