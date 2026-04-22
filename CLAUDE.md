# CLAUDE.md — context for Claude sessions working on Tidy Tails

If you are a Claude session that just opened this repo, read this file first.

## What Tidy Tails is

A business management platform for **Samantha**, the owner of a professional dog-grooming business. Near-term mandate: make Samantha's business run better. Longer-term possibility: license this to other groomers — but don't get ahead of that. Samantha's real workflow is the anchor.

## Current state

- **v1 (live, in Samantha's daily use)** — static HTML site deployed via GitHub Pages at `https://russell-labs.github.io/tidy-tails/home.html`. Multiple modules: `home`, `client`, `intake`, `report`, `export`. **Not file-based** — each HTML module loads `@supabase/supabase-js` via CDN and talks directly to the live Supabase project (see "Live data"). The Supabase URL and anon key are hard-coded in the HTML. A Twilio-backed `send-sms` Supabase edge function is invoked from `client.html` for text notifications.
- **v2 (aspirational, not started)** — a Next.js 14 + Supabase + Stripe + Anthropic-API rebuild Russell has sketched on design cards. No code exists yet. Don't assume any v2 work is partially landed — the "v2" label has historically been misleading because v1 is already Supabase-backed.
- **Architecture reality check:** v1 is a static-HTML + Supabase-js hybrid, not a static brochure site. Treat every HTML module as a production database client. Changes to query shape, table names, or RLS policies are shipping to Samantha the moment they land in `main` (GitHub Pages auto-deploys).

## Live data

Tidy Tails has a live Supabase backend that is actively populated.

- **Project**: `Tidy Tails` on `russellcolevop's Org`, Supabase project ref `pgkwovokciaqnbhpttba`, region us-east-1, Nano (free tier — no automated backups).
- **Dashboard**: `https://supabase.com/dashboard/project/pgkwovokciaqnbhpttba`
- **Tables (public schema)**:
  - `clients` — 268 rows
  - `pets` — 352 rows
  - `appointments` — 730 rows
  - `booking_requests` — 0 rows
  - `client_accounts` — 0 rows
  - `automations_log` — 0 rows
  - View: `client_overview` (has a SECURITY DEFINER warning in the security advisor — worth fixing eventually)
- **What writes to it**: the v1 HTML modules themselves. `intake.html`, `client.html`, `index.html`, and the copies under `docs/` each import `@supabase/supabase-js` from a CDN, instantiate a client with `window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`, and read/write the public tables directly from the browser. `client.html` also calls a `send-sms` Supabase edge function (Twilio-backed, set up 2026-04). Treat these tables as load-bearing for Samantha's business — do not drop, rename, or alter columns without a coordinated HTML-side change.
- **Credentials**: the Supabase URL and anon key are currently hard-coded in the HTML modules. This is acceptable with Supabase-js *only* if Row Level Security is enabled and scoped correctly on every public table — the anon key is meant to be public, but the DB is only as safe as the RLS policies. The DB password was rotated on 2026-04-22 during the backup — any deployed service that used the old direct-postgres password is now broken. The anon key was not changed, so the HTML modules still work.
- **RLS audit (2026-04-22)**: RLS is ✅ enabled on all 6 public tables (`clients`, `pets`, `appointments`, `booking_requests`, `client_accounts`, `automations_log`). However, the policies themselves are permissive — every SELECT / INSERT / UPDATE policy has `qual = true` and `roles = {public}`, which means any visitor with the anon key (i.e. anyone who views page source) can read and write all rows. As a partial mitigation, the three DELETE policies on `clients`, `pets`, and `appointments` were dropped on 2026-04-22 — the anon role can no longer delete rows, and no HTML module calls `.delete()` so nothing in v1 breaks. **The full fix belongs in v2**, when the Next.js rebuild introduces real authentication (Supabase Auth or equivalent) and the policies can be rewritten against `auth.uid()`. Until then, treat the live DB as read/writeable by anyone who has the public URL — which is fine for Samantha's single-operator workflow but not safe to share broadly.
- **Edge functions**: `send-sms` (Twilio) — called from `client.html` to notify Samantha / clients. Credentials live in Supabase function secrets, not in this repo.
- **Logical backup**: the most recent full dump (schema + data + per-table CSVs) lives OUTSIDE this repo at `~/venture-ops/backups/tidy-tails/` (on Russell's Mac). It's a one-shot insurance copy via session pooler, not a replacement for the live DB. Re-run with `venture-ops/dump_supabase.py` if a fresh snapshot is needed. Never commit this backup into the repo.

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

- Secrets, API keys, tokens. Never. (The Supabase anon key that appears in the HTML is *not* a secret — it's the public client key and is safe to ship if RLS is on. Do not commit the `service_role` key or the Twilio token.)
- Samantha's real customer data. The logical backup lives OUTSIDE this repo in `~/venture-ops/backups/tidy-tails/` — never commit that dump into the repo.

## History

Migrated from `russellcolevop/tidy-tails` (Russell's personal GitHub account) into the `russell-labs` org on 2026-04-21. Predates the studio's `/new` scaffolder by several months.
