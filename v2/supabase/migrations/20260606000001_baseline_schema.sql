-- Baseline schema for Tidy Tails (public schema).
--
-- Captured READ-ONLY from production (ref pgkwovokciaqnbhpttba) on 2026-06-06 via
-- pg_catalog introspection (no pg_dump / DB password available in this slice;
-- this can be regenerated later with `supabase db pull` once CLI auth exists).
-- It reproduces the production public schema on a fresh Supabase project.
-- Supabase-managed schemas (auth, storage, graphql, ...), the auth.uid()
-- function, the standard extensions, and the default table privileges for
-- anon/authenticated/service_role are assumed already present (they ship with
-- every Supabase project), so they are intentionally NOT recreated here.

-- ---------------------------------------------------------------------------
-- Extensions (provide uuid_generate_v4 / gen_random_uuid used by id defaults).
-- No-ops on a standard Supabase project; listed for a truly bare database.
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Auto-enables RLS on any new table created in the public schema. SECURITY
-- DEFINER with a pinned search_path. Execute is restricted (see REVOKE below) so
-- only postgres/service_role can call it directly, matching production.
create or replace function public.rls_auto_enable()
 returns event_trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Production restricts execute to postgres + service_role (Phase 0 hardening).
revoke all on function public.rls_auto_enable() from public;
revoke all on function public.rls_auto_enable() from anon;
revoke all on function public.rls_auto_enable() from authenticated;

-- Stamps updated_at on row update.
create or replace function public.update_updated_at_column()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Tables (columns + defaults; primary keys inline. Foreign keys, unique and
-- check constraints are added after all tables exist to avoid ordering issues.)
-- ---------------------------------------------------------------------------

create table public.clients (
  id uuid not null default uuid_generate_v4(),
  first_name text,
  last_name text,
  phone text,
  email text,
  preferred_location text,
  preferred_day text,
  preferred_frequency_weeks integer,
  notes text,
  tier text default 'new'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  address text,
  home_phone text,
  referral_source text,
  alt_contact text,
  groomer_id uuid not null default auth.uid(),
  constraint clients_pkey primary key (id)
);

create table public.pets (
  id uuid not null default uuid_generate_v4(),
  client_id uuid not null,
  name text,
  breed text,
  size text,
  grooming_style text,
  temperament_notes text,
  medical_notes text,
  vet_contact text,
  vaccination_status text,
  created_at timestamptz default now(),
  sex text,
  color text,
  age text,
  weight_lbs numeric,
  spayed_neutered boolean default false,
  allergies boolean default false,
  allergies_detail text,
  standard_fee numeric(10,2),
  clip_style text,
  grooming_notes text,
  behavior_flags text,
  groomer_id uuid not null default auth.uid(),
  constraint pets_pkey primary key (id)
);

create table public.appointments (
  id uuid not null default uuid_generate_v4(),
  client_id uuid not null,
  pet_id uuid not null,
  date date not null,
  time_slot text,
  location text,
  service_type text,
  fee numeric(10,2),
  tip numeric(10,2) default 0,
  rent_paid numeric(10,2) default 0,
  net numeric(10,2),
  status text default 'booked'::text,
  notes text,
  created_at timestamptz default now(),
  groomer_id uuid not null default auth.uid(),
  google_calendar_id text,
  google_event_id text,
  google_sync_status text,
  google_sync_error text,
  google_synced_at timestamptz,
  constraint appointments_pkey primary key (id)
);

create table public.audit_events (
  id uuid not null default uuid_generate_v4(),
  actor_id uuid not null default auth.uid(),
  event_type text not null,
  client_id uuid,
  pet_id uuid,
  appointment_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  groomer_id uuid not null default auth.uid(),
  constraint audit_events_pkey primary key (id)
);

create table public.automations_log (
  id uuid not null default uuid_generate_v4(),
  client_id uuid not null,
  type text,
  sent_at timestamptz,
  channel text,
  status text default 'sent'::text,
  message text,
  groomer_id uuid not null default auth.uid(),
  constraint automations_log_pkey primary key (id)
);

create table public.booking_requests (
  id uuid not null default uuid_generate_v4(),
  client_id uuid,
  client_account_id uuid,
  pet_id uuid,
  requested_date date not null,
  requested_time_slot text,
  preferred_location text,
  service_type text,
  status text default 'pending'::text,
  ai_suggested_slot jsonb,
  admin_notes text,
  denial_reason text,
  client_message text,
  created_at timestamptz default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  groomer_id uuid not null default auth.uid(),
  constraint booking_requests_pkey primary key (id)
);

create table public.client_accounts (
  id uuid not null default uuid_generate_v4(),
  client_id uuid,
  pin_code text not null,
  phone text not null,
  display_name text,
  birthday date,
  secondary_contacts jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  groomer_id uuid not null default auth.uid(),
  constraint client_accounts_pkey primary key (id)
);

create table public.day_closeout_overrides (
  id uuid not null default gen_random_uuid(),
  groomer_id uuid not null default auth.uid(),
  date date not null,
  location text not null,
  final_payout numeric(10,2) not null,
  calculated_payout numeric(10,2),
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint day_closeout_overrides_pkey primary key (id)
);

create table public.google_calendar_connections (
  id uuid not null default uuid_generate_v4(),
  groomer_id uuid not null default auth.uid(),
  google_email text not null,
  calendar_id text not null default 'primary'::text,
  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  refresh_token_tag text not null,
  scope text,
  token_type text,
  expiry_date timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_connections_pkey primary key (id)
);

create table public.sam_review_responses (
  id uuid not null default uuid_generate_v4(),
  session_id text not null,
  reviewer_name text default 'Samantha'::text,
  question_id text not null,
  question_category text,
  answer text,
  notes text,
  is_completion_marker boolean default false,
  user_agent text,
  submitted_at timestamptz not null default now(),
  constraint sam_review_responses_pkey primary key (id)
);

create table public.sms_messages (
  id uuid not null default gen_random_uuid(),
  groomer_id uuid not null default auth.uid(),
  client_id text,
  direction text not null,
  from_phone text not null,
  to_phone text not null,
  body text not null,
  twilio_message_sid text,
  status text not null default 'received'::text,
  match_status text,
  received_at timestamptz default now(),
  sent_at timestamptz,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sms_messages_pkey primary key (id)
);

-- ---------------------------------------------------------------------------
-- Foreign keys (groomer_id / actor_id reference Supabase auth.users)
-- ---------------------------------------------------------------------------
alter table public.appointments add constraint appointments_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.appointments add constraint appointments_pet_id_fkey foreign key (pet_id) references pets(id) on delete cascade;
alter table public.appointments add constraint appointments_groomer_id_fkey foreign key (groomer_id) references auth.users(id);

alter table public.audit_events add constraint audit_events_client_id_fkey foreign key (client_id) references clients(id) on delete set null;
alter table public.audit_events add constraint audit_events_pet_id_fkey foreign key (pet_id) references pets(id) on delete set null;
alter table public.audit_events add constraint audit_events_appointment_id_fkey foreign key (appointment_id) references appointments(id) on delete set null;
alter table public.audit_events add constraint audit_events_actor_id_fkey foreign key (actor_id) references auth.users(id);
alter table public.audit_events add constraint audit_events_groomer_id_fkey foreign key (groomer_id) references auth.users(id);

alter table public.automations_log add constraint automations_log_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.automations_log add constraint automations_log_groomer_id_fkey foreign key (groomer_id) references auth.users(id);

alter table public.booking_requests add constraint booking_requests_client_id_fkey foreign key (client_id) references clients(id);
alter table public.booking_requests add constraint booking_requests_client_account_id_fkey foreign key (client_account_id) references client_accounts(id);
alter table public.booking_requests add constraint booking_requests_pet_id_fkey foreign key (pet_id) references pets(id);
alter table public.booking_requests add constraint booking_requests_groomer_id_fkey foreign key (groomer_id) references auth.users(id);

alter table public.client_accounts add constraint client_accounts_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.client_accounts add constraint client_accounts_groomer_id_fkey foreign key (groomer_id) references auth.users(id);

alter table public.clients add constraint clients_groomer_id_fkey foreign key (groomer_id) references auth.users(id);

alter table public.day_closeout_overrides add constraint day_closeout_overrides_groomer_id_fkey foreign key (groomer_id) references auth.users(id);

alter table public.pets add constraint pets_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.pets add constraint pets_groomer_id_fkey foreign key (groomer_id) references auth.users(id);

alter table public.sms_messages add constraint sms_messages_groomer_id_fkey foreign key (groomer_id) references auth.users(id);

-- ---------------------------------------------------------------------------
-- Unique constraints
-- ---------------------------------------------------------------------------
alter table public.client_accounts add constraint client_accounts_phone_key unique (phone);
alter table public.day_closeout_overrides add constraint day_closeout_overrides_groomer_id_date_location_key unique (groomer_id, date, location);
alter table public.google_calendar_connections add constraint google_calendar_connections_groomer_unique unique (groomer_id);

-- ---------------------------------------------------------------------------
-- Check constraints
-- ---------------------------------------------------------------------------
alter table public.appointments add constraint appointments_google_sync_status_check check (((google_sync_status IS NULL) OR (google_sync_status = ANY (ARRAY['synced'::text, 'failed'::text, 'skipped'::text]))));
alter table public.appointments add constraint appointments_location_check check ((location = ANY (ARRAY['annette'::text, 'gina'::text])));
alter table public.appointments add constraint appointments_service_type_check check ((service_type = ANY (ARRAY['full_groom'::text, 'bath_only'::text, 'nail_trim'::text, 'other'::text])));
alter table public.appointments add constraint appointments_status_check check ((status = ANY (ARRAY['booked'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text])));

alter table public.automations_log add constraint automations_log_channel_check check ((channel = ANY (ARRAY['sms'::text, 'email'::text])));
alter table public.automations_log add constraint automations_log_status_check check ((status = ANY (ARRAY['sent'::text, 'delivered'::text, 'failed'::text])));
alter table public.automations_log add constraint automations_log_type_check check ((type = ANY (ARRAY['follow_up'::text, 'reminder'::text, 'rebook_prompt'::text, 'no_show'::text])));

alter table public.booking_requests add constraint booking_requests_preferred_location_check check ((preferred_location = ANY (ARRAY['annette'::text, 'gina'::text])));
alter table public.booking_requests add constraint booking_requests_service_type_check check ((service_type = ANY (ARRAY['full_groom'::text, 'bath_only'::text, 'nail_trim'::text, 'other'::text])));
alter table public.booking_requests add constraint booking_requests_status_check check ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'rescheduled'::text, 'cancelled'::text])));

alter table public.clients add constraint clients_preferred_frequency_weeks_check check ((preferred_frequency_weeks = ANY (ARRAY[2, 3, 4, 6, 7, 8, 12])));
alter table public.clients add constraint clients_preferred_location_check check ((preferred_location = ANY (ARRAY['annette'::text, 'gina'::text])));
alter table public.clients add constraint clients_tier_check check ((tier = ANY (ARRAY['new'::text, 'regular'::text, 'loyal'::text, 'vip'::text])));

alter table public.day_closeout_overrides add constraint day_closeout_overrides_calculated_payout_check check (((calculated_payout IS NULL) OR (calculated_payout >= (0)::numeric)));
alter table public.day_closeout_overrides add constraint day_closeout_overrides_final_payout_check check ((final_payout >= (0)::numeric));
alter table public.day_closeout_overrides add constraint day_closeout_overrides_location_check check ((location = ANY (ARRAY['gina'::text, 'annette'::text])));
alter table public.day_closeout_overrides add constraint day_closeout_overrides_note_check check (((char_length(TRIM(BOTH FROM note)) >= 1) AND (char_length(TRIM(BOTH FROM note)) <= 500)));

alter table public.google_calendar_connections add constraint google_calendar_connections_groomer_id_present check ((groomer_id IS NOT NULL));
alter table public.google_calendar_connections add constraint google_calendar_connections_token_present check (((length(refresh_token_ciphertext) > 0) AND (length(refresh_token_iv) > 0) AND (length(refresh_token_tag) > 0)));

alter table public.pets add constraint pets_size_check check ((size = ANY (ARRAY['small'::text, 'medium'::text, 'large'::text, 'xl'::text])));

alter table public.sms_messages add constraint sms_messages_direction_check check ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])));

-- ---------------------------------------------------------------------------
-- Indexes (non-constraint; constraint-backed indexes are created above)
-- ---------------------------------------------------------------------------
create index idx_appointments_client_id on public.appointments using btree (client_id);
create index idx_appointments_date on public.appointments using btree (date);
create index idx_appointments_google_event_id on public.appointments using btree (google_event_id) where (google_event_id is not null);
create index idx_appointments_pet_id on public.appointments using btree (pet_id);
create index idx_appointments_status on public.appointments using btree (status);

create index idx_audit_events_client_id on public.audit_events using btree (client_id);
create index idx_audit_events_event_type on public.audit_events using btree (event_type);
create index idx_audit_events_groomer_created_at on public.audit_events using btree (groomer_id, created_at desc);

create index idx_automations_log_client_id on public.automations_log using btree (client_id);
create index idx_automations_log_sent_at on public.automations_log using btree (sent_at);

create index idx_booking_requests_date on public.booking_requests using btree (requested_date);
create index idx_booking_requests_status on public.booking_requests using btree (status);

create index idx_client_accounts_phone on public.client_accounts using btree (phone);

create index idx_clients_created_at on public.clients using btree (created_at);
create index idx_clients_email on public.clients using btree (email);
create index idx_clients_phone on public.clients using btree (phone);

create index day_closeout_overrides_groomer_date_idx on public.day_closeout_overrides using btree (groomer_id, date);

create index idx_pets_client_id on public.pets using btree (client_id);
create index idx_pets_created_at on public.pets using btree (created_at);

create index idx_sam_review_question on public.sam_review_responses using btree (question_id);
create index idx_sam_review_session_time on public.sam_review_responses using btree (session_id, submitted_at);

create index sms_messages_client_created_idx on public.sms_messages using btree (client_id, created_at desc);
create index sms_messages_groomer_created_idx on public.sms_messages using btree (groomer_id, created_at desc);
create unique index sms_messages_twilio_message_sid_full_key on public.sms_messages using btree (twilio_message_sid);
create unique index sms_messages_twilio_message_sid_key on public.sms_messages using btree (twilio_message_sid) where (twilio_message_sid is not null);

-- ---------------------------------------------------------------------------
-- Row Level Security (enabled on every table; production parity)
-- ---------------------------------------------------------------------------
alter table public.appointments enable row level security;
alter table public.audit_events enable row level security;
alter table public.automations_log enable row level security;
alter table public.booking_requests enable row level security;
alter table public.client_accounts enable row level security;
alter table public.clients enable row level security;
alter table public.day_closeout_overrides enable row level security;
alter table public.google_calendar_connections enable row level security;
alter table public.pets enable row level security;
alter table public.sam_review_responses enable row level security; -- RLS on, no policies (production parity)
alter table public.sms_messages enable row level security;

-- ---------------------------------------------------------------------------
-- Policies (per-operator: groomer_id = auth.uid()). Roles match production:
-- most target `public`; google_calendar_connections and sms_messages target
-- `authenticated`.
-- ---------------------------------------------------------------------------
create policy "groomer_select" on public.appointments for select to public using (groomer_id = auth.uid());
create policy "groomer_insert" on public.appointments for insert to public with check (groomer_id = auth.uid());
create policy "groomer_update" on public.appointments for update to public using (groomer_id = auth.uid()) with check (groomer_id = auth.uid());
create policy "groomer_delete" on public.appointments for delete to public using (groomer_id = auth.uid());

create policy "groomer_select" on public.audit_events for select to public using (groomer_id = auth.uid());
create policy "groomer_insert" on public.audit_events for insert to public with check ((groomer_id = auth.uid()) and (actor_id = auth.uid()));

create policy "groomer_select" on public.automations_log for select to public using (groomer_id = auth.uid());
create policy "groomer_insert" on public.automations_log for insert to public with check (groomer_id = auth.uid());
create policy "groomer_update" on public.automations_log for update to public using (groomer_id = auth.uid()) with check (groomer_id = auth.uid());
create policy "groomer_delete" on public.automations_log for delete to public using (groomer_id = auth.uid());

create policy "groomer_select" on public.booking_requests for select to public using (groomer_id = auth.uid());
create policy "groomer_insert" on public.booking_requests for insert to public with check (groomer_id = auth.uid());
create policy "groomer_update" on public.booking_requests for update to public using (groomer_id = auth.uid()) with check (groomer_id = auth.uid());
create policy "groomer_delete" on public.booking_requests for delete to public using (groomer_id = auth.uid());

create policy "groomer_select" on public.client_accounts for select to public using (groomer_id = auth.uid());
create policy "groomer_insert" on public.client_accounts for insert to public with check (groomer_id = auth.uid());
create policy "groomer_update" on public.client_accounts for update to public using (groomer_id = auth.uid()) with check (groomer_id = auth.uid());
create policy "groomer_delete" on public.client_accounts for delete to public using (groomer_id = auth.uid());

create policy "groomer_select" on public.clients for select to public using (groomer_id = auth.uid());
create policy "groomer_insert" on public.clients for insert to public with check (groomer_id = auth.uid());
create policy "groomer_update" on public.clients for update to public using (groomer_id = auth.uid()) with check (groomer_id = auth.uid());
create policy "groomer_delete" on public.clients for delete to public using (groomer_id = auth.uid());

create policy "groomer_select" on public.day_closeout_overrides for select to public using (groomer_id = auth.uid());
create policy "groomer_insert" on public.day_closeout_overrides for insert to public with check (groomer_id = auth.uid());
create policy "groomer_update" on public.day_closeout_overrides for update to public using (groomer_id = auth.uid()) with check (groomer_id = auth.uid());
create policy "groomer_delete" on public.day_closeout_overrides for delete to public using (groomer_id = auth.uid());

create policy "groomer_select" on public.pets for select to public using (groomer_id = auth.uid());
create policy "groomer_insert" on public.pets for insert to public with check (groomer_id = auth.uid());
create policy "groomer_update" on public.pets for update to public using (groomer_id = auth.uid()) with check (groomer_id = auth.uid());
create policy "groomer_delete" on public.pets for delete to public using (groomer_id = auth.uid());

create policy "google_calendar_connections_groomer_select" on public.google_calendar_connections for select to authenticated using (groomer_id = auth.uid());
create policy "google_calendar_connections_groomer_insert" on public.google_calendar_connections for insert to authenticated with check (groomer_id = auth.uid());
create policy "google_calendar_connections_groomer_update" on public.google_calendar_connections for update to authenticated using (groomer_id = auth.uid()) with check (groomer_id = auth.uid());
create policy "google_calendar_connections_groomer_delete" on public.google_calendar_connections for delete to authenticated using (groomer_id = auth.uid());

create policy "sms_messages_operator_select" on public.sms_messages for select to authenticated using (groomer_id = auth.uid());
create policy "sms_messages_operator_insert" on public.sms_messages for insert to authenticated with check (groomer_id = auth.uid());
create policy "sms_messages_operator_update" on public.sms_messages for update to authenticated using (groomer_id = auth.uid()) with check (groomer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger update_clients_updated_at before update on public.clients for each row execute function update_updated_at_column();
create trigger update_google_calendar_connections_updated_at before update on public.google_calendar_connections for each row execute function update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Event trigger: auto-enable RLS on future public tables. Created last so it
-- does not fire during this migration (RLS is already enabled explicitly above).
-- ---------------------------------------------------------------------------
create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();
