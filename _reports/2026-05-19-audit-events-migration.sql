-- Tidy Tails v2 — audit/activity log for Sam's operator actions.
--
-- Safe to run after Ship 2.2b. This table is first-party app telemetry:
-- operational summaries only, no customer message bodies, no secrets, no raw
-- form payloads. The app's recordAuditEvent helper is best-effort, so deploying
-- code before this table exists is safe; events begin recording once this
-- migration is applied.

BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  event_type text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  pet_id uuid REFERENCES public.pets(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  groomer_id uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid()
);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groomer_select" ON public.audit_events;
DROP POLICY IF EXISTS "groomer_insert" ON public.audit_events;

CREATE POLICY "groomer_select" ON public.audit_events
  FOR SELECT USING (groomer_id = auth.uid());

CREATE POLICY "groomer_insert" ON public.audit_events
  FOR INSERT WITH CHECK (groomer_id = auth.uid() AND actor_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_audit_events_groomer_created_at
  ON public.audit_events (groomer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_client_id
  ON public.audit_events (client_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_event_type
  ON public.audit_events (event_type);

NOTIFY pgrst, 'reload schema';

COMMIT;
