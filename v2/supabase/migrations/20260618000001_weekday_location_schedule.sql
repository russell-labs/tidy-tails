-- TT — recurring weekly "where I work" location schedule (ADDITIVE ONLY).
--
-- Adds a single nullable/defaulted jsonb column to the existing per-org
-- settings store so Sam can set, per weekday, which salon location she works
-- that day (or leave it absent → "off"). Extends org_settings rather than
-- introducing a new table specifically to REUSE that table's per-org RLS
-- (org_settings_select / _insert / _update, all scoped to user_org_ids()) — the
-- new column is automatically org-isolated by those row-level policies, so this
-- migration adds NO new policy and changes NO existing one.
--
-- SAFETY: purely additive. `add column ... not null default '{}'::jsonb` gives
-- every existing org_settings row the empty map (= every weekday "off" until
-- set) with no rewrite of column meaning and no touch to any other table. It
-- does not alter/rename existing columns and does not change RLS on any table,
-- so the cross-tenant isolation gate (which enumerates the 11 tenant tables and
-- asserts their policies stay org-scoped — org_settings is not even in that
-- list) is unaffected, and the prod cutover rehearsal (which applies ONLY the
-- baseline 0001, where org_settings does not yet exist) is likewise unaffected.
--
-- Shape of the value (normalized in lib/orgSettings.ts):
--   { "0".."6": "<org location name>" }  where 0 = Sunday .. 6 = Saturday
--   (JS Date.getDay()). A missing/blank/non-org key means that weekday is OFF.
-- Applying this to prod is a deliberate human step (this is a committed file
-- only; CI applies it to throwaway Postgres).

alter table public.org_settings
  add column weekday_locations jsonb not null default '{}'::jsonb;
