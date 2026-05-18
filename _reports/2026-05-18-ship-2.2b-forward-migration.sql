-- ============================================================================
-- Ship 2.2b — RLS-hardening FORWARD migration            (REHEARSAL COPY)
-- ============================================================================
-- Venture:      tidy-tails
-- Authored:     2026-05-18
-- Source plan:  _reports/2026-05-15-v2-ship-2.2-auth-rls-plan.md  §4 (Steps A->B->C)
-- Applied to:   Supabase branch  tidy-tails-rls-rehearsal  (ref yahlrrwjdqqgpvorfvgp)
--               via apply_migration as ONE named migration:
--               name = "ship_2_2b_forward_rls_hardening"
--
-- WHAT THIS IS
--   The literal SQL run during the Ship 2.2b forward-migration rehearsal. It
--   closes R-1: adds groomer_id to the 6 in-scope public tables, backfills it,
--   enforces NOT NULL, replaces every permissive ("qual = true") policy with
--   auth.uid()-scoped policies, and drops the client_overview SECURITY DEFINER
--   view.
--
-- !! UID SUBSTITUTION — REHEARSAL vs PRODUCTION !!
--   The UID below — a49e3c18-bbbc-4789-9eb9-c0501aee50a5 — is the REHEARSAL
--   test user (rehearsal@example.com) created on the BRANCH. It is NOT
--   Samantha's production UID. The branch has its own isolated auth.users;
--   Samantha's production UID does not exist there.
--   The real production cutover MUST substitute Samantha's verified production
--   auth.users UID, captured read-only from production (pgkwovokciaqnbhpttba)
--   at pre-flight. NEVER run this file's literal UID against production.
--
-- SCOPE — 6 in-scope tables
--   clients, pets, appointments, booking_requests, client_accounts,
--   automations_log.
--   sam_review_responses is OUT of scope — left exactly as-is (its INSERT-only
--   anon policy "sam_review_anon_insert" is a Workstream-B artifact; parent
--   plan §4). This file does not touch it.
--
-- DROP-POLICY NAMES
--   The 20 DROP POLICY statements below name the exact policies captured in
--   _reports/2026-05-17-prod-preflight-policies.json. IF EXISTS keeps the
--   migration idempotent on a re-run.
--
-- ATOMICITY
--   apply_migration wraps this whole file in one BEGIN/COMMIT — Steps A, B, C
--   land together or not at all. There is no half-migrated state.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- STEP A — add groomer_id, backfill to the groomer UID, enforce NOT NULL
-- ---------------------------------------------------------------------------
-- DEFAULT auth.uid() auto-stamps the caller's UID on future authenticated
-- inserts. During this migration there is no JWT, so the DEFAULT evaluates to
-- NULL for existing rows; the explicit UPDATE backfills them before SET NOT NULL.

ALTER TABLE public.clients
  ADD COLUMN groomer_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
UPDATE public.clients
  SET groomer_id = 'a49e3c18-bbbc-4789-9eb9-c0501aee50a5' WHERE groomer_id IS NULL;
ALTER TABLE public.clients ALTER COLUMN groomer_id SET NOT NULL;

ALTER TABLE public.pets
  ADD COLUMN groomer_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
UPDATE public.pets
  SET groomer_id = 'a49e3c18-bbbc-4789-9eb9-c0501aee50a5' WHERE groomer_id IS NULL;
ALTER TABLE public.pets ALTER COLUMN groomer_id SET NOT NULL;

ALTER TABLE public.appointments
  ADD COLUMN groomer_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
UPDATE public.appointments
  SET groomer_id = 'a49e3c18-bbbc-4789-9eb9-c0501aee50a5' WHERE groomer_id IS NULL;
ALTER TABLE public.appointments ALTER COLUMN groomer_id SET NOT NULL;

ALTER TABLE public.booking_requests
  ADD COLUMN groomer_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
UPDATE public.booking_requests
  SET groomer_id = 'a49e3c18-bbbc-4789-9eb9-c0501aee50a5' WHERE groomer_id IS NULL;
ALTER TABLE public.booking_requests ALTER COLUMN groomer_id SET NOT NULL;

ALTER TABLE public.client_accounts
  ADD COLUMN groomer_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
UPDATE public.client_accounts
  SET groomer_id = 'a49e3c18-bbbc-4789-9eb9-c0501aee50a5' WHERE groomer_id IS NULL;
ALTER TABLE public.client_accounts ALTER COLUMN groomer_id SET NOT NULL;

ALTER TABLE public.automations_log
  ADD COLUMN groomer_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
UPDATE public.automations_log
  SET groomer_id = 'a49e3c18-bbbc-4789-9eb9-c0501aee50a5' WHERE groomer_id IS NULL;
ALTER TABLE public.automations_log ALTER COLUMN groomer_id SET NOT NULL;


-- ---------------------------------------------------------------------------
-- STEP B — replace permissive policies with auth.uid()-scoped policies
-- ---------------------------------------------------------------------------
-- Per table: drop every captured permissive policy, then create the four
-- groomer_* scoped policies. ENABLE ROW LEVEL SECURITY is already on (verified
-- pre-flight) — re-stated for self-containment; it is idempotent.
-- The UPDATE policy carries WITH CHECK as well as USING so a row cannot be
-- re-assigned to a different groomer_id. DELETE policies are (re-)created —
-- v1 had them dropped 2026-04-22; under scoped RLS a groomer-scoped delete is
-- safe (parent plan §4 Step B).

-- clients
DROP POLICY IF EXISTS "Anon can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Anon can select clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated can select all clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated can update clients" ON public.clients;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groomer_select" ON public.clients
  FOR SELECT USING (groomer_id = auth.uid());
CREATE POLICY "groomer_insert" ON public.clients
  FOR INSERT WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_update" ON public.clients
  FOR UPDATE USING (groomer_id = auth.uid()) WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_delete" ON public.clients
  FOR DELETE USING (groomer_id = auth.uid());

-- pets
DROP POLICY IF EXISTS "Anon can insert pets" ON public.pets;
DROP POLICY IF EXISTS "Anon can select pets" ON public.pets;
DROP POLICY IF EXISTS "Authenticated can select all pets" ON public.pets;
DROP POLICY IF EXISTS "Authenticated can update pets" ON public.pets;
ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groomer_select" ON public.pets
  FOR SELECT USING (groomer_id = auth.uid());
CREATE POLICY "groomer_insert" ON public.pets
  FOR INSERT WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_update" ON public.pets
  FOR UPDATE USING (groomer_id = auth.uid()) WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_delete" ON public.pets
  FOR DELETE USING (groomer_id = auth.uid());

-- appointments
DROP POLICY IF EXISTS "Authenticated can insert appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated can select appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated can update appointments" ON public.appointments;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groomer_select" ON public.appointments
  FOR SELECT USING (groomer_id = auth.uid());
CREATE POLICY "groomer_insert" ON public.appointments
  FOR INSERT WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_update" ON public.appointments
  FOR UPDATE USING (groomer_id = auth.uid()) WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_delete" ON public.appointments
  FOR DELETE USING (groomer_id = auth.uid());

-- booking_requests
DROP POLICY IF EXISTS "Anon can insert booking_requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Anon can select booking_requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Anon can update booking_requests" ON public.booking_requests;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groomer_select" ON public.booking_requests
  FOR SELECT USING (groomer_id = auth.uid());
CREATE POLICY "groomer_insert" ON public.booking_requests
  FOR INSERT WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_update" ON public.booking_requests
  FOR UPDATE USING (groomer_id = auth.uid()) WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_delete" ON public.booking_requests
  FOR DELETE USING (groomer_id = auth.uid());

-- client_accounts
DROP POLICY IF EXISTS "Anon can insert client_accounts" ON public.client_accounts;
DROP POLICY IF EXISTS "Anon can select client_accounts" ON public.client_accounts;
DROP POLICY IF EXISTS "Anon can update client_accounts" ON public.client_accounts;
ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groomer_select" ON public.client_accounts
  FOR SELECT USING (groomer_id = auth.uid());
CREATE POLICY "groomer_insert" ON public.client_accounts
  FOR INSERT WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_update" ON public.client_accounts
  FOR UPDATE USING (groomer_id = auth.uid()) WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_delete" ON public.client_accounts
  FOR DELETE USING (groomer_id = auth.uid());

-- automations_log
DROP POLICY IF EXISTS "Authenticated can insert automations" ON public.automations_log;
DROP POLICY IF EXISTS "Authenticated can select automations" ON public.automations_log;
DROP POLICY IF EXISTS "Authenticated can update automations" ON public.automations_log;
ALTER TABLE public.automations_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groomer_select" ON public.automations_log
  FOR SELECT USING (groomer_id = auth.uid());
CREATE POLICY "groomer_insert" ON public.automations_log
  FOR INSERT WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_update" ON public.automations_log
  FOR UPDATE USING (groomer_id = auth.uid()) WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_delete" ON public.automations_log
  FOR DELETE USING (groomer_id = auth.uid());


-- ---------------------------------------------------------------------------
-- STEP C — drop the SECURITY DEFINER view (closes B2 / R-5)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.client_overview;

-- ============================================================================
-- END Ship 2.2b forward migration
-- ============================================================================
