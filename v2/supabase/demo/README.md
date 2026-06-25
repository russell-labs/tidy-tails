# Demo-book seed — "Rusty's Dog House"

Fills the **demo org** with a believable full groom book so the launch / update
videos show a real-looking schedule, client list, history, and income. Every
detail is fictional; phones are `555` (non-routable); addresses are invented.

## Target (hard-coded — staging only)

| | |
|---|---|
| Supabase project | `exemhetaxosklljbrzeh` (tidy-tails-staging) |
| Org | `1bf5de76-4c23-4a07-8015-7fe77e672939` ("Rusty's Dog House") |
| Operator (`groomer_id`) | `9592c232-0526-4754-b06c-834e7a221a6d` (russellcolevop@gmail.com) |

Production (`pgkwovokciaqnbhpttba`) is **never** referenced. `groomer_id` is set
explicitly on every row because `auth.uid()` is null in a raw/service-role session.

## What it creates

- **29 clients** (25 active households + 4 lapsed), **33 pets**, **52 appointments**
  (33 completed, 19 booked).
- Past 2 weeks (Tue–Sat) of **completed** grooms with notes, tips (~60%),
  cash/Interac payment markers, and a per-day clock-time schedule.
- Next 2 weeks of **booked** appointments (the rebookings).
- **4 lapsed** clients last seen 8–12 weeks ago → they populate the "who's due to
  rebook" list.
- One **rented-chair day** at **Bayfield Pet Spa** (salon keeps 30%); the rest at
  **Home Studio** (owned, 100%). Busiest completed day grosses ~$430.
- Rewrites the demo org's `org_settings` to **1:1 / hybrid** with those two
  locations so owner take-home (and the WS4c rented-chair split) attribute
  correctly. Appointment `location` strings match the org-settings names verbatim.

## Idempotent & date-anchored

Dates anchor to `current_date` (T) **at run time**, and the script clears **only**
the demo org then re-inserts. Re-run it before each filming session to refresh the
schedule to "now". Client/pet UUIDs are deterministic (`dab0…`=client,
`da70…`=pet) so re-runs are stable.

## Isolation

Every `DELETE`/`INSERT` is scoped to the demo `org_id`; a guard aborts if the org
is missing; no other org is read or written. The dry run additionally snapshots
all non-demo-org row counts before/after and fails on any change.

## How to run

**Must run inside a single transaction** (the temp roster table requires it).

```bash
# Dry run — validate, persist NOTHING (recommended before every real run):
psql "$STAGING_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -c 'BEGIN;' -f 2026-06-13_demo_book_seed.sql -f demo_book_assert.sql -c 'ROLLBACK;'

# Real run — seed for filming (deliberate; after gate review):
psql "$STAGING_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -f 2026-06-13_demo_book_seed.sql -f demo_book_assert.sql
```

`demo_book_assert.sql` raises on any mismatch (counts, attribution, the rented-chair
day, the two-Coco / brothers touches, a $400–550 full day, ≥4 lapsed) and otherwise
returns a summary row. Run it in the same transaction as the seed.

This MCP-equivalent dry run was executed against staging and **passed**
(`clients=29 pets=33 appts=52 completed=33 booked=19`, busiest day $430, isolation
clean), and rolled back leaving the demo org untouched.

## Schema-drift note

Staging's `appointments_service_type_check` allows only
`full_groom | bath_only | nail_trim | other` — the TT-019 `puppy_groom` widening
is **not** applied on staging. The dataset's "puppy intro groom" (Kobe) is therefore
recorded as `full_groom`; the operator note carries the puppy context. If staging
later gains `puppy_groom`, no change is needed.

## On-camera touches (deliberate)

Two dogs named **Coco** booked the same day (disambiguation), the Castellano
**brothers** Olive + Gus booked together, a second **Olive** (Beagle) in another
household, a nervous **first-timer** (Roo), a **muzzle-for-nails** dog, and the
rented-chair **salon-cut** day.
