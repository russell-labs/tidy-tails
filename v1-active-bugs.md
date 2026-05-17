# tidy-tails — Active Bugs

Rolling list of open findings. Sister to `v1-final-state-spec.md`. Severity: S1 = Critical, S2 = High/Medium, S3 = Low. Strategic and operational risks live in `RISKS.md`; this file covers implementation bugs and data gaps.

---

## B1 — Permissive RLS: anon key grants arbitrary read/write

**Status:** Open
**Severity:** S1 (Critical)
**Source:** CONTEXT.md, RISKS.md R-1, Supabase advisor

**Description:** Every SELECT/INSERT/UPDATE policy on all six public tables is `qual = true, roles = {public}`. The Supabase anon key is embedded in v1's static HTML on GitHub Pages. Any caller with the key can read or write arbitrary rows.

**Partial mitigation in place:** DELETE policies were dropped 2026-04-22. Anon role can no longer delete rows.

**Expected:** RLS policies narrow access to legitimate v1 operation only (reads are fine; writes should be scoped to the session's intended operation).
**Actual:** Anon role can INSERT or UPDATE any row in `clients`, `pets`, or `appointments` without restriction.

**Fix path:** Two options under consideration (decision in `docs/DECISIONS.md`): (a) narrow INSERT/UPDATE policies per table to the real v1 access pattern, or (b) route writes through an edge function holding a server-side role. Either path requires a v2 auth layer. Do not deploy a partial fix to v1 without a parallel-run period — policy changes ship to Samantha immediately.

**Milestone:** V1_HARDENED

---

## B2 — `client_overview` view uses SECURITY DEFINER semantics

**Status:** Open
**Severity:** S2 (Medium)
**Source:** Supabase advisor warning, CONTEXT.md, RISKS.md R-5

**Description:** The `client_overview` database view is flagged by Supabase's advisor for SECURITY DEFINER behavior. Queries through this view execute with elevated privilege and bypass RLS, regardless of the calling role.

**Expected:** Views execute with the privileges of the calling role (SECURITY INVOKER), so RLS applies normally.
**Actual:** `client_overview` runs with SECURITY DEFINER, which means it bypasses RLS. This compounds B1 — any query through this view ignores the already-permissive policies.

**Fix:** Rewrite with `SECURITY INVOKER`, or drop the view and rebuild the query in the application layer. Schema change — ships to production immediately; handle in v2 or during V1_HARDENED with a careful parallel-run.

**Milestone:** V1_HARDENED

---

## B3 — No automated backups (Supabase free tier)

**Status:** Open
**Severity:** S2 (High)
**Source:** CONTEXT.md, RISKS.md R-2, venture-ops/backups/tidy-tails/manifest.json

**Description:** Supabase free tier does not include automated point-in-time recovery. Manual logical dump is the only backup.

**Expected:** A current backup exists before any SQL mutation runs against live data.
**Actual (updated 2026-05-15):** Fresh backup taken 2026-05-15 before Phase 1 execution. clients.csv (268 rows) and pets.csv (352 rows) at `venture-ops/backups/tidy-tails/2026-05-15/`. Phase 1 SQL has now executed. This backup is the current restore point.

**Note:** `venture-ops/dump_supabase.py` is referenced in CLAUDE.md but does not exist on disk. Backup was performed via Supabase REST API workaround. The script should be written before the next SQL phase.

**Long-term fix:** Supabase Pro ($25/month) includes 7-day PITR, OR script daily dumps to a local or remote store. Timeline: before V1_HARDENED.

**Milestone:** V1_HARDENED

---

## B4 — Client roster not fully canonical (partial contact-card reconciliation)

**Status:** In progress (Phases 1, 2, 3 closed; Phase 3.5 planning done, not executed; Korrie/Gavi + Landry/Laundry holdouts open; ~189 cards still queued)
**Severity:** S2 (Medium)
**Source:** _reports/2026-05-13-card-batch-1.md, _reports/2026-05-15-tidy-tails-source-registry.md, _reports/2026-05-16-phase-2-execution-report.md, _reports/2026-05-17-phase-3-execution-report.md

**Description:** 79 of ~268+ contact cards have been processed in Workstream B. The remaining ~189+ cards may contain name corrections, phone corrections, allergy flags, breed corrections, or deceased pet flags not yet reflected in the database. The 2026-04-09 double-import duplicates are cleared (Phase 2). The 6 confirmed net-new clients + 7 pets from batch 1 are now inserted (Phase 3). Two known reconciliation holdouts remain: Landry/Laundry phone group and the Korrie Silver / Gavi within-client duplicate.

**Expected:** `clients` is the canonical roster — every row has a correct name, correct phone, and correct pet associations.
**Actual:** Some rows have surname-only first names or incorrect pet name spellings (residual on the unprocessed ~189 cards). Landry/Laundry 4 rows remain at 705-796-0620. Korrie Silver row at 647-300-7952 has two within-client Gavi pet duplicates (Medium Mix + Yorkie Mix, both `allergies = false`) — Sam's "no chicken, no grain" flag is not yet applied. Otherwise, every non-Landry duplicate phone group is a singleton.

**Progress:**

- **Phase 1 SQL executed 2026-05-15.** 29 UPDATEs (name fixes, phone corrections, pet fixes, allergy flags, deceased pet flags). Execution report at `_reports/2026-05-15-phase-1-execution-report.md`.
- **Phase 2 SQL COMMITTED 2026-05-16.** 137 ghost client rows + 171 ghost pet rows deleted; 38 appointments re-pointed to canonical clients; all 730 appointments preserved. Live state went 268/352/730 → 131/181/730. Every non-Landry duplicate phone group is now a singleton (0 remaining). All 8 pre-write gates and 7 post-write invariants passed. Execution report at `_reports/2026-05-16-phase-2-execution-report.md`. Pre-commit backup at `_private/backups/2026-05-16-phase-2-precommit/`.
- **Phase 3 SQL COMMITTED 2026-05-17.** 6 new clients + 7 new pets inserted (Mary Anca/Whiskey, Nancy Cauchi/Ruby, Gardy/Coco, Ashley Nichols/Kahlúa, Mary Nichols/Merlyn+Vader, Christina Kitchen/Winston). Korrie Silver / Gavi held out by G5 rollback-test catch. Live state went 131/181/730 → 137/188/730. All 7 pre-write gates (G1-G6 with G5 split into G5a + G5b) and 7 post-write invariants passed. Execution report at `_reports/2026-05-17-phase-3-execution-report.md`. Pre-commit backup at `_private/backups/2026-05-17-phase-3-precommit/`.
- **Phase 3.5** (historical appointment backfills: Whiskey×3, Kiwi×2, plus deferred date-ambiguous rows) — planning at `_reports/2026-05-16-phase-3.5-appointment-backfills-plan.md`. Now unblocked by Phase 3.
- **Phase 4** (Codex enrichment: typical_fee, color, sex, special_notes) queued after Phase 3.5.
- **Remaining contact-card batches** (~189 cards 80-268+) still queued in Workstream B.
- **Holdout patches needed:**
  - **Korrie Silver / Gavi**: phone format reconciliation, within-client Gavi pet dedup, then UPDATE allergies + allergies_detail. Existing client_id `56f4385b-b103-4aab-86a3-f18219d7aabe` at phone 647-300-7952 with 8 appointments. Pending Sam input on canonical phone format and Gavi identity.
  - **Landry/Laundry (705-796-0620)** waiting on Sam's Cash vs Charlotte decision before that 4-row cluster can be cleaned.

**Milestone:** CONTACT_CARD_ARCHIVE_RECONCILED

---

## B5 — Russell Cole / Kiwi appointments missing from Supabase

**Status:** Partially closed (Phase 3.5 backfilled 2 of 4 card-back visits 2026-05-17; 2 remain)
**Severity:** S3 (Low)
**Source:** HANDOFF.md, _reports/2026-05-15-tidy-tails-venture-state-snapshot.md, _reports/2026-05-17-phase-3.5-execution-report.md, financial ledgers

**Description:** Russell Cole's client row exists in Supabase (`clients` table) but had zero appointment records as of 2026-04-09 import. The financial ledger shows at least 1 visit (2024-06-06, $50). Russell's contact card shows 4 visits.

**Expected:** All grooming visits for Russell Cole / Kiwi are in the `appointments` table.
**Actual (2026-05-17 post-Phase-3.5):** 2 appointments now on file in Supabase (2024-06-06 $50 and 2024-12-05 $50, both backfilled with Phase 3.5 conservative NULL policy — service_type/status/location/tip/rent_paid/net all NULL pending Sam confirmation). 2 card-back visits remain unbackfilled.

**Progress:**

- **Phase 3.5 SQL COMMITTED 2026-05-17.** Two of the four card-back visits inserted under Russell's client_id `2fd5cb57-0a4a-46bf-8684-a90c5721bc42` and Kiwi's pet_id `e1fb8585-7cb1-4caa-8132-a25a97f6842a`. Both rows carry `notes` ending with the `[Phase 3.5 backfill 2026-05-17]` tag.
- **Remaining work (Phase 3.5.1 candidate):**
  - Kiwi 2024-07-?? visit — Codex P015 row 2; exact day partial. Russell or Sam reads back the original IMG_0935/0936 card to resolve.
  - 4th card-back visit — Russell to re-confirm card content; if real, add to the 3.5.1 patch.

**Fix:** Phase 3.5.1 follow-up patch once Russell/Sam confirms the partial-date and the 4th-visit details. Low priority — affects reporting accuracy only; no operational impact for Samantha.

**Milestone:** Phase 3.5.1

---

## Closed bugs

*(None closed yet. Move entries here with close date and resolution note when fixed.)*
