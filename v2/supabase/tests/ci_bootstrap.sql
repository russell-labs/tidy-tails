-- CI-only: make a plain Postgres look enough like Supabase that the committed
-- migrations apply and cross_tenant_isolation.sql can run as a real
-- `authenticated` user. NEVER run this against a real Supabase project — it is
-- a test scaffold, not part of the app schema.
--
-- It reproduces exactly the auth context the isolation test depends on:
--   * the anon / authenticated / service_role roles (service_role bypasses RLS);
--   * the `auth` schema, a minimal `auth.users` (the migrations only FK to id;
--     the extra columns match what seed.sql inserts), and `auth.uid()` with the
--     production definition (reads request.jwt.claim.sub);
--   * the `extensions` schema + uuid-ossp / pgcrypto for the id defaults.
-- Table privileges for anon/authenticated (Supabase's default-privilege grants,
-- which plain Postgres does NOT apply) are granted by a separate CI step after
-- the migrations create the tables. search_path is supplied per-session via
-- PGOPTIONS in CI, so `uuid_generate_v4()` defaults resolve.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists auth.users (
  id uuid primary key,
  aud text,
  role text,
  email text
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
