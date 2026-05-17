---
when: 2026-05-15 (updated 2026-05-17 after Phase 3.5 appointment backfills COMMIT)
who: Cowork
purpose: Current venture state snapshot for KoyaOS ingestion. Covers live product, database, reconciliation progress, open risks, and pending execution gates. Read alongside CLAUDE.md, HANDOFF.md, and the source registry.
status: current as of 2026-05-17 (post-Phase-3.5 appointment backfills COMMIT)
venture: tidy-tails
supabase_project: pgkwovokciaqnbhpttba
---

# Tidy Tails — Venture State Snapshot

---

## Product state

**v1 is live and in daily use.**

URL: `https://russell-labs.github.io/tidy-tails/home.html`

Five HTML modules: `home`, `index`, `intake`, `client`, `report`, `export`. Static HTML + direct browser-to-Supabase calls + Twilio-backed `send-sms` edge function. No auth. Samantha is the only user.

Samantha runs her full grooming business on v1: booking, intake, client lookup, appointment history, SMS reminders. This is not a demo or prototype.

**v2 is not started.** Design cards exist on Russell's wall. No code. V2 design-lock prep/spec exists, and Pawfinity logged-in recon is complete. Execution remains gated on V1_HARDENED and V2_DESIGN_LOCK.

---

## Database state

| Table | Count | Source |
|---|---|---|
| clients | 137 | Post-Phase-3 COMMIT live (2026-05-17); unchanged by Phase 3.5. Was 131 pre-Phase-3, 268 pre-Phase-2. |
| pets | 188 | Post-Phase-3 COMMIT live (2026-05-17); unchanged by Phase 3.5. Was 181 pre-Phase-3, 352 pre-Phase-2. |
| appointments | 735 | Post-Phase-3.5 COMMIT live (2026-05-17). Was 730 pre-Phase-3.5 (held through Phases 1-3 as a load-bearing invariant). Phase 3.5 added 5 historical backfills (Whiskey×3 + Kiwi×2). |

The original 268 clients were bulk-imported from Excel in a 2-minute window on 2026-04-09 (21:26–21:28). The double-import created 115 duplicate phone groups; Phase 1B's Backway phone normalization consolidated this to 114 groups (101 two-row, 13 four-row = 140 ghost rows in the post-Phase-1 baseline).

**Phase 2 COMMITTED 2026-05-16.** 137 ghost client rows + 171 ghost pet rows removed (137 + 3 Landry ghosts retained); 38 appointments re-pointed from ghost client_ids to canonical client_ids; all 730 appointments preserved. Post-COMMIT verification confirmed 0 remaining duplicate phone groups outside Landry/Laundry, and 0 orphan appointment FKs. Execution report: `_reports/2026-05-16-phase-2-execution-report.md`.

**Phase 3 COMMITTED 2026-05-17.** 6 new clients (Mary Anca, Nancy Cauchi, Gardy, Ashley Nichols, Mary Nichols, Christina Kitchen) + 7 new pets (Whiskey, Ruby, Coco, Kahlúa, Merlyn, Vader, Winston) inserted. All 730 appointments preserved. Korrie Silver / Gavi held out: G5 rollback test caught an existing same-person row at phone `647-300-7952` with two within-client Gavi pet duplicates that need separate reconciliation. Execution report: `_reports/2026-05-17-phase-3-execution-report.md`.

**Landry/Laundry (705-796-0620) — 4 rows still present, deliberately excluded by Phases 1, 2, and 3.** Sam needs to clarify Cash vs Charlotte before a follow-up patch can clean this group.

**Korrie Silver / Gavi — held out by Phase 3 G5 catch.** Existing row at `647-300-7952` (client_id `56f4385b-b103-4aab-86a3-f18219d7aabe`) carries 8 appointments and two Gavi pet rows that need within-client dedup. Reconciliation pending Sam input on canonical phone format and Gavi identity. See `_reports/2026-05-16-phase-3-rollback-test-outcome.md`.

**Financial alignment:** Ledger = 731 rows / $57,881.25 gross. Supabase = 730 appointments / $57,821.25 gross. Delta = 1 appointment: Russell Cole / Kiwi, 2024-06-06, $60. Ledger and database are effectively aligned.

---

## Open risks

### R-1 — RLS permissive policies (SEVERITY: HIGH)

RLS is enabled on all six public tables but every SELECT/INSERT/UPDATE policy is `qual = true, roles = {public}`. The anon key is in v1's HTML. Anyone with the key can read or write arbitrary rows. Partial mitigation: DELETE policies dropped 2026-04-22, so anon can no longer delete rows. Full fix requires v2 auth. Do not add auth-sensitive features to v1 without closing this first.

### R-2 — No automated backups (SEVERITY: MEDIUM)

Supabase free tier. Manual logical dump at `venture-ops/backups/tidy-tails/` on Russell's Mac (not in repo). Last dump: 2026-05-15 (taken before Phase 1 execution — clients.csv 268 rows, pets.csv 352 rows). Note: `dump_supabase.py` does not exist on disk; backup was done via REST API workaround. Script should be written before next SQL phase.

### R-3 — v1 is load-bearing (SEVERITY: MEDIUM)

GitHub Pages auto-deploys on merge to `main`. Any query-shape or table-name change ships to Samantha immediately. Default is read-only on v1 schema. All Phase 1–4 changes are data-layer only (UPDATE/INSERT/DELETE on row content, no schema changes).

---

## Reconciliation workstream state

### Workstream A — BUILD doc parity
**Status: done** (2026-05-13). CONTEXT.md, ROADMAP.md, GLOSSARY.md, METRICS.md (stub), v1-final-state-spec.md (stub), v1-active-bugs.md (stub), koya_inputs/00_venture_brief.md (stub), HANDOFF.md all created.

### Workstream B — Contact-card reconciliation
**Status: in-progress.** 79 of ~268+ cards processed. Sam's 49-question review complete (69 rows in sam_review_responses). Phase 1 SQL generated, verified, executed, and spot-checked clean.

**Phase 1 — Safe UPDATEs**
- SQL: `_reports/2026-05-14-phase-1-safe-updates.sql`
- Review: `_reports/2026-05-14-phase-1-safe-updates-review.md`
- Verifier: `_reports/2026-05-14-phase-1-safe-updates-codex-verifier.md`
- Execution report: `_reports/2026-05-15-phase-1-execution-report.md`
- **Status: EXECUTED 2026-05-15 — verified clean**
- Scope: 29 UPDATEs across 18 client rows + 11 pet rows. No DELETEs, no INSERTs, no schema changes, no appointment mutations.
- Post-run: all 18 client rows + 11 pet rows spot-checked ✓. Appointments = 730 (unchanged) ✓. Clients = 268, pets = 352 (unchanged) ✓.

**Phase 2 — Dedup (ghost row deletion)**
- SQL: `_reports/2026-05-15-phase-2-dedup.sql` (set-based, temp-table-driven, 8 pre-write gates G1-G8 + 7 post-write invariants I1-I7, default ROLLBACK)
- Notes: `_reports/2026-05-15-phase-2-dedup-notes.md`
- Pre-flight output: `_reports/2026-05-15-phase-2-pre-flight-output.md`
- Execution report: `_reports/2026-05-16-phase-2-execution-report.md`
- **Status: COMMITTED 2026-05-16 — verified clean**
- Scope executed: 137 ghost client rows + 171 ghost pet rows deleted, 38 appointments re-pointed to canonical client_ids. 105 SAFE groups (113 ghosts) + 8 SPLIT_APPT groups (24 ghosts). Landry/Laundry (4 rows) deliberately excluded.
- Post-run: 131 clients, 181 pets, 730 appointments. 0 remaining duplicate phone groups outside Landry. 0 orphan appointment FKs. All gates and invariants passed.

**Phase 3 — New client + pet INSERTs**
- SQL: `_reports/2026-05-16-phase-3-inserts.sql` (set-based, temp-table-driven, 7 pre-write gates G1, G2, G3, G4, G5a, G5b, G6 + 7 post-write invariants I1-I7, default ROLLBACK)
- Plan: `_reports/2026-05-16-phase-3-insert-plan.md`
- Rollback-test outcome: `_reports/2026-05-16-phase-3-rollback-test-outcome.md` (documents the G5 catch on Korrie Silver and the resulting holdout decision)
- Execution report: `_reports/2026-05-17-phase-3-execution-report.md`
- **Status: COMMITTED 2026-05-17 — verified clean**
- Scope executed: 6 client INSERTs + 7 pet INSERTs (Korrie Silver client + Gavi pet held out per the rollback-test G5 catch).
- Post-run: 137 clients, 188 pets, 730 appointments. Landry/Laundry 4 rows untouched. Korrie holdout 1 row untouched. Dependent tables 0/0/0. 0 orphan appointment FKs. All gates and invariants passed.

**Phase 3.5 — Historical appointment backfills**
- Plan: `_reports/2026-05-16-phase-3.5-appointment-backfills-plan.md`
- SQL: `_reports/2026-05-17-phase-3.5-appointment-backfills.sql` (9 pre-write gates G1-G9 + 7 post-write invariants I1-I7, default ROLLBACK)
- Execution report: `_reports/2026-05-17-phase-3.5-execution-report.md`
- **Status: COMMITTED 2026-05-17 — verified clean**
- Scope executed: 5 historical appointment INSERTs (Whiskey×3 + Kiwi×2). Conservative NULL policy: time_slot/location/service_type/tip/rent_paid/net/status set to NULL where Codex was silent (bypasses column defaults to preserve "unknown" as a distinct value). notes carry the Codex grooming description plus a `[Phase 3.5 backfill 2026-05-17]` tag.
- Post-run: 137 clients, 188 pets, 735 appointments. Landry 4 untouched, Korrie holdout 1 untouched. 0 orphan appointment FKs.
- Schema discovery in the same loop: the live `appointments` table has 14 columns, not the 7 v2 design-lock spec §6.1 originally listed. Spec corrected.

**Phase 3.5.1 — Date-ambiguous appointment backfills (planning candidate)**
- Status: not written. Holds 3 rows: Kiwi 2024-07-??, Ruby / Nancy Cauchi 2024-08-??, Coco / Gardy 2023-12-14 (year ambiguous). Each blocked on Sam reading the original cards.
- Scope: 7 new clients + 8 pets. Mary Anca, Nancy Cauchi, Gardy, Ashley Nichols, Mary Nichols (+ Merlyn), Korrie Silver / Gavi, Christina Kitchen / Winston.

**Phase 4 — Codex pet enrichment**
- Status: not written. Blocked on Phase 3.
- Scope: Backfill Typical_Fee, Special_Notes, Color, Sex from Codex extracted CSVs for ~38 pets.

### Workstream C — Pawfinity logged-in recon
**Status: complete (2026-05-15).** Codex performed a read-only logged-in recon. No live records were mutated, exported, messaged, scheduled, charged, or deleted.

Artifacts:
- `_reports/2026-05-15-pawfinity-logged-in-recon.md`
- `_reports/2026-05-15-pawfinity-v2-implications.md`

Product decision: Pawfinity validates the category and the wedge. Tidy v2 should not clone Pawfinity's broad legacy suite; it should build a mobile-first Samantha grooming cockpit centered on search, pet safety notes, quick groom logging, SMS reminders, lapsed clients, vaccination status, and simple revenue visibility.

---

## Open decisions

| Decision | Status | Notes |
|---|---|---|
| Landry/Laundry (705-796-0620) | Pending Russell + Sam | Cash or Charlotte? May be the same dog. |
| Dunlop phone (705-323-7685 vs 705-383-7685) | Pending Sam confirmation | Codex says 383, backup has 323. Hold. |
| Gardy first name | Not confirmed | Sam didn't provide one. Phase 3 INSERT will leave blank. |
| Apollo pet row | Pending | Sam said misread, not a pet name. Confirm which row before deleting. |
| Russell/Kiwi 2024-06-06 backfill | Not done | $60 visit in ledger, not in Supabase. Manual or Phase 3. |
| Gunner/Tommassetti | Not found | Get phone from Sam. Phase 3 investigation. |

---

## Milestone state

| Milestone | Status |
|---|---|
| V1_DOC_PARITY | done (2026-05-13) |
| CONTACT_CARD_ARCHIVE_RECONCILED | in-progress |
| PAWFINITY_LOGGED_IN_RECON | done (2026-05-15) |
| V1_HARDENED | not started — blocked on CONTACT_CARD_ARCHIVE_RECONCILED |
| V2_DESIGN_LOCK | draft spec exists — blocked on V1_HARDENED and open Russell/Samantha decisions |
| V2_SCAFFOLD | not started |
| V2_PARALLEL_RUN | not started |
| V2_CUTOVER | not started |
| LICENSEABLE_READY | not started |

---

## What to do next session

1. Write Phase 2 dedup SQL. Reference: `_reports/2026-05-14-reconciliation-plan.md`. 106 safe ghost-row deletions + 9 split-appt groups (need appointment re-pointing first). No execution without Russell approval.
2. Ask Sam: Landry/Laundry (705-796-0620) — Cash or Charlotte?
3. Write `venture-ops/dump_supabase.py` so future backups don't require REST API workaround.
4. Use the Pawfinity recon artifacts to keep v2 scope narrow: mobile-first search cockpit, pet safety cards, quick groom logging, SMS, lapsed clients, vaccination status, simple revenue.
5. Begin Phase 3 planning (7 new client INSERTs) once Phase 2 is approved and executed.

---

*Generated by Cowork 2026-05-15. Updated by Codex post-Pawfinity-recon 2026-05-15.*
