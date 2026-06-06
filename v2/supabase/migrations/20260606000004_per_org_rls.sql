-- WS2.2 — switch tenant-table RLS from per-user to per-ORG membership.
--
-- SAFETY-CRITICAL. Replaces every tenant table's `groomer_id = auth.uid()`
-- policy with an org-membership predicate, so a row is visible/writable iff its
-- org_id is one the current user belongs to. groomer_id stays as attribution.
--
-- STAGING-FIRST: applied to staging only. PROD IS NOT MIGRATED HERE — prod's
-- org_id is null, so this RLS would hide every prod row. The prod backfill +
-- atomic switch is WS2.4.
--
-- NOTE: this also makes inserts fail closed for any caller that does not set
-- org_id (the app does not thread org context until WS2.3). That is the expected
-- "app breaks against the new RLS" state for this slice; the app is not pointed
-- at staging in CI, and no app code changes here.

-- ---------------------------------------------------------------------------
-- 1. Deferred membership FK (flagged in WS2.1): user_id -> auth.users.
-- ---------------------------------------------------------------------------
alter table public.organization_memberships
  add constraint organization_memberships_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 2. Helper: the org_ids the current user belongs to.
--    SECURITY DEFINER so it bypasses RLS on organization_memberships (no policy
--    recursion); STABLE so it is evaluated once per query, not per row; pinned
--    search_path. The memberships table's OWN policy stays user_id = auth.uid()
--    (it does not call this helper), which is why there is no recursion.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Replace the per-user policies on all 10 tenant tables with the per-org
--    predicate. Policy names, commands, and roles are preserved exactly; only
--    the predicate changes. UPDATE keeps BOTH using + with check so a row can
--    neither be reached unless it is yours NOR be reassigned to a foreign org.
-- ---------------------------------------------------------------------------

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
