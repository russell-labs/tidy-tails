-- Tidy Tails v2 — Google Calendar sync support
-- Date: 2026-05-18
-- Scope: production schema support for operator-owned Google Calendar OAuth
--        connection + appointment event sync metadata.
--
-- Safety:
-- - No customer rows are changed.
-- - New OAuth refresh tokens are stored encrypted by the app before insert.
-- - RLS keeps the connection row scoped to the signed-in groomer.
-- - Appointment sync metadata is nullable and does not affect booking writes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  groomer_id uuid NOT NULL DEFAULT auth.uid(),
  google_email text NOT NULL,
  calendar_id text NOT NULL DEFAULT 'primary',
  refresh_token_ciphertext text NOT NULL,
  refresh_token_iv text NOT NULL,
  refresh_token_tag text NOT NULL,
  scope text,
  token_type text,
  expiry_date timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_calendar_connections_groomer_unique UNIQUE (groomer_id),
  CONSTRAINT google_calendar_connections_groomer_id_present CHECK (groomer_id IS NOT NULL),
  CONSTRAINT google_calendar_connections_token_present CHECK (
    length(refresh_token_ciphertext) > 0
    AND length(refresh_token_iv) > 0
    AND length(refresh_token_tag) > 0
  )
);

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS google_calendar_connections_groomer_select ON public.google_calendar_connections;
DROP POLICY IF EXISTS google_calendar_connections_groomer_insert ON public.google_calendar_connections;
DROP POLICY IF EXISTS google_calendar_connections_groomer_update ON public.google_calendar_connections;
DROP POLICY IF EXISTS google_calendar_connections_groomer_delete ON public.google_calendar_connections;

CREATE POLICY google_calendar_connections_groomer_select
  ON public.google_calendar_connections
  FOR SELECT
  TO authenticated
  USING (groomer_id = auth.uid());

CREATE POLICY google_calendar_connections_groomer_insert
  ON public.google_calendar_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY google_calendar_connections_groomer_update
  ON public.google_calendar_connections
  FOR UPDATE
  TO authenticated
  USING (groomer_id = auth.uid())
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY google_calendar_connections_groomer_delete
  ON public.google_calendar_connections
  FOR DELETE
  TO authenticated
  USING (groomer_id = auth.uid());

DROP TRIGGER IF EXISTS update_google_calendar_connections_updated_at
  ON public.google_calendar_connections;

CREATE TRIGGER update_google_calendar_connections_updated_at
  BEFORE UPDATE ON public.google_calendar_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_sync_status text,
  ADD COLUMN IF NOT EXISTS google_sync_error text,
  ADD COLUMN IF NOT EXISTS google_synced_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_google_sync_status_check'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_google_sync_status_check
      CHECK (
        google_sync_status IS NULL
        OR google_sync_status IN ('synced', 'failed', 'skipped')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_google_event_id
  ON public.appointments (google_event_id)
  WHERE google_event_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;

