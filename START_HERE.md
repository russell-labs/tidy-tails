---
venture: tidy-tails
last-updated: 2026-06-04
---

# START_HERE - Tidy Tails

Tidy Tails is the live grooming-operations product for Samantha McLennan's
business. The active production app is v2, a Next.js app deployed to Vercel and
connected to live Supabase, Twilio, and Google Calendar integrations.

## Doctrine Pre-Flight

Read KoyaOS doctrine before acting. In Russell's local workspace it lives one
level above this repo:

1. `/Users/russellcole/Developer/RussellLabs/.koya/ORIENTATION.md`
2. `/Users/russellcole/Developer/RussellLabs/.koya/MODES.md`
3. `/Users/russellcole/Developer/RussellLabs/.koya/AGENTS.md`
4. `/Users/russellcole/Developer/RussellLabs/.koya/VOLATILE.md`

If those files are not available in your environment, say so and continue with
the repo-local rules below. Do not invent missing doctrine.

## Canonical Repo Reading Order

1. `tidy-tails/START_HERE.md`
2. `tidy-tails/HANDOFF.md`
3. `tidy-tails/AGENTS.md`
4. `tidy-tails/v2/AGENTS.md`
5. `tidy-tails/TECH-DEVELOPMENT.md`
6. `tidy-tails/ENGINEERING-ROADMAP.md`
7. Any additional file explicitly named by `HANDOFF.md` or Russell.

Treat older `CLAUDE.md`, `ROADMAP.md`, and historical `_reports/` files as
context only unless the current handoff points to them.

## Live URLs

- Production v2 app: `https://tidy-tails-v2.vercel.app`
- Vercel project: `tidy-tails-v2`
- Supabase project id: `pgkwovokciaqnbhpttba`
- Legacy v1 GitHub Pages app: historical/fallback only; do not edit v1 unless
  Russell explicitly asks.

## Repo Paths

- Main repo path: `/Users/russellcole/Developer/RussellLabs/tidy-tails`
- Active app path: `/Users/russellcole/Developer/RussellLabs/tidy-tails/v2`
- Git remote: `https://github.com/russell-labs/tidy-tails.git`

## Hold-Fire Rules

- Do not deploy, mutate production data, send live SMS, run schema/RLS changes,
  or change Supabase/Twilio/Google production settings without Russell's
  explicit go for that exact action.
- Preserve unrelated dirty/untracked files. This repo often contains operator
  docs and reports that are not part of the current code task.
- Prefer fixture mode and local/browser verification before touching live flows.
- Customer-facing location copy should use addresses, not internal owner names.
- New server actions must re-verify the operator session server-side.
- CI must stay green before merge.

## Who To Ask

- Russell owns product, venture, production, deployment, data, and customer
  communication decisions.
- Sam is the operator/design-partner workflow source of truth when Russell
  chooses to involve her.
