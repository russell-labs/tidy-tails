---
venture: tidy-tails
last-updated: 2026-05-28
---

# START_HERE - Tidy Tails

Tidy Tails is a Founder-lane B2B SaaS venture for solopreneur groomers, monetized by subscription.

## Venture Identity

- Name: Tidy Tails
- subType: B2B SaaS
- scale: solopreneur
- monetization: subscription
- lane: FOUNDER
- MC project ID: not documented in this repo.
- Identity inferred from `HANDOFF.md` + `CLAUDE.md` as of 2026-05-28; will be reconciled to BP frontmatter when `MASTER-BUSINESS-PLAN.md` is authored. Source of truth flips to BP frontmatter at that time.

## Canonical Reading Order

1. `.koya/ORIENTATION.md`
2. `.koya/MODES.md`
3. `.koya/AGENTS.md`
4. `.koya/VOLATILE.md` (doctrine-changes section)
5. `tidy-tails/HANDOFF.md`
6. `tidy-tails/CLAUDE.md`
7. `tidy-tails/CLAUDE.md` (temporary BP stand-in; `tidy-tails/MASTER-BUSINESS-PLAN.md` is absent until authored)
8. Anything else only as `HANDOFF.md` names it.

## Live URLs

- Production URL: `https://russell-labs.github.io/tidy-tails/home.html`
- Staging URL: none documented.
- Koya / Mission Control dashboard: `http://100.76.140.23:3000`
- MC project ID: not documented in this repo.

## Repo Paths

- Operator workspace path: `~/Developer/RussellLabs/tidy-tails`
- VPS deploy path: none; v1 ships via GitHub Pages from `main`.
- Git remote: `https://github.com/russell-labs/tidy-tails.git`

## Operator Constraints

- Samantha's live workflow is load-bearing; do not change production behavior casually.
- Do not mutate live Supabase data, RLS policies, Twilio settings, or customer records without explicit Russell authorization.
- Do not mutate `data/venture-pulse/proj_tidy_tails.json`; it is a known dirty Mission Control seed outside this repo.
- Do not run Generate BP for Tidy Tails until Russell authorizes it.
- Do not broaden from Sam's workflow to a multi-groomer platform without Russell approving that product gate.

## Who To Ask

- Russell owns all venture, product, data, deployment, BP, and customer-facing decisions.
- Samantha is the design partner and workflow source of truth only when Russell chooses to involve her.
