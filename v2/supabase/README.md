# Tidy Tails — database migrations

Versioned Supabase migrations are the **source of truth** for the Tidy Tails
schema. They replace the old ad-hoc-SQL-in-`_reports/` pattern. Each change is a
timestamped file in `migrations/`, applied in order.

```
supabase/
  config.toml          CLI config (project_id is a local label, not a remote ref)
  migrations/
    20260606000001_baseline_schema.sql   production public schema, captured 2026-06-06
    20260606000002_sms_consent.sql        WS0 consent columns (pending on prod)
  seed.sql             synthetic STAGING-only data (no production data, ever)
```

## Projects

| Env | Ref | Notes |
|---|---|---|
| **Staging** | `exemhetaxosklljbrzeh` | Push target. Rehearsal ground for every migration. Safe to reset/seed. |
| **Production** | `pgkwovokciaqnbhpttba` | Operator-gated. Never `db push`/`db reset` casually. Sam's live data. |

## Prerequisites

```bash
# Install the CLI (Homebrew shown; see supabase.com/docs for other OSes)
brew install supabase/tap/supabase

# Authenticate (needs a personal access token from the Supabase dashboard)
supabase login
```

## Add a migration

```bash
cd v2
supabase migration new <short_name>      # creates migrations/<timestamp>_<short_name>.sql
# edit the new file — forward-only DDL, additive where possible
```

Keep migrations additive and reversible-in-spirit; never edit an already-applied
migration — add a new one.

## Push to staging (do this first, always)

```bash
cd v2
supabase link --project-ref exemhetaxosklljbrzeh   # staging
supabase db push                                    # applies pending migrations
# load synthetic data:
psql "$STAGING_DB_URL" -f supabase/seed.sql         # or run via the SQL editor / MCP
```

Verify the schema looks right, exercise the app against staging
(`NEXT_PUBLIC_USE_LIVE_DATA=on` pointing at the staging URL/anon key in
`.env.local`), and only then consider production.

## Apply to production (operator-gated, separate, deliberate)

Production is **not** part of the normal push flow. Applying a migration to prod
is an explicit, operator-approved step, ideally after a rehearsal on staging and
a fresh backup:

```bash
# Only with explicit operator approval + a current backup:
supabase link --project-ref pgkwovokciaqnbhpttba   # prod
supabase db push                                    # applies the SAME versioned files
```

Never run `supabase db reset` against production. Never seed production.

## Notes

- The baseline (`20260606000001`) was captured read-only from prod via catalog
  introspection in this slice (no DB password / pg_dump available then). Once CLI
  auth exists, it can be regenerated/verified with `supabase db pull` — the
  versioned files remain the source of truth either way.
- The `20260606000002` consent migration is **not yet applied to production**; it
  sits after the baseline so staging = prod-plus-consent.
- Supabase-managed schemas (`auth`, `storage`, `graphql`, …), the standard
  extensions, and the default `anon`/`authenticated`/`service_role` table grants
  ship with every project and are intentionally not recreated by the baseline.
