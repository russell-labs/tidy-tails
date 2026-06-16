# Tidy Tails — Codex Operating Context

This repo is the live Tidy Tails grooming-operations product. Codex agents should read this file first, then `v2/AGENTS.md`, then the current handoff.

## Read Order

1. `AGENTS.md` — repo-level rules and current orientation.
2. `v2/AGENTS.md` — Next.js app rules, write gates, verification.
3. `_reports/2026-05-21-codex-handoff.md` — current handoff for the next thread.
4. `_reports/2026-05-21-tidy-tails-24h-feature-requests.md` — Russell's recent request backlog.

Treat older `HANDOFF.md` files as historical context unless a current handoff explicitly points to them. Some of their early-v2 statements are stale. (The former `CLAUDE.md` has been removed; its still-relevant v1 infrastructure facts are preserved in "v1 infrastructure reference" at the bottom of this file.)

## Current Product State

- `v2/` is the production app deployed at `https://tidy-tails-v2.vercel.app`.
- The app is connected to live Supabase data for Samantha's grooming business.
- Ship 2.2b RLS cutover has been completed. Do not assume the old read-only preview state.
- Google Calendar integration and Twilio SMS integration exist and are actively being refined.
- Samantha's real workflow is the source of truth. Optimize for fast mobile use while she is answering calls/texts and booking dogs.

## Safety Rules

- Do not touch v1 production files unless Russell explicitly asks.
- Do not run SQL, schema, RLS, migration, or destructive data changes without explicit approval for that exact action.
- Never commit secrets, service-role keys, Twilio tokens, Google secrets, `.env*` files, backups, or customer-data dumps.
- This repo often has unrelated dirty files. Stage only the files in the current task scope.
- Prefer status/void/cancel corrections over hard deletion for past business records.
- If a change sends customer communication, writes production data, or changes security posture, verify the gate and explain it clearly.

## Verification Gates

For `v2/` app code changes, run from `v2/` before claiming complete:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

For user-facing UI changes, also verify the relevant flow in browser/mobile when practical. Tidy Tails is iPhone-first; screenshots from iPhone Safari are important evidence.

For production deploys:

```bash
vercel --prod
```

Then smoke test `https://tidy-tails-v2.vercel.app/login` and the changed workflow.

## Git Discipline

- Use small scoped commits.
- Preserve unrelated modified/untracked files.
- Push only when Russell asks or the task explicitly includes shipping to production.
- If deploying, note the Vercel deployment id or URL in the final report.

## Next-Agent Starter Prompt

Use this short launcher instead of pasting a giant chat transcript:

> Read `/Users/russellcole/Developer/RussellLabs/tidy-tails/AGENTS.md`, `/Users/russellcole/Developer/RussellLabs/tidy-tails/v2/AGENTS.md`, `/Users/russellcole/Developer/RussellLabs/tidy-tails/_reports/2026-05-21-codex-handoff.md`, and `/Users/russellcole/Developer/RussellLabs/tidy-tails/_reports/2026-05-21-tidy-tails-24h-feature-requests.md`. Continue the Tidy Tails v2 production build from the handoff, preserving scoped commits and running the verification gates.

## v1 infrastructure reference (migrated from the former CLAUDE.md)

v2 is production now, but v1 (the original live static-HTML + `@supabase/supabase-js` hybrid — modules `home`, `client`, `intake`, `report`, `export`) may still be in use. Each v1 HTML module is a production DB client and GitHub Pages auto-deploys `main`, so any change to query shape, table names, or RLS ships to Samantha instantly. These v1 facts are kept here so they survive the CLAUDE.md removal:

- **v1 Supabase**: project ref `pgkwovokciaqnbhpttba`, region us-east-1, Nano tier (no automated backups). Dashboard: `https://supabase.com/dashboard/project/pgkwovokciaqnbhpttba`.
- **Count-baseline warning**: never trust row counts from docs or `list_tables`/planner estimates as a cutover baseline — a planner run reported `appointments ≈ 7` against a true `737` (100× off). Only a fresh `count(*)` manifest captured at cutover is a valid baseline.
- **RLS audit (2026-04-22)**: RLS enabled on all 6 public tables, but policies are permissive (`qual = true`, `roles = {public}`) — anyone with the public anon key can read/write. The 3 DELETE policies (`clients`, `pets`, `appointments`) were dropped as partial mitigation; the full fix lands with v2 auth rewritten against `auth.uid()`.
- **Credentials**: the anon key is public-safe only when RLS is correct; never commit the `service_role` key or Twilio token. The DB password was rotated 2026-04-22 (old direct-postgres consumers broke; the anon key was unchanged so v1 HTML kept working).
- **send-sms edge function** (Twilio) is called from v1 `client.html`; its secrets live in Supabase function secrets, not the repo.
- **Logical backup**: the most recent full dump lives OUTSIDE the repo at `~/venture-ops/backups/tidy-tails/`; refresh with `venture-ops/dump_supabase.py`; never commit it.
## Skills

All installed skills are universal (available to every agent in every thread). The canonical catalog + installer is the `russell-labs-skills` plugin at `~/Developer/RussellLabs/russell-labs-skills/` — its README lists every skill, and each skill's `SKILL.md` description says when to use it. Invoke by slash command (e.g. `/voice-scan`, `/webvid`, `/handoff`); build a skill once and it's available everywhere, so there's no per-venture setup.
