-- =============================================================================
-- Tidy Tails — Phase 3.5 Appointment Backfills (Whiskey×3 + Kiwi×2)
-- Generated:        2026-05-17 by Cowork
-- Revised:          2026-05-17 (after rollback test surfaced richer schema)
-- Supabase project: pgkwovokciaqnbhpttba
-- Status:           DRAFT — DO NOT EXECUTE
-- Companion plan:   _reports/2026-05-16-phase-3.5-appointment-backfills-plan.md
-- =============================================================================
-- Schema-discovery note
--   The first rollback-test attempt (2026-05-17) fired G9 because the live
--   appointments table is richer than the v2 design-lock spec §6.1 described.
--   Actual 14 columns: id, client_id, pet_id, date, time_slot, location,
--   service_type, fee, tip, rent_paid, net, status, notes, created_at.
--   Of these, service_type and fee replace the spec's "service" and "price"
--   names; the rest (time_slot, location, tip, rent_paid, net, status) were
--   not in the spec at all.
--
--   This DRAFT follows the conservative policy authorized 2026-05-17:
--   "NULL where Codex is silent; no inference from surrounding rows or
--   current habits." That means:
--     - service_type = NULL  (Codex describes the visit textually; the
--                              categorical enum is an inference)
--     - status       = NULL  (we don't store "this happened" as data;
--                              the date + fee + ledger evidence implies it)
--     - location     = NULL  (Codex silent)
--     - time_slot    = NULL  (Codex silent)
--     - tip          = NULL  (Codex silent — even though column default is 0)
--     - rent_paid    = NULL  (Codex silent — even though column default is 0)
--     - net          = NULL  (derived; can't compute without tip + rent_paid)
--   All 7 of those columns are nullable (`is_nullable: YES`) — no NOT NULL
--   constraints violated. Setting them to NULL bypasses the column defaults
--   so future Sam (or v2 logic) can distinguish "unknown" from "0" / "booked".
--   The Codex grooming description goes into `notes` verbatim with a
--   `[Phase 3.5 backfill 2026-05-17]` tag.
-- =============================================================================
-- Purpose
--   Insert 5 historical appointment rows for two pets surfaced during
--   Workstream B batch-1 reconciliation:
--     - 3 Whiskey appointments (pet of Mary Anca, inserted in Phase 3).
--       Source: Codex appointments.csv Pet_ID = P002.
--     - 2 Russell Cole / Kiwi appointments. Russell's client row exists with
--       0 appointments (v1-active-bugs.md B5 import gap). This closes the
--       2024-06-06 ledger entry + the 2024-12-05 visit.
--       Source: Codex appointments.csv Pet_ID = P015 (rows 1 and 3).
--
--   Date-ambiguous rows EXPLICITLY excluded from this script:
--     - Kiwi 2024-07-?? (Codex P015 row 2 — exact day partial)
--     - Ruby / Nancy Cauchi 2024-08-?? (Codex P013 — date partial)
--     - Coco / Gardy 2023-12-14 (Codex P026 — year ambiguous, "could be /24")
--   These three need a Sam-readback before they can ship. They will be
--   tracked as a Phase 3.5.1 patch once Sam clarifies.
--
-- Pre-conditions
--   - Phase 3 COMMITTED 2026-05-17 (`_reports/2026-05-17-phase-3-execution-report.md`).
--   - Live baseline expected: 137 clients / 188 pets / 730 appointments.
--   - Mary Anca client exists at phone '705-330-1807' (Phase 3 §3.1).
--   - Whiskey pet exists under Mary Anca's client_id (Phase 3 §4.1).
--   - Russell Cole client row exists with 0 appointments (B5).
--   - Kiwi pet row existence under Russell Cole's client_id is the
--     load-bearing branch — pre-flight 0.3.b answers this.
--     If 1 row named 'Kiwi': proceed as-is.
--     If 0 rows: an additional pet INSERT must be added BEFORE Section 4.2
--     (commented stub provided in Section 4.0 below).
--     If 1 row with a different name: abort and ask Sam.
--   - Fresh pre-COMMIT backup at `_private/backups/<timestamp>-phase-3.5-precommit/`.
--   - Service_role context (Supabase SQL editor or apply_migration).
--
-- Strategy
--   1. BEGIN transaction.
--   2. Snapshot baseline counts.
--   3. Resolve FK targets (Whiskey pet_id + Mary Anca client_id;
--      Kiwi pet_id + Russell Cole client_id) into a temp table.
--   4. Run pre-write gates G1-G9 (RAISE EXCEPTION on any divergence).
--   5. INSERT 5 appointment rows by joining the temp table.
--   6. Run I1-I7 post-write invariants.
--   7. Print final summary (expected deltas: 0 / 0 / +5).
--   8. Default end-of-script is ROLLBACK. Operator must consciously edit
--      to COMMIT before this can ship.
--
-- Pre-write gates (each RAISE EXCEPTION on failure):
--   G1 baseline counts == (137, 188, 730)
--   G2 Whiskey pet row exists under Mary Anca's client_id (exactly 1)
--   G3 Russell Cole client row exists with 0 appointments (exactly 1 client, 0 appts)
--   G4 Kiwi pet row exists under Russell Cole's client_id (exactly 1)
--      [If this fires, see Section 4.0 — a Kiwi pet INSERT may be required first.]
--   G5 No existing appointment matches any of the 5 proposed (pet_id, date) pairs
--   G6 Landry/Laundry phone has exactly 4 rows (untouched-blocker invariant)
--   G7 Korrie Silver holdout row at phone 647-300-7952 still has exactly 1 row
--   G8 Dependent tables (booking_requests/client_accounts/automations_log) still 0/0/0
--   G9 Schema audit: appointments table has all 14 expected columns (per the
--      2026-05-17 discovery); pets and appointments have no updated_at column.
--
-- Post-write invariants (each RAISE EXCEPTION on failure):
--   I1 appointments_post = appointments_pre + 5
--   I2 clients_post = clients_pre (no client INSERTs in this script)
--   I3 pets_post = pets_pre (no pet INSERTs in default path)
--   I4 Each proposed (pet_id, date) pair now has exactly 1 appointment row
--   I5 Zero orphan FKs across the appointments table after INSERT
--   I6 Landry/Laundry still has 4 rows
--   I7 Korrie holdout still has 1 row
--
-- DEFAULT END-OF-SCRIPT IS `ROLLBACK;`. The script as written CANNOT mutate
-- the database. Section 7 has the swap instructions.
-- =============================================================================


-- =============================================================================
-- SECTION 0 — PRE-FLIGHT (run BEFORE BEGIN; pure SELECT, no writes)
-- =============================================================================
-- Russell: uncomment one at a time, run in SQL editor, verify expected.

-- 0.1 Baseline counts (expect 137 / 188 / 730 — Phase 3 post-state)
-- SELECT (SELECT COUNT(*) FROM public.clients)      AS clients,
--        (SELECT COUNT(*) FROM public.pets)         AS pets,
--        (SELECT COUNT(*) FROM public.appointments) AS appointments;

-- 0.2 Whiskey pet row (expect 1 row under Mary Anca @ 705-330-1807)
-- SELECT p.id AS pet_id, p.name, p.breed, p.client_id, c.first_name, c.last_name, c.phone
-- FROM public.pets p
-- JOIN public.clients c ON c.id = p.client_id
-- WHERE p.name = 'Whiskey' AND c.phone = '705-330-1807';

-- 0.3 Russell Cole / Kiwi prerequisites
-- 0.3.a Confirm Russell Cole client row + zero appointments (expect 1 row, appt_count = 0)
-- SELECT c.id, c.first_name, c.last_name, c.phone,
--        (SELECT COUNT(*) FROM public.appointments a WHERE a.client_id = c.id) AS appt_count
-- FROM public.clients c
-- WHERE c.first_name = 'Russell' AND c.last_name = 'Cole';

-- 0.3.b Kiwi pet row under Russell's client_id
-- Expect 1 row named 'Kiwi'. If 0, see Section 4.0 stub. If different name, ask Sam.
-- SELECT p.id, p.name, p.breed, p.client_id
-- FROM public.pets p
-- JOIN public.clients c ON c.id = p.client_id
-- WHERE c.first_name = 'Russell' AND c.last_name = 'Cole';

-- 0.4 No-duplicate-appointment probe (expect 0 rows for each proposed (pet, date))
-- Replace <whiskey_pet_id> and <kiwi_pet_id> with the UUIDs returned in 0.2 / 0.3.b.
-- SELECT a.id, a.pet_id, a.date, a.service, a.price
-- FROM public.appointments a
-- WHERE (a.pet_id = '<whiskey_pet_id>' AND a.date IN ('2023-11-16','2025-05-08','2026-04-10'))
--    OR (a.pet_id = '<kiwi_pet_id>'    AND a.date IN ('2024-06-06','2024-12-05'));
-- Expected: 0 rows. Any match means the appointment is already on file.

-- 0.5 Landry/Laundry untouched (expect 4)
-- SELECT COUNT(*) FROM public.clients WHERE phone = '705-796-0620';

-- 0.6 Korrie Silver holdout untouched (expect 1)
-- SELECT COUNT(*) FROM public.clients
-- WHERE lower(first_name) = 'korrie' AND lower(last_name) = 'silver' AND phone = '647-300-7952';

-- 0.7 Dependent tables (expect 0/0/0)
-- SELECT (SELECT COUNT(*) FROM public.booking_requests) AS booking_requests,
--        (SELECT COUNT(*) FROM public.client_accounts)  AS client_accounts,
--        (SELECT COUNT(*) FROM public.automations_log)  AS automations_log;

-- 0.8 Schema audit: confirm the 14-column appointments schema is intact.
-- Expect: 0 missing columns; 0 updated_at columns.
-- (Updated 2026-05-17 after the rollback-test discovery — the planning docs
-- previously assumed only service/price/notes; the live schema is richer.)
-- SELECT
--   (SELECT COUNT(*) FROM (VALUES
--     ('appointments','id'),('appointments','client_id'),('appointments','pet_id'),
--     ('appointments','date'),('appointments','time_slot'),('appointments','location'),
--     ('appointments','service_type'),('appointments','fee'),('appointments','tip'),
--     ('appointments','rent_paid'),('appointments','net'),('appointments','status'),
--     ('appointments','notes'),('appointments','created_at')
--   ) AS req(tn, cn)
--   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
--     WHERE ic.table_schema='public' AND ic.table_name=req.tn AND ic.column_name=req.cn)
--   ) AS missing_columns,
--   (SELECT COUNT(*) FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name  IN ('appointments', 'pets')
--      AND column_name = 'updated_at') AS updated_at_columns;
-- Expected: missing_columns = 0, updated_at_columns = 0. If non-zero on either,
-- review before flipping COMMIT. If the appointments schema has gained columns
-- not in the list above, decide per-column whether to populate or leave default.


-- =============================================================================
-- SECTION 1 — TRANSACTION START + FK RESOLUTION
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _phase35_pre_counts AS
SELECT
  (SELECT COUNT(*) FROM public.clients)      AS clients_pre,
  (SELECT COUNT(*) FROM public.pets)         AS pets_pre,
  (SELECT COUNT(*) FROM public.appointments) AS appointments_pre;

-- Resolve the two FK targets: (Whiskey pet, Mary Anca client) and
-- (Kiwi pet, Russell Cole client). Keys are (pet_name, client_lookup).
CREATE TEMP TABLE _phase35_fk (
  pet_alias   text PRIMARY KEY,    -- 'whiskey' or 'kiwi'
  client_id   uuid NOT NULL,
  pet_id      uuid NOT NULL
);

INSERT INTO _phase35_fk (pet_alias, client_id, pet_id)
SELECT 'whiskey', c.id, p.id
FROM public.clients c
JOIN public.pets    p ON p.client_id = c.id AND p.name = 'Whiskey'
WHERE c.phone = '705-330-1807';

INSERT INTO _phase35_fk (pet_alias, client_id, pet_id)
SELECT 'kiwi', c.id, p.id
FROM public.clients c
JOIN public.pets    p ON p.client_id = c.id AND p.name = 'Kiwi'
WHERE c.first_name = 'Russell' AND c.last_name = 'Cole';

-- Proposed appointment rows (5 strong-evidence, no date-ambiguous entries).
-- Each row carries only Codex-evidenced fields: date, fee, and the grooming
-- description (`groom_description`). Everything else stays NULL per the
-- conservative policy. The `notes` column on INSERT carries the description
-- plus a `[Phase 3.5 backfill 2026-05-17]` tag so the row's provenance is
-- visible in the data itself.
CREATE TEMP TABLE _phase35_proposed (
  pet_alias         text   NOT NULL,
  date              date   NOT NULL,
  fee               numeric(8,2) NOT NULL,
  groom_description text   NOT NULL,
  source            text   NOT NULL,
  PRIMARY KEY (pet_alias, date)
);

INSERT INTO _phase35_proposed (pet_alias, date, fee, groom_description, source) VALUES
  ('whiskey', '2023-11-16', 50.00, '1/2 clip comb (mostly scissor work), tip ears + tidy, left tail', 'Codex appts.csv P002 row 1'),
  ('whiskey', '2025-05-08', 60.00, '#4, left ears + tail',                                            'Codex appts.csv P002 row 2'),
  ('whiskey', '2026-04-10', 60.00, '#4, left ears + tail',                                            'Codex appts.csv P002 row 3'),
  ('kiwi',    '2024-06-06', 50.00, 'first visit (puppy)',                                             'Codex appts.csv P015 row 1 + 2022-2024 ledger'),
  ('kiwi',    '2024-12-05', 50.00, 'bath, brush + tidy, legs, left head + tail',                      'Codex appts.csv P015 row 3');


-- =============================================================================
-- SECTION 2 — PRE-WRITE GATES G1-G9 (fail-loud before any INSERT)
-- =============================================================================

-- G1 — Baseline counts match Phase 3 post-state.
DO $$
DECLARE c_count INT; p_count INT; a_count INT;
BEGIN
  SELECT COUNT(*) INTO c_count FROM public.clients;
  SELECT COUNT(*) INTO p_count FROM public.pets;
  SELECT COUNT(*) INTO a_count FROM public.appointments;
  IF c_count <> 137 OR p_count <> 188 OR a_count <> 730 THEN
    RAISE EXCEPTION
      'G1 FAIL: baseline counts (clients=%, pets=%, appointments=%) do not match Phase 3 post-state (137/188/730). Re-baseline Phase 3.5 against current state before proceeding.',
      c_count, p_count, a_count;
  END IF;
END$$;

-- G2 — Whiskey pet row exists under Mary Anca's client_id.
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM _phase35_fk WHERE pet_alias = 'whiskey';
  IF n <> 1 THEN
    RAISE EXCEPTION
      'G2 FAIL: Whiskey FK resolution returned % row(s) (expected exactly 1). Phase 3 may not have committed correctly, or Mary Anca''s client_id has drifted.',
      n;
  END IF;
END$$;

-- G3 — Russell Cole client row exists with 0 appointments (B5 invariant).
DO $$
DECLARE russell_count INT; russell_appts INT;
BEGIN
  SELECT COUNT(*) INTO russell_count
  FROM public.clients
  WHERE first_name = 'Russell' AND last_name = 'Cole';
  IF russell_count <> 1 THEN
    RAISE EXCEPTION 'G3 FAIL: % Russell Cole client row(s) (expected exactly 1)', russell_count;
  END IF;

  SELECT COUNT(*) INTO russell_appts
  FROM public.appointments a
  JOIN public.clients c ON c.id = a.client_id
  WHERE c.first_name = 'Russell' AND c.last_name = 'Cole';
  IF russell_appts <> 0 THEN
    RAISE EXCEPTION
      'G3 FAIL: Russell Cole already has % appointment(s) (expected 0 — this script closes the import gap). Investigate before proceeding.',
      russell_appts;
  END IF;
END$$;

-- G4 — Kiwi pet row exists under Russell Cole's client_id.
--   If this fires with count 0, see Section 4.0 below — a Kiwi pet INSERT
--   may be required first (under operator review).
--   If it fires with count > 1, there are duplicate Kiwi rows that need
--   reconciliation (similar to the Korrie/Gavi pattern).
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM _phase35_fk WHERE pet_alias = 'kiwi';
  IF n <> 1 THEN
    RAISE EXCEPTION
      'G4 FAIL: Kiwi FK resolution returned % row(s) (expected exactly 1). If 0, Kiwi pet must be inserted first (see Section 4.0 stub). If >1, dedupe before Phase 3.5.',
      n;
  END IF;
END$$;

-- G5 — No existing appointment matches any of the 5 proposed (pet_id, date) pairs.
--   Prevents duplicate appointment creation if part of this set has already shipped.
DO $$
DECLARE dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM public.appointments a
  JOIN _phase35_fk f         ON f.pet_id = a.pet_id
  JOIN _phase35_proposed pr  ON pr.pet_alias = f.pet_alias AND pr.date = a.date;
  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'G5 FAIL: % existing appointment(s) already match one of the 5 proposed (pet_id, date) pairs. Run pre-flight 0.4 to identify which row(s) are already on file and remove them from Section 4 INSERTs before proceeding.',
      dup_count;
  END IF;
END$$;

-- G6 — Landry/Laundry phone has exactly 4 rows.
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM public.clients WHERE phone = '705-796-0620';
  IF n <> 4 THEN
    RAISE EXCEPTION 'G6 FAIL: phone 705-796-0620 has % row(s) (expected 4 — Landry/Laundry blocker).', n;
  END IF;
END$$;

-- G7 — Korrie Silver holdout row at phone 647-300-7952 still has 1 row.
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM public.clients
  WHERE lower(first_name) = 'korrie' AND lower(last_name) = 'silver' AND phone = '647-300-7952';
  IF n <> 1 THEN
    RAISE EXCEPTION 'G7 FAIL: Korrie Silver holdout-row count is % (expected exactly 1).', n;
  END IF;
END$$;

-- G8 — Dependent tables still 0/0/0.
DO $$
DECLARE br INT; ca INT; al INT;
BEGIN
  SELECT COUNT(*) INTO br FROM public.booking_requests;
  SELECT COUNT(*) INTO ca FROM public.client_accounts;
  SELECT COUNT(*) INTO al FROM public.automations_log;
  IF br <> 0 OR ca <> 0 OR al <> 0 THEN
    RAISE EXCEPTION
      'G8 FAIL: dependent tables non-empty (booking_requests=%, client_accounts=%, automations_log=%).',
      br, ca, al;
  END IF;
END$$;

-- G9 — Schema audit. Verifies the 14-column appointments schema discovered
--   2026-05-17 is still intact. Every column the Section 4 INSERT mentions
--   must exist. updated_at must NOT exist on appointments or pets.
DO $$
DECLARE missing INT; appts_has_updated_at INT; pets_has_updated_at INT;
BEGIN
  SELECT COUNT(*) INTO missing
  FROM (VALUES
    ('appointments','id'),
    ('appointments','client_id'),('appointments','pet_id'),
    ('appointments','date'),('appointments','time_slot'),
    ('appointments','location'),('appointments','service_type'),
    ('appointments','fee'),('appointments','tip'),
    ('appointments','rent_paid'),('appointments','net'),
    ('appointments','status'),('appointments','notes'),
    ('appointments','created_at')
  ) AS req(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public'
      AND ic.table_name   = req.table_name
      AND ic.column_name  = req.column_name
  );
  IF missing > 0 THEN
    RAISE EXCEPTION
      'G9 FAIL: % expected appointments column(s) missing. The schema discovered 2026-05-17 may have changed; re-audit before proceeding.',
      missing;
  END IF;

  SELECT COUNT(*) INTO appts_has_updated_at
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'updated_at';
  IF appts_has_updated_at > 0 THEN
    RAISE EXCEPTION
      'G9 FAIL: appointments now has an updated_at column. Decide whether this script should set it (add to Section 4 column list as `updated_at` with `NOW()` in the SELECT) before proceeding.';
  END IF;

  SELECT COUNT(*) INTO pets_has_updated_at
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'pets' AND column_name = 'updated_at';
  IF pets_has_updated_at > 0 THEN
    RAISE NOTICE
      'G9 NOTE: pets has an updated_at column. Not a Phase 3.5 blocker (this script does not insert pets in the default path). Reflect this in Section 4.0 if the Kiwi-pet stub is enabled.';
  END IF;
END$$;


-- =============================================================================
-- SECTION 4.0 — OPTIONAL: KIWI PET INSERT (commented; only if G4 found 0 rows)
-- =============================================================================
-- If pre-flight 0.3.b found NO Kiwi row under Russell Cole's client_id, this
-- block can be uncommented and run BEFORE Sections 4.1–4.5. Reviewing Codex
-- P015 details before flipping COMMIT is mandatory:
--   Codex P015: name='Kiwi', breed='Cavapoo (Cavachon x Poodle)',
--               age='6 months (at card creation)', sex='Female',
--               special_notes='To be spayed; tummy bump removal noted; needs
--                              training in clippers; allergies noted',
--               typical_fee='$50'
-- The Codex allergies wording is ambiguous ("allergies noted" without
-- specifics) — Russell should confirm whether allergies=true is appropriate
-- before enabling this stub. Default is allergies=false; adjust as needed.
--
-- WITH ins AS (
--   INSERT INTO public.pets (name, breed, allergies, allergies_detail, grooming_notes, client_id, created_at)
--   SELECT 'Kiwi','Cavapoo (Cavachon x Poodle)', false, NULL,
--          'Female, 6 months at card creation. To be spayed. Allergies noted in Codex card (specifics unconfirmed). Typical fee $50.',
--          c.id, NOW()
--   FROM public.clients c
--   WHERE c.first_name = 'Russell' AND c.last_name = 'Cole'
--   RETURNING id, client_id
-- )
-- INSERT INTO _phase35_fk (pet_alias, client_id, pet_id)
-- SELECT 'kiwi', client_id, id FROM ins;
-- -- Adjust I3 (pets invariant) to expect +1 if this block runs.


-- =============================================================================
-- SECTION 4 — APPOINTMENT INSERTS (5 rows, FK lookup against _phase35_fk)
-- =============================================================================
-- Joins _phase35_proposed × _phase35_fk by pet_alias. One INSERT statement
-- covers all 5 rows. Explicit NULL is supplied for every column where Codex
-- is silent (per the conservative policy authorized 2026-05-17). This
-- BYPASSES the column defaults — important so `status` doesn't become
-- 'booked' and `tip`/`rent_paid` don't become 0; instead they stay NULL,
-- which a future v2 surface can distinguish from a real 0/booked value.
-- `id` is omitted from the column list so the table default (uuid_generate_v4)
-- assigns a fresh UUID per row.

INSERT INTO public.appointments
  (client_id, pet_id, date, time_slot, location, service_type,
   fee, tip, rent_paid, net, status, notes, created_at)
SELECT
  f.client_id,
  f.pet_id,
  pr.date,
  NULL::text          AS time_slot,    -- Codex silent
  NULL::text          AS location,     -- Codex silent (do not infer 'annette')
  NULL::text          AS service_type, -- Codex silent on categorical (description goes in `notes`)
  pr.fee,                              -- Codex-evidenced
  NULL::numeric       AS tip,          -- Codex silent (bypasses default 0)
  NULL::numeric       AS rent_paid,    -- Codex silent (bypasses default 0)
  NULL::numeric       AS net,          -- derived; can't compute without tip + rent_paid
  NULL::text          AS status,       -- Codex silent (bypasses default 'booked')
  pr.groom_description || ' [Phase 3.5 backfill 2026-05-17]' AS notes,
  NOW()               AS created_at
FROM _phase35_proposed pr
JOIN _phase35_fk       f ON f.pet_alias = pr.pet_alias;


-- =============================================================================
-- SECTION 5 — POST-WRITE INVARIANTS I1-I7
-- =============================================================================

-- I1 — Appointments grew by exactly +5.
DO $$
DECLARE pre INT; post INT;
BEGIN
  SELECT appointments_pre INTO pre FROM _phase35_pre_counts;
  SELECT COUNT(*) INTO post FROM public.appointments;
  IF post - pre <> 5 THEN
    RAISE EXCEPTION 'I1 FAIL: appointments delta is % (expected +5)', post - pre;
  END IF;
END$$;

-- I2 — Clients unchanged.
DO $$
DECLARE pre INT; post INT;
BEGIN
  SELECT clients_pre INTO pre FROM _phase35_pre_counts;
  SELECT COUNT(*) INTO post FROM public.clients;
  IF post - pre <> 0 THEN
    RAISE EXCEPTION 'I2 FAIL: clients delta is % (expected 0 — this script does not insert clients)', post - pre;
  END IF;
END$$;

-- I3 — Pets unchanged in default path. If Section 4.0 (Kiwi pet stub) was
-- uncommented and ran, change the expected delta to +1 here.
DO $$
DECLARE pre INT; post INT;
BEGIN
  SELECT pets_pre INTO pre FROM _phase35_pre_counts;
  SELECT COUNT(*) INTO post FROM public.pets;
  IF post - pre <> 0 THEN
    RAISE EXCEPTION 'I3 FAIL: pets delta is % (expected 0 — if Kiwi pet stub was enabled, expect +1 and update this gate)', post - pre;
  END IF;
END$$;

-- I4 — Each proposed (pet_id, date) pair has exactly 1 appointment row.
DO $$
DECLARE bad INT;
BEGIN
  SELECT COUNT(*) INTO bad
  FROM _phase35_proposed pr
  JOIN _phase35_fk       f ON f.pet_alias = pr.pet_alias
  WHERE (SELECT COUNT(*) FROM public.appointments a WHERE a.pet_id = f.pet_id AND a.date = pr.date) <> 1;
  IF bad > 0 THEN
    RAISE EXCEPTION 'I4 FAIL: % proposed (pet_id, date) pair(s) do not have exactly 1 matching appointment row', bad;
  END IF;
END$$;

-- I5 — Zero orphan FKs across appointments.
DO $$
DECLARE orphan_client INT; orphan_pet INT;
BEGIN
  SELECT COUNT(*) INTO orphan_client
  FROM public.appointments a
  WHERE NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = a.client_id);
  IF orphan_client > 0 THEN
    RAISE EXCEPTION 'I5 FAIL: % appointment(s) point at a non-existent client_id', orphan_client;
  END IF;

  SELECT COUNT(*) INTO orphan_pet
  FROM public.appointments a
  WHERE a.pet_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.pets p WHERE p.id = a.pet_id);
  IF orphan_pet > 0 THEN
    RAISE EXCEPTION 'I5 FAIL: % appointment(s) point at a non-existent pet_id', orphan_pet;
  END IF;
END$$;

-- I6 — Landry/Laundry still has 4 rows.
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM public.clients WHERE phone = '705-796-0620';
  IF n <> 4 THEN
    RAISE EXCEPTION 'I6 FAIL: Landry/Laundry row count is % (expected 4)', n;
  END IF;
END$$;

-- I7 — Korrie holdout still has 1 row.
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM public.clients
  WHERE lower(first_name) = 'korrie' AND lower(last_name) = 'silver' AND phone = '647-300-7952';
  IF n <> 1 THEN
    RAISE EXCEPTION 'I7 FAIL: Korrie holdout row count is % (expected 1)', n;
  END IF;
END$$;


-- =============================================================================
-- SECTION 6 — FINAL SUMMARY (with explicit deltas)
-- =============================================================================
-- Russell: read before flipping ROLLBACK to COMMIT.
--   - clients_delta MUST be exactly 0  (I2 enforced)
--   - pets_delta    MUST be exactly 0  (I3 enforced; +1 if Kiwi-pet stub ran)
--   - appointments_delta MUST be exactly +5  (I1 enforced)
--   - Russell Cole's appt_count goes from 0 to 2; Whiskey's from 0 to 3.
SELECT
  c_pre  AS clients_pre,      c_post AS clients_post,      (c_post - c_pre) AS clients_delta,
  p_pre  AS pets_pre,         p_post AS pets_post,         (p_post - p_pre) AS pets_delta,
  a_pre  AS appointments_pre, a_post AS appointments_post, (a_post - a_pre) AS appointments_delta,
  (SELECT COUNT(*) FROM _phase35_fk)       AS fk_resolutions,
  (SELECT COUNT(*) FROM _phase35_proposed) AS proposed_rows
FROM (
  SELECT
    (SELECT clients_pre      FROM _phase35_pre_counts) AS c_pre,
    (SELECT COUNT(*) FROM public.clients)              AS c_post,
    (SELECT pets_pre         FROM _phase35_pre_counts) AS p_pre,
    (SELECT COUNT(*) FROM public.pets)                 AS p_post,
    (SELECT appointments_pre FROM _phase35_pre_counts) AS a_pre,
    (SELECT COUNT(*) FROM public.appointments)         AS a_post
) s;


-- =============================================================================
-- SECTION 7 — ROLLBACK / COMMIT
-- =============================================================================
-- DEFAULT: ROLLBACK. The script as written CANNOT mutate the database.
--
-- To ship: change `ROLLBACK;` to `COMMIT;` ONLY AFTER:
--   (a) Pre-flight (Section 0) results match expected values.
--   (b) Fresh pre-COMMIT backup exists at _private/backups/<phase-3.5-tag>/.
--   (c) Live pre-flight counts re-verified within the same minute as the backup.
--   (d) Codex verifier checklist signed off
--       (companion plan _reports/2026-05-16-phase-3.5-appointment-backfills-plan.md §8).
--   (e) Russell consciously edits this line AND supervises the run.
--   (f) All 9 pre-write gates (G1-G9) and all 7 post-write invariants (I1-I7)
--       pass without any RAISE EXCEPTION.
--   (g) Final summary in Section 6 shows deltas: clients 0, pets 0
--       (or +1 if Kiwi-pet stub ran), appointments +5.

ROLLBACK;
-- COMMIT;

-- =============================================================================
-- End of Phase 3.5 appointment-backfills draft. NO SQL HAS BEEN EXECUTED BY
-- THIS FILE.
--
-- Excluded date-ambiguous rows (held until Sam readback):
--   - Kiwi 2024-07-?? (Codex P015 row 2)
--   - Ruby / Nancy Cauchi 2024-08-?? (Codex P013)
--   - Coco / Gardy 2023-12-14 (Codex P026 — could be /23 or /24)
-- These will be a Phase 3.5.1 follow-up after Sam clarifies the dates.
-- =============================================================================


-- =============================================================================
-- VERIFIER NOTES (inline; mirror the Phase 3 verifier-checklist pattern)
-- =============================================================================
-- Before flipping ROLLBACK to COMMIT, Codex verifier confirms:
--
-- Plan completeness
-- - [ ] All 5 proposed rows are strong-evidence (date precise, fee certain).
-- - [ ] Date-ambiguous rows (Kiwi 2024-07, Ruby 2024-08, Coco 2023-12-14)
--       are NOT in this SQL.
-- - [ ] FK resolution targets the right Phase-3-inserted Whiskey row
--       (under Mary Anca @ 705-330-1807, client_id 7aa4190d-...).
-- - [ ] Russell Cole / Kiwi pre-flight 0.3.b has been run and the result
--       (1 row, 0 rows, or anomaly) drives whether Section 4.0 stub is needed.
-- - [ ] No proposed (pet_id, date) pair collides with an existing appointment
--       (pre-flight 0.4 returned 0 rows).
--
-- SQL hygiene
-- - [ ] 9 pre-write gates (G1-G9) and 7 post-write invariants (I1-I7) present.
-- - [ ] Default end-of-script is ROLLBACK; COMMIT is commented.
-- - [ ] No UPDATE, no DELETE.
-- - [ ] No INSERT into clients (and no INSERT into pets unless Section 4.0
--       stub is intentionally enabled and I3 is adjusted).
-- - [ ] G9 schema-audit verified the absence of appointments.updated_at; if
--       present, Section 4 INSERTs would need to set it.
-- - [ ] Final summary returns explicit *_delta columns.
--
-- Evidence chain
-- - [ ] Whiskey rows cite Codex appts.csv P002 (rows 1–3, 2023-11-16 to
--       2026-04-10, $50/$60/$60).
-- - [ ] Kiwi rows cite Codex appts.csv P015 (rows 1 and 3, 2024-06-06 and
--       2024-12-05, $50 each). Row 2 (2024-07-??) explicitly excluded.
-- - [ ] B5 (Russell Cole / Kiwi import gap) acknowledged in preamble; closing
--       2 of the 4 card-back visits Russell can recall.
--
-- Safety
-- - [ ] Fresh pre-COMMIT backup exists at _private/backups/<phase-3.5-tag>/
--       with MANIFEST + SHA-256.
-- - [ ] Live counts re-verified at the same UTC minute as the backup.
-- - [ ] G6 (Landry untouched) and G7 (Korrie holdout untouched) both pass.
-- - [ ] G8 (dependent tables empty) still 0/0/0.
-- =============================================================================
