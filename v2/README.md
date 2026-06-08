# Tidy Tails v2 — grooming cockpit

A mobile-first, installable grooming cockpit for Samantha. **Ship 2.2b —
production-bound: reads live data; every write surface stays gated until an
explicit post-cutover flip.** Built for one operator's working day: fast
client/pet search, pet safety cards, appointment history, lapsed clients,
vaccination status, revenue.

This is **not** a Pawfinity clone. It is the five-minute daily cockpit, narrowed
to Samantha's workflow.

- Product contract: `../_reports/2026-05-15-v2-design-lock-spec.md`
- This ship's scope + decisions: `../_reports/2026-05-15-v2-ship-2.1-scaffold-addendum.md`

## Run it

```bash
npm install      # first time only
npm run dev      # → http://localhost:3000
```

Production build / preview:

```bash
npm run build && npm start
```

Other scripts: `npm run lint`, `npm run typecheck`, `npm run icons` (regenerate
placeholder PWA icons).

The app is auth-gated by Supabase Auth (email/password plus Google OAuth). Entry
is gated by ORGANIZATION MEMBERSHIP (WS3): a confirmed user with a membership
enters the app; a confirmed user with no membership is routed to onboarding to
create one. The proxy enforces a valid session on every routed request, each
server action re-verifies the session, and per-org RLS isolates every row at the
database layer.

## Safety — what this build does NOT do

This build performs **no live writes**. By construction:

- No live writes — every write surface is gated; the live data path is
  `SELECT`-only until the post-cutover write flips.
- No SQL execution, no schema changes, no RLS changes.
- No SMS is sent — the reminder flow is built but its Send action is disabled.
- Groom logging is built but its Save action is disabled.
- No customer data is committed — fixtures are fully synthetic.

Writes turn on after the Ship 2.2b RLS cutover, **one surface at a time**, each
behind its own flag and explicit approval — see the write-flip plan in
`../_reports/`.

## Data source

| Mode | How | Default |
|---|---|---|
| Fixtures | Anonymized synthetic data in `lib/data/fixtures.ts` | yes |
| Live (read-only) | `SELECT`-only reads of the live Supabase project | opt-in |

To preview against live data locally, copy `.env.local.example` to `.env.local`,
set `NEXT_PUBLIC_USE_LIVE_DATA=on` plus the Supabase URL and anon key, and
restart. `.env.local` is gitignored. Live mode shows a "Live data · read-only"
banner. Even in live mode there is no write path.

## PWA / installability

- Web app manifest (`app/manifest.ts`) — standalone display, portrait, theme color.
- Placeholder icons in `public/icons/` and `app/apple-icon.png` (regenerate with
  `npm run icons`). **Replace with a finished icon set before launch.**
- Service worker (`public/sw.js`) — registered in production builds only;
  gives installability and offline read-through for the shell.
- Mobile viewport with `viewport-fit=cover` and iOS safe-area handling.

Verify installability with `npm run build && npm start`, then "Add to Home
Screen" in a mobile browser.

## Deploy

Deployed to **Vercel Production** as project `tidy-tails-v2` (Root Directory =
`v2/`) — `https://tidy-tails-v2.vercel.app`. Redeploy with `vercel --prod` from
`v2/`. v1 stays on GitHub Pages, untouched, until the Ship 2.2b RLS cutover
takes it dark. Write surfaces stay gated regardless of deploy — see the cutover
runbook and write-flip plan in `../_reports/`.

## Structure

```
app/            routes (App Router) + manifest + icons
  (auth)/login  placeholder sign-in
  (app)/        authenticated shell: home search, clients, reports, settings
components/     UI: ClientSearch, PetCard, AllergyAlert, sheets, nav, ...
lib/data/       types, fixtures, repo (fixtures ↔ live dispatch), supabase
lib/            format, derive (lapsed / vaccination / revenue), session, actions
proxy.ts        Next 16 proxy — placeholder auth gate
```

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4.
