-- WS0 — SMS consent capture (Phase 2 / Cheryl delivery program)
--
-- Adds explicit, recorded SMS consent to the clients table so reminder/booking
-- texts are truthful for A2P registration and compliant with Canada's CASL.
--
-- REVIEW ONLY — DO NOT APPLY TO PRODUCTION from this PR. Apply deliberately,
-- and deploy the app code only AFTER this migration has run (the app reads
-- sms_consent; before the column exists every client reads as not-consented,
-- which is fail-closed but disables all booking-text controls).
--
-- Existing clients: sms_consent defaults to false (NOT consented) and
-- sms_consent_at stays null. This is intentional — consent is never assumed for
-- existing records; each must be re-confirmed in-app before texting resumes.
--
-- Additive and idempotent. No RLS change: the existing
-- `groomer_id = auth.uid()` policies already cover these columns.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz;
