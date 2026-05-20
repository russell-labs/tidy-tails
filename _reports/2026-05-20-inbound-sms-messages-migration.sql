-- Tidy Tails v2 — inbound SMS inbox
--
-- Purpose:
--   Store customer replies from Twilio so Sam can see "confirmed", "thank you",
--   and rebooking replies in Tidy Tails instead of hunting through Twilio logs.
--
-- Runtime:
--   The Twilio webhook writes through the server-only service_role client and
--   explicitly sets groomer_id. Authenticated app reads are scoped by groomer_id.

CREATE TABLE IF NOT EXISTS public.sms_messages (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  groomer_id uuid NOT NULL DEFAULT auth.uid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_phone text NOT NULL,
  to_phone text NOT NULL,
  body text NOT NULL,
  twilio_message_sid text UNIQUE,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'received')),
  match_status text CHECK (match_status IN ('matched', 'unmatched', 'ambiguous')),
  received_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_groomer_created
  ON public.sms_messages (groomer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_messages_client_created
  ON public.sms_messages (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_messages_from_phone
  ON public.sms_messages (from_phone);

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groomer_select" ON public.sms_messages;
DROP POLICY IF EXISTS "groomer_insert" ON public.sms_messages;
DROP POLICY IF EXISTS "groomer_update" ON public.sms_messages;
DROP POLICY IF EXISTS "groomer_delete" ON public.sms_messages;

CREATE POLICY "groomer_select" ON public.sms_messages
  FOR SELECT TO authenticated
  USING (groomer_id = auth.uid());

CREATE POLICY "groomer_insert" ON public.sms_messages
  FOR INSERT TO authenticated
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "groomer_update" ON public.sms_messages
  FOR UPDATE TO authenticated
  USING (groomer_id = auth.uid())
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "groomer_delete" ON public.sms_messages
  FOR DELETE TO authenticated
  USING (groomer_id = auth.uid());

NOTIFY pgrst, 'reload schema';
