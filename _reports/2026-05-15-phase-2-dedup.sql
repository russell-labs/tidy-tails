-- =============================================================================
-- Tidy Tails — Phase 2 Dedup
-- Generated:        2026-05-15 by Cowork
-- Supabase project: pgkwovokciaqnbhpttba
-- Status:           DRAFT — AWAITING RUSSELL REVIEW — DO NOT EXECUTE
-- Companion:        _reports/2026-05-15-phase-2-dedup-notes.md
-- Plan source:      _reports/2026-05-14-reconciliation-plan.md  (Phase 2 section)
-- =============================================================================
-- Purpose
--   Remove the duplicate client rows created by the 2026-04-09 21:26-21:28
--   double-import event, while preserving every appointment and every
--   canonical client. Post-Phase-1 baseline (re-baselined 2026-05-15 after
--   Phase 1B Backway phone normalization collapsed two 2-row clusters into
--   a single 4-row cluster) identifies 114 duplicate phone groups:
--     - 105 "safe" groups (clean) — ghost rows hold zero appts and zero
--       pets-with-appts. Direct delete works.
--     -   8 "split-appt" groups — appointments and/or pets-with-appointments
--       sit on ghost rows. Re-point them to the canonical row, then delete
--       the now-empty ghost.
--     -   1 "blocked" group — phone 705-796-0620 (Landry/Laundry). Sam must
--       clarify the Cash/Charlotte identity before this group is touched.
--       Explicitly excluded by this script.
--
-- Strategy
--   1. Build temp tables at the top of the transaction:
--        _phase2_dup_phones   — every phone that appears 2+ times
--                               (Landry/Laundry excluded by WHERE clause)
--        _phase2_ranked       — every client row in those groups, ranked
--                               within group by (appt_count DESC, created_at ASC, id ASC)
--        _phase2_canonical    — rank 1 per phone (the survivor)
--        _phase2_ghosts       — rank 2+ per phone (the rows to delete)
--   2. Run pre-write gates G1-G8 (baseline counts, dup inventory, Landry
--      cluster, working-set sizes, set disjointness, ghost↔canonical mapping,
--      Landry absence, dependent-table emptiness). Any failure aborts the
--      transaction before any write.
--   3. Re-point pets that carry appointment history from ghost → canonical.
--      (For the 105 safe groups this UPDATE touches 0 rows; for the 8
--      split-appt groups it preserves appointment FKs.)
--   4. Re-point appointments.client_id from ghost → canonical, same logic.
--   5. Delete the remaining ghost pets (every one of which now has 0 appts).
--   6. Delete ghost client rows.
--   7. Run post-write invariants I1-I7 that RAISE EXCEPTION if anything is off.
--   8. Print a final summary row with pre/post/delta columns.
--   9. End-of-script is ROLLBACK by default. Russell must consciously edit
--      it to COMMIT before this can ship.
--
-- Pre-write gates enforced inside the transaction (fail-loud, before any UPDATE/DELETE):
--   (G1) Baseline row counts match Phase 1 post-state:
--        clients = 268, pets = 352, appointments = 730.
--   (G2) Duplicate phone inventory matches the verified plan BEFORE Landry exclusion:
--        101 groups of size 2 + 13 groups of size 4 = 114 duplicate groups.
--   (G3) Phone 705-796-0620 (Landry/Laundry) has exactly 4 rows in clients.
--   (G4) Working set sizes after excluding Landry/Laundry match the plan:
--        _phase2_ranked    = 250 rows  (101×2 two-row + 12×4 four-row, Landry excluded)
--        _phase2_canonical = 113 rows  (1 per non-blocked group)
--        _phase2_ghosts    = 137 rows  (250 - 113)
--   (G5) Canonical and ghost sets are disjoint (no row appears in both).
--   (G6) Every ghost has a canonical of the same phone (no orphan ghosts).
--   (G7) Phone 705-796-0620 is absent from the working set entirely.
--   (G8) Dependent tables (booking_requests, client_accounts, automations_log)
--        are still empty (CLAUDE.md baseline). If they have rows, v1 has begun
--        writing to surfaces this script does not model — pause and audit.
--
-- Post-write invariants enforced inside the transaction (fail-loud, after every write):
--   (I1) appointments row count is unchanged.
--   (I2) Every canonical client_id from pre-state still exists in post-state.
--   (I3) Zero appointments reference a non-existent client_id.
--   (I4) Zero appointments reference a non-existent pet_id.
--   (I5) Phone 705-796-0620 still has exactly 4 rows.
--   (I6) No ghost client_id from pre-state still exists in post-state.
--   (I7) Per-phone-group appointment counts are unchanged.
--
-- Prerequisites
--   - Phase 1 already executed (verified 2026-05-15). Phase 1B normalized
--     phone numbers (Backway area code, Stillman son, etc.) so phone-grouping
--     now resolves cleanly.
--   - Fresh logical backup exists at venture-ops/backups/tidy-tails/2026-05-15/.
--   - RLS DELETE policies were dropped 2026-04-22; this script must therefore
--     be run as service_role (Supabase MCP execute_sql or psql via session
--     pooler with the rotated password), not as anon.
--
-- Predicted output of a successful run (when COMMIT is enabled):
--     clients:      268 → 131    (delta = -137; 101 two-row ghosts + 36 four-row
--                                 ghosts in the 12 non-blocked four-row clusters
--                                 (101 + 12×3 = 137). Landry's 3 ghosts excluded.)
--     pets:         352 → 181    (delta = -171; verified by the 2026-05-15
--                                 rollback-only test. The earlier soft estimate
--                                 of [-147, -140] undercounted ghost-row pets —
--                                 the 137 ghost client rows carry more attached
--                                 pets than predicted (e.g. Jane Donaldson's
--                                 ghost row alone carries 6 pets). All seven
--                                 post-write invariants I1-I7 passed during
--                                 the rollback test, so the deletion shape is
--                                 correct; only the soft range was wrong.)
--     appointments: 730 → 730    (delta  0; load-bearing invariant)
--
--   Russell: the deltas above are PLAN-DERIVED estimates. The exact deltas
--   depend on what the dry-run section (SECTION 1) actually reports. If the
--   real numbers diverge from the plan, STOP and reconcile before flipping
--   ROLLBACK to COMMIT.
-- =============================================================================


-- =============================================================================
-- SECTION 0 — PRE-FLIGHT (run BEFORE BEGIN; pure SELECT, no writes)
-- =============================================================================
-- Sanity-check the baseline. Russell: copy these 4 queries into the Supabase
-- SQL editor BEFORE running the transactional part. If any number is
-- unexpected, do not proceed.

-- 0.1 Row counts. Expect: 268 / 352 / 730 (matches Phase 1 post-state).
-- SELECT (SELECT COUNT(*) FROM public.clients)      AS clients,
--        (SELECT COUNT(*) FROM public.pets)         AS pets,
--        (SELECT COUNT(*) FROM public.appointments) AS appointments;

-- 0.2 Duplicate phone group inventory.
-- Expect: 101 groups of size 2 + 13 groups of size 4 = 114 groups,
-- 140 ghost rows total (137 after Landry/Laundry exclusion).
-- WITH dup AS (
--   SELECT phone, COUNT(*) AS row_count
--   FROM public.clients
--   WHERE phone IS NOT NULL AND phone <> ''
--   GROUP BY phone
--   HAVING COUNT(*) > 1
-- )
-- SELECT row_count, COUNT(*) AS groups
-- FROM dup
-- GROUP BY row_count
-- ORDER BY row_count;

-- 0.3 Confirm the Landry/Laundry blocker still has 4 rows (will be EXCLUDED).
-- SELECT id, first_name, last_name, phone, created_at
-- FROM public.clients
-- WHERE phone = '705-796-0620'
-- ORDER BY created_at;

-- 0.4 Empty-phone audit. Empty-string phones are not deduplicated by this script.
-- Phase 1 added phones where it could (Stillman son, Lahay). Anything left
-- empty stays as-is.
-- SELECT id, first_name, last_name, notes
-- FROM public.clients
-- WHERE phone IS NULL OR phone = '';

-- 0.5 Schema audit: does `pets` or `appointments` have an `updated_at` column?
-- Phase 1 evidence (19 updated_at hits, all on clients) and the v2 design-lock
-- spec section 6.1 (which lists no updated_at for either table) both say no.
-- If this query returns rows, edit section 2.3 or 2.4 to add `, updated_at = NOW()`
-- before running section 2.
-- SELECT table_name, column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name  IN ('pets', 'appointments')
--   AND column_name = 'updated_at';
-- Expected: 0 rows.

-- 0.6 Dependent-table audit. CLAUDE.md (2026-05-15) baseline records 0 rows
-- in each. v1 HTML modules reference booking_requests and client_accounts but
-- no row has been written yet, per the same baseline. If any row exists here,
-- this script does NOT model the FK blast radius — stop and audit manually
-- before deleting client rows.
-- SELECT (SELECT COUNT(*) FROM public.booking_requests) AS booking_requests,
--        (SELECT COUNT(*) FROM public.client_accounts)  AS client_accounts,
--        (SELECT COUNT(*) FROM public.automations_log)  AS automations_log;
-- Expected: 0 / 0 / 0.


-- =============================================================================
-- SECTION 1 — DRY-RUN PREVIEW  (run BEFORE the transactional section; SELECT only)
-- =============================================================================
-- Goal: produce the full list of ghosts and their re-pointing targets WITHOUT
-- writing anything. Russell signs off on this output before SECTION 2 ships.

WITH dup_phones AS (
  SELECT phone
  FROM public.clients
  WHERE phone IS NOT NULL
    AND phone <> ''
    AND phone <> '705-796-0620'      -- blocker (Landry/Laundry); intentionally excluded
  GROUP BY phone
  HAVING COUNT(*) > 1
),
client_appt_counts AS (
  SELECT client_id, COUNT(*) AS appt_count
  FROM public.appointments
  GROUP BY client_id
),
client_pet_counts AS (
  SELECT client_id, COUNT(*) AS pet_count
  FROM public.pets
  GROUP BY client_id
),
ranked AS (
  SELECT
    c.id,
    c.phone,
    c.first_name,
    c.last_name,
    c.created_at,
    COALESCE(a.appt_count, 0) AS appt_count,
    COALESCE(p.pet_count,  0) AS pet_count,
    ROW_NUMBER() OVER (
      PARTITION BY c.phone
      ORDER BY COALESCE(a.appt_count, 0) DESC,
               c.created_at ASC,
               c.id ASC
    ) AS rank_in_group
  FROM public.clients c
  LEFT JOIN client_appt_counts a ON a.client_id = c.id
  LEFT JOIN client_pet_counts  p ON p.client_id = c.id
  WHERE c.phone IN (SELECT phone FROM dup_phones)
),
canonical AS (
  SELECT id, phone, first_name, last_name, appt_count
  FROM ranked
  WHERE rank_in_group = 1
),
ghosts AS (
  SELECT id, phone, first_name, last_name, appt_count, pet_count
  FROM ranked
  WHERE rank_in_group > 1
),
-- A group is "split-appt" if 2+ rows in it have appointments,
-- OR if any pet belonging to a ghost client has appointments.
ghost_pets_with_appts AS (
  SELECT DISTINCT p.client_id AS ghost_client_id
  FROM public.pets p
  JOIN public.appointments a ON a.pet_id = p.id
  WHERE p.client_id IN (SELECT id FROM ghosts)
),
split_appt_phones AS (
  SELECT phone FROM (
    SELECT phone, COUNT(*) FILTER (WHERE appt_count > 0) AS rows_with_appts
    FROM ranked
    GROUP BY phone
  ) s
  WHERE rows_with_appts >= 2
  UNION
  SELECT g.phone FROM ghosts g
  WHERE g.id IN (SELECT ghost_client_id FROM ghost_pets_with_appts)
)
SELECT
  CASE
    WHEN g.phone IN (SELECT phone FROM split_appt_phones) THEN 'SPLIT_APPT'
    ELSE 'SAFE'
  END AS classification,
  g.phone,
  g.id           AS ghost_id,
  g.first_name   AS ghost_first_name,
  g.last_name    AS ghost_last_name,
  g.appt_count   AS ghost_appt_count,
  g.pet_count    AS ghost_pet_count,
  c.id           AS canonical_id,
  c.first_name   AS canonical_first_name,
  c.last_name    AS canonical_last_name,
  c.appt_count   AS canonical_appt_count
FROM ghosts g
JOIN canonical c ON c.phone = g.phone
ORDER BY classification, g.phone, g.appt_count DESC, g.id;
-- Russell: expected output = 137 rows. Derivation from the post-Phase-1 baseline:
--   114 duplicate phone groups total = 101 two-row + 13 four-row.
--    -1 group excluded (Landry/Laundry, four-row → 3 ghosts not counted).
--   = 113 non-blocked groups → 101 two-row + 12 four-row,
--     ghost rows = 101×1 + 12×3 = 137.
-- Observed classification split from 2026-05-15 dry-run:
--    SAFE       = 105 groups (101 two-row + 4 four-row), 113 ghost rows
--    SPLIT_APPT =   8 groups (all four-row),              24 ghost rows
--    Total      = 113 groups, 137 ghost rows
-- The 4 SAFE four-row clusters are: Backway 705-330-6144 (consolidated from
-- two pre-Phase-1B 2-row clusters), Cory Handy 705-955-4414, McKee
-- 416-317-2038, Wallis/Borrelli 705-229-6170.
-- If the actual output diverges from 137 (more than ~150 or fewer than ~125),
-- pause and reconcile against _reports/2026-05-15-phase-2-pre-flight-output.md
-- before running SECTION 2.


-- =============================================================================
-- SECTION 2 — TRANSACTIONAL EXECUTION (writes; defaults to ROLLBACK)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 2.1 Snapshot pre-state into temp tables (no writes to public schema yet)
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _phase2_pre_counts AS
SELECT
  (SELECT COUNT(*) FROM public.clients)      AS clients_pre,
  (SELECT COUNT(*) FROM public.pets)         AS pets_pre,
  (SELECT COUNT(*) FROM public.appointments) AS appointments_pre;

CREATE TEMP TABLE _phase2_dup_phones AS
SELECT phone
FROM public.clients
WHERE phone IS NOT NULL
  AND phone <> ''
  AND phone <> '705-796-0620'      -- blocker; do not touch
GROUP BY phone
HAVING COUNT(*) > 1;

CREATE TEMP TABLE _phase2_ranked AS
WITH client_appt_counts AS (
  SELECT client_id, COUNT(*) AS appt_count
  FROM public.appointments
  GROUP BY client_id
),
client_pet_counts AS (
  SELECT client_id, COUNT(*) AS pet_count
  FROM public.pets
  GROUP BY client_id
)
SELECT
  c.id,
  c.phone,
  c.first_name,
  c.last_name,
  c.created_at,
  COALESCE(a.appt_count, 0) AS appt_count,
  COALESCE(p.pet_count,  0) AS pet_count,
  ROW_NUMBER() OVER (
    PARTITION BY c.phone
    ORDER BY COALESCE(a.appt_count, 0) DESC,
             c.created_at ASC,
             c.id ASC
  ) AS rank_in_group
FROM public.clients c
LEFT JOIN client_appt_counts a ON a.client_id = c.id
LEFT JOIN client_pet_counts  p ON p.client_id = c.id
WHERE c.phone IN (SELECT phone FROM _phase2_dup_phones);

CREATE TEMP TABLE _phase2_canonical AS
SELECT id, phone
FROM _phase2_ranked
WHERE rank_in_group = 1;

CREATE TEMP TABLE _phase2_ghosts AS
SELECT id, phone
FROM _phase2_ranked
WHERE rank_in_group > 1;

-- Snapshot the appointments-per-phone-group totals so we can prove
-- no appointment dropped off a phone group after re-pointing.
CREATE TEMP TABLE _phase2_appts_per_phone_pre AS
SELECT r.phone, COUNT(a.id) AS appts_pre
FROM _phase2_ranked r
LEFT JOIN public.appointments a ON a.client_id = r.id
GROUP BY r.phone;

-- ---------------------------------------------------------------------------
-- 2.2 Pre-write gates (fail-loud BEFORE any UPDATE or DELETE)
-- ---------------------------------------------------------------------------
-- Each gate raises EXCEPTION on failure, which aborts the transaction. None
-- of section 2.3+ runs unless every gate here passes.

-- G1 — Baseline counts match Phase 1 post-state.
DO $$
DECLARE
  c_count INT;
  p_count INT;
  a_count INT;
BEGIN
  SELECT COUNT(*) INTO c_count FROM public.clients;
  SELECT COUNT(*) INTO p_count FROM public.pets;
  SELECT COUNT(*) INTO a_count FROM public.appointments;
  IF c_count <> 268 OR p_count <> 352 OR a_count <> 730 THEN
    RAISE EXCEPTION
      'G1 FAIL: baseline counts (clients=%, pets=%, appointments=%) do not match Phase 1 post-state (268/352/730). The plan assumed Phase 1 was the only data change since 2026-04-22 backup; if anything has changed, re-baseline before running Phase 2.',
      c_count, p_count, a_count;
  END IF;
END$$;

-- G2 — Duplicate phone inventory matches the plan BEFORE Landry exclusion.
--   Post-Phase-1 baseline: 101 size-2 + 13 size-4 = 114 dup groups.
DO $$
DECLARE
  size_2 INT;
  size_4 INT;
  size_other INT;
  total INT;
BEGIN
  WITH dup AS (
    SELECT phone, COUNT(*) AS row_count
    FROM public.clients
    WHERE phone IS NOT NULL AND phone <> ''
    GROUP BY phone
    HAVING COUNT(*) > 1
  )
  SELECT
    COUNT(*) FILTER (WHERE row_count = 2),
    COUNT(*) FILTER (WHERE row_count = 4),
    COUNT(*) FILTER (WHERE row_count NOT IN (2, 4)),
    COUNT(*)
  INTO size_2, size_4, size_other, total
  FROM dup;

  IF size_2 <> 101 OR size_4 <> 13 OR size_other <> 0 OR total <> 114 THEN
    RAISE EXCEPTION
      'G2 FAIL: dup phone inventory is (size_2=%, size_4=%, other=%, total=%); post-Phase-1 baseline requires exactly (101, 13, 0, 114). New duplicates or split duplicates appearing since the 2026-05-15 dry-run would invalidate Phase 2.',
      size_2, size_4, size_other, total;
  END IF;
END$$;

-- G3 — Landry/Laundry (705-796-0620) has exactly 4 rows before any write.
DO $$
DECLARE
  landry_count INT;
BEGIN
  SELECT COUNT(*) INTO landry_count
  FROM public.clients
  WHERE phone = '705-796-0620';
  IF landry_count <> 4 THEN
    RAISE EXCEPTION
      'G3 FAIL: phone 705-796-0620 has % row(s) (plan expects exactly 4). Landry/Laundry must remain a 4-row cluster excluded from this run; investigate before proceeding.',
      landry_count;
  END IF;
END$$;

-- G4 — Working-set sizes after Landry exclusion match the plan.
--   Post-Phase-1 derivation: 113 non-blocked groups × group_size summed
--     = 101 two-row + 12 four-row groups
--     = 101×2 + 12×4
--     = 202 + 48
--     = 250 ranked rows
--     - 113 canonicals (rank 1 in each)
--     = 137 ghosts.
DO $$
DECLARE
  ranked_n    INT;
  canonical_n INT;
  ghosts_n    INT;
BEGIN
  SELECT COUNT(*) INTO ranked_n    FROM _phase2_ranked;
  SELECT COUNT(*) INTO canonical_n FROM _phase2_canonical;
  SELECT COUNT(*) INTO ghosts_n    FROM _phase2_ghosts;
  IF ranked_n <> 250 OR canonical_n <> 113 OR ghosts_n <> 137 THEN
    RAISE EXCEPTION
      'G4 FAIL: working set sizes are (ranked=%, canonical=%, ghosts=%); post-Phase-1 baseline requires exactly (250, 113, 137) after Landry/Laundry exclusion. Re-run sections 0 and 1 and reconcile against 2026-05-15-phase-2-pre-flight-output.md before proceeding.',
      ranked_n, canonical_n, ghosts_n;
  END IF;
END$$;

-- G5 — Canonical and ghost sets must not overlap.
DO $$
DECLARE
  overlap INT;
BEGIN
  SELECT COUNT(*) INTO overlap
  FROM _phase2_canonical c
  JOIN _phase2_ghosts    g ON c.id = g.id;
  IF overlap > 0 THEN
    RAISE EXCEPTION 'G5 FAIL: % rows appear in BOTH canonical and ghost sets', overlap;
  END IF;
END$$;

-- G6 — Every ghost has a canonical of the same phone.
DO $$
DECLARE
  orphan_ghosts INT;
BEGIN
  SELECT COUNT(*) INTO orphan_ghosts
  FROM _phase2_ghosts g
  WHERE NOT EXISTS (
    SELECT 1 FROM _phase2_canonical c WHERE c.phone = g.phone
  );
  IF orphan_ghosts > 0 THEN
    RAISE EXCEPTION 'G6 FAIL: % ghost row(s) have no canonical of the same phone', orphan_ghosts;
  END IF;
END$$;

-- G7 — Phone 705-796-0620 is absent from the working set.
DO $$
DECLARE
  landry_in_ranked INT;
BEGIN
  SELECT COUNT(*) INTO landry_in_ranked
  FROM _phase2_ranked
  WHERE phone = '705-796-0620';
  IF landry_in_ranked > 0 THEN
    RAISE EXCEPTION 'G7 FAIL: phone 705-796-0620 leaked into the working set (% row(s))', landry_in_ranked;
  END IF;
END$$;

-- G8 — Dependent tables must still be empty.
--   CLAUDE.md (2026-05-15) records booking_requests, client_accounts, and
--   automations_log as 0 rows. v1 HTML modules reference booking_requests and
--   client_accounts, so this gate prevents Phase 2 from deleting a client row
--   that an unmodeled FK references. If any of these tables is non-empty,
--   abort and audit those rows' references to ghost client_ids manually.
DO $$
DECLARE
  br_count INT;
  ca_count INT;
  al_count INT;
BEGIN
  SELECT COUNT(*) INTO br_count FROM public.booking_requests;
  SELECT COUNT(*) INTO ca_count FROM public.client_accounts;
  SELECT COUNT(*) INTO al_count FROM public.automations_log;
  IF br_count <> 0 OR ca_count <> 0 OR al_count <> 0 THEN
    RAISE EXCEPTION
      'G8 FAIL: dependent tables non-empty (booking_requests=%, client_accounts=%, automations_log=%). CLAUDE.md baseline expects 0/0/0. If real data exists, v1 has begun writing to surfaces this script does not model — pause and audit references to ghost client_ids before deleting client rows.',
      br_count, ca_count, al_count;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2.3 Re-point pets that carry appointment history (split-appt groups only,
--     but the WHERE clause filters automatically — for the 105 safe groups
--     this UPDATE touches zero rows).
-- ---------------------------------------------------------------------------
-- After this UPDATE: every pet that owns 1+ appointments lives on the
-- canonical client of its phone group. Pet rows on ghosts that own no
-- appointments are left for SECTION 2.5 to delete outright.

UPDATE public.pets p
SET client_id = c.id
FROM _phase2_ghosts g
JOIN _phase2_canonical c ON c.phone = g.phone
WHERE p.client_id = g.id
  AND EXISTS (
    SELECT 1 FROM public.appointments a WHERE a.pet_id = p.id
  );
-- Note: `pets` has no `updated_at` column in v1's schema (Phase 1 SQL set
-- updated_at only on clients, not pets — see 2026-05-14-phase-1-safe-updates.sql).
-- If a schema audit before commit shows pets actually does have updated_at,
-- add `, updated_at = NOW()` above.

-- ---------------------------------------------------------------------------
-- 2.4 Re-point appointments whose client_id points at a ghost client.
-- ---------------------------------------------------------------------------
-- pet_id is intentionally NOT touched here — pets that owned the
-- appointment were re-pointed to canonical in 2.3, so appointment.pet_id is
-- still correct.

UPDATE public.appointments a
SET client_id = c.id
FROM _phase2_ghosts g
JOIN _phase2_canonical c ON c.phone = g.phone
WHERE a.client_id = g.id;

-- ---------------------------------------------------------------------------
-- 2.5 Delete ghost pets that no longer own any appointment.
-- ---------------------------------------------------------------------------
-- By construction (after 2.3) every remaining pet on a ghost client_id is
-- appointment-less, so this DELETE drops no appointment FK target.

DELETE FROM public.pets
WHERE client_id IN (SELECT id FROM _phase2_ghosts)
  AND NOT EXISTS (
    SELECT 1 FROM public.appointments a WHERE a.pet_id = public.pets.id
  );

-- ---------------------------------------------------------------------------
-- 2.6 Delete ghost client rows.
-- ---------------------------------------------------------------------------
-- At this point every ghost has 0 pets and 0 appointments (see 2.7 invariant).

DELETE FROM public.clients
WHERE id IN (SELECT id FROM _phase2_ghosts);

-- ---------------------------------------------------------------------------
-- 2.7 Post-write invariant checks (fail-loud)
-- ---------------------------------------------------------------------------

-- I1 — Appointment count unchanged.
DO $$
DECLARE
  appts_pre  INT;
  appts_post INT;
BEGIN
  SELECT appointments_pre INTO appts_pre FROM _phase2_pre_counts;
  SELECT COUNT(*) INTO appts_post FROM public.appointments;
  IF appts_pre <> appts_post THEN
    RAISE EXCEPTION 'I1 FAIL: appointments changed from % to %', appts_pre, appts_post;
  END IF;
END$$;

-- I2 — Every canonical row from pre-state still exists.
DO $$
DECLARE
  missing INT;
BEGIN
  SELECT COUNT(*) INTO missing
  FROM _phase2_canonical c
  WHERE NOT EXISTS (SELECT 1 FROM public.clients x WHERE x.id = c.id);
  IF missing > 0 THEN
    RAISE EXCEPTION 'I2 FAIL: % canonical client(s) deleted by Phase 2 — DO NOT COMMIT', missing;
  END IF;
END$$;

-- I3 — No appointment references a non-existent client_id.
DO $$
DECLARE
  orphan_appts_client INT;
BEGIN
  SELECT COUNT(*) INTO orphan_appts_client
  FROM public.appointments a
  WHERE NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = a.client_id);
  IF orphan_appts_client > 0 THEN
    RAISE EXCEPTION 'I3 FAIL: % appointment(s) point at a deleted client_id', orphan_appts_client;
  END IF;
END$$;

-- I4 — No appointment references a non-existent pet_id.
DO $$
DECLARE
  orphan_appts_pet INT;
BEGIN
  SELECT COUNT(*) INTO orphan_appts_pet
  FROM public.appointments a
  WHERE a.pet_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.pets p WHERE p.id = a.pet_id);
  IF orphan_appts_pet > 0 THEN
    RAISE EXCEPTION 'I4 FAIL: % appointment(s) point at a deleted pet_id', orphan_appts_pet;
  END IF;
END$$;

-- I5 — Landry/Laundry phone untouched.
DO $$
DECLARE
  landry_count INT;
BEGIN
  SELECT COUNT(*) INTO landry_count FROM public.clients WHERE phone = '705-796-0620';
  IF landry_count <> 4 THEN
    RAISE EXCEPTION 'I5 FAIL: phone 705-796-0620 row count is % (expected 4 — Sam blocker)', landry_count;
  END IF;
END$$;

-- I6 — No ghost row survived.
DO $$
DECLARE
  surviving_ghosts INT;
BEGIN
  SELECT COUNT(*) INTO surviving_ghosts
  FROM _phase2_ghosts g
  WHERE EXISTS (SELECT 1 FROM public.clients x WHERE x.id = g.id);
  IF surviving_ghosts > 0 THEN
    RAISE EXCEPTION 'I6 FAIL: % ghost client(s) still present after delete', surviving_ghosts;
  END IF;
END$$;

-- I7 — Appointments-per-phone unchanged. Catches the case where re-pointing
-- accidentally moves appointments out of their phone group.
DO $$
DECLARE
  bad_phones INT;
BEGIN
  SELECT COUNT(*) INTO bad_phones
  FROM _phase2_appts_per_phone_pre pre
  JOIN (
    SELECT c.phone, COUNT(a.id) AS appts_post
    FROM _phase2_canonical can
    JOIN public.clients c      ON c.id = can.id
    LEFT JOIN public.appointments a ON a.client_id = c.id
    GROUP BY c.phone
  ) post ON post.phone = pre.phone
  WHERE pre.appts_pre <> post.appts_post;
  IF bad_phones > 0 THEN
    RAISE EXCEPTION 'I7 FAIL: % phone group(s) have a different appt count post vs pre', bad_phones;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2.8 Final summary (visible in Supabase SQL editor before commit)
-- ---------------------------------------------------------------------------
-- Russell: read this row carefully before flipping ROLLBACK to COMMIT.
--   - appointments_delta MUST be 0
--   - clients_delta should be exactly -137 (or G4 would have fired)
--   - pets_delta should be exactly -171, with pets 352 → 181
--     (rollback-tested 2026-05-15; the earlier soft estimate of [-147, -140]
--     undercounted ghost-row pets — invariants I1-I7 passed during the
--     rollback test, so the deletion shape is correct).
SELECT
  c_pre  AS clients_pre,
  c_post AS clients_post,
  (c_post - c_pre)   AS clients_delta,
  p_pre  AS pets_pre,
  p_post AS pets_post,
  (p_post - p_pre)   AS pets_delta,
  a_pre  AS appointments_pre,
  a_post AS appointments_post,
  (a_post - a_pre)   AS appointments_delta,
  ghosts_deleted,
  canonicals_kept
FROM (
  SELECT
    (SELECT clients_pre      FROM _phase2_pre_counts) AS c_pre,
    (SELECT COUNT(*) FROM public.clients)             AS c_post,
    (SELECT pets_pre         FROM _phase2_pre_counts) AS p_pre,
    (SELECT COUNT(*) FROM public.pets)                AS p_post,
    (SELECT appointments_pre FROM _phase2_pre_counts) AS a_pre,
    (SELECT COUNT(*) FROM public.appointments)        AS a_post,
    (SELECT COUNT(*) FROM _phase2_ghosts)             AS ghosts_deleted,
    (SELECT COUNT(*) FROM _phase2_canonical)          AS canonicals_kept
) s;

-- ---------------------------------------------------------------------------
-- 2.9 ROLLBACK / COMMIT
-- ---------------------------------------------------------------------------
-- DEFAULT: ROLLBACK. The script as written CANNOT mutate the database.
--
-- To ship: change `ROLLBACK;` to `COMMIT;` ONLY AFTER:
--   (a) the dry-run preview in SECTION 1 has been reviewed and approved,
--   (b) all 8 pre-write gates in 2.2 (G1-G8) and all 7 post-write invariants
--       in 2.7 (I1-I7) pass without any RAISE EXCEPTION,
--   (c) Russell confirms the row-count summary in 2.8 matches the baseline:
--       appointments_delta == 0, clients_delta == -137, pets_delta == -171
--       (pets 352 → 181; rollback-tested 2026-05-15).

ROLLBACK;
-- COMMIT;

-- =============================================================================
-- End of Phase 2 dedup draft.
-- =============================================================================
