# Handoff — tidy-tails

Single source of truth for "whose turn is it, and what are they doing?" on Tidy Tails. Every agent (Russell, Cowork, Claude on the VPS) edits this file before stopping. Committed to git so the history becomes the project's working log.

## Current state

- **Whose turn**: Russell — review the v2 Ship 2.2 auth + RLS plan and the committed scaffold, then choose next lane
- **Focus**: v2 Ship 2.1 read-only scaffold committed (`2e9a5cb`). Ship 2.2 (auth + RLS) plan written this session — flag-day cutover chosen. Open data lane is the hardened Phase 2 dedup SQL awaiting Russell's review. Open product lane is Ship 2.2 execution, gated on V1_HARDENED and the Ship 2.2 plan prerequisites.
- **Reason**: CC built the v2 read-only scaffold on 2026-05-15 — fast client/pet search, client detail, allergy-first pet safety cards, appointment history, lapsed clients, vaccination status, revenue, PWA shell. Read-only by construction: anonymized fixtures default, live Supabase `SELECT`-only behind `NEXT_PUBLIC_USE_LIVE_DATA`, groom-logging + SMS UIs present but write-disabled. `npm run build` clean; browser-verified every page with no console errors. Zero live DB writes, no SQL, no SMS, no v1 changes, no deploy. Scaffold addendum: `_reports/2026-05-15-v2-ship-2.1-scaffold-addendum.md`.
- **Updated**: 2026-05-16 (CC — Ship 2.2 security-only migration scope ratified)
- **Updated by**: CC

## Sam's review pipeline — operational reference

- **Public URL** (share with Sam): `https://symphonious-starlight-2a7ecc.netlify.app`
- **HTML source**: `_reports/sam-review.html` (re-deploy by drag-drop to Netlify Deploys tab)
- **Supabase table**: `public.sam_review_responses` (INSERT-only RLS for anon; SELECT via service_role only)
- **Notify edge function**: `notify-sam-review-complete` (uses Resend; `RESEND_API_KEY` in function secrets)
- **Watch live**: `https://supabase.com/dashboard/project/pgkwovokciaqnbhpttba/editor` → `sam_review_responses` table, filter by latest session_id
- **Sam's first-batch answers**: captured in `_reports/2026-05-13-sam-answers-batch-1.md`
- **Sam's session_id (first batch)**: `ddc94583-05c2-4d52-b262-048ec9d7e496`
- **Cleanup tech debt (low priority)**: dead `sam-review` storage bucket + `sam-review` edge function left from a failed hosting attempt; harmless but messy

## What just happened

- **v2 Ship 2.2 auth + RLS plan written** (2026-05-15, CC). Planning-only artifact at `_reports/2026-05-15-v2-ship-2.2-auth-rls-plan.md`: flag-day cutover (no anon bridge), app-side Supabase Auth wiring (file-by-file), the RLS-hardening migration as draft SQL (`groomer_id` + `auth.uid()`-scoped policies on all six tables + drop `client_overview`), rollback plan, backup requirement, and a verifier checklist. Nothing executed — no SQL run, no migration applied, no backup taken. KoyaOS dogfood lessons REQ-15–18 at `_reports/2026-05-15-koyaos-dogfood-v2-ship-2.2-planning.md`.
- **v2 Ship 2.1 scaffold committed** (2026-05-15, CC, `2e9a5cb`). 57 files — `v2/` plus the venture docs (`CONTEXT.md`, `ROADMAP.md`, `docs/DECISIONS.md`, the scaffold + KoyaOS reports). `docs/home.html` was deliberately excluded: it carries an unrelated uncommitted v1 heading-color change (purple `#9B30FF` → pink `#FF69B4`) for Russell to confirm or `git checkout` separately.
- **v2 Ship 2.1 read-only scaffold built** (2026-05-15, CC). A production-quality, mobile-first, installable PWA grooming cockpit in `v2/` — Next.js 16 (App Router) + TypeScript + Tailwind v4. Surfaces: search-first home, client detail, allergy-first pet safety cards, pet detail with vaccination status, appointment history, lapsed clients, revenue by month, tiny settings. Groom-logging and SMS-reminder flows are built as UI but write-disabled behind a gate notice. Placeholder auth (cookie gate via `proxy.ts`); real Supabase Auth deferred to Ship 2.2. Anonymized synthetic fixtures are the default data source; a live `SELECT`-only Supabase read is available behind `NEXT_PUBLIC_USE_LIVE_DATA`. PWA baseline shipped: manifest, placeholder icons, service worker, installability. Build clean, browser-verified. Repo strategy decided (`v2/` subdir, same repo) and logged in `docs/DECISIONS.md`. Scaffold addendum at `_reports/2026-05-15-v2-ship-2.1-scaffold-addendum.md`. KoyaOS dogfood lessons at `_reports/2026-05-15-koyaos-dogfood-v2-scaffold.md`.
- **Workstream B — 79 contact cards processed across 8 batches** (2026-05-13). Full report at `_reports/2026-05-13-card-batch-1.md`. Open questions tracked at `_reports/2026-05-13-open-questions.md` (~215 decisions for Russell to triage). Zero DB writes executed — all gated on per-row confirmation per kickoff rule.
- **Findings summary across the 79 cards:**
  - **~60 matches** to existing Supabase clients (with various dedup patterns)
  - **9 truly-new** cards (no match anywhere): cards 2 (Acca/Whiskers), 13 (Caughn/Riley), 26 (Gandy/Coco), 38 (McDoe/Riva), 48 (Ashley Nichols/Khaleesi), 50+51 (Mary Nichols/Megan+Vader as one new household), 62 (Snider/Boone), 70 (Sillman/Loki), 78 (Ethan/Koda)
  - **Excel-only-not-in-Supabase**: 1 (card 36 Lahay/Rocky)
  - **Recurring dedup patterns identified**:
    - 2x to 4x import-double-load on 2026-04-09 21:26-21:28 (universal)
    - First-name-as-last-name in `clients.first_name` column (universal convention)
    - First-name spelling fork (Cory/Kori Handy, Peggy/Lund, Scotland/Nadine Scotland) — 3+ confirmed cases
    - Ghost-pet breed fork (Stella Markie/Doodle, Ziggy Westie/?, Stilly yorkie/large Doodle) — 3+ confirmed cases
    - Truncated surname pattern (Mc + Colleen Louise McKee) — 1+ case
    - Phone typos (795 area code on Backway live row, multiple one-digit-off cases)
    - 2026 visits on cards not in Excel (Excel ends Dec 2025) — recurring gap
  - **Multi-pet households mapped**: Andrews (Bobbi + Wilson), Backway (Ozzy + OJ), Beasley (Ziggy + Kaila), Cooper (Lexie + Theo), Donaldson 705 (Baron + Moxie + Piper + maybe Trigger), Michael Donaldson 437 (Trigs + Moxie), Elford (Baxter + Floyd + Phil), Handy (Ricky + Morty), Hinds-Matt (Zoey), Patterson (Jedi + Socha), Santos (Miles + Harlow), Santocono (Daisy + Oddy + maybe Coby new), Marco (Grizzly + Bently + Grizlik), Mary Nichols-new (Megan + Vader), Mitchell/MacNeil (Reese + Rolo-new), Cooper (Cool dog), Wainman (Loki + Mylla)
- **Pesard/Madden/Pesaro disambiguation logged** (2026-05-13): 705-323-3351 = Lisa Madden (69 visits, $4,550, Cavachons Milo + Chloe); 416-520-5297 = Joanna Pesaro (13 visits, $1,525, Beau Portuguese Water Dog). Excel index updated with `_canonical_identity` notes.
- **You discovered yourself** (Russell Cole) in the customer base with dog Kiwi (Cavachon/poodle). Supabase has client row but ZERO appointments despite Excel showing 1 visit (2024-06-06 $60). Card has 4 visits. Suggest manual backfill for your own account.
- **Workstream A closed (2026-05-13).** Canonical BUILD-venture doc set populated for Tidy Tails:
  - `koya_inputs/00_venture_brief.md` (created)
  - `CONTEXT.md` (populated from stub)
  - `ROADMAP.md` (populated from skeleton; Now / Next / Later / Done all real)
  - `GLOSSARY.md` (created)
  - `METRICS.md` (created, with caveat that MODES.md doesn't formally list it)
  - `v1-final-state-spec.md` (created; Phase 0 to Phase 7 plan; v1 naming collision documented inline)
  - `v1-active-bugs.md` (created; R-1 as S1, `client_overview` SECURITY DEFINER as S2, no automated backups as S2)
  - `docs/DECISIONS.md` (two decisions logged: adopt canonical BUILD doc set; v1 naming collision resolution)
  - `_reports/2026-05-13-koya-milestones.md` (paste-ready milestone list for MC ingest)
  - `_reports/2026-05-13-koya-feedback.md` (12 observations for parallel KoyaOS dev session)
- **Koya feedback relayed.** Russell forwarded the 12 observations into the parallel KoyaOS session. Outcome:
  - All 12 triaged into `koya/v1-active-bugs.md`
  - 3 became Phase 5B ships in the Koya PRD: `koya_inputs/` ingest path (5B.7), doc-parity endpoint (5B.8); mode-transition-single-action moved to Post-v1
  - 3 captured as Post-v1 Roadmap platform-level patterns in `koya/v1-final-state-spec.md`: reconciliation skill, competitive-recon templateable artifact, anchors-as-frontmatter audit tooling
  - 4 small doc edits queued as a Phase 5 doc-cleanup pass: METRICS.md addition to MODES.md, `koya_inputs/`+`_reports/` formalization, Credential Paste Protocol consolidation, CC-kickoff-prompt artifact codification
  - 1 Russell decision pending (see Open decisions): v1 naming collision convention. Cowork recommends keeping `v1-final-state-spec.md` and adding a Naming Clarification template to MODES.md, which mirrors what shipped in Tidy Tails this session.
- **Workstream B starting now.** Russell about to upload the first card batch. Output destination: `_reports/2026-05-13-card-batch-1.md` (or matching dated filename per batch).
- **Workstream C complete** (2026-05-15). Codex performed a read-only logged-in Pawfinity recon. Artifacts:
  - `_reports/2026-05-15-pawfinity-logged-in-recon.md`
  - `_reports/2026-05-15-pawfinity-v2-implications.md`

## What's next

1. **Russell**: review hardened Phase 2 dedup SQL. Files: `_reports/2026-05-15-phase-2-dedup.sql` (8 pre-write gates G1-G8 + 7 post-write invariants I1-I7, defaults to ROLLBACK) and `_reports/2026-05-15-phase-2-dedup-notes.md` (verifier reading aid + run playbook). Walk through Section 0 (pre-flight, including 0.5 schema audit and 0.6 dependent-table audit) and Section 1 (dry-run preview) in the Supabase SQL editor — expected dry-run output is ~136 rows. Section 2's gates will refuse to run if anything diverges from the plan. If anything looks off, push back to Cowork before authorizing Section 2.
2. **Russell**: ask Sam — Landry/Laundry (705-796-0620): Cash or Charlotte? Same dog or two? Needed before that phone group can be deduped (it is explicitly excluded from the Phase 2 draft at five layers).
3. **Russell**: backfill your own (Russell Cole / Kiwi) appointments — Supabase has the client row but zero appts despite ledger showing 1 visit (2024-06-06, $60) and card showing 4 visits. Manual or Phase 3.
4. **Queued**: Phase 3 new client INSERTs (7 clients + 8 pets) after Phase 2.
5. **Queued**: Phase 4 Codex enrichment (Typical_Fee, Color, Sex, Special_Notes) after Phase 3.
6. **Russell**: review the v2 scaffold (`cd v2 && npm install && npm run dev`) and the Ship 2.2 auth + RLS plan (`_reports/2026-05-15-v2-ship-2.2-auth-rls-plan.md`). Answer design-lock open questions Q2–Q6 (vaccination scope, lapsed threshold, SMS template, v2 URL, parallel-run length) — they gate Ship 2.4/2.5/2.6.
7. **Queued**: Ship 2.2 execution. Plan written 2026-05-15 (`_reports/2026-05-15-v2-ship-2.2-auth-rls-plan.md`) — flag-day cutover. Hard-gated on the plan's five prerequisites: Samantha's `auth.users` account, a written/ratified backup procedure (`dump_supabase.py` does not exist), v2 feature-complete, a rehearsed rollback migration, and a fresh backup. App-side auth (2.2a) is buildable now; the RLS migration (2.2b) runs at cutover. No v2 write path until then.
8. **Queued**: more contact-card batches (cards 80–268+ not yet processed).

## Next-session opener (paste-ready)

> Picking up Tidy Tails. Read `HANDOFF.md`, `_reports/2026-05-15-v2-design-lock-spec.md`, and `_reports/2026-05-15-v2-ship-2.1-scaffold-addendum.md`. The v2 read-only scaffold exists in `v2/` (Next.js 16 PWA cockpit) — run `cd v2 && npm install && npm run dev`. It is read-only by construction: fixtures default, live Supabase SELECT-only behind a flag, all write UIs gated. If continuing v2, the next ship (2.2 auth + RLS) is hard-gated on V1_HARDENED, an approved migration, and a fresh backup — no v2 write path before then. If taking the data lane, draft Phase 2 dedup SQL from `_reports/2026-05-14-reconciliation-plan.md`. No DB writes, no SQL, no SMS without Russell approval.

## Open decisions

- **v1 naming collision (Russell-only).** Cowork recommends keeping `v1-final-state-spec.md` as the canonical Koya filename and adding a Naming Clarification template to `.koya/MODES.md` for any future BUILD venture with a shipped MVP. This mirrors what shipped in Tidy Tails today (see "Naming clarification" section at the top of `v1-final-state-spec.md`). Pending Russell signoff in the parallel Koya session.
- **R-1 fix path — RESOLVED 2026-05-15.** v2 Ship 2.2 closes R-1 with `auth.uid()`-scoped RLS policies plus a `groomer_id` FK (design-lock spec §3.3). Migration sequencing decided: flag-day cutover, no anon bridge. Migration scope ratified by Russell 2026-05-16: security-only (`groomer_id` + RLS + drop `client_overview`); feature schema ships as separate migrations. All logged in `docs/DECISIONS.md`.
- **Repo strategy for v2.0 — RESOLVED 2026-05-15.** v2 lives in the `v2/` subdirectory of the same repo. Logged in `docs/DECISIONS.md`.
- **Commit `v2/`? — RESOLVED 2026-05-15.** Russell approved; the scaffold was committed as `2e9a5cb` (`Ship Tidy Tails v2 read-only scaffold`). `docs/home.html` was deliberately excluded — it carries an unrelated uncommitted v1 heading-color change (purple → pink) for Russell to confirm or revert separately.
- **Pricing model if licensed (Russell-only, deferred to LICENSEABLE_READY).** Free for Samantha forever vs paid tier for other groomers. Candidate $19-$29/mo flat from the Pawfinity recon. Not committed.

## Blockers (external)

- None.

## Context a fresh agent needs

- Read order: `CLAUDE.md` → `HANDOFF.md` (this file) → `CONTEXT.md` → `koya_inputs/00_venture_brief.md` → `v1-final-state-spec.md` → `v1-active-bugs.md`.
- Tidy Tails is a BUILD-mode venture per `.koya/MODES.md`. Sole design partner is Samantha. v1.0 is live and in daily use; v2.0 is planned and not started.
- R-1 risk (permissive RLS) is the largest open issue. Do not write to the live DB without Russell's per-row confirmation.
- Customer data is real. Do not commit data, credentials, or screenshots that include them.
- Workstreams: A (closed), B (active, contact-card batches/reconciliation phases), C (complete, Pawfinity logged-in recon).

## Recent handoff log

| When | From → To | Note |
|---|---|---|
| 2026-05-15 | CC → Russell | Committed the v2 Ship 2.1 scaffold (`2e9a5cb`, 57 files; `docs/home.html` excluded — unrelated v1 color change). Wrote the Ship 2.2 auth + RLS plan (`_reports/2026-05-15-v2-ship-2.2-auth-rls-plan.md`) — flag-day cutover, no anon bridge; covers app-side Supabase Auth wiring, the RLS migration as draft SQL, rollback, backup requirement, verifier checklist. KoyaOS dogfood notes REQ-15–18 at `_reports/2026-05-15-koyaos-dogfood-v2-ship-2.2-planning.md`. Two decisions logged in `docs/DECISIONS.md`. Planning only — no SQL run, no migration applied, no backup taken. |
| 2026-05-15 | Cowork → Russell | Phase 2 dedup SQL hardened per Russell's review. Two files: `_reports/2026-05-15-phase-2-dedup.sql` (set-based, temp-table-driven, 8 pre-write gates G1-G8 + 7 post-write invariants I1-I7, defaults to ROLLBACK) and `_reports/2026-05-15-phase-2-dedup-notes.md` (verifier reading aid + run playbook). Pre-write gates: G1 baseline counts (268/352/730), G2 dup inventory (103+12=115), G3 Landry exactly 4 rows, G4 working set (250 ranked / 114 canonical / 136 ghosts), G5-G7 set integrity, **G8 dependent tables (`booking_requests`, `client_accounts`, `automations_log`) all 0 rows — fails if v1 has begun writing to a surface this script does not model in its FK blast radius.** Section 0.5 schema audit for pets/appointments `updated_at`, Section 0.6 audit for the three dependent tables. Final summary includes explicit `clients_delta` / `pets_delta` / `appointments_delta` columns. Landry/Laundry blocker enforced at 5 layers. Zero DB writes performed. |
| 2026-05-15 | CC → Russell | Built the v2 Ship 2.1 read-only scaffold in `v2/` — Next.js 16 mobile-first PWA grooming cockpit. Search, client/pet detail, allergy-first safety cards, appointment history, lapsed clients, vaccination status, revenue. Groom-logging + SMS UIs built but write-disabled. Build clean, browser-verified, no console errors. Zero live DB writes, no SQL, no SMS, no v1 changes, no deploy. Repo strategy + scaffold authorization logged in `docs/DECISIONS.md`. **(Scaffold later committed as `2e9a5cb` — see the 2026-05-15 CC commit entry above.)** |
| 2026-05-15 | Codex → Russell/Cowork/CC | Pawfinity logged-in recon completed read-only. No live records mutated, exported, messaged, scheduled, charged, or deleted. Created `_reports/2026-05-15-pawfinity-logged-in-recon.md` and `_reports/2026-05-15-pawfinity-v2-implications.md`. Main product decision: Tidy v2 should be a mobile-first Samantha grooming cockpit, not a Pawfinity clone. |
| 2026-05-15 | Cowork → Russell | Phase 1 SQL executed and verified. 29 UPDATEs, 18 client rows + 11 pet rows. All spot-checks pass. Appointments unchanged at 730. Fresh backup at venture-ops/backups/tidy-tails/2026-05-15/. Execution report at _reports/2026-05-15-phase-1-execution-report.md. State docs updated. v2 design-lock prep doc written. Next: Phase 2 dedup SQL. |
| 2026-05-13 late EOD | Cowork → Sam | Review pipeline shipped end-to-end. Page live at symphonious-starlight-2a7ecc.netlify.app, Resend wired, Sam answered 22 distinct Qs (30 raw rows). Caught a UX bug mid-session (notes were gated behind a radio selection); fixed by adding "Other / write below" + notes-on-every-question + note-only-Next-enable. Sam paused around Q23/49; will continue tomorrow. |
| 2026-05-13 EOD | Cowork → Russell | 79 contact cards processed across 8 batches. Workstream A closed earlier; Workstream B paused per Russell's "last batch for now" signal. Workstream C still queued (Pawfinity logged-in recon). Open questions log carries ~215 Russell-only decisions. Zero DB writes executed by Cowork on customer data. |
| 2026-05-13 | Cowork → Cowork (workstream pivot) | Workstream A closed; Workstream B opened. Koya feedback doc relayed (12/12 triaged into KoyaOS; 3 became Phase 5B ships). HANDOFF refreshed mid-session before first card batch landed. |
| 2026-04-21 | Cowork → Russell | Migrated from `russellcolevop/tidy-tails` into the `russell-labs` org. Studio dashboard reflects it. Russell notifies Samantha + opens the Tidy Tails Cowork project for the v2 enrichment and Supabase conversion. |
