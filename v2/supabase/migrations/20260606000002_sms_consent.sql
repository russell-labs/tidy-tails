-- WS0 — SMS consent capture (see PR #9 / _reports/2026-06-06-sms-consent-migration.sql).
--
-- Adds explicit, recorded SMS consent to clients so reminder/booking texts are
-- truthful for A2P registration and compliant with Canada's CASL. This change is
-- NOT yet on production, so it sits AFTER the baseline as the next versioned
-- migration. Existing clients read as not-consented (false / null) — consent is
-- never assumed.
--
-- Additive and idempotent. No RLS change: the existing groomer_id = auth.uid()
-- policies already cover these columns.

alter table public.clients
  add column if not exists sms_consent boolean not null default false,
  add column if not exists sms_consent_at timestamptz;
