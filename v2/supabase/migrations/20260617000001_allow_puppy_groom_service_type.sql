-- TT-019 — allow 'puppy_groom' as a service_type.
--
-- The app's SERVICE_TYPES (lib/booking.ts) has always included 'puppy_groom',
-- and the Add-appointment form offers "Puppy groom" — but the baseline CHECK
-- constraints on appointments and booking_requests were carried over from v1
-- without it (full_groom / bath_only / nail_trim / other only). Every Puppy-groom
-- booking therefore failed the CHECK and surfaced the generic
--   "That appointment could not be saved. Nothing was written."
-- banner (TT-019, S1 — confirmed in production: zero 'puppy_groom' rows have
-- ever been written because the constraint always rejected them). This realigns
-- the live schema with the app's documented service enum.
--
-- Table-level, so it covers every org and both booking surfaces (AddAppointment
-- and OneToOneAddAppointment) with no per-tenant/model branching.
--
-- Additive + idempotent: drop the stale constraint and re-add it with the full
-- set. No data migration needed — no existing row holds 'puppy_groom'.
--
-- RENUMBERED 2026-06-17: this file originally shared version 20260606000006 with
-- 20260606000006_one_to_one_scheduling.sql. The migration runner applied the
-- one_to_one file and SKIPPED this one (same version → treated as already
-- applied), so the puppy_groom widening reached NEITHER staging nor prod and the
-- TT-019 bug stayed live. Renumbered to a unique, later version so it actually
-- runs. Staging-first; prod apply is a separate, deliberate step.

alter table public.appointments
  drop constraint if exists appointments_service_type_check;
alter table public.appointments
  add constraint appointments_service_type_check
  check (service_type = any (array['full_groom', 'puppy_groom', 'bath_only', 'nail_trim', 'other']));

alter table public.booking_requests
  drop constraint if exists booking_requests_service_type_check;
alter table public.booking_requests
  add constraint booking_requests_service_type_check
  check (service_type = any (array['full_groom', 'puppy_groom', 'bath_only', 'nail_trim', 'other']));
