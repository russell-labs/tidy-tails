---
when: 2026-05-15
who: Cowork
purpose: Verifier notes for Phase 2 dedup SQL draft. Companion to `_reports/2026-05-15-phase-2-dedup.sql`. Does not execute anything.
venture: tidy-tails
supabase_project: pgkwovokciaqnbhpttba
status: DRAFT — pending Russell review
gated_on: dry-run output review, Section 2 rollback-test review
---

# Phase 2 Dedup — Verifier Notes

This is the reading aid for `2026-05-15-phase-2-dedup.sql`. It explains how the draft proves the two non-negotiables Russell asked for: **no appointment loss** and **no canonical-row deletion**. Read this before changing `ROLLBACK` to `COMMIT`.

## What Phase 2 is doing

The 2026-04-09 21:26-21:28 double-import created mirror copies of every client and every pet. After Phase 1B's Backway phone normalization (which collapsed two pre-Phase-1 2-row clusters into one 4-row cluster), the **post-Phase-1 baseline** classifies the resulting **114 duplicate phone groups** into three buckets:

| Bucket | Groups | Ghost rows | Behaviour |
|---|---|---|---|
| Safe | 105 | 113 client rows + ~135 pet rows | Direct delete. Ghosts hold zero appointments and zero pets-with-appointments. |
| Split-appt | 8 | 24 client rows; a subset hold appointments and/or pets-with-appointments | Re-point appointments and pets to canonical, THEN delete the now-empty ghosts. |
| Blocked | 1 | Phone 705-796-0620 (Landry/Laundry), 3 ghost rows | Skipped entirely. Sam must decide Cash vs Charlotte first. |

The SQL handles all three uniformly: the re-pointing UPDATEs touch zero rows on the 105 safe groups, so the same code path is correct for both safe and split-appt groups. Landry/Laundry is excluded by a single `WHERE phone <> '705-796-0620'` in the duplicate-phones CTE and is re-checked four more times by pre-write gates G3, G4, G7 and post-write invariant I5.

## Pre-write gates (G1-G8) — what fires before any write

Section 2.2 of the SQL runs eight `DO $$ ... $$` blocks immediately after the temp tables are built and BEFORE any UPDATE or DELETE. Each gate raises an exception with a specific failure message; any one of them aborting the transaction prevents the script from touching live tables.

| Gate | What it asserts | Why it matters |
|---|---|---|
| **G1** | `clients = 268`, `pets = 352`, `appointments = 730` | The plan was verified against the Phase 1 post-state. If anything has changed since (manual edits, an Excel import, a v2-scaffold write), the plan's group counts are stale and Phase 2 must be re-baselined. |
| **G2** | Duplicate phone inventory is exactly 101 size-2 + 13 size-4 = 114 groups before Landry is excluded; nothing of any other size. | If new duplicates have appeared (or existing duplicates have split) since the 2026-05-15 dry-run, the 105/8/1 classification no longer maps cleanly to the data. Fail-loud forces a re-read of the plan. |
| **G3** | Phone 705-796-0620 has exactly 4 rows in `clients`. | If Sam answered Cash/Charlotte and someone already started cleaning the cluster, this script's exclusion logic is no longer the right shape. Refuse to run. |
| **G4** | Working set sizes after Landry exclusion: `ranked = 250`, `canonical = 113`, `ghosts = 137`. | This is the deterministic post-exclusion math. If any of the three numbers is off, the dry-run preview row count is also off — pause and reconcile. |
| **G5** | Canonical and ghost sets are disjoint. | Belt-and-braces — `ROW_NUMBER()` already guarantees this, but the gate catches any operator-edit that broke the partitioning logic. |
| **G6** | Every ghost row has a canonical of the same phone. | If a phone group somehow ended up with only ghosts (no canonical), no re-pointing target exists and we'd delete data. |
| **G7** | Phone 705-796-0620 is absent from `_phase2_ranked`. | The exclusion in step 2.1 worked; nothing slipped through. |
| **G8** | `booking_requests`, `client_accounts`, and `automations_log` all have 0 rows. | CLAUDE.md baseline. v1 HTML modules reference `booking_requests` and `client_accounts`, so if either has rows, this script does NOT model the FK blast radius — a client delete could orphan a real row in those tables. Fail-loud forces a manual audit before continuing. |

Together G1–G8 mean: the script's idea of the data exactly matches the plan, the blast radius is exactly the three tables we model (`clients`, `pets`, `appointments`), or it refuses to write anything. The dry-run preview in Section 1 lets Russell eyeball this earlier, but Section 2.2 is the load-bearing check.

## How canonical is picked

Inside each phone group, every client row is ranked by:

1. `appt_count DESC` — the row Samantha has actually billed against wins.
2. `created_at ASC` — among ties, the older row wins (helps when both rows have 0 appts — picks the first import).
3. `id ASC` — final deterministic tiebreak so the choice is reproducible across runs.

Rank 1 in each group is the **canonical**. Ranks 2+ are **ghosts**.

The same ordering rule was used in Phase 1 to choose canonical UUIDs for the name corrections, so the canonical set here matches the rows Phase 1 already cleaned.

## How "no appointment loss" is proven

Three independent checks fire after every write, inside the transaction. If any one of them fails, `RAISE EXCEPTION` aborts and the entire transaction rolls back atomically — nothing ships.

| Check | What it proves |
|---|---|
| **I1** | `COUNT(*) FROM appointments` is identical pre and post. The expected delta is exactly zero. |
| **I3** | No appointment references a non-existent client_id. Catches the case where a ghost holding an appointment got deleted without re-pointing. |
| **I4** | No appointment references a non-existent pet_id. Catches the case where a ghost pet holding an appointment got deleted without re-pointing. |
| **I7** | Per-phone-group appointment counts are unchanged. Catches re-pointing bugs that would move an appointment to a different phone group's canonical. |

The re-pointing order is the second half of the proof:

1. Re-point **pets** that own appointments → canonical (step 2.3).
2. Re-point **appointments** still referencing a ghost client_id → canonical (step 2.4).
3. Delete ghost pets, but only those that own zero appointments (step 2.5).
4. Delete ghost clients (step 2.6).

By the time step 2.5 runs, every pet that owns an appointment lives on a canonical client. By the time step 2.6 runs, every appointment references a canonical client_id and a canonical-resident pet_id. The FK chain is intact at every step. The transaction is the unit of atomicity, so an interruption between steps cannot produce a partial dedup.

## How "no canonical-row deletion" is proven

The SQL never DELETEs from a set that includes canonicals. Every DELETE is gated on `id IN (SELECT id FROM _phase2_ghosts)`. The ghost set is constructed once at the top of the transaction (step 2.1) and is mathematically disjoint from the canonical set — proven by gate 2.2.b, which fails the transaction if any row appears in both sets.

After the deletes, **I2** independently re-checks the post-state: every canonical id from the pre-state snapshot must still exist in `public.clients`. If any canonical was somehow deleted (operator error in editing the script, FK cascade we didn't anticipate), I2 raises and the transaction rolls back.

**I6** is the symmetric check for ghosts — every ghost id must be absent post-state. Together, I2 and I6 prove the delete set exactly equals the ghost set.

## How the Landry/Laundry block is enforced

Five layers of defense:

1. **Exclusion in `_phase2_dup_phones`** (step 2.1): `WHERE phone <> '705-796-0620'`. The ghost set literally cannot contain a Landry/Laundry row.
2. **Pre-write gate G3**: aborts the transaction if the phone doesn't have exactly 4 rows in `clients` — catches the case where someone already started cleaning the cluster.
3. **Pre-write gate G7**: aborts if any row at that phone leaked into `_phase2_ranked` (i.e., the step 2.1 filter didn't fire correctly).
4. **Pre-write gate G4**: indirectly catches a Landry leak because the expected `_phase2_ranked` count is exactly 250 — any extra row from Landry would push it to 254.
5. **Post-write invariant I5**: re-counts rows at that phone and aborts if it isn't 4. (Phase 1 didn't touch this phone, and Phase 2 must not either.)

If/when Sam clarifies (Cash vs Charlotte), the unblocking patch is small: drop the exclusion in step 2.1, relax G3/G4 to the new expected counts, and add a one-off canonical override for that phone group.

## What the dry-run preview returns

Section 1 of the SQL is a single `SELECT` that produces one row per ghost, with columns:

| Column | Meaning |
|---|---|
| classification | `SAFE` (one of the 105) or `SPLIT_APPT` (one of the 8) |
| phone | the duplicate phone |
| ghost_id, ghost_first_name, ghost_last_name | the row that will be deleted |
| ghost_appt_count | appointments currently on this ghost (should be 0 for SAFE) |
| ghost_pet_count | pets currently on this ghost (a count, not an appt-bearing-pets count) |
| canonical_id, canonical_first_name, canonical_last_name | the row that will survive |
| canonical_appt_count | appointments currently on canonical (the column that drove the choice) |

Expected output volume: **137 rows**, derived from the post-Phase-1 baseline (verified by the 2026-05-15 dry-run, captured in `_reports/2026-05-15-phase-2-pre-flight-output.md`):

- 114 duplicate phone groups total (101 two-row + 13 four-row).
- 1 four-row group blocked (Landry/Laundry) → 3 ghosts excluded.
- 113 non-blocked groups remain: 101 two-row + 12 four-row = 101 + 36 = 137 ghost rows.

Observed classification split from the 2026-05-15 dry-run:

| Classification | Group count | Ghost rows |
|---|---|---|
| SAFE (two-row) | 101 | 101 |
| SAFE (four-row) | 4 | 12 |
| SPLIT_APPT (four-row) | 8 | 24 |
| BLOCKED (Landry/Laundry, four-row) | 1 | 0 (excluded) |
| **Total in dry-run output** | **113** | **137** |

The 4 SAFE four-row clusters are: Backway 705-330-6144 (consolidated from two pre-Phase-1B 2-row clusters), Cory Handy 705-955-4414, McKee 416-317-2038, Wallis/Borrelli 705-229-6170.

Russell: if the actual output diverges from 137 — fewer than ~125 or more than ~150 rows — pause and reconcile against `_reports/2026-05-15-phase-2-pre-flight-output.md` before running the transactional section. The baseline assumes the only data-changes since the 2026-05-15 dry-run are zero; any external changes invalidate the predicted counts.

## Run order (the playbook for Russell)

1. **Take a fresh backup** — `venture-ops/dump_supabase.py` is referenced but not yet written; the 2026-05-15 Phase 1 backup is the working baseline. If anything in `clients` or `pets` has changed since Phase 1 execution, dump fresh first.
2. **Run SECTION 0** in the Supabase SQL editor. Each of 0.1–0.6 is a commented-out SELECT; uncomment and run them one at a time. Confirm: row counts match Phase 1 post-state (268 / 352 / 730), duplicate inventory matches the post-Phase-1 baseline (101 size-2 + 13 size-4 = 114 groups), Landry/Laundry shows 4 rows, the empty-phone audit shows the expected residual rows, the schema audit returns 0 rows (i.e. neither `pets` nor `appointments` has `updated_at`), and all three dependent tables show 0 rows.
3. **Run SECTION 1** (the dry-run preview). Read the output. Spot-check ~5 random rows by phone to confirm the canonical choice looks right (highest-appts row is being kept). Expected row count: 137.
4. **If anything in step 2 or 3 looks off, stop.** Open a question; do not run section 2.
5. **Run SECTION 2** as a single block. The default `ROLLBACK;` at the end means nothing commits even if every gate and invariant passes. The eight pre-write gates G1–G8 fire automatically inside the transaction — if any of them raises, the transaction aborts before any write.
6. **Read the row from step 2.8** (the final summary, with explicit delta columns). It must show:
   - `appointments_delta == 0`
   - `clients_delta == -137`
   - `pets_delta == -171` (pets 352 → 181). This was verified by the 2026-05-15 rollback-only test. The earlier soft estimate of `[-147, -140]` undercounted ghost-row pets — invariants I1–I7 passed during that test, so the deletion shape is correct.
   - `ghosts_deleted == 137`
   - `canonicals_kept == 113`
7. **Flip `ROLLBACK;` to `COMMIT;`** in the file. Re-run section 2. Russell or the operator must do this consciously; the script cannot auto-commit.
8. **Re-snapshot** clients/pets backups after commit. Update HANDOFF.md with the actual deltas.

## Known caveats

- **Empty-phone rows are not deduplicated.** Section 0.4 audits them. Phase 1 added phones where Sam confirmed (Stillman son, Lahay). Any remaining empty-phone rows need a per-row decision and belong in a follow-up patch.
- **Pet-name duplicates may surface on canonical clients after split-appt re-pointing.** If a canonical client already had "Ozzy" and a ghost's "Ozzy" gets moved over because it owns appointments, the canonical now has two "Ozzy" rows. Phase 2 does not auto-merge these — that's a deliberate scope boundary. Expect a Phase 2.5 or Phase 4 cleanup pass for pet-name dedup.
- **Neither `pets` nor `appointments` is given `updated_at = NOW()` in this script.** Phase 1 SQL only set `updated_at` on `clients` UPDATEs (19 hits there, 0 on pets). The v2 design-lock spec also lists no `updated_at` column for pets or appointments. If a schema audit before commit shows either table actually has one, the relevant `SET` clause should add it.
- **The predicted deltas are hard-asserted for clients and appointments, and rollback-tested for pets.** `clients_delta == -137` is enforced by gate G4 (working-set sizes) — if the ghost count diverges, the transaction aborts before any write. `appointments_delta == 0` is enforced by I1. `pets_delta == -171` is the verified value from the 2026-05-15 rollback-only test, not enforced by a gate. The earlier soft estimate of `[-147, -140]` undercounted ghost-row pets (a few ghost clients carry several pets each — Jane Donaldson's ghost row alone holds 6 pets). The shape is correct: all seven invariants I1–I7 passed during the rollback, including I4 which proves no appointment lost its `pet_id` FK target.
- **Landry/Laundry remains a hard block.** Even after Phase 2 commits, that phone group still has 4 conflicting rows. Russell needs Sam's answer (Cash or Charlotte?) before a follow-up patch can clean it.
- **The script must run as service_role.** The DELETE policies on `clients` and `pets` were dropped 2026-04-22, so the anon role cannot delete rows. Use Supabase MCP `apply_migration` or the SQL editor (which runs as service_role), not a browser session against the anon endpoint.

## Open items before commit

| Item | Owner | Notes |
|---|---|---|
| Approve dry-run preview output | Russell | Section 1 result; confirm 105 SAFE groups (113 ghosts) + 8 SPLIT_APPT groups (24 ghosts) pattern matches the 2026-05-15 dry-run captured in `_reports/2026-05-15-phase-2-pre-flight-output.md` |
| Decide Landry/Laundry (Cash vs Charlotte) | Sam | Unblocks a follow-up patch, not this script |
| Fresh backup before commit | Russell | Re-run venture-ops dump or REST-API workaround |
| Run Section 0.5 schema audit | Russell | Single SELECT against `information_schema.columns`. Expected: 0 rows. If non-zero, add `, updated_at = NOW()` to section 2.3 (pets) or 2.4 (appointments) before running section 2. |

## What I'd write next, after Russell approves

1. A short "Phase 2 execution report" in the same style as `2026-05-15-phase-1-execution-report.md`, capturing the actual dry-run row counts, the final summary, and the post-commit backup path.
2. A `phase-2-landry-laundry-patch.sql` that runs after Sam's answer arrives, treating that single phone group as a one-off canonical pick.
3. The Phase 3 INSERT SQL for the 7 new clients + 8 new pets, since Phase 3 is unblocked once Phase 2 commits.

---

*Generated by Cowork 2026-05-15. Companion to the SQL draft; no DB writes are implied by this document.*
