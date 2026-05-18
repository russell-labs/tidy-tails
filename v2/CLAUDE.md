# Tidy Tails v2 — agent context

@AGENTS.md

This is the **v2 app** — Ship 2.2b, production-bound (reads live data; every
write surface is gated). Venture context, the product contract, and the build
plan live in the parent repo:

- `../CLAUDE.md` — Tidy Tails venture operating context
- `../HANDOFF.md` — whose turn / what's next
- `../_reports/2026-05-15-v2-design-lock-spec.md` — the v2 product contract
- `../_reports/2026-05-15-v2-ship-2.1-scaffold-addendum.md` — this ship's scope + locked decisions
- `./README.md` — run, data modes, safety, deploy

**Hard rules for this app:** no SQL/schema/RLS changes and no v1 production
changes from app code. Every write/send surface is gated by a private
server-only flag; a surface may persist/send only when its exact flag is `on`.
Reminder SMS is never automatic: Samantha must review and explicitly confirm
each message in-app. Post-cutover write behavior is governed by
`../_reports/2026-05-18-ship-2.2b-write-flip-plan.md` and
`../_reports/2026-05-18-ship-2.2b-write-flips-1-2-code-prep.md`.
