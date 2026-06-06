-- Synthetic seed for STAGING ONLY. No production data, ever.
--
-- Two tenants (organizations), each with its own operator and its own book, so
-- WS2.2 has cross-tenant isolation to prove against. Shapes mirror
-- lib/data/fixtures.ts (anonymized, invented). Every row carries an explicit
-- groomer_id and org_id (column defaults are null/auth.uid() outside a request).
--
-- Idempotent: re-running changes nothing (ON CONFLICT DO NOTHING + a guarded
-- backfill of any pre-existing rows that predate the org_id column).

-- Organizations (WS2.1)
insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-00000000f001', 'Tidy Tails — Samantha (tenant 1)'),
  ('00000000-0000-0000-0000-00000000f002', 'Maple Grooming Co (tenant 2)')
on conflict (id) do nothing;

-- Synthetic operators, one per org. groomer_id / membership.user_id reference these.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'authenticated', 'authenticated', 'sam.staging@tidytails.test'),
  ('00000000-0000-0000-0000-0000000000bb', 'authenticated', 'authenticated', 'maple.staging@tidytails.test')
on conflict (id) do nothing;

-- Memberships (each operator owns their org)
insert into public.organization_memberships (org_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa', 'owner'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000bb', 'owner')
on conflict (org_id, user_id) do nothing;

-- ---- Tenant 1 (org #1, operator aa) ---------------------------------------
insert into public.clients (id, org_id, groomer_id, first_name, last_name, phone, email, address, notes, tier, sms_consent, sms_consent_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa', 'Maya',  'Albright', '705-555-0118', 'maya.albright@example.com', '208 Lakeshore Rd', 'Prefers morning slots.', 'regular', true,  now()),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa', 'Theo',  'Brandt',   '705-555-0147', null,                        null,              'Two dogs — usually booked together.', 'loyal', false, null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa', 'Priya', 'Castellano','705-555-0163', 'priya.c@example.com',       null,              null, 'new', false, null)
on conflict (id) do nothing;

insert into public.pets (id, org_id, groomer_id, client_id, name, breed, size, standard_fee) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c1', 'Biscuit', 'Cavoodle',      'small',  68),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c2', 'Pepper',  'Border Collie', 'medium', 80),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c2', 'Olive',   'Border Collie', 'medium', 80),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c3', 'Kiwi',    'Terrier',       'small',  60)
on conflict (id) do nothing;

insert into public.appointments (id, org_id, groomer_id, client_id, pet_id, date, time_slot, location, service_type, fee, status) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', '2026-06-15', '10:00am', 'gina',    'full_groom', 68, 'booked'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d2', '2026-06-16', '9:00am',  'annette', 'full_groom', 80, 'booked'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d3', '2026-06-16', '9:00am',  'annette', 'full_groom', 80, 'booked'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000d4', '2026-06-10', '11:00am', 'gina',    'bath_only',  40, 'completed')
on conflict (id) do nothing;

-- ---- Tenant 2 (org #2, operator bb) — a distinct book ---------------------
insert into public.clients (id, org_id, groomer_id, first_name, last_name, phone, email, address, notes, tier, sms_consent, sms_consent_at) values
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000bb', 'Devon', 'Carrow', '705-555-0200', 'devon.carrow@example.com', '12 Pine St', null, 'regular', true,  now()),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000bb', 'Nadia', 'Holt',   '705-555-0201', null,                       null,         'Anxious — short visits.', 'new', false, null)
on conflict (id) do nothing;

insert into public.pets (id, org_id, groomer_id, client_id, name, breed, size, standard_fee) values
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000c4', 'Mochi', 'Shih Tzu', 'small',  55),
  ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000c5', 'Rex',   'Labrador', 'large',  95)
on conflict (id) do nothing;

insert into public.appointments (id, org_id, groomer_id, client_id, pet_id, date, time_slot, location, service_type, fee, status) values
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000d5', '2026-06-18', '10:00am', 'gina',    'full_groom', 55, 'booked'),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000d6', '2026-06-19', '1:00pm',  'annette', 'nail_trim',  25, 'booked')
on conflict (id) do nothing;

-- ---- Backfill: any pre-existing tenant-1 rows that predate org_id (WS1 seed)
update public.clients      set org_id = '00000000-0000-0000-0000-00000000f001' where groomer_id = '00000000-0000-0000-0000-0000000000aa' and org_id is null;
update public.pets         set org_id = '00000000-0000-0000-0000-00000000f001' where groomer_id = '00000000-0000-0000-0000-0000000000aa' and org_id is null;
update public.appointments set org_id = '00000000-0000-0000-0000-00000000f001' where groomer_id = '00000000-0000-0000-0000-0000000000aa' and org_id is null;
