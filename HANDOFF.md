# Handoff — tidy-tails

Single source of truth for "whose turn is it, and what are they doing?" on Tidy Tails. Every agent (Russell, Cowork, Claude on the VPS) edits this file before stopping. Committed to git so the history becomes the project's working log.

## Current state

- **Whose turn**: Russell
- **Focus**: dev
- **Reason**: v1 (static HTML on GitHub Pages) is in Samantha's daily use. v2 rebuild on Supabase is the next major build — design cards exist and are ready to convert into a schema + app scaffold. That work happens in a dedicated Tidy Tails Cowork project, not in venture-ops.
- **Updated**: 2026-04-21 (Cowork session — migration from `russellcolevop/tidy-tails`)
- **Updated by**: Cowork

## What just happened

- **Migrated into Russell Labs** (2026-04-21). Repo transferred from `russellcolevop/tidy-tails` → `russell-labs/tidy-tails`. Old GitHub Pages URL (`russellcolevop.github.io/tidy-tails/`) is retired; new URL is `russell-labs.github.io/tidy-tails/home.html`. Samantha to be notified of the new URL.
- Studio's standard `HANDOFF.md` and `CLAUDE.md` added at the repo root. `PROJECTS.md` and `README.md` in venture-ops now show Tidy Tails in the dashboard.

## What's next

1. **Russell**: notify Samantha of the new URL (`https://russell-labs.github.io/tidy-tails/home.html`).
2. **Russell**: open a fresh Cowork project with this repo (`tidy-tails/`) as the folder. Enrichment + v2 build happen there, not in venture-ops.
3. **Russell (in the Tidy Tails Cowork project)**: upload the design cards, convert them into a Supabase schema and a v2 app scaffold.
4. **Russell**: create Drive folder `Russell Labs/01_Active_Projects/tidy-tails/` with `Context/`, `Research/`, `Assets/` subfolders. Drop the cards and any background material there for session context.

## Open decisions

- Does v2 replace v1 in place (same repo, different deploy target) or live as a sibling (`tidy-tails-v2`)? Leaning toward same repo — GitHub Pages keeps serving static v1 until the Supabase build is ready to cut over.
- Pricing model — is this a product Russell charges other groomers for once stable, or free-and-forever for Samantha?

## Blockers (external)

- None.

## Context a fresh agent needs

- This is a real venture with a real design partner (Samantha). Current site is a static HTML v1 built for her dog-grooming business. A Supabase-backed v2 is the next major build.
- The studio (`venture-ops` repo) is the parent infra. Orientation there: `PROJECTS.md`, `README.md`.
- Venture-specific context (playbook, thesis if any, product plan) belongs in this repo's future `docs/` tree, populated by the Tidy Tails Cowork project — not by studio sessions.

## Recent handoff log

| When | From → To | Note |
|---|---|---|
| 2026-04-21 | Cowork → Russell | Migrated from `russellcolevop/tidy-tails` into the `russell-labs` org. Studio dashboard reflects it. Russell notifies Samantha + opens the Tidy Tails Cowork project for the v2 enrichment and Supabase conversion. |
