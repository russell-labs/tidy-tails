-- Demo-book seed — "Rusty's Dog House" (the launch/update-video demo org).
--
-- Fills the demo org with a believable full groom book: client roster, pet
-- history with logged grooms/notes/tips/payments, a 2-week completed past, a
-- 2-week booked future, 4 lapsed clients, and a rented-chair (salon-cut) day.
-- Everything is fictional; phones are 555 (non-routable).
--
-- TARGET (hard-coded, staging only):
--   org      1bf5de76-4c23-4a07-8015-7fe77e672939   ("Rusty's Dog House")
--   operator 9592c232-0526-4754-b06c-834e7a221a6d   (russellcolevop@gmail.com)
-- Production is NEVER referenced. groomer_id is set explicitly because
-- auth.uid() is null in a service-role / raw SQL session.
--
-- ISOLATION: every DELETE and INSERT is scoped to the demo org_id above. No
-- other org's rows are read or written. A guard aborts if the org is missing.
--
-- IDEMPOTENT + DATE-ANCHORED: dates anchor to current_date (T) at run time, and
-- the script clears ONLY the demo org then re-inserts — so re-running before a
-- filming session refreshes the schedule. Fixed deterministic UUIDs
-- (dab0…=client, da70…=pet) make re-runs stable.
--
-- HOW TO RUN (must be a single transaction; the temp roster requires it):
--   real:    psql "$STAGING_DB_URL" --single-transaction -f 2026-06-13_demo_book_seed.sql
--   dry-run: wrap with BEGIN; \i 2026-06-13_demo_book_seed.sql \i demo_book_assert.sql ROLLBACK;
-- This file intentionally has NO begin/commit so the caller controls the txn.

-- ---------------------------------------------------------------------------
-- Guard: refuse to run unless the demo org exists (never auto-create it).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from public.organizations
    where id = '1bf5de76-4c23-4a07-8015-7fe77e672939'
  ) then
    raise exception 'Demo org 1bf5de76-... not found — refusing to seed.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Wipe ONLY the demo org (child tables first, then pets, then clients).
-- ---------------------------------------------------------------------------
delete from public.appointments        where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939';
delete from public.booking_requests    where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939';
delete from public.automations_log     where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939';
delete from public.audit_events        where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939';
delete from public.client_accounts     where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939';
delete from public.daily_income        where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939';
delete from public.day_closeout_overrides where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939';
delete from public.sms_messages        where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939';
delete from public.pets                where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939';
delete from public.clients             where org_id = '1bf5de76-4c23-4a07-8015-7fe77e672939';

-- ---------------------------------------------------------------------------
-- Rewrite the demo org's settings: 1:1 hybrid with Home Studio (owned, 100%)
-- and Bayfield Pet Spa (rented, salon keeps 30%). Appointment location strings
-- below match these names verbatim so owner take-home + the rented split
-- attribute correctly.
-- ---------------------------------------------------------------------------
insert into public.org_settings (org_id, scheduling_style, settings, updated_at)
values (
  '1bf5de76-4c23-4a07-8015-7fe77e672939',
  'one_to_one',
  jsonb_build_object(
    'businessStructure', 'hybrid',
    'operatorName', 'Rusty',
    'locations', jsonb_build_array(
      jsonb_build_object(
        'type', 'owned', 'name', 'Home Studio',
        'address', '14 Birchwood Cres, Orillia',
        'expenses', jsonb_build_object(
          'rentMortgage', 1200, 'utilities', 220, 'supplies', 180,
          'upkeep', 90, 'cleaning', 60
        )
      ),
      jsonb_build_object(
        'type', 'rented', 'name', 'Bayfield Pet Spa',
        'address', '120 Bayfield St, Barrie',
        'payoutType', 'percent', 'salonKeepsPercent', 30, 'dailyRate', null
      )
    )
  ),
  now()
)
on conflict (org_id) do update
  set scheduling_style = excluded.scheduling_style,
      settings = excluded.settings,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Roster (source of truth). One row per pet; client fields denormalized.
-- size ∈ small/medium/large/xl; service_type ∈ full_groom/bath_only/nail_trim/
-- other. Dataset→schema service mapping: deshed package → 'other'; a puppy intro
-- groom → 'full_groom' (staging's service_type CHECK has no 'puppy_groom' — the
-- TT-019 widening is not applied here; the note carries the "puppy" context).
-- freq_weeks ∈ schema enum {2,3,4,6,7,8,12} (Reyes "5 wks" → 4, the closest valid).
--   past_day  1..10 → index into the 10 most-recent Tue–Sat dates (completed)
--   future_day 1..10 → index into the next 10 Tue–Sat dates (booked); null = no rebook
--   lapsed_weeks → a single completed visit that many weeks ago, no upcoming
-- ---------------------------------------------------------------------------
create temporary table _roster (
  pet_ord int, client_ord int,
  first_name text, last_name text, phone text, address text,
  tier text, freq_weeks int,
  pet_name text, breed text, size text, service text, note text, behavior text,
  past_day int, past_loc text, future_day int, lapsed_weeks int
) on commit drop;

insert into _roster values
 (1 ,1 ,'Mara','Hayes','705-555-0142','14 Birchwood Cres','loyal',4,'Maple','Goldendoodle','large','full_groom','Thick curly coat, loves the dryer. #4 body, teddy face.',null,3,'Home Studio',2,null),
 (2 ,2 ,'Tomi','Okafor','705-555-0188','9 Coldwater Rd','regular',6,'Biscuit','Cockapoo','small','full_groom','Mats behind ears — watched closely, no shave needed.',null,1,'Home Studio',1,null),
 (3 ,3 ,'Gia','Romano','705-555-0119','221 King St E','regular',8,'Nala','Bernese Mountain Dog','xl','other','Heavy undercoat, full deshed, took 2 hrs.','Muzzle for nails',4,'Home Studio',8,null),
 (4 ,3 ,'Gia','Romano','705-555-0119','221 King St E','regular',8,'Pepper','Miniature Schnauzer','small','full_groom','#4 body, schnauzer legs left longer.',null,6,'Home Studio',6,null),
 (5 ,4 ,'Pia','Whitfield','705-555-0207','5 Maple Dr','regular',6,'Coco','Shih Tzu','small','full_groom','Puppy cut, wiggly — went slow.',null,8,'Bayfield Pet Spa',null,null),
 (6 ,5 ,'Luis','Delgado','705-555-0163','48 Peter St N','loyal',4,'Rocco','Standard Poodle','large','full_groom','#7 face, owner declined continental.',null,3,'Home Studio',4,null),
 (7 ,6 ,'Ada','Booth','705-555-0291','17 Mississaga St W','regular',6,'Daisy','Cavalier King Charles Spaniel','small','full_groom','Feathered legs left natural.',null,1,'Home Studio',1,null),
 (8 ,7 ,'Minh','Nguyen','705-555-0134','62 Front St S','regular',6,'Mochi','Pomeranian','small','full_groom','Sensitive on hindquarters — gentle.',null,3,'Home Studio',5,null),
 (9 ,8 ,'Cole','Abbott','705-555-0250','3 Tecumseth St','regular',8,'Bruno','Labrador Retriever','large','bath_only','Bath & tidy, nails ground not clipped per owner.',null,9,'Home Studio',null,null),
 (10,9 ,'Rosa','Sandoval','705-555-0176','88 West St N','loyal',6,'Lola','Yorkshire Terrier','small','full_groom','Top-knot tied.',null,3,'Home Studio',null,null),
 (11,9 ,'Rosa','Sandoval','705-555-0176','88 West St N','loyal',6,'Tank','French Bulldog','small','bath_only','Bath, fold cleaning.',null,3,'Home Studio',null,null),
 (12,10,'Dev','Pryce','705-555-0228','11 Colborne St E','loyal',4,'Hazel','Mini Goldendoodle','medium','full_groom','Teddy face, #2 body, left legs a touch longer.',null,5,'Home Studio',2,null),
 (13,11,'Sven','Iverson','705-555-0155','7 Neywash St','regular',6,'Murphy','Wheaten Terrier','medium','full_groom','Soft coat, no clippers on face.',null,2,'Home Studio',6,null),
 (14,12,'Nico','Castellano','705-555-0299','40 Borland St E','loyal',6,'Olive','Havanese','small','full_groom','Havanese — brothers booked together with Gus.',null,7,'Home Studio',9,null),
 (15,12,'Nico','Castellano','705-555-0299','40 Borland St E','loyal',6,'Gus','Havanese','small','full_groom','Havanese — brothers booked together with Olive.',null,7,'Home Studio',9,null),
 (16,13,'Jas','Brar','705-555-0181','25 Coldwater Rd','regular',8,'Simba','Chow mix','large','other','Heavy blowout, muzzle for nails.','Muzzle for nails',4,'Home Studio',8,null),
 (17,14,'Elle','Fontaine','705-555-0103','19 Jarvis St','regular',8,'Winnie','West Highland Terrier','small','full_groom','Hand-strip skipped, clipper #4.',null,2,'Home Studio',3,null),
 (18,15,'Pat','Doyle','705-555-0264','6 Albert St N','regular',12,'Bear','Newfoundland','xl','other','Deshed package, 2 hr.',null,4,'Home Studio',null,null),
 (19,16,'Remo','Marchetti','705-555-0117','33 Elgin St','regular',6,'Ziggy','Maltipoo','small','full_groom','Eye-area gentle.',null,3,'Home Studio',null,null),
 (20,17,'Kofi','Osei','705-555-0245','71 Gill St','new',null,'Coco','Doodle','large','full_groom','Second Coco on the book — confirm household (Osei) before booking.',null,8,'Bayfield Pet Spa',null,null),
 (21,18,'Eva','Lindqvist','705-555-0192','4 Brant St','regular',12,'Freya','Samoyed','large','other','Full coat, no shave — deshed only.',null,10,'Home Studio',null,null),
 (22,19,'Iva','Petrov','705-555-0138','58 Dunlop St','regular',8,'Boris','Rottweiler','large','bath_only','Bath & nails, gentle giant.','Gentle giant',5,'Home Studio',5,null),
 (23,20,'Sam','Whitaker','705-555-0276','2 Bay St','loyal',6,'Pickles','Dachshund','small','nail_trim','Ears + nails.',null,5,'Home Studio',4,null),
 (24,20,'Sam','Whitaker','705-555-0276','2 Bay St','loyal',6,'Olive','Beagle','medium','full_groom','Beagle — not the Havanese Olive; confirm household (Whitaker).',null,7,'Home Studio',null,null),
 (25,21,'Abe','Asante','705-555-0149','84 Mary St','new',null,'Kobe','Cane Corso','medium','full_groom','Puppy first groom — kept it short and positive, lots of breaks.','Puppy — first groom',8,'Bayfield Pet Spa',10,null),
 (26,22,'Rey','Reyes','705-555-0211','13 Toronto St','vip',4,'Luna','Goldendoodle','large','full_groom','Matting prone — recommend 5 wks (booked 4).',null,8,'Bayfield Pet Spa',3,null),
 (27,23,'Ian','McAllister','705-555-0167','27 Wellington St W','regular',6,'Angus','Scottish Terrier','small','full_groom','#7 body, owner declined schnauzer face.',null,2,'Home Studio',7,null),
 (28,24,'Noa','Tremblay','705-555-0184','50 Andrew St','regular',8,'Remy','Australian Shepherd','medium','other','Deshed, leave tail full.',null,6,'Home Studio',7,null),
 (29,25,'Bal','Singh','705-555-0258','9 Ontario St','new',null,'Roo','Cavapoo','small','full_groom','First visit, nervous — went slow, finished clean.','Nervous — go slow',8,'Bayfield Pet Spa',null,null),
 (30,26,'Hye','Cho','705-555-0125','15 Coldwater Rd','regular',6,'Bandit','Shetland Sheepdog','medium','full_groom','Sheltie — full groom, line-brushed.',null,null,null,null,10),
 (31,27,'Tess','Vance','705-555-0233','22 Mary St','regular',6,'Ruby','Cocker Spaniel','medium','full_groom','Spaniel — full groom, ears cleaned.',null,null,null,null,12),
 (32,28,'Min','Park','705-555-0198','9 Elgin St','regular',6,'Tofu','Bichon Frise','small','full_groom','Bichon — round trim, tear-stain wipe.',null,null,null,null,9),
 (33,29,'Rui','Ferreira','705-555-0146','40 West St N','regular',8,'Diesel','Boxer','large','bath_only','Boxer — bath & nails.',null,null,null,null,11);

-- ---------------------------------------------------------------------------
-- Clients (one per client_ord).
-- ---------------------------------------------------------------------------
insert into public.clients
  (id, org_id, groomer_id, first_name, last_name, phone, address, tier,
   preferred_frequency_weeks, created_at, updated_at)
select distinct on (r.client_ord)
  ('dab00000-0000-4000-8000-' || lpad(to_hex(r.client_ord), 12, '0'))::uuid,
  '1bf5de76-4c23-4a07-8015-7fe77e672939',
  '9592c232-0526-4754-b06c-834e7a221a6d',
  r.first_name, r.last_name, r.phone, r.address, r.tier, r.freq_weeks,
  now(), now()
from _roster r
order by r.client_ord;

-- ---------------------------------------------------------------------------
-- Pets. standard_fee is the pet's usual fee for its size/service.
-- ---------------------------------------------------------------------------
insert into public.pets
  (id, org_id, groomer_id, client_id, name, breed, size, standard_fee,
   grooming_notes, behavior_flags, created_at)
select
  ('da700000-0000-4000-8000-' || lpad(to_hex(r.pet_ord), 12, '0'))::uuid,
  '1bf5de76-4c23-4a07-8015-7fe77e672939',
  '9592c232-0526-4754-b06c-834e7a221a6d',
  ('dab00000-0000-4000-8000-' || lpad(to_hex(r.client_ord), 12, '0'))::uuid,
  r.pet_name, r.breed, r.size,
  case r.service
    when 'full_groom'  then case r.size when 'small' then 65 when 'medium' then 75 when 'large' then 85 when 'xl' then 95 end
    when 'bath_only'   then case r.size when 'small' then 40 when 'medium' then 45 when 'large' then 50 when 'xl' then 55 end
    when 'puppy_groom' then 45
    when 'nail_trim'   then 18
    when 'other'       then case r.size when 'medium' then 85 when 'large' then 100 when 'xl' then 120 else 85 end
  end,
  r.note, r.behavior, now()
from _roster r;

-- ---------------------------------------------------------------------------
-- Appointments. Completed (past + lapsed) carry fee/tip/payment-marker/net;
-- booked (future) carry the quoted fee only. Tips on ~60% of completed; payment
-- alternates cash/interac. time_slot is a distinct clock time per day.
-- ---------------------------------------------------------------------------
insert into public.appointments
  (id, org_id, groomer_id, client_id, pet_id, date, time_slot, location,
   service_type, fee, tip, net, status, notes, duration_minutes, created_at)
with pd as (
  select array_agg(d order by d) as arr from (
    select ts::date d
    from generate_series(current_date - 28, current_date - 1, interval '1 day') as g(ts)
    where extract(dow from ts) in (2,3,4,5,6)
    order by ts desc limit 10
  ) z
),
fd as (
  select array_agg(d order by d) as arr from (
    select ts::date d
    from generate_series(current_date, current_date + 27, interval '1 day') as g(ts)
    where extract(dow from ts) in (2,3,4,5,6)
    order by ts asc limit 10
  ) z
),
visits as (
  select r.pet_ord, r.client_ord, r.size, r.service, r.note,
         'completed'::text as status, pd.arr[r.past_day] as date, r.past_loc as location
  from _roster r cross join pd
  where r.past_day is not null
  union all
  select r.pet_ord, r.client_ord, r.size, r.service, r.note,
         'completed', (current_date - (r.lapsed_weeks * 7 + (r.pet_ord % 3)))::date, 'Home Studio'
  from _roster r
  where r.lapsed_weeks is not null
  union all
  select r.pet_ord, r.client_ord, r.size, r.service, r.note,
         'booked', fd.arr[r.future_day], 'Home Studio'
  from _roster r cross join fd
  where r.future_day is not null
),
calc as (
  select v.*,
    row_number() over (partition by v.date order by v.pet_ord) as rn,
    case v.service
      when 'full_groom'  then case v.size when 'small' then 65 when 'medium' then 75 when 'large' then 85 when 'xl' then 95 end
      when 'bath_only'   then case v.size when 'small' then 40 when 'medium' then 45 when 'large' then 50 when 'xl' then 55 end
      when 'puppy_groom' then 45
      when 'nail_trim'   then 18
      when 'other'       then case v.size when 'medium' then 85 when 'large' then 100 when 'xl' then 120 else 85 end
    end as fee,
    case v.service
      when 'full_groom'  then case v.size when 'small' then 75 when 'medium' then 85 when 'large' then 95 when 'xl' then 105 end
      when 'bath_only'   then 50
      when 'puppy_groom' then 45
      when 'nail_trim'   then 15
      when 'other'       then case v.size when 'xl' then 120 else 100 end
    end as duration,
    case when v.status = 'completed'
      then case when v.pet_ord % 5 < 2 then 0
                else case v.pet_ord % 4 when 0 then 5 when 1 then 10 when 2 then 15 else 20 end end
      else 0 end as tip,
    case when v.pet_ord % 2 = 0 then 'cash' else 'interac' end as pay
  from visits v
)
select
  gen_random_uuid(),
  '1bf5de76-4c23-4a07-8015-7fe77e672939',
  '9592c232-0526-4754-b06c-834e7a221a6d',
  ('dab00000-0000-4000-8000-' || lpad(to_hex(c.client_ord), 12, '0'))::uuid,
  ('da700000-0000-4000-8000-' || lpad(to_hex(c.pet_ord), 12, '0'))::uuid,
  c.date,
  (array['9:00am','10:00am','11:00am','12:30pm','2:00pm','3:00pm','4:00pm'])[((c.rn - 1) % 7) + 1],
  c.location,
  c.service,
  c.fee,
  c.tip,
  case when c.status = 'completed' then c.fee + c.tip else null end,
  c.status,
  case when c.status = 'completed'
    then c.note || ' [payment:' || c.pay || '; payment_status:paid]'
    else c.note end,
  c.duration,
  now()
from calc c;
