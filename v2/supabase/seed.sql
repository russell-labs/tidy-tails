-- Synthetic seed for STAGING ONLY. No production data, ever.
--
-- Shapes mirror lib/data/fixtures.ts (anonymized, invented). Run against the
-- staging project after the migrations are applied. Every row carries an
-- explicit groomer_id (the column default auth.uid() is null outside a request),
-- pointing at a single synthetic operator created below so the FKs resolve.
--
-- Idempotent: re-running it changes nothing (ON CONFLICT DO NOTHING).

-- A synthetic operator. groomer_id references auth.users(id); staging has no
-- real users, so we create one. Only `id` is required on auth.users.
insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000aa', 'authenticated', 'authenticated', 'sam.staging@tidytails.test')
on conflict (id) do nothing;

-- Clients (a couple consented to texts, the rest not — WS0 default).
insert into public.clients (id, groomer_id, first_name, last_name, phone, email, address, notes, tier, sms_consent, sms_consent_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000aa', 'Maya',  'Albright', '705-555-0118', 'maya.albright@example.com', '208 Lakeshore Rd', 'Prefers morning slots.', 'regular', true,  now()),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000aa', 'Theo',  'Brandt',   '705-555-0147', null,                        null,              'Two dogs — usually booked together.', 'loyal', false, null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000aa', 'Priya', 'Castellano','705-555-0163', 'priya.c@example.com',       null,              null, 'new', false, null)
on conflict (id) do nothing;

-- Pets
insert into public.pets (id, groomer_id, client_id, name, breed, size, standard_fee) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c1', 'Biscuit', 'Cavoodle',        'small',  68),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c2', 'Pepper',  'Border Collie',   'medium', 80),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c2', 'Olive',   'Border Collie',   'medium', 80),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c3', 'Kiwi',    'Terrier',         'small',  60)
on conflict (id) do nothing;

-- Appointments (service_type/location/status satisfy the CHECK constraints).
insert into public.appointments (id, groomer_id, client_id, pet_id, date, time_slot, location, service_type, fee, status) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', '2026-06-15', '10:00am', 'gina',    'full_groom', 68, 'booked'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d2', '2026-06-16', '9:00am',  'annette', 'full_groom', 80, 'booked'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d3', '2026-06-16', '9:00am',  'annette', 'full_groom', 80, 'booked'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000d4', '2026-06-10', '11:00am', 'gina',    'bath_only',  40, 'completed')
on conflict (id) do nothing;
