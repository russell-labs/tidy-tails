# CLAUDE.md — context for Claude sessions working on Tidy Tails

If you are a Claude session that just opened this repo, read this file first.

## What Tidy Tails is

A business management platform for **Samantha**, the owner of a professional dog-grooming business. Near-term mandate: make Samantha's business run better. Longer-term possibility: license this to other groomers — but don't get ahead of that. Samantha's real workflow is the anchor.

## Current state

- **v1 (live, in Samantha's daily use)** — static HTML site deployed via GitHub Pages at `https://russell-labs.github.io/tidy-tails/home.html`. Multiple modules: `home`, `client`, `intake`, `report`, `export`. Data is hardcoded / file-based.
- **v2 (in design, not yet built)** — Supabase-backed rebuild. Russell has a stack of design cards ready to convert into a Supabase schema + app scaffold. Planned stack: Next.js 14 + Supabase + Stripe + Anthropic API (same as childcareos) — re-confirm before coding.

## How to be useful here

- **Before touching v1**, remember Samantha is using it. Changes to the live site need to be intentional, not accidental refactors.
- **v2 work happens in its own Cowork project** (open a new Cowork project with this folder as the mount). Don't do venture-specific deep work in the `venture-ops` studio project.
- **Russell is not a developer.** If something needs a shell command, explain what it does in one line before handing it over.
- **Design-partner-driven.** When in doubt about a product decision, Samantha's real workflow is the source of truth.

## Where the non-code context lives

- Studio overview: the parent `venture-ops` repo (`PROJECTS.md`, `README.md`, `docs/`).
- Drive folder (when created): `Russell Labs/01_Active_Projects/tidy-tails/` with `Context/`, `Research/`, `Assets/` subfolders. That's where the design cards, Samantha's notes, and any mockups live.
- Venture-specific docs will grow inside this repo's `docs/` tree after the Cowork enrichment pass.

## What's explicitly not here

- Secrets, API keys, tokens. Never.
- Samantha's real customer data. The live v1 is static HTML with non-sensitive seed data; keep it that way until v2's Supabase is built with proper row-level security.

## History

Migrated from `russellcolevop/tidy-tails` (Russell's personal GitHub account) into the `russell-labs` org on 2026-04-21. Predates the studio's `/new` scaffolder by several months.
