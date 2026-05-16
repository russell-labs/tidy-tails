---
when: 2026-05-16
who: Cowork
purpose: Phase 2 dedup execution record. What ran, when, what was verified, what the state looks like after.
venture: tidy-tails
supabase_project: pgkwovokciaqnbhpttba
---

# Phase 2 Execution Report — 2026-05-16

## Approval

Russell Cole approved Phase 2 execution in this Cowork session on 2026-05-16, after a halt-and-fresh-backup loop:

- Initial COMMIT approval (option 1) was deferred because Cowork could not reach `~/venture-ops/backups/tidy-tails/2026-05-15/` from the sandbox.
- Russell directed a fresh pre-commit backup before re-asking for approval.
- Backup taken at `_private/backups/2026-05-16-phase-2-precommit/` (workspace path, gitignored via `_private/`). All six tables snapshotted; manifest sealed with SHA-256.
- Live counts re-verified at 19:15:14 UTC: `268 / 352 / 730`, Landry 4, dependent tables 0/0/0.
- Final COMMIT approval (option 1) granted with explicit verification checklist.

**Approval conditions met:**

- Rollback-only Section 2 test (2026-05-15) passed cleanly: all 8 pre-write gates G1–G8 and all 7 post-write invariants I1–I7 raised no exceptions.
- Fresh logical backup taken 2026-05-16 19:14 UTC (location, manifest, and hashes below).
- Hardened SQL re-baselined to post-Phase-1 state (G2 → `(101, 13, 0, 114)`, G4 → `(250, 113, 137)`).
- Expected `pets_delta` updated from the original soft estimate `[-147, -140]` to the rollback-tested `-171`.
- Default `ROLLBACK;` line consciously edited to `COMMIT;` immediately before execution and restored immediately after.

---

## Execution

**SQL file:** `_reports/2026-05-15-phase-2-dedup.sql` (Section 2 only).

**Executed via:** Supabase MCP (`execute_sql`) against project `pgkwovokciaqnbhpttba`.

**Executed at:** 2026-05-16, transactional submission completed before the post-state verification SELECT returned at 19:18:07 UTC.

**Transaction:** Single `BEGIN ... COMMIT` block containing 6 temp-table creations, 8 pre-write gate `DO` blocks, 2 UPDATEs, 2 DELETEs, 7 post-write invariant `DO` blocks, and the final summary `SELECT`. Result: the 2.8 summary row plus a clean COMMIT — no errors, no notices.

---

## Scope executed

| Section | Statement | Effect |
|---|---|---|
| 2.1 | Temp tables `_phase2_pre_counts`, `_phase2_dup_phones`, `_phase2_ranked`, `_phase2_canonical`, `_phase2_ghosts`, `_phase2_appts_per_phone_pre` | Pre-state snapshot in-transaction |
| 2.2 (G1–G8) | 8 fail-loud `DO` blocks | All passed |
| 2.3 | `UPDATE public.pets` re-pointing ghost-row pets that own appointments to canonical | Re-point step |
| 2.4 | `UPDATE public.appointments` re-pointing `client_id` from ghost → canonical | 38 appointments re-pointed (per Section 1 dry-run; not separately counted at COMMIT) |
| 2.5 | `DELETE public.pets` for appointment-free ghost pets | Pet deletion step |
| 2.6 | `DELETE public.clients` for all ghost client rows | 137 ghost client rows deleted |
| 2.7 (I1–I7) | 7 fail-loud `DO` blocks | All passed |
| 2.8 | Summary `SELECT` returning pre/post/delta columns | Returned single row (below) |

---

## Verification results

### Section 2.8 summary row (in-transaction, verbatim)

```json
[{
  "clients_pre": 268,
  "clients_post": 131,
  "clients_delta": -137,
  "pets_pre": 352,
  "pets_post": 181,
  "pets_delta": -171,
  "appointments_pre": 730,
  "appointments_post": 730,
  "appointments_delta": 0,
  "ghosts_deleted": 137,
  "canonicals_kept": 113
}]
```

Matches the rollback-test summary row exactly. All three hard-asserted deltas are correct: `clients_delta == -137`, `appointments_delta == 0`, `pets_delta == -171`.

### Independent post-commit live verification (2026-05-16 19:18:07 UTC)

```json
[{
  "clients": 131,
  "pets": 181,
  "appointments": 730,
  "landry_rows": 4,
  "booking_requests": 0,
  "client_accounts": 0,
  "automations_log": 0,
  "remaining_duplicate_phone_groups": 0,
  "orphan_appts_client": 0,
  "orphan_appts_pet": 0
}]
```

| Check | Expected | Actual | Verdict |
|---|---|---|---|
| Clients | 131 | 131 | PASS |
| Pets | 181 | 181 | PASS |
| Appointments | 730 | 730 | PASS (load-bearing invariant) |
| Landry/Laundry rows | 4 | 4 | PASS (untouched) |
| booking_requests | 0 | 0 | PASS |
| client_accounts | 0 | 0 | PASS |
| automations_log | 0 | 0 | PASS |
| Remaining duplicate phone groups (excluding Landry) | 0 | 0 | PASS (full dedup achieved) |
| Orphan appointment client_id | 0 | 0 | PASS |
| Orphan appointment pet_id | 0 | 0 | PASS |

### Gate / invariant summary

- **Pre-write gates G1–G8:** ALL PASSED. No exception raised.
- **Post-write invariants I1–I7:** ALL PASSED. No exception raised.
- **Supabase notices/errors:** None. The only output was the Section 2.8 summary row.

---

## Pre-commit backup record

| Item | Value |
|---|---|
| Backup path | `_private/backups/2026-05-16-phase-2-precommit/` (workspace, gitignored under `_private/`) |
| Backup timestamp | 2026-05-16 19:14:51 UTC |
| Method | Supabase REST anon `SELECT *` with `Range` pagination (script: `/tmp/backup_phase2_precommit.py`) |
| Manifest | `MANIFEST.json` (1,394 bytes) |
| clients.json | 268 rows, 135,286 bytes, SHA-256 `b5a0a6cc0825baedbd64ec0eada300fd1cea0d296f482967a838fac3c556f780` |
| pets.json | 352 rows, 228,397 bytes, SHA-256 `202464435b6a60961726714ff07d75821a8a0cd6f0856d1c5495bd535e67dc61` |
| appointments.json | 730 rows, 353,175 bytes, SHA-256 `02bf0987490ebd36c921afd33d997ce621edbf0660c91f74d6eff8fdab749c1d` |
| booking_requests.json | 0 rows, 2 bytes (`[]`), SHA-256 `4f53cda1...` |
| client_accounts.json | 0 rows, 2 bytes (`[]`), SHA-256 `4f53cda1...` |
| automations_log.json | 0 rows, 2 bytes (`[]`), SHA-256 `4f53cda1...` |

**Note:** This is the rollback source of record for Phase 2. Russell should mirror it to `~/venture-ops/backups/tidy-tails/2026-05-16-phase-2-precommit/` on the Mac filesystem at first opportunity so the venture-ops directory remains the canonical store. The workspace copy is operational backup, not the canonical archive.

The earlier 2026-05-15 Phase 1 backup at `~/venture-ops/backups/tidy-tails/2026-05-15/` remains valid as the pre-Phase-1 restore point.

---

## SQL state after execution

The `ROLLBACK;` / `-- COMMIT;` lines in `_reports/2026-05-15-phase-2-dedup.sql` were consciously swapped to `-- ROLLBACK;` / `COMMIT;` immediately before execution, and consciously restored to `ROLLBACK;` / `-- COMMIT;` immediately after. The committed file is back to its default rollback-only posture so a future re-run is impossible without another deliberate flip.

---

## Pets-delta note

The Section 2.9 commit checklist originally carried a soft estimate `pets_delta in [-147, -140]`. The 2026-05-15 rollback-only test produced `pets_delta == -171` instead, and the SQL/notes were updated to that value before COMMIT (see Section 2.8 / 2.9 comments). The committed delta of `-171` matches.

The reason the soft estimate undercounted: a few ghost client rows carry several pets each (e.g. Jane Donaldson's ghost row alone holds 6 pets), and the original heuristic assumed roughly one pet per ghost client. Invariant I4 ("no appointment references a non-existent pet_id") passed during both the rollback test and the COMMIT, so the deletion shape is correct — only the soft prediction was wrong, not the math.

---

## Outstanding items after Phase 2

- **Landry/Laundry (705-796-0620)** — 4 rows still present, deliberately excluded by Phase 2. Russell needs Sam's answer on Cash vs Charlotte before a follow-up patch can clean this group. `v1-active-bugs.md` B4 remains partially open.
- **Phase 3 INSERTs** — 7 new clients + 8 new pets queued per `_reports/2026-05-14-reconciliation-plan.md`. Phase 2 was the prerequisite; Phase 3 is now unblocked.
- **Phase 4 Codex enrichment** — typical_fee, color, sex, special_notes additions. Lower priority; can run incrementally.
- **Remaining contact-card batches** — ~189 of ~268+ cards still unprocessed. Workstream B continuation.
- **`venture-ops/dump_supabase.py`** — still does not exist on disk despite CLAUDE.md reference. The Python script written for this backup (`/tmp/backup_phase2_precommit.py`) is a candidate prototype; lift into venture-ops with a proper interface before the next phase.
- **B1 / R-1 (permissive RLS)** — unchanged by Phase 2. Still the largest open risk. v2 auth layer is the canonical fix path.

---

## Files written this session

- `_private/backups/2026-05-16-phase-2-precommit/clients.json`
- `_private/backups/2026-05-16-phase-2-precommit/pets.json`
- `_private/backups/2026-05-16-phase-2-precommit/appointments.json`
- `_private/backups/2026-05-16-phase-2-precommit/booking_requests.json`
- `_private/backups/2026-05-16-phase-2-precommit/client_accounts.json`
- `_private/backups/2026-05-16-phase-2-precommit/automations_log.json`
- `_private/backups/2026-05-16-phase-2-precommit/MANIFEST.json`
- `_reports/2026-05-16-phase-2-execution-report.md` (this file)

## Files edited this session

- `_reports/2026-05-15-phase-2-dedup.sql` — `ROLLBACK;` ↔ `COMMIT;` swap (now restored to default ROLLBACK)
- `HANDOFF.md` — Phase 2 execution log entry, Whose-turn / Focus update
- `v1-active-bugs.md` — B4 progress update

---

*Generated by Cowork 2026-05-16. Phase 2 dedup committed cleanly. 137 ghost client rows + 171 ghost pet rows removed. All 730 appointments preserved.*
