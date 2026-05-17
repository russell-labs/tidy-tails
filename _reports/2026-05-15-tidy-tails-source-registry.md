---
when: 2026-05-15
who: Cowork
purpose: Full source registry for the Tidy Tails contact-card reconciliation workstream. Every artifact in the chain — what it is, where it lives, what it proves, what it feeds into, and its privacy level. Intended for KoyaOS ingestion and as the durable reference any future session can load instead of re-deriving provenance.
status: current as of Phase 1 post-execution (2026-05-15)
venture: tidy-tails
supabase_project: pgkwovokciaqnbhpttba
---

# Tidy Tails — Source Registry

Every source in the reconciliation chain from contact-card photos to live Supabase writes. Read this before starting any new workstream session.

---

## S-01 — Supabase live database

| Field | Value |
|---|---|
| **Kind** | live database |
| **Location** | Supabase project `pgkwovokciaqnbhpttba`, region us-east-1 |
| **Access** | Supabase MCP (execute_sql) |
| **Privacy** | HIGH — real customer data, Supabase anon key in v1 HTML |
| **Source-of-truth for** | canonical row IDs (UUIDs), appointment counts, RLS state |
| **Current state** | 137 clients / 188 pets / 735 appointments — confirmed post-Phase-3.5-COMMIT 2026-05-17 (was 137 / 188 / 730 post-Phase-3; 131 / 181 / 730 post-Phase-2; 268 / 352 / 730 pre-Phase-2) |
| **Feeds into** | Phase 1 UPDATE targets; Phase 2 dedup plan; Phase 3 INSERTs; post-run verification queries |
| **Notes** | Do not run multi-statement queries in one MCP call — only the last result is returned. Use UNION ALL for multi-table counts. |

---

## S-02 — Logical backup (2026-04-22)

| Field | Value |
|---|---|
| **Kind** | local backup — full schema + data + per-table CSVs |
| **Location** | `/Users/russellcole/Developer/RussellLabs/venture-ops/backups/tidy-tails/` |
| **Access** | Read tool or bash (`/sessions/zealous-elegant-turing/mnt/RussellLabs/venture-ops/backups/tidy-tails/`) |
| **Privacy** | HIGH — full customer data dump |
| **Source-of-truth for** | UUID existence verification; appointment counts per pet/client; double-import dedup analysis; ghost-row identification |
| **Manifest** | `manifest.json` confirms 268 clients / 352 pets / 730 appointments at dump time |
| **Dump script** | `venture-ops/dump_supabase.py` |
| **Not in repo** | Correct. `.gitignore` covers `venture-ops/backups/`. Do not commit. |
| **Feeds into** | Verifier UUID existence checks; Phase 2 dedup ghost-row analysis |

---

## S-03 — 2022–2024 financial ledgers

| Field | Value |
|---|---|
| **Kind** | financial source — Russell's transaction records from Samantha's business |
| **Location** | Not in repo. Analyzed during reconciliation session. |
| **Privacy** | HIGH — client financial records |
| **Source-of-truth for** | Gross revenue totals; appointment visit counts by client; confirming clients are real paying customers |
| **Key figures** | 731 rows, $57,881.25 gross |
| **Alignment with Supabase** | 730 appointments / $57,821.25 gross in Supabase. Delta = 1 appointment (Russell Cole / Kiwi, 2024-06-06, $60). Effectively aligned. |
| **Feeds into** | METRICS.md financial sanity check; Phase 3 Russell/Kiwi backfill |

---

## S-04 — Samantha's handwritten contact-card photos

| Field | Value |
|---|---|
| **Kind** | photo batch — source material |
| **Location** | Uploaded into a prior Cowork session. Physical cards are Samantha's. |
| **Privacy** | HIGH — customer names, phones, pet details, grooming notes |
| **Coverage** | 79 cards processed across Workstream B batch 1. ~268 total clients; not all cards have been photographed/uploaded yet. |
| **Source-of-truth for** | First names where import used surname-only; pet name spellings; alternate phone numbers; allergy and grooming notes; deceased pet flags |
| **Feeds into** | S-05 (extracted workbook/CSVs); card-batch report S-07 |
| **Notes** | Original physical cards are at Sam's grooming location. The photo upload is the only digital copy of many of the notes. |

---

## S-05 — Codex extracted workbook and CSVs (2026-05-11)

| Field | Value |
|---|---|
| **Kind** | extracted artifacts from card photos |
| **Location** | `/Users/russellcole/Developer/RussellLabs/tidy-tails/_private/source-artifacts/2026-05-11-codex-extraction/` |
| **Files** | `tidy-tails-contact-cards-batch1.xlsx`, `tidy_tails_owners.csv`, `tidy_tails_pets.csv`, `tidy_tails_appointments.csv` |
| **Access** | Read tool (host path) or bash (`/sessions/zealous-elegant-turing/mnt/tidy-tails/_private/source-artifacts/2026-05-11-codex-extraction/`) |
| **Privacy** | HIGH — customer data; `_private/` is gitignored |
| **Coverage** | 32 owners, 38 pets, 219 appointments — an earlier batch/subset, not the full 268-client universe |
| **Source-of-truth for** | Rich per-pet detail: Typical_Fee, Special_Notes, Color, Sex, Colour — fields not captured in the Supabase import |
| **Codex pet IDs** | P001–P038. P010 = Theo Cooper allergy. P021 = Floyd Elford allergy. P022 = Phil Elford allergy. P033 = Sunday Kitchen breed/allergy. |
| **Codex owner IDs** | O001–O032. O008 = Nadine Cooper. O025 = Matt Hinds. O030 = Blair Lahay. O031 = Colleen McKee. O032 = Kathleen McRob. |
| **Feeds into** | Phase 1 allergy flags (S-1D); grooming notes; Phase 4 pet enrichment |
| **Notes** | These CSVs are an earlier extraction pass, not the full May 13 batch report. Do not treat as complete. Use card-batch report (S-07) as the comprehensive cross-reference. |

---

## S-06 — Sam's 49-question review form

| Field | Value |
|---|---|
| **Kind** | operator confirmation surface |
| **Location** | Live at `https://symphonious-starlight-2a7ecc.netlify.app` |
| **Source HTML** | `/Users/russellcole/Developer/RussellLabs/tidy-tails/_reports/sam-review.html` |
| **Privacy** | Form is public-URL (no auth) but contains no pre-filled customer data |
| **Feeds into** | S-07 (sam_review_responses Supabase table) |

---

## S-07 — sam_review_responses (Supabase table)

| Field | Value |
|---|---|
| **Kind** | operator confirmation records |
| **Location** | `public.sam_review_responses`, project `pgkwovokciaqnbhpttba` |
| **Access** | Supabase MCP |
| **Privacy** | MEDIUM — Sam's answers about customers; no raw customer data stored |
| **Completion** | 69 rows submitted 2026-05-13 to 2026-05-14, covering 49 distinct questions. Sam finished all 49. |
| **Session** | `ddc94583-05c2-4d52-b262-048ec9d7e496` |
| **Key answers** | Leona Beasley (not Leora), Kailo (not Kaila), Kathleen McRob (not Cathleen/McDoe), phone typo 795→705 (Backway), Stillman second household (519-755-8209), Donaldsons are two families, Marcos = same dog two spellings, Bentley is not Marco's dog, all Kitchen households confirmed, Christina Kitchen/Winston new client. |
| **Feeds into** | Phase 1 name + phone + note corrections; Phase 3 new client INSERTs |
| **Notes** | INSERT-only RLS for anon role. Sam went back and refined a few answers — use latest answer per question_key. |

---

## S-08 — Card-batch report (2026-05-13)

| Field | Value |
|---|---|
| **Kind** | Cowork reconciliation report |
| **Location** | `/Users/russellcole/Developer/RussellLabs/tidy-tails/_reports/2026-05-13-card-batch-1.md` |
| **Privacy** | HIGH — contains customer names, phones, pet details cross-referenced against Supabase |
| **Coverage** | 79 cards, full cross-reference against Excel import + Supabase. 9 truly-new clients identified. Dedup patterns catalogued. Multi-pet households mapped. |
| **Source-of-truth for** | Card numbers (#1–#79) cross-referenced to Supabase UUIDs; pet-household mappings; split-appt group identification; ghost-row analysis |
| **Feeds into** | Phase 1 name corrections; Phase 2 dedup plan; Phase 3 new client list; Sam's review question set |

---

## S-09 — Sam's first-session answers summary (2026-05-13/14)

| Field | Value |
|---|---|
| **Kind** | Cowork summary report |
| **Location** | `/Users/russellcole/Developer/RussellLabs/tidy-tails/_reports/2026-05-13-sam-answers-batch-1.md` |
| **Privacy** | MEDIUM — summarizes Sam's operator confirmations |
| **Coverage** | Sam's answers from her first session (~Q22/24 of 49); note: Sam later completed all 49. Full answers are in S-07. |
| **Feeds into** | Phase 1 SQL; reconciliation plan |

---

## S-10 — Reconciliation plan (2026-05-14)

| Field | Value |
|---|---|
| **Kind** | Cowork planning artifact |
| **Location** | `/Users/russellcole/Developer/RussellLabs/tidy-tails/_reports/2026-05-14-reconciliation-plan.md` |
| **Privacy** | LOW — plan references UUIDs and names but is derived; no raw data |
| **Covers** | 4-phase plan: Phase 1 safe UPDATEs, Phase 2 dedup, Phase 3 new INSERTs, Phase 4 Codex enrichment. 5 open decisions documented. |
| **Feeds into** | Phase 1–4 SQL scripts; HANDOFF.md |

---

## S-11 — Phase 1 SQL script (2026-05-14)

| Field | Value |
|---|---|
| **Kind** | Cowork SQL artifact — pending execution |
| **Location** | `/Users/russellcole/Developer/RussellLabs/tidy-tails/_reports/2026-05-14-phase-1-safe-updates.sql` |
| **Status** | EXECUTED 2026-05-15 ~05:15 UTC — verified clean |
| **Covers** | 29 UPDATEs: 18 client rows + 11 pet rows. No DELETEs, no INSERTs, no schema changes, no appointment mutations. Wrapped in BEGIN/COMMIT. |
| **Verified by** | Codex verifier pass (S-13); post-run spot-check (all 18 client rows + 11 pet rows + row counts confirmed) |
| **Execution report** | `_reports/2026-05-15-phase-1-execution-report.md` |
| **Feeds into** | Live Supabase (executed); post-run verification queries |

---

## S-12 — Phase 1 review doc (2026-05-14)

| Field | Value |
|---|---|
| **Kind** | Human-readable review for Russell approval |
| **Location** | `/Users/russellcole/Developer/RussellLabs/tidy-tails/_reports/2026-05-14-phase-1-safe-updates-review.md` |
| **Status** | APPROVED AND EXECUTED 2026-05-15 |
| **Covers** | Every UPDATE in plain English: what changes, why, source citation, current value, UUID, appointment count |
| **Feeds into** | Russell approval decision; S-11 execution gate |

---

## S-13 — Codex verifier report (2026-05-15)

| Field | Value |
|---|---|
| **Kind** | Independent verification artifact |
| **Location** | `/Users/russellcole/Developer/RussellLabs/tidy-tails/_reports/2026-05-14-phase-1-safe-updates-codex-verifier.md` |
| **Verdict** | PASS_WITH_NOTES |
| **Key finding resolved** | Theo Cooper allergy originally targeted orphan pet `9315e779` (0 appts, ghost row). Fixed to canonical `881733e0` (5 appts, active Cooper row `ea254495`). |
| **Remaining nit** | Review doc says "17 client rows" but SQL updates 18 distinct client rows. Non-blocking. |
| **8 Koya platform lessons** | Documented in verifier report. Includes: verifier gate pattern, source-registry requirement, canonical row map primitive, phone-change blast-radius flag, backup path discoverability. |

---

## Source chain summary

```
Contact-card photos (S-04)
    └─ Codex extraction (S-05) ─────────────────────────────┐
    └─ Card-batch report (S-08)                             │
         └─ Sam's review form (S-06)                       │
              └─ sam_review_responses (S-07)               │
                   └─ Sam answers summary (S-09)           │
                        └─ Reconciliation plan (S-10) ─────┤
                             └─ Phase 1 SQL (S-11) ────────┤
                                  └─ Phase 1 review (S-12) │
                                       └─ Codex verifier (S-13)
                                            └─ Russell approval (granted 2026-05-15)
                                                 └─ Live Supabase write (S-01) ← EXECUTED 2026-05-15

Financial ledgers (S-03) ─ cross-check only ──────────────► METRICS.md
Logical backup (S-02) ─────── UUID verification ──────────► S-13 verifier
```

---

## What's not yet in the chain

| Item | Status | Next action |
|---|---|---|
| Cards 80–268+ (remaining archive) | Not yet uploaded/processed | Batch-driven; Russell uploads when ready |
| Gunner/Tommassetti | Not found in DB | Sam needs to supply phone number; Phase 3 investigation |
| Landry/Laundry disambiguation | On hold | Russell asks Sam: Cash or Charlotte? |
| Phase 2 dedup SQL | Not written | After Phase 1 execution |
| Phase 3 new client INSERTs | Not written | After Phase 2 |
| Phase 4 Codex pet enrichment | Not written | After Phase 3 |
| Russell/Kiwi appointment backfill | Not written | Manual or Phase 3 |

---

*Generated by Cowork 2026-05-15. Updated post-Phase-1-execution 2026-05-15. Phase 1 SQL executed and verified clean.*
