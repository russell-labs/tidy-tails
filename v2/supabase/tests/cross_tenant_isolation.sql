-- Cross-tenant isolation test (WS2.2). THE gate for per-org RLS.
--
-- Proves that, under the per-org RLS policies, one tenant can never read or
-- write another tenant's data. Two parts:
--   1. STRUCTURAL (covers ALL 11 tenant tables, populated or not): every
--      tenant-table policy must be org-scoped (references user_org_ids) and none
--      may still be per-user (references groomer_id). This is what guarantees the
--      seven empty tenant tables are switched.
--   2. BEHAVIORAL (the 3 populated tables — clients/pets/appointments): simulate
--      both seeded tenants and assert read + write isolation in both directions.
--
-- FAILS LOUDLY: any breach raises an exception (psql exits non-zero under
-- ON_ERROR_STOP). NON-DESTRUCTIVE: the whole thing runs in a transaction that is
-- rolled back, so probe writes never persist.
--
-- Run against staging (or any Postgres carrying the migrations + the two-tenant
-- seed) as a role that may `set role authenticated`:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f v2/supabase/tests/cross_tenant_isolation.sql
--
-- Identities are the synthetic seed values:
--   org #1: user 00000000-0000-0000-0000-0000000000aa, org 00000000-0000-0000-0000-00000000f001
--   org #2: user 00000000-0000-0000-0000-0000000000bb, org 00000000-0000-0000-0000-00000000f002

begin;

-- 1. STRUCTURAL ---------------------------------------------------------------
do $$
declare per_user int; not_scoped int;
begin
  select count(*) into per_user from pg_policies
  where schemaname='public'
    and tablename in ('clients','pets','appointments','booking_requests','client_accounts',
                      'day_closeout_overrides','daily_income','google_calendar_connections',
                      'sms_messages','audit_events','automations_log')
    and ((qual like '%groomer_id%') or (with_check like '%groomer_id%'));
  if per_user <> 0 then
    raise exception 'ISOLATION FAIL (structural): % tenant policy(ies) still reference groomer_id (per-user RLS not switched)', per_user;
  end if;

  select count(*) into not_scoped from pg_policies
  where schemaname='public'
    and tablename in ('clients','pets','appointments','booking_requests','client_accounts',
                      'day_closeout_overrides','daily_income','google_calendar_connections',
                      'sms_messages','audit_events','automations_log')
    and not ((qual like '%user_org_ids%') or (with_check like '%user_org_ids%'));
  if not_scoped <> 0 then
    raise exception 'ISOLATION FAIL (structural): % tenant policy(ies) are not org-scoped (missing user_org_ids)', not_scoped;
  end if;

  raise notice 'structural OK: all tenant-table policies are org-scoped, none per-user';
end $$;

-- 2. BEHAVIORAL ---------------------------------------------------------------
-- Both tenants are the `authenticated` role; they differ only by jwt sub
-- (auth.uid()). We switch sub between the two and re-run the same assertions.
set local role authenticated;

-- ---- Tenant 1 (sees only org #1; cannot touch org #2) ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
do $$
declare
  own  constant uuid := '00000000-0000-0000-0000-00000000f001';
  foreign_org constant uuid := '00000000-0000-0000-0000-00000000f002';
  me   constant uuid := '00000000-0000-0000-0000-0000000000aa';
  n int;
begin
  -- READ: sees own rows, zero foreign rows
  if (select count(*) from public.clients) = 0 then raise exception 'FAIL t1 read: sees no clients of its own'; end if;
  if (select count(*) from public.clients where org_id <> own) <> 0 then raise exception 'FAIL t1 read: clients leaked from another org'; end if;
  if (select count(*) from public.pets where org_id <> own) <> 0 then raise exception 'FAIL t1 read: pets leaked from another org'; end if;
  if (select count(*) from public.appointments where org_id <> own) <> 0 then raise exception 'FAIL t1 read: appointments leaked from another org'; end if;

  -- WRITE A1: cross-org UPDATE touches 0 rows (foreign rows are invisible)
  update public.appointments set fee = 999 where org_id = foreign_org;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL t1 A1: updated % foreign appointment row(s)', n; end if;

  -- WRITE A2: cannot reassign own row into the foreign org (WITH CHECK)
  begin
    update public.clients set org_id = foreign_org where org_id = own;
    raise exception 'FAIL t1 A2: reassigned a row to the foreign org';
  exception when insufficient_privilege then null; end;

  -- WRITE A3: cannot insert into the foreign org (WITH CHECK)
  begin
    insert into public.clients (org_id, groomer_id, first_name) values (foreign_org, me, 'Intruder');
    raise exception 'FAIL t1 A3: inserted a row into the foreign org';
  exception when insufficient_privilege then null; end;

  -- WRITE A4: CAN insert into own org (rolled back with the outer transaction)
  begin
    insert into public.clients (org_id, groomer_id, first_name) values (own, me, 'SelfProbe');
  exception when insufficient_privilege then raise exception 'FAIL t1 A4: own-org insert was wrongly blocked'; end;

  -- daily_income (TT-014): read scoped, cross-org write blocked, own insert allowed.
  -- Guarded on table existence — this test is shared with the cutover-rehearsal
  -- job, whose schema (baseline + cutover script) has no daily_income table.
  if to_regclass('public.daily_income') is not null then
    if (select count(*) from public.daily_income where org_id <> own) <> 0 then raise exception 'FAIL t1 read: daily_income leaked from another org'; end if;

    update public.daily_income set amount = 9999 where org_id = foreign_org;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL t1 daily_income: updated % foreign row(s)', n; end if;

    begin
      insert into public.daily_income (org_id, groomer_id, date, location, amount) values (foreign_org, me, '2026-06-20', 'gina', 100);
      raise exception 'FAIL t1 daily_income: inserted into the foreign org';
    exception when insufficient_privilege then null; end;

    begin
      insert into public.daily_income (org_id, groomer_id, date, location, amount) values (own, me, '2026-06-21', 'gina', 120);
    exception when insufficient_privilege then raise exception 'FAIL t1 daily_income: own-org insert wrongly blocked'; end;
  end if;

  raise notice 'tenant 1 OK: read scoped; cross-org update/reassign/insert blocked; own insert allowed';
end $$;

-- ---- Tenant 2 (sees only org #2; cannot touch org #1) ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000bb', true);
do $$
declare
  own  constant uuid := '00000000-0000-0000-0000-00000000f002';
  foreign_org constant uuid := '00000000-0000-0000-0000-00000000f001';
  me   constant uuid := '00000000-0000-0000-0000-0000000000bb';
  n int;
begin
  if (select count(*) from public.clients) = 0 then raise exception 'FAIL t2 read: sees no clients of its own'; end if;
  if (select count(*) from public.clients where org_id <> own) <> 0 then raise exception 'FAIL t2 read: clients leaked from another org'; end if;
  if (select count(*) from public.pets where org_id <> own) <> 0 then raise exception 'FAIL t2 read: pets leaked from another org'; end if;
  if (select count(*) from public.appointments where org_id <> own) <> 0 then raise exception 'FAIL t2 read: appointments leaked from another org'; end if;

  update public.appointments set fee = 999 where org_id = foreign_org;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL t2 A1: updated % foreign appointment row(s)', n; end if;

  begin
    update public.clients set org_id = foreign_org where org_id = own;
    raise exception 'FAIL t2 A2: reassigned a row to the foreign org';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.clients (org_id, groomer_id, first_name) values (foreign_org, me, 'Intruder');
    raise exception 'FAIL t2 A3: inserted a row into the foreign org';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.clients (org_id, groomer_id, first_name) values (own, me, 'SelfProbe');
  exception when insufficient_privilege then raise exception 'FAIL t2 A4: own-org insert was wrongly blocked'; end;

  -- daily_income (TT-014): read scoped, cross-org write blocked, own insert allowed.
  -- Guarded on table existence — this test is shared with the cutover-rehearsal
  -- job, whose schema (baseline + cutover script) has no daily_income table.
  if to_regclass('public.daily_income') is not null then
    if (select count(*) from public.daily_income where org_id <> own) <> 0 then raise exception 'FAIL t2 read: daily_income leaked from another org'; end if;

    update public.daily_income set amount = 9999 where org_id = foreign_org;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL t2 daily_income: updated % foreign row(s)', n; end if;

    begin
      insert into public.daily_income (org_id, groomer_id, date, location, amount) values (foreign_org, me, '2026-06-20', 'annette', 100);
      raise exception 'FAIL t2 daily_income: inserted into the foreign org';
    exception when insufficient_privilege then null; end;

    begin
      insert into public.daily_income (org_id, groomer_id, date, location, amount) values (own, me, '2026-06-21', 'annette', 120);
    exception when insufficient_privilege then raise exception 'FAIL t2 daily_income: own-org insert wrongly blocked'; end;
  end if;

  raise notice 'tenant 2 OK: read scoped; cross-org update/reassign/insert blocked; own insert allowed';
end $$;

reset role;
rollback;  -- non-destructive: undo every probe write
