-- Rehearsal seed for the WS2.4 cutover — REHEARSAL/CI ONLY, never a real project.
--
-- Mirrors PRODUCTION'S TRUE STARTING STATE: the original baseline schema (no
-- org_id columns, no sms_consent column, per-user RLS), a single operator
-- ("Sam"), and a book of rows that all read as org_id = (column absent) i.e. the
-- pre-cutover null-org world. It deliberately seeds >=1 row in ALL 10 tenant
-- tables so the cutover's backfill is exercised on every one.
--
-- Sam's email is the REAL operator email the cutover resolves by, so the
-- rehearsal proves the email -> uid -> membership -> visibility chain end to end.
-- The uid itself is synthetic (this is a throwaway DB).
--
-- Runs as the superuser (RLS bypassed); apply AFTER baseline migration 0001 and
-- BEFORE the cutover. Idempotent (ON CONFLICT DO NOTHING).

-- Synthetic operator, addressed by the real prod email.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e0', 'authenticated', 'authenticated', 'sammclennan143@gmail.com')
on conflict (id) do nothing;

-- clients (2) — baseline columns only; no org_id / sms_consent yet.
insert into public.clients (id, groomer_id, first_name, last_name, phone, tier) values
  ('e0000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e0', 'Reed',  'Castellano', '705-555-0001', 'regular'),
  ('e0000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e0', 'Wren',  'Okafor',     '705-555-0002', 'loyal')
on conflict (id) do nothing;

-- pets (2)
insert into public.pets (id, groomer_id, client_id, name, breed, size, standard_fee) values
  ('e0000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e0', 'e0000000-0000-0000-0000-0000000000c1', 'Biscuit', 'Cavoodle',      'small',  60),
  ('e0000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e0', 'e0000000-0000-0000-0000-0000000000c2', 'Pepper',  'Border Collie', 'medium', 80)
on conflict (id) do nothing;

-- appointments (2)
insert into public.appointments (id, groomer_id, client_id, pet_id, date, time_slot, location, service_type, fee, status) values
  ('e0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e0', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000d1', '2026-07-01', '10:00am', 'gina',    'full_groom', 60, 'booked'),
  ('e0000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e0', 'e0000000-0000-0000-0000-0000000000c2', 'e0000000-0000-0000-0000-0000000000d2', '2026-07-02', '11:00am', 'annette', 'bath_only',  40, 'completed')
on conflict (id) do nothing;

-- sms_messages (1) — client_id is text in the baseline schema.
insert into public.sms_messages (id, groomer_id, client_id, direction, from_phone, to_phone, body, status) values
  ('e0000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e0', 'e0000000-0000-0000-0000-0000000000c1', 'outbound', '+17055550199', '+17055550001', 'Reminder: Biscuit tomorrow at 10.', 'sent')
on conflict (id) do nothing;

-- audit_events (1) — actor_id has no auth.uid() in a superuser session; set it.
insert into public.audit_events (id, actor_id, groomer_id, event_type, summary) values
  ('e0000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-0000000000e0', 'client.created', 'Seeded Reed Castellano.')
on conflict (id) do nothing;

-- automations_log (1)
insert into public.automations_log (id, groomer_id, client_id, type, channel, status, message) values
  ('e0000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e0', 'e0000000-0000-0000-0000-0000000000c1', 'reminder', 'sms', 'sent', 'Reminder sent to Reed.')
on conflict (id) do nothing;

-- day_closeout_overrides (1)
insert into public.day_closeout_overrides (id, groomer_id, date, location, final_payout, note) values
  ('e0000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000e0', '2026-07-01', 'gina', 120.00, 'Cash close-out.')
on conflict (id) do nothing;

-- google_calendar_connections (1) — token fields require length > 0.
insert into public.google_calendar_connections (id, groomer_id, google_email, refresh_token_ciphertext, refresh_token_iv, refresh_token_tag) values
  ('e0000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000e0', 'sam@example.com', 'ct', 'iv', 'tag')
on conflict (id) do nothing;

-- booking_requests (1)
insert into public.booking_requests (id, groomer_id, requested_date, status) values
  ('e0000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-0000000000e0', '2026-07-05', 'pending')
on conflict (id) do nothing;

-- client_accounts (1)
insert into public.client_accounts (id, groomer_id, client_id, pin_code, phone) values
  ('e0000000-0000-0000-0000-0000000000cc', '00000000-0000-0000-0000-0000000000e0', 'e0000000-0000-0000-0000-0000000000c1', '1234', '705-555-9999')
on conflict (id) do nothing;
