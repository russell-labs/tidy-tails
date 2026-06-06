-- WS2.4 cutover rehearsal — second-org isolation. REHEARSAL/CI ONLY.
-- Run AFTER the cutover AND after seed.sql has added the synthetic tenant
-- aa/org-f001. Proves that a *different* tenant sees none of Sam's backfilled
-- data under the new per-org RLS. Fails loudly.

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', false);

do $$
begin
  -- aa (org f001) must see NONE of Sam's rows (groomer_id = Sam's synthetic uid).
  if (select count(*) from public.clients
        where groomer_id = '00000000-0000-0000-0000-0000000000e0') <> 0 then
    raise exception 'ISOLATION FAIL: tenant aa can see Sam''s clients after cutover';
  end if;
  if (select count(*) from public.appointments
        where groomer_id = '00000000-0000-0000-0000-0000000000e0') <> 0 then
    raise exception 'ISOLATION FAIL: tenant aa can see Sam''s appointments after cutover';
  end if;

  -- ...but DOES see its own seeded book (sanity: RLS is not just hiding everything).
  if (select count(*) from public.clients) = 0 then
    raise exception 'ASSERT FAIL: tenant aa sees none of its own clients';
  end if;

  raise notice 'SECOND-ORG OK: tenant aa cannot see Sam''s data; sees its own';
end $$;

reset role;
