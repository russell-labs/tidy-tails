-- WS2.4 cutover rehearsal — idempotency. REHEARSAL/CI ONLY.
-- Run AFTER the cutover has been applied a SECOND time. Proves the re-run was a
-- no-op: no duplicate org/membership, and (critically) the consent grandfather
-- did NOT re-fire on the client that was created AFTER the first cutover. Fails
-- loudly. Superuser session (RLS bypassed for inspection).

do $$
declare n int;
begin
  n := (select count(*) from public.organizations where name = 'Tidy Tails');
  if n <> 1 then raise exception 'IDEMPOTENCY FAIL: expected exactly 1 Tidy Tails org, found %', n; end if;

  n := (select count(*) from public.organization_memberships m
          join auth.users u on u.id = m.user_id
          where u.email = 'sammclennan143@gmail.com');
  if n <> 1 then raise exception 'IDEMPOTENCY FAIL: expected exactly 1 Sam membership, found %', n; end if;

  -- The post-cutover probe client must STILL be not-consented: the grandfather is
  -- gated on org_id IS NULL, so an already-org-tagged client is never re-touched.
  if (select sms_consent from public.clients where first_name = 'PostCutoverProbe') is not false then
    raise exception 'IDEMPOTENCY FAIL: the re-run re-grandfathered a post-cutover client';
  end if;

  raise notice 'IDEMPOTENT OK: single org + membership; post-cutover client not re-grandfathered';
end $$;
