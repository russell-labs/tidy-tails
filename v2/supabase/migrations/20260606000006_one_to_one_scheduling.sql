-- WS4a — 1:1 (one_to_one) scheduling engine. Staging-first.
--
-- Two changes, both on public.appointments:
--   (1) ADDITIVE: a nullable duration_minutes column. The 1:1 engine persists a
--       block's adjustable length here and uses it for overlap detection. The
--       batched (Sam) waterfall never sets it — her rows stay null and ignore it.
--   (2) CONSTRAINT RELAXATION (not additive — called out honestly): the location
--       CHECK is hardcoded to Sam's two shops ('annette','gina'), which rejects
--       any other tenant's location. A table-level CHECK cannot be per-org, so
--       storing Cheryl's onboarding location names REQUIRES relaxing it. We DROP
--       the two-value enum and ADD a light sanity CHECK (non-empty, <= 64 chars);
--       real per-org validation moves to the app (the booking write action checks
--       the location is one of the org's org_settings locations).
--
-- Relaxation, not loosening-into-nothing: non-destructive (every existing row
-- stays valid), reversible, scoped to THIS one constraint. The sibling
-- gina/annette enums on booking_requests.preferred_location,
-- clients.preferred_location, and day_closeout_overrides.location are LEFT ALONE
-- (the WS4a booking write path does not write them).
--
-- No RLS policy change → the cross-tenant isolation gate (which inspects policies,
-- not CHECKs) stays green. The cutover-rehearsal CI job applies only baseline
-- 0001, so this migration never runs there. STAGING ONLY — rehearse with a backup
-- taken first; never applied to production in this workstream.

-- (1) Additive block length. Nullable, no default; waterfall rows stay null.
alter table public.appointments add column duration_minutes integer;

-- (2) Relax the location enum to a per-org-agnostic sanity check.
alter table public.appointments drop constraint appointments_location_check;
alter table public.appointments
  add constraint appointments_location_check
  check (location is null or char_length(location) between 1 and 64);
