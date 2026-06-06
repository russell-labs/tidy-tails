# Database isolation tests

## `cross_tenant_isolation.sql` — the per-org RLS gate (WS2.2)

Proves that, under the per-org RLS policies, one tenant can never read or write
another tenant's data. It is **the gate that must pass before any multi-tenant
deploy** (notably WS2.4's production cutover).

Two layers:
- **Structural** (covers all 10 tenant tables, populated or empty): every
  tenant-table policy must reference `user_org_ids()` and none may reference
  `groomer_id`. This is what guarantees the seven currently-empty tenant tables
  are actually switched — row tests can only exercise the three populated ones.
- **Behavioral** (clients/pets/appointments): simulates both seeded tenants and
  asserts, in **both directions**, read isolation (sees only its own org, zero
  foreign rows) and write isolation (cross-org UPDATE touches 0 rows; reassigning
  a row's `org_id` to a foreign org is blocked by `WITH CHECK`; inserting into a
  foreign org is blocked; inserting into one's own org is allowed).

It **fails loudly** (raises → non-zero exit under `ON_ERROR_STOP`) and is
**non-destructive** (wrapped in a transaction it rolls back).

### Run it

```bash
# Against staging (or any Postgres carrying migrations 0001–0004 + the two-tenant
# seed), as a role permitted to `set role authenticated`:
psql "$DB_URL" -v ON_ERROR_STOP=1 -f v2/supabase/tests/cross_tenant_isolation.sql
```

Verified passing against staging (`exemhetaxosklljbrzeh`) on 2026-06-06 via the
Supabase MCP: structural + both tenants, read + all four write-attacks.

## CI wiring — deferred to **WS2.2b** (deliberate)

This test is not yet wired into the `verify` CI job. CI currently runs
typecheck + lint + vitest with no database, and a faithful CI harness is a real
sub-project that, if subtly wrong, would give a **false-green safety gate** — the
worst possible outcome for the check that's supposed to guard the prod cutover.
So per the kickoff it is split into WS2.2b. The plan:

1. Add a `postgres:17` **service container** to `.github/workflows/ci.yml`.
2. Apply a **Supabase auth shim** before the migrations. The shim must reproduce,
   at minimum:
   - the `auth` schema, an `auth.users` table, and `auth.uid()` reading
     `request.jwt.claim.sub` (the real function's behaviour);
   - the `anon`, `authenticated`, `service_role` roles;
   - **the default table grants to `anon`/`authenticated`** — *this is the trap*:
     plain Postgres does not run Supabase's `ALTER DEFAULT PRIVILEGES`, so without
     explicit grants an `authenticated` session hits `permission denied` **before
     RLS is even evaluated**, silently testing the wrong thing. The shim must
     `GRANT` table privileges to those roles to match a real Supabase project.
3. Apply migrations `0001`–`0004`, then the two-tenant seed (the seed already
   creates the two synthetic `auth.users`).
4. Run `cross_tenant_isolation.sql` with `-v ON_ERROR_STOP=1`; a raise fails the
   job.

Until WS2.2b lands, the gate is enforced by running the script against staging
during review.
