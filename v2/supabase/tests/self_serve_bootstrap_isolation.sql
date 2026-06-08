-- Self-serve org bootstrap isolation test (WS3 Slice B). Sibling to
-- cross_tenant_isolation.sql; proves migration 0005's bootstrap surface.
--
-- WHY A SIBLING FILE (do not merge into cross_tenant_isolation.sql): that file
-- also runs in the prod-cutover-rehearsal CI job, which applies ONLY the baseline
-- migration (0001) — none of 0005's objects (created_by, org_settings,
-- org_created_by_me, the bootstrap policies, the partial unique index) exist
-- there. This test references those objects, so it is wired ONLY into the
-- `isolation` CI job, which applies ALL migrations.
--
-- Proves, as the `authenticated` role (sub switched between users):
--   1. A brand-new, org-less user CAN create exactly one org stamped as
--      themselves, one OWNER membership in THAT org, and a settings row.
--   2. They CANNOT create an org stamped as someone else, CANNOT insert an owner
--      membership into another user's existing org, CANNOT insert a membership
--      for a different user, and CANNOT insert a non-owner bootstrap membership.
--   3. The org_one_owner_per_user partial unique index blocks a SECOND owner
--      membership (the race-safe "exactly one org" backstop).
--   4. The freshly self-created org's settings are fully isolated from an
--      existing tenant's, in both directions.
--
-- Runs AFTER cross_tenant_isolation.sql in the isolation job, so seed.sql's two
-- tenants exist (org #1 = f001/aa, org #2 = f002/bb, each with one owner
-- membership). NON-DESTRUCTIVE: everything runs in a rolled-back transaction.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f v2/supabase/tests/self_serve_bootstrap_isolation.sql

begin;

-- A third, org-less user for the self-serve path (auth.users so the membership
-- FK to auth.users(id) is satisfied). Inserted as the CI superuser before we
-- drop to the authenticated role.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000cc', 'authenticated', 'authenticated', 'newcomer@tidytails.test'),
  -- A second org-less user used only as the "different user" in the forbidden
  -- probes below. Membership-less on purpose: if we reused an existing owner
  -- (e.g. aa) the org_one_owner_per_user index could mask a policy hole, since
  -- the index (23505) and the RLS WITH CHECK (42501) both reject the row.
  ('00000000-0000-0000-0000-0000000000de', 'authenticated', 'authenticated', 'other@tidytails.test')
on conflict (id) do nothing;

set local role authenticated;

-- ---- Part 1+2+3: the newcomer bootstraps, and forbidden writes are blocked ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000cc', true);
do $$
declare
  me        constant uuid := '00000000-0000-0000-0000-0000000000cc';
  other     constant uuid := '00000000-0000-0000-0000-0000000000de'; -- a membership-less other user
  my_org    constant uuid := '00000000-0000-0000-0000-00000000f0cc'; -- app-generated id
  my_org2   constant uuid := '00000000-0000-0000-0000-00000000f0cd'; -- a would-be second org
  foreign_org constant uuid := '00000000-0000-0000-0000-00000000f001'; -- tenant-1's org
begin
  -- FORBIDDEN: create an org stamped as someone else (org_self_create WITH CHECK)
  begin
    insert into public.organizations (id, name, created_by) values (my_org, 'Spoofed', other);
    raise exception 'FAIL B1: created an org stamped as another user';
  exception when insufficient_privilege then null; end;

  -- FORBIDDEN: own owner membership in a FOREIGN existing org (org_created_by_me false)
  begin
    insert into public.organization_memberships (org_id, user_id, role) values (foreign_org, me, 'owner');
    raise exception 'FAIL B2: joined another user''s org as owner';
  exception when insufficient_privilege then null; end;

  -- ALLOWED: create my own org, stamped as me
  begin
    insert into public.organizations (id, name, created_by) values (my_org, 'Newcomer Grooming', me);
  exception when insufficient_privilege then raise exception 'FAIL B3: own-org create was wrongly blocked'; end;

  -- FORBIDDEN: a membership for a DIFFERENT user, even into my own org (user_id <> auth.uid())
  begin
    insert into public.organization_memberships (org_id, user_id, role) values (my_org, other, 'owner');
    raise exception 'FAIL B4: inserted a membership for another user';
  exception when insufficient_privilege then null; end;

  -- FORBIDDEN: a NON-owner bootstrap membership (policy requires role = owner)
  begin
    insert into public.organization_memberships (org_id, user_id, role) values (my_org, me, 'member');
    raise exception 'FAIL B5: inserted a non-owner bootstrap membership';
  exception when insufficient_privilege then null; end;

  -- ALLOWED: my own OWNER membership in my own org
  begin
    insert into public.organization_memberships (org_id, user_id, role) values (my_org, me, 'owner');
  exception when insufficient_privilege then raise exception 'FAIL B6: own owner membership was wrongly blocked'; end;

  -- ALLOWED: seed my settings (membership now exists -> user_org_ids resolves)
  begin
    insert into public.org_settings (org_id, scheduling_style, settings)
      values (my_org, 'one_to_one', '{"locations":[]}'::jsonb);
  exception when insufficient_privilege then raise exception 'FAIL B7: own settings insert was wrongly blocked'; end;

  -- BACKSTOP: a SECOND org + owner membership is blocked by the partial unique
  -- index (unique_violation, not a policy denial). The org row inserts; the
  -- second owner membership must fail.
  insert into public.organizations (id, name, created_by) values (my_org2, 'Second Try', me);
  begin
    insert into public.organization_memberships (org_id, user_id, role) values (my_org2, me, 'owner');
    raise exception 'FAIL B8: created a SECOND owner membership (index missing?)';
  exception when unique_violation then null; end;

  raise notice 'bootstrap OK: newcomer self-created exactly one org; spoof/foreign/other-user/non-owner/second-owner all blocked';
end $$;

-- ---- Part 4: settings isolation between the new org and an existing tenant ----
-- As tenant-1 (aa), seed a settings row for org #1, then assert each side sees
-- only its own org_settings.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
do $$
declare
  org1 constant uuid := '00000000-0000-0000-0000-00000000f001';
  newcomer_org constant uuid := '00000000-0000-0000-0000-00000000f0cc';
begin
  insert into public.org_settings (org_id, scheduling_style, settings)
    values (org1, 'batched', '{"locations":[]}'::jsonb)
  on conflict (org_id) do nothing;

  if (select count(*) from public.org_settings where org_id = org1) <> 1 then
    raise exception 'FAIL B9: tenant-1 cannot see its own settings';
  end if;
  if (select count(*) from public.org_settings where org_id <> org1) <> 0 then
    raise exception 'FAIL B10: tenant-1 leaked another org''s settings';
  end if;
  -- explicit: the newcomer's settings are invisible to tenant-1
  if (select count(*) from public.org_settings where org_id = newcomer_org) <> 0 then
    raise exception 'FAIL B11: tenant-1 can read the newcomer org''s settings';
  end if;
  raise notice 'settings isolation OK: tenant-1 sees only its own org_settings';
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000cc', true);
do $$
declare
  org1 constant uuid := '00000000-0000-0000-0000-00000000f001';
  newcomer_org constant uuid := '00000000-0000-0000-0000-00000000f0cc';
begin
  if (select count(*) from public.org_settings where org_id = newcomer_org) <> 1 then
    raise exception 'FAIL B12: newcomer cannot see its own settings';
  end if;
  if (select count(*) from public.org_settings where org_id <> newcomer_org) <> 0 then
    raise exception 'FAIL B13: newcomer leaked another org''s settings';
  end if;
  raise notice 'settings isolation OK: newcomer sees only its own org_settings';
end $$;

reset role;
rollback;  -- non-destructive: undo every probe write
