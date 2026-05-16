# Decisions — tidy-tails

<!-- Log significant decisions here as they're made. -->
<!-- Format: ## [YYYY-MM-DD] Decision title -->
<!-- **Decision:** What was decided -->
<!-- **Rationale:** Why -->
<!-- **Alternatives considered:** What else was on the table -->

## [2026-05-13] Adopt canonical Koya BUILD-venture doc set

**Decision:** Populate Tidy Tails with the full BUILD doc set as defined in `.koya/MODES.md`: CONTEXT.md, ROADMAP.md, GLOSSARY.md, v1-final-state-spec.md, v1-active-bugs.md, koya_inputs/00_venture_brief.md. Plus METRICS.md (kickoff-prompt requested, not formally in MODES.md but carried by ChildCareOS).

**Rationale:** Tidy Tails was at structural parity gap with other BUILD ventures in the studio. Without the canonical doc set, fresh agents cannot load the right context, milestones cannot be surfaced into Koya in a normalized shape, and the venture stays a special case. Anchored every claim in the new docs to CLAUDE.md, the live Supabase state, and the Pawfinity recon. No fabrication; gaps flagged as TBD or pinned to a future Ship.

**Alternatives considered:**
- Minimal CONTEXT/ROADMAP-only update (rejected: doesn't close the structural gap).
- Wait for v2 work to start and write the spec then (rejected: open RLS risk plus an in-flight contact-card reconciliation both need a spec to anchor to).

## [2026-05-13] Tidy Tails "v1" vs Koya `v1-final-state-spec.md` naming collision

**Decision:** Keep the studio-standard filename `v1-final-state-spec.md` and document the collision inside that doc. The file covers both Tidy Tails v1.0 (current static HTML) and v2.0 (planned Next.js rebuild) as a single Koya BUILD-venture v1 contract. Re-review at V2_CUTOVER; spec may rename to `v2-final-state-spec.md` then.

**Rationale:** Studio convention is stable across all BUILD ventures (per `.koya/MODES.md`). Renaming the file to match Tidy Tails' internal versioning would break Koya ingestion patterns and confuse cross-venture agents. Documenting the collision is cheaper than diverging from the studio convention.

**Alternatives considered:**
- Use `v2-final-state-spec.md` immediately (rejected: Koya ingestion expects the canonical name).
- Two specs, one per Tidy Tails version (rejected: redundant; v1.0 is in maintenance, the meaningful Phase plan is the v2.0 rebuild).

## [2026-05-15] v2 repo strategy — same repo, `/v2` subdirectory

**Decision:** The v2 Next.js app lives in a `v2/` subdirectory of `russell-labs/tidy-tails`. v1 static HTML and GitHub Pages behavior are untouched. A future Vercel project deploys with Root Directory = `v2/`. Shared venture docs (CLAUDE.md, HANDOFF.md, `koya_inputs/`, `_reports/`, `docs/`) stay in the parent repo. Resolves open question Q1 in the v2 design-lock spec §9.

**Rationale:** Keeps the venture's context and doc set unified — one CLAUDE.md, one HANDOFF.md, one Koya ingestion surface. GitHub Pages serves v1 from the repo root and never sees a `v2/` subdirectory, so v1 is structurally isolated with zero config change. Vercel supports a subdirectory root cleanly.

**Alternatives considered:**
- Sibling repo `russell-labs/tidy-tails-v2` (rejected: splits the doc set, CLAUDE.md, and venture context across two repos).
- v2 at the repo root alongside v1 HTML (rejected: clutters v1's GitHub Pages root with Node tooling).

## [2026-05-15] Ship 2.1 read-only v2 scaffold authorized ahead of formal V2_DESIGN_LOCK

**Decision:** A read-only v2 scaffold (Ship 2.1) is authorized to proceed before V2_DESIGN_LOCK is formally closed and before V1_HARDENED. Scope is strictly read-only: no live Supabase writes, no SQL, no SMS sends, no schema/RLS changes, no v1 changes, no deploy. Anonymized fixtures are the default data source; a live `SELECT`-only read is available behind `NEXT_PUBLIC_USE_LIVE_DATA`. Documented in `_reports/2026-05-15-v2-ship-2.1-scaffold-addendum.md`.

**Rationale:** The Pawfinity v2-implications report (§9) explicitly pre-authorizes a read-only scaffold ahead of design-lock — it is a safe precursor that lets Samantha see the product shape early. The design-lock acceptance gate (spec §11) and V1_HARDENED remain preconditions for the *write* ships (2.2 auth/RLS, 2.4 writes, 2.5 SMS). Building read-only first de-risks the eventual write work without touching the live database.

**Alternatives considered:**
- Wait for full V2_DESIGN_LOCK before any v2 code (rejected: the read-only scaffold has no DB risk and unblocks design feedback from Samantha now).
- Scaffold with live writes wired but disabled in UI (rejected: a dormant write path is still a footgun; read-only by construction is safer).

## [2026-05-15] v2 Ship 2.2 RLS migration — flag-day cutover, no anon bridge

**Decision:** The Ship 2.2 RLS-hardening migration (add `groomer_id`, scope all policies to `auth.uid()`, drop the `client_overview` view) runs as a single flag-day cutover event — not early in the ship sequence. v1 stays fully live and code-unchanged on its current permissive policies until that moment. No temporary permissive anon bridge policies will be added to keep v1 alive past the migration. "Parallel run" is reinterpreted: a pre-cutover rehearsal (Samantha tests v2 on staging while v1 stays source of truth) and a post-cutover watch week (v2 is source of truth, v1 is archived reference, not an active parallel-write surface). Consequence: the migration becomes the last step of v2, after the feature ships; the design-lock §10 ship order is re-derived accordingly. Resolves the open decision flagged in design-lock spec §10 and `HANDOFF.md`. Plan: `_reports/2026-05-15-v2-ship-2.2-auth-rls-plan.md`.

**Rationale:** A bridge policy keeps the exact R-1 hole — anon read/write via the public key — open through the parallel-run week, defeating the point of the ship. Flag-day cutover closes R-1 decisively in one event and keeps the rollback surface simple (one revertible migration). v1 stays a clean, untouched fallback right up to cutover; if v2 fails in the watch week, the rehearsed rollback migration restores the permissive state and v1 works again within minutes.

**Alternatives considered:**
- SELECT-only bridge during the parallel run (rejected by Russell: v1 would go read-only for the week *and* R-1's read-hole would stay open — complexity for little gain).
- Full permissive anon bridge (rejected: leaves R-1 entirely open during the parallel run).

## [2026-05-15] v2 Ship 2.2 migration scope — security only (RATIFIED 2026-05-16)

**Decision:** The Ship 2.2 migration is narrowed to security only — `groomer_id` columns, the RLS policy rewrite, and dropping `client_overview`. Feature schema (the `vaccinations` table, `clients`/`pets` enrichment columns, optional `audit_events`) ships as **separate migrations**, in the ships that build those features (2.3+). This supersedes design-lock spec §3.6's "single bundled migration" per spec §0. Proposed in `_reports/2026-05-15-v2-ship-2.2-auth-rls-plan.md` §1 on 2026-05-15; ratified by Russell on 2026-05-16.

**Rationale:** A security migration with a small, well-understood surface has a far simpler and safer rollback than one also carrying feature columns and a new table. Keeping feature-schema migrations separate shrinks the rollback surface of the security-critical one. The security migration and the feature migrations still all land before cutover.

**Alternatives considered:**
- Single bundled migration per spec §3.6 (rejected on ratification: a larger migration surface makes the security-critical rollback riskier; no offsetting benefit).

