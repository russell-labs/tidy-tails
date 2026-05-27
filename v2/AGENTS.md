<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tidy Tails v2 — Codex App Rules

This directory is the production Next.js app for Tidy Tails. It is no longer a prototype or read-only preview. The app is live at `https://tidy-tails-v2.vercel.app` and is used for Samantha's real grooming workflow.

## Product Contract

- Mobile-first, especially iPhone Safari.
- Samantha must be able to identify callers/texters quickly, inspect household and pet history, book work, log grooms, send customer messages, and produce business records.
- Search, Schedule, and Reports are the main operating surfaces.
- Settings must be reachable from the top-right profile/settings control, not as a bottom-nav tab.
- Inbox/notifications should be reachable from the header, not by displacing Settings.

## Data and Write Rules

- Supabase production is live. Be careful with any code path that mutates data.
- Do not make SQL/schema/RLS changes from normal app work. Those require explicit approval and a separate migration/rehearsal path.
- Server actions must validate ownership and inputs server-side.
- Customer communication must be human-reviewable unless a specific automation has been explicitly designed, gated, and approved.
- Past completed grooms are business records. Prefer edit/correction/void/no-show status over hard delete.
- Customer-facing location copy should use addresses, not internal names like Gina or Annette.

## Integrations

- Google Calendar availability should use Google's native busy/free state. Busy events block availability; free/transparent events do not.
- Calendar booking time means drop-off time, not exclusive groom duration.
- Twilio is used for SMS. Inbound webhook routes must remain auth-proxy exempt and validate Twilio signatures internally.
- Do not print, commit, or echo Twilio, Google, or Supabase secrets.

## Verification

Run these from `v2/` for code changes:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Use browser/mobile verification for flows involving sheets, bottom navigation, Google Calendar, Twilio, or production writes.

## Current High-Priority Backlog

Read `../_reports/2026-05-21-codex-handoff.md` and `../_reports/2026-05-21-tidy-tails-24h-feature-requests.md` before choosing work. The current next product priority is multi-pet household booking, followed by no-show/cancel/delete policy, inbound SMS handling, customer request triage, and reports/bookkeeping export polish.
