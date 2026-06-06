-- WS2.4 cutover rehearsal — primary assertions. REHEARSAL/CI ONLY.
-- Run AFTER the cutover + the privilege grants. Fails loudly (RAISE -> psql exits
-- non-zero under ON_ERROR_STOP=1). Leaves a committed "PostCutoverProbe" client
-- behind for the later idempotency assertion.

-- ---------------------------------------------------------------------------
-- A. Backfill + consent grandfather, proven via the SAME email->uid->membership
--    chain the cutover uses (superuser session; RLS bypassed for inspection).
-- ---------------------------------------------------------------------------
do $$
declare
  sam uuid; resolved_org uuid; t text; n_total int; n_bad int;
  tbls text[] := array[
    'clients','pets','appointments','booking_requests','client_accounts',
    'day_closeout_overrides','google_calendar_connections','sms_messages',
    'audit_events','automations_log'
  ];
begin
  select id into sam from auth.users where email = 'sammclennan143@gmail.com';
  if sam is null then raise exception 'ASSERT FAIL: Sam email did not resolve to a user'; end if;

  select org_id into resolved_org from public.organization_memberships where user_id = sam;
  if resolved_org is null then raise exception 'ASSERT FAIL: Sam has no membership after cutover'; end if;

  foreach t in array tbls loop
    execute format('select count(*) from public.%I where groomer_id = %L', t, sam) into n_total;
    if n_total = 0 then
      raise exception 'ASSERT FAIL: no Sam rows in % — backfill not exercised on this table', t;
    end if;
    execute format(
      'select count(*) from public.%I where groomer_id = %L and (org_id is distinct from %L)',
      t, sam, resolved_org
    ) into n_bad;
    if n_bad <> 0 then
      raise exception 'ASSERT FAIL: %/% rows in % were not backfilled to Sam''s org', n_bad, n_total, t;
    end if;
  end loop;

  -- Consent grandfather: every pre-existing client is now consented, with a stamp.
  if (select count(*) from public.clients
        where groomer_id = sam and (sms_consent is not true or sms_consent_at is null)) <> 0 then
    raise exception 'ASSERT FAIL: a pre-existing client was not grandfathered to consented';
  end if;

  raise notice 'CHAIN OK: email->uid->membership->org resolved; all 10 tenant tables backfilled; consent grandfathered';
end $$;

-- ---------------------------------------------------------------------------
-- B. Under the NEW per-org RLS, as Sam (authenticated): she sees her backfilled
--    rows, can write, and a brand-new client defaults to NOT consented.
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e0', false);

do $$
declare
  me constant uuid := '00000000-0000-0000-0000-0000000000e0';
  my_org uuid;
  c int;
begin
  select org_id into my_org from public.organization_memberships where user_id = me;
  if my_org is null then raise exception 'ASSERT FAIL: Sam (authenticated) cannot read her own membership'; end if;

  c := (select count(*) from public.clients);
  if c <> 2 then raise exception 'ASSERT FAIL: Sam should see her 2 clients under per-org RLS, sees %', c; end if;

  c := (select count(*) from public.appointments);
  if c <> 2 then raise exception 'ASSERT FAIL: Sam should see her 2 appointments, sees %', c; end if;

  -- write works under per-org RLS (org_id satisfies the WITH CHECK).
  insert into public.clients (org_id, groomer_id, first_name) values (my_org, me, 'PostCutoverProbe');

  -- ...and defaults to not-consented (only pre-existing clients were grandfathered).
  if (select sms_consent from public.clients where first_name = 'PostCutoverProbe') is not false then
    raise exception 'ASSERT FAIL: a post-cutover client should default sms_consent = false';
  end if;

  raise notice 'SAM RLS OK: sees her rows; write allowed; post-cutover client not auto-consented';
end $$;

reset role;
