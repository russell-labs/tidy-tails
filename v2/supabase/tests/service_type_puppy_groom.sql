-- TT-019 regression (isolation gate): a 'puppy_groom' appointment must insert
-- under per-org RLS. The app's booking form offers "Puppy groom"; the live CHECK
-- must accept it. Runs against the schema with ALL migrations applied (so the
-- 0006 constraint fix is present) plus the two-tenant seed.
--
-- Red before 0006 (CHECK rejects 'puppy_groom' → psql aborts under
-- ON_ERROR_STOP), green after. Wrapped in a transaction and rolled back so it
-- leaves no residue regardless of step ordering.

begin;

-- Act as seeded operator aa (org f001), exactly as the isolation test does.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);

-- Positive: a Puppy-groom booking (the TT-019 repro) must be accepted.
insert into public.appointments
  (id, org_id, groomer_id, client_id, pet_id, date, time_slot, location, service_type, fee, status)
values
  ('00000000-0000-0000-0000-0000000000f9',
   '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1',
   '2026-07-10', '10:30am', 'gina', 'puppy_groom', 45, 'booked');

do $$
begin
  if not exists (
    select 1 from public.appointments
    where id = '00000000-0000-0000-0000-0000000000f9' and service_type = 'puppy_groom'
  ) then
    raise exception 'TT-019: puppy_groom appointment was not written';
  end if;
end $$;

-- Negative control: a genuinely invalid service_type must still be rejected, so
-- the constraint is widened, not removed.
do $$
begin
  begin
    insert into public.appointments
      (id, org_id, groomer_id, client_id, pet_id, date, time_slot, location, service_type, fee, status)
    values
      ('00000000-0000-0000-0000-0000000000fa',
       '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa',
       '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1',
       '2026-07-10', '11:30am', 'gina', 'not_a_real_service', 45, 'booked');
    raise exception 'TT-019: an invalid service_type was accepted — CHECK is too loose';
  exception
    when check_violation then null; -- expected
  end;
end $$;

reset role;
rollback;
