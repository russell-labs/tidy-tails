---
venture: tidy-tails
doc-type: staging-rehearsal-proof
ticket: TT-015
created: 2026-06-11
status: PASS on staging (exemhetaxosklljbrzeh). Migration persisted; all probe data rolled back. Flag still OFF, no prod, no enable.
branch: feat/tt015-admin-view-as
security-sensitive: true
---

# TT-015 — Admin view-as — staging rehearsal proof

Rehearsal of `v2/supabase/migrations/20260611000002_admin_view_as.sql` against
**staging** `exemhetaxosklljbrzeh` (tidy-tails-staging). **Prod
`pgkwovokciaqnbhpttba` was never touched.** The migration was applied
persistently (staging-first); every probe ran inside a `begin … rollback`
transaction, so no probe seed, admin row, or session persisted. Method mirrors
the committed `v2/supabase/tests/cross_tenant_isolation.sql`: probe RLS as a
given identity via `set local role authenticated` + `request.jwt.claim.sub`,
assertions raise on breach.

Identities: synthetic seed (already on staging) — org #1 `…f001` (operator `…aa`,
3 clients/4 pets/4 appts), org #2 `…f002` (operator `…bb`). Throwaway admin
`…00ad` seeded into `platform_admins` inside each probe tx (rolled back).

## 1. Migration apply — OK
`apply_migration` succeeded (staging ledger entry `admin_view_as`; auto-versioned
timestamp, not the file's `20260611000002` — cosmetic). Pre-state: migrations
through `daily_income`; all in-scope tables present.

## 2. pg_policies introspection — OK (each assertion exact)
| Check | Expected | Got |
|---|---|---|
| In-scope SELECT policies carrying BOTH `user_org_ids` + `active_impersonated_org_ids` | 10 | **10** |
| Exactly one SELECT policy per in-scope table (max per table) | 1 | **1** |
| INSERT/UPDATE/DELETE policies carrying the admin term (anywhere) | 0 | **0** |
| Excluded tables (`client_accounts`, `google_calendar_connections`) SELECT with admin term | 0 | **0** |
| Excluded tables keeping member-only SELECT | 2 | **2** |
| Tenant policies still referencing `groomer_id` | 0 | **0** |
| `platform_admins` / `admin_impersonation_sessions` write policies | 0 | **0** |
| `platform_admins` / `admin_impersonation_sessions` self-select policies | 2 | **2** |

The OR-term is on SELECT only; writes are untouched; OAuth-token table and
client_accounts are provably out of admin-read scope (structural, not vacuous).

## 3. Cross-tenant isolation gate — PASS
Ran the committed `cross_tenant_isolation.sql` (structural + behavioral) post-
migration: tenant 1 and tenant 2 each read only their own org and cannot
update/reassign/insert across orgs. **Tenant isolation is unchanged by this
migration** (`A OR ∅ = A` confirmed behaviorally).

## 4. Admin view-as live RLS probes — PASS

**Probe 1 — no active session / non-admin (read nothing, can't start):**
- Normal operator `…aa` calling `admin_start_impersonation` → rejected with
  `42501` (the RPC's `is_platform_admin()` assert).
- Admin `…ad` with only an **expired** and an **ended** session: `is_admin=true`,
  but `active_impersonated_org_ids()=0` and **0 rows** across all 11 tenant
  tables (clients/pets/appointments/daily_income/org_settings/audit_events/
  booking_requests/day_closeout_overrides/automations_log/sms_messages). Expired
  and ended sessions grant nothing.

**Probe 2 — active session via the real RPC (reads only the target):** after
`admin_start_impersonation('…f001')`: `active_orgs=1`; sees f001 = 3 clients /
4 pets / 4 appts / 1 daily_income / 1 org_settings; sees **0** of each from any
other org (f002 hidden). Scoped to the session's target, and the two
newly-added tables (`daily_income`, `org_settings`) are correctly visible.

**Probe 3 — writes denied (asymmetric) + explicit exit:** with an active session
on f001, as the admin:
- `INSERT` into f001 (clients, daily_income) → `42501` (WITH CHECK; admin ∉ org).
- `UPDATE` / `DELETE` on f001 (clients, daily_income, appointments) → **0 rows
  affected, no exception** (the USING clause is member-only, so the rows are
  invisible to the write path even though SELECT shows them). This asymmetry is
  the intended, correct behavior, not a wart.
- `admin_end_impersonation()` → `active_orgs=0`, clients seen `=0` (explicit exit
  clears all visibility immediately).

Net: the admin can **read** the target org while a session is active and can
**never write** any tenant row — exactly the read-only-at-DB thesis.

## 5. Security advisors (post-DDL) — reviewed, all expected
`get_advisors(security)` after apply flagged only:
- `anon/authenticated_security_definer_function_executable` on the new functions
  — the **same class already carried by `user_org_ids` and `org_created_by_me`**
  (Postgres grants EXECUTE to PUBLIC by default). Proven safe in §4: every
  function fails closed for anon / non-admin via the inner `is_platform_admin()`
  assert/predicate. `active_impersonated_org_ids` **must** keep anon EXECUTE (it
  is referenced in `to public` SELECT policies).
- `rls_enabled_no_policy` on `sam_review_responses` and leaked-password — both
  **pre-existing**, unrelated to TT-015.

**Hardening — APPLIED & verified (Russell approved 2026-06-11).** Revoked
`EXECUTE` from `anon` on the 5 admin-only RPCs (`is_platform_admin`,
`admin_start/end_impersonation`, `admin_active_impersonation`, `admin_list_orgs`),
keeping `authenticated`. `active_impersonated_org_ids` left anon-executable (it
is referenced in `to public` SELECT policies).
- **Gotcha caught:** Supabase grants EXECUTE *directly to the `anon` role* (schema
  default privileges), not via `PUBLIC` — the admin RPCs' ACL had no PUBLIC grant
  at all. So `revoke … from public` was a no-op; the migration revokes
  `from public, anon` (anon named explicitly). Confirmed via `pg_proc.proacl`.
- **Verified on staging:** authenticated admin path still works (start OK,
  active=1, reads 3 target clients); `anon` now gets `insufficient_privilege` on
  both `is_platform_admin` and `admin_start_impersonation`; `anon` still executes
  `active_impersonated_org_ids` (returns ∅, no error). `get_advisors(security)`
  re-run: the 5 admin-RPC **anon** warnings are gone; remaining anon warnings are
  only `active_impersonated_org_ids` (intentional) + pre-existing `user_org_ids`/
  `org_created_by_me`. The `authenticated`-executable warnings remain by design
  (the app calls these as authenticated; same accepted baseline as user_org_ids).
- Staging got the hardening as a follow-on (`admin_view_as_rpc_hardening` +
  corrected `from anon` delta); the committed migration file folds it inline
  (`revoke … from public, anon`), so a fresh prod apply is hardened in one shot.

## 6. Cleanup — verified clean
All probe transactions rolled back. Post-rehearsal staging state:
`platform_admins=0`, `admin_impersonation_sessions=0`, probe admin user absent,
`daily_income=0` (pre-rehearsal value), synthetic `clients=7` intact,
`platform_admins` table present (migration persisted). **No residue.** The
feature is inert on staging (no real admin seeded) until the flag + a real seed.

## 7. Remaining pre-enable gates
Legal disclosure live in ToS/Privacy; capture + seed the **real** staging admin
uid (the probe used a throwaway, rolled back); then gated prod apply (the
committed migration now folds in the §5 RPC hardening). Flag stays OFF until a
real support session.
