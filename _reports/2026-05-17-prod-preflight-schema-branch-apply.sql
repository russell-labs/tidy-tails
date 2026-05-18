-- =====================================================================
-- Tidy Tails — branch-apply schema (Ship 2.2b RLS rehearsal target)
-- Target: branch yahlrrwjdqqgpvorfvgp (tidy-tails-rls-rehearsal)
--         https://yahlrrwjdqqgpvorfvgp.supabase.co
-- Derived: 2026-05-17, from 2026-05-17-prod-preflight-schema.sql.
--
-- WHY THIS FILE EXISTS
--   The rehearsal branch was created off production via Supabase
--   branching, which replays only TRACKED migrations. Tidy Tails' four
--   tracked migrations cover only `sam_review_responses`, so the branch
--   came up with that one table (plus its pkey, two indexes, comment,
--   RLS, and the `sam_review_anon_insert` policy) and nothing else.
--
--   This file is the captured production pre-migration schema MINUS the
--   `sam_review_responses` objects the branch already has — so it can be
--   applied to the branch with no CREATE-collision. Applying it brings
--   the branch to production's full pre-migration state.
--
-- OMITTED vs 2026-05-17-prod-preflight-schema.sql (already on the branch
-- from migration replay; verified 2026-05-17 structurally equivalent to
-- production — every column, the pkey, both indexes, the comment, RLS,
-- and the policy match):
--   - CREATE TABLE public.sam_review_responses + its COMMENT
--   - sam_review_responses_pkey
--   - idx_sam_review_question, idx_sam_review_session_time
--   - ALTER TABLE public.sam_review_responses ENABLE ROW LEVEL SECURITY
--   - CREATE POLICY "sam_review_anon_insert"
-- The branch's existing sam_review_responses is preserved as-is.
--
-- This file is the PRE-MIGRATION state — it does NOT contain `groomer_id`
-- or any `groomer_*` policy. The Ship 2.2b RLS migration is NOT applied
-- here. Schema / DDL only — no customer rows.
--
-- The `ensure_rls` event trigger at the end is applied SEPARATELY from
-- the rest (creating an event trigger needs the `postgres` role) — if the
-- apply path lacks that privilege it is a known, non-load-bearing gap
-- (it only affects FUTURE table creation, not the RLS rehearsal).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions  (uuid-ossp is required: every table's id default is
-- extensions.uuid_generate_v4(). A fresh Supabase project usually has
-- these already; IF NOT EXISTS makes re-declaration a benign no-op.)
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto   WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- Functions  (created before the trigger / event trigger that use them)
-- ---------------------------------------------------------------------

-- update_updated_at_column — plain trigger function (SECURITY INVOKER).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- rls_auto_enable — SECURITY DEFINER event-trigger function. Auto-enables
-- RLS on any new public table. Flagged by the security advisor
-- (anon/authenticated can execute it); captured here verbatim as the
-- pre-migration state.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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

-- ---------------------------------------------------------------------
-- Tables  (columns only — constraints added below so FK order is free)
-- sam_review_responses is intentionally NOT recreated — see header.
-- ---------------------------------------------------------------------

CREATE TABLE public.clients (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    first_name text,
    last_name text,
    phone text,
    email text,
    address text,
    home_phone text,
    alt_contact text,
    referral_source text,
    preferred_location text,
    preferred_day text,
    preferred_frequency_weeks integer,
    tier text DEFAULT 'new'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.pets (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    client_id uuid NOT NULL,
    name text,
    breed text,
    size text,
    sex text,
    color text,
    age text,
    weight_lbs numeric,
    spayed_neutered boolean DEFAULT false,
    allergies boolean DEFAULT false,
    allergies_detail text,
    vaccination_status text,
    medical_notes text,
    vet_contact text,
    temperament_notes text,
    behavior_flags text,
    grooming_style text,
    clip_style text,
    standard_fee numeric,
    grooming_notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.appointments (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    client_id uuid NOT NULL,
    pet_id uuid NOT NULL,
    date date NOT NULL,
    time_slot text,
    location text,
    service_type text,
    status text DEFAULT 'booked'::text,
    fee numeric,
    tip numeric DEFAULT 0,
    net numeric,
    rent_paid numeric DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.automations_log (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    client_id uuid NOT NULL,
    type text,
    channel text,
    message text,
    status text DEFAULT 'sent'::text,
    sent_at timestamp with time zone
);

CREATE TABLE public.client_accounts (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    client_id uuid,
    pin_code text NOT NULL,
    phone text NOT NULL,
    display_name text,
    birthday date,
    secondary_contacts jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.booking_requests (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    client_id uuid,
    client_account_id uuid,
    pet_id uuid,
    requested_date date NOT NULL,
    requested_time_slot text,
    preferred_location text,
    service_type text,
    ai_suggested_slot jsonb,
    admin_notes text,
    denial_reason text,
    client_message text,
    status text DEFAULT 'pending'::text,
    reviewed_at timestamp with time zone,
    reviewed_by text,
    created_at timestamp with time zone DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Primary keys
-- ---------------------------------------------------------------------
ALTER TABLE public.clients          ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE public.pets             ADD CONSTRAINT pets_pkey PRIMARY KEY (id);
ALTER TABLE public.appointments     ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);
ALTER TABLE public.automations_log  ADD CONSTRAINT automations_log_pkey PRIMARY KEY (id);
ALTER TABLE public.client_accounts  ADD CONSTRAINT client_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_pkey PRIMARY KEY (id);

-- ---------------------------------------------------------------------
-- Unique constraints
-- ---------------------------------------------------------------------
ALTER TABLE public.client_accounts ADD CONSTRAINT client_accounts_phone_key UNIQUE (phone);

-- ---------------------------------------------------------------------
-- Check constraints  (verbatim from pg_get_constraintdef)
-- ---------------------------------------------------------------------
ALTER TABLE public.clients ADD CONSTRAINT clients_preferred_frequency_weeks_check CHECK ((preferred_frequency_weeks = ANY (ARRAY[2, 3, 4, 6, 7, 8, 12])));
ALTER TABLE public.clients ADD CONSTRAINT clients_preferred_location_check CHECK ((preferred_location = ANY (ARRAY['annette'::text, 'gina'::text])));
ALTER TABLE public.clients ADD CONSTRAINT clients_tier_check CHECK ((tier = ANY (ARRAY['new'::text, 'regular'::text, 'loyal'::text, 'vip'::text])));
ALTER TABLE public.pets ADD CONSTRAINT pets_size_check CHECK ((size = ANY (ARRAY['small'::text, 'medium'::text, 'large'::text, 'xl'::text])));
ALTER TABLE public.appointments ADD CONSTRAINT appointments_location_check CHECK ((location = ANY (ARRAY['annette'::text, 'gina'::text])));
ALTER TABLE public.appointments ADD CONSTRAINT appointments_service_type_check CHECK ((service_type = ANY (ARRAY['full_groom'::text, 'bath_only'::text, 'nail_trim'::text, 'other'::text])));
ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['booked'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text])));
ALTER TABLE public.automations_log ADD CONSTRAINT automations_log_channel_check CHECK ((channel = ANY (ARRAY['sms'::text, 'email'::text])));
ALTER TABLE public.automations_log ADD CONSTRAINT automations_log_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'delivered'::text, 'failed'::text])));
ALTER TABLE public.automations_log ADD CONSTRAINT automations_log_type_check CHECK ((type = ANY (ARRAY['follow_up'::text, 'reminder'::text, 'rebook_prompt'::text, 'no_show'::text])));
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_preferred_location_check CHECK ((preferred_location = ANY (ARRAY['annette'::text, 'gina'::text])));
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_service_type_check CHECK ((service_type = ANY (ARRAY['full_groom'::text, 'bath_only'::text, 'nail_trim'::text, 'other'::text])));
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'rescheduled'::text, 'cancelled'::text])));

-- ---------------------------------------------------------------------
-- Foreign keys
-- NOTE: ON DELETE behavior is NOT uniform — booking_requests' three FKs
-- are plain NO ACTION; every other FK is ON DELETE CASCADE. This is
-- deliberate; preserve it exactly.
-- ---------------------------------------------------------------------
ALTER TABLE public.pets ADD CONSTRAINT pets_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE;
ALTER TABLE public.automations_log ADD CONSTRAINT automations_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_accounts ADD CONSTRAINT client_accounts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES pets(id);
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_client_account_id_fkey FOREIGN KEY (client_account_id) REFERENCES client_accounts(id);

-- ---------------------------------------------------------------------
-- Secondary indexes  (verbatim from pg_indexes; the *_pkey and
-- client_accounts_phone_key indexes are created by the constraints above.
-- The two idx_sam_review_* indexes are omitted — already on the branch.)
-- ---------------------------------------------------------------------
CREATE INDEX idx_clients_created_at ON public.clients USING btree (created_at);
CREATE INDEX idx_clients_email ON public.clients USING btree (email);
CREATE INDEX idx_clients_phone ON public.clients USING btree (phone);
CREATE INDEX idx_pets_client_id ON public.pets USING btree (client_id);
CREATE INDEX idx_pets_created_at ON public.pets USING btree (created_at);
CREATE INDEX idx_appointments_client_id ON public.appointments USING btree (client_id);
CREATE INDEX idx_appointments_date ON public.appointments USING btree (date);
CREATE INDEX idx_appointments_pet_id ON public.appointments USING btree (pet_id);
CREATE INDEX idx_appointments_status ON public.appointments USING btree (status);
CREATE INDEX idx_automations_log_client_id ON public.automations_log USING btree (client_id);
CREATE INDEX idx_automations_log_sent_at ON public.automations_log USING btree (sent_at);
CREATE INDEX idx_client_accounts_phone ON public.client_accounts USING btree (phone);
CREATE INDEX idx_booking_requests_date ON public.booking_requests USING btree (requested_date);
CREATE INDEX idx_booking_requests_status ON public.booking_requests USING btree (status);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- Row Level Security  (6 core tables; sam_review_responses already has
-- RLS enabled on the branch — omitted here)
-- ---------------------------------------------------------------------
ALTER TABLE public.clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- RLS policies — 20 here (the 21st, "sam_review_anon_insert", is already
-- on the branch and is omitted). ALL are PERMISSIVE, roles {public},
-- qual/with_check `true`. Names are inconsistent ("Anon ..." vs
-- "Authenticated ...") and clients/pets carry 4 policies each (a
-- redundant SELECT pair) — recreated verbatim. No DELETE policy exists.
-- ---------------------------------------------------------------------

-- clients (4)
CREATE POLICY "Anon can insert clients" ON public.clients FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anon can select clients" ON public.clients FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated can select all clients" ON public.clients FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated can update clients" ON public.clients FOR UPDATE TO public USING (true);

-- pets (4)
CREATE POLICY "Anon can insert pets" ON public.pets FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anon can select pets" ON public.pets FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated can select all pets" ON public.pets FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated can update pets" ON public.pets FOR UPDATE TO public USING (true);

-- appointments (3)
CREATE POLICY "Authenticated can insert appointments" ON public.appointments FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Authenticated can select appointments" ON public.appointments FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated can update appointments" ON public.appointments FOR UPDATE TO public USING (true);

-- automations_log (3)
CREATE POLICY "Authenticated can insert automations" ON public.automations_log FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Authenticated can select automations" ON public.automations_log FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated can update automations" ON public.automations_log FOR UPDATE TO public USING (true);

-- booking_requests (3)
CREATE POLICY "Anon can insert booking_requests" ON public.booking_requests FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anon can select booking_requests" ON public.booking_requests FOR SELECT TO public USING (true);
CREATE POLICY "Anon can update booking_requests" ON public.booking_requests FOR UPDATE TO public USING (true);

-- client_accounts (3)
CREATE POLICY "Anon can insert client_accounts" ON public.client_accounts FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anon can select client_accounts" ON public.client_accounts FOR SELECT TO public USING (true);
CREATE POLICY "Anon can update client_accounts" ON public.client_accounts FOR UPDATE TO public USING (true);

-- ---------------------------------------------------------------------
-- View — client_overview. Owned by `postgres`, no `security_invoker`
-- option set, so it runs with the owner's privileges: this is the
-- "SECURITY DEFINER view" the security advisor flags as an ERROR.
-- Captured verbatim from pg_get_viewdef as the pre-migration state.
-- ---------------------------------------------------------------------
CREATE VIEW public.client_overview AS
 SELECT c.id,
    c.first_name,
    c.last_name,
    c.phone,
    c.email,
    c.tier,
    c.preferred_location,
    c.preferred_day,
    c.preferred_frequency_weeks,
    string_agg(p.name, ', '::text ORDER BY p.name) AS pet_names,
    count(DISTINCT p.id) AS total_pets,
    max(a.date) AS last_appointment_date,
    count(DISTINCT a.id) FILTER (WHERE a.status = 'completed'::text) AS total_visits,
    c.created_at,
    c.updated_at
   FROM clients c
     LEFT JOIN pets p ON c.id = p.client_id
     LEFT JOIN appointments a ON c.id = a.client_id
  GROUP BY c.id, c.first_name, c.last_name, c.phone, c.email, c.tier, c.preferred_location, c.preferred_day, c.preferred_frequency_weeks, c.created_at, c.updated_at;

-- ---------------------------------------------------------------------
-- Event trigger — APPLY SEPARATELY (needs the `postgres` role).
-- `ensure_rls` fires on every DDL `CREATE TABLE` and auto-enables RLS via
-- rls_auto_enable(). It only affects FUTURE table creation, not the RLS
-- rehearsal — recreating it is nice-to-have, not load-bearing.
-- ---------------------------------------------------------------------
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end EXECUTE FUNCTION rls_auto_enable();

-- =====================================================================
-- End of branch-apply schema.
-- =====================================================================
