-- demo_book_assert.sql — verify the demo-book seed. Run AFTER the seed, in the
-- SAME transaction (e.g. the BEGIN/ROLLBACK dry run, or after a real seed before
-- COMMIT). Raises on any failure; otherwise emits a NOTICE and returns a summary
-- row. Demo org / operator are hard-coded to match the seed.
do $$
declare
  v_org uuid := '1bf5de76-4c23-4a07-8015-7fe77e672939';
  v_op  uuid := '9592c232-0526-4754-b06c-834e7a221a6d';
  v_clients int; v_pets int; v_appts int; v_completed int; v_booked int;
  v_badgroomer int; v_bayfield int; v_coco_day int; v_bros_day int;
  v_maxday numeric; v_lapsed int;
begin
  select count(*) into v_clients   from public.clients      where org_id = v_org;
  select count(*) into v_pets      from public.pets         where org_id = v_org;
  select count(*) into v_appts     from public.appointments where org_id = v_org;
  select count(*) into v_completed from public.appointments where org_id = v_org and status = 'completed';
  select count(*) into v_booked    from public.appointments where org_id = v_org and status = 'booked';

  if v_clients   <> 29 then raise exception 'clients = % (expected 29)', v_clients; end if;
  if v_pets      <> 33 then raise exception 'pets = % (expected 33)', v_pets; end if;
  if v_appts     <> 52 then raise exception 'appointments = % (expected 52)', v_appts; end if;
  if v_completed <> 33 then raise exception 'completed = % (expected 33)', v_completed; end if;
  if v_booked    <> 19 then raise exception 'booked = % (expected 19)', v_booked; end if;

  -- Attribution: every demo row is stamped to the demo operator.
  select
    (select count(*) from public.clients      where org_id = v_org and groomer_id <> v_op) +
    (select count(*) from public.pets         where org_id = v_org and groomer_id <> v_op) +
    (select count(*) from public.appointments where org_id = v_org and groomer_id <> v_op)
    into v_badgroomer;
  if v_badgroomer <> 0 then raise exception '% demo rows have wrong groomer_id', v_badgroomer; end if;

  -- At least one completed rented-chair (Bayfield) day so the salon-cut shows.
  select count(*) into v_bayfield from public.appointments
    where org_id = v_org and status = 'completed' and location = 'Bayfield Pet Spa';
  if v_bayfield < 1 then raise exception 'no completed Bayfield (rented-chair) appts'; end if;

  -- Two Cocos appear on the same day (the on-camera disambiguation moment).
  select count(*) into v_coco_day from (
    select a.date from public.appointments a
      join public.pets p on p.id = a.pet_id
    where a.org_id = v_org and p.name = 'Coco'
    group by a.date having count(*) >= 2
  ) z;
  if v_coco_day < 1 then raise exception 'two Cocos never share a day'; end if;

  -- Castellano brothers (Olive + Gus) booked the same day.
  select count(*) into v_bros_day from (
    select a.date from public.appointments a
      join public.clients c on c.id = a.client_id
    where a.org_id = v_org and c.last_name = 'Castellano'
    group by a.date having count(*) >= 2
  ) z;
  if v_bros_day < 1 then raise exception 'Castellano brothers never share a day'; end if;

  -- A believable "full day": busiest completed day grosses $400-550.
  select max(g) into v_maxday from (
    select sum(coalesce(fee, 0) + coalesce(tip, 0)) g
    from public.appointments where org_id = v_org and status = 'completed'
    group by date
  ) z;
  if v_maxday is null or v_maxday < 400 or v_maxday > 550 then
    raise exception 'busiest completed day gross = % (expected 400-550)', v_maxday;
  end if;

  -- Lapsed clients (last visit > 56 days ago, no upcoming) feed the rebook list.
  select count(*) into v_lapsed from (
    select client_id from public.appointments where org_id = v_org
    group by client_id having max(date) < current_date - 56
  ) z;
  if v_lapsed < 4 then raise exception 'lapsed clients = % (expected >= 4)', v_lapsed; end if;

  raise notice 'demo_book_assert OK — clients=% pets=% appts=% (completed=% booked=%) bayfield=% maxday=% lapsed=%',
    v_clients, v_pets, v_appts, v_completed, v_booked, v_bayfield, v_maxday, v_lapsed;
end $$;

-- Summary row (returned to the caller).
select
  (select count(*) from public.clients      where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939') as clients,
  (select count(*) from public.pets         where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939') as pets,
  (select count(*) from public.appointments where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939') as appts,
  (select count(*) from public.appointments where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939' and status = 'completed') as completed,
  (select count(*) from public.appointments where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939' and status = 'booked') as booked,
  (select count(distinct date) from public.appointments where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939' and location = 'Bayfield Pet Spa' and status = 'completed') as bayfield_days,
  (select max(g) from (
     select sum(coalesce(fee, 0) + coalesce(tip, 0)) g
     from public.appointments where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939' and status = 'completed'
     group by date) z) as max_completed_day_gross;
