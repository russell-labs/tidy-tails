-- WS2.1 — multi-tenant data model (ADDITIVE ONLY).
--
-- Introduces the org/membership model and a nullable org_id on every tenant
-- table. This slice changes NO existing columns or policies and NO app behavior:
-- org_id is nullable with no backfill of production, and the app ignores it for
-- now. Switching RLS to per-org isolation (WS2.2), the app cutover (WS2.3), and
-- the production backfill (WS2.4) are later slices.
--
-- The existing groomer_id stays on every table; it becomes attribution ("who
-- did this"), not the isolation boundary.
--
-- Staging-first: applied to staging only. Production is untouched.

-- ---------------------------------------------------------------------------
-- New tenant tables
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid not null default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  constraint organizations_pkey primary key (id)
);

create table public.organization_memberships (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  role text not null default 'owner',
  created_at timestamptz default now(),
  constraint organization_memberships_pkey primary key (id),
  constraint organization_memberships_org_id_fkey foreign key (org_id) references organizations(id) on delete cascade,
  constraint organization_memberships_org_user_key unique (org_id, user_id)
);

create index organization_memberships_user_id_idx on public.organization_memberships using btree (user_id);

-- ---------------------------------------------------------------------------
-- Additive nullable org_id (fk -> organizations) on every tenant table.
-- Nullable + no default + no backfill: existing rows read as org_id = null and
-- nothing about current behavior changes.
-- ---------------------------------------------------------------------------
alter table public.clients add column org_id uuid;
alter table public.clients add constraint clients_org_id_fkey foreign key (org_id) references organizations(id);

alter table public.pets add column org_id uuid;
alter table public.pets add constraint pets_org_id_fkey foreign key (org_id) references organizations(id);

alter table public.appointments add column org_id uuid;
alter table public.appointments add constraint appointments_org_id_fkey foreign key (org_id) references organizations(id);

alter table public.booking_requests add column org_id uuid;
alter table public.booking_requests add constraint booking_requests_org_id_fkey foreign key (org_id) references organizations(id);

alter table public.client_accounts add column org_id uuid;
alter table public.client_accounts add constraint client_accounts_org_id_fkey foreign key (org_id) references organizations(id);

alter table public.day_closeout_overrides add column org_id uuid;
alter table public.day_closeout_overrides add constraint day_closeout_overrides_org_id_fkey foreign key (org_id) references organizations(id);

alter table public.google_calendar_connections add column org_id uuid;
alter table public.google_calendar_connections add constraint google_calendar_connections_org_id_fkey foreign key (org_id) references organizations(id);

alter table public.sms_messages add column org_id uuid;
alter table public.sms_messages add constraint sms_messages_org_id_fkey foreign key (org_id) references organizations(id);

alter table public.audit_events add column org_id uuid;
alter table public.audit_events add constraint audit_events_org_id_fkey foreign key (org_id) references organizations(id);

alter table public.automations_log add column org_id uuid;
alter table public.automations_log add constraint automations_log_org_id_fkey foreign key (org_id) references organizations(id);

-- ---------------------------------------------------------------------------
-- RLS on the two new tables. Placeholder-safe read policies: a member can read
-- their own org and their own membership rows. (Existing tables' policies are
-- intentionally NOT touched in this slice; per-org isolation is WS2.2.)
-- RLS is also auto-enabled by the ensure_rls event trigger; enabling it here is
-- explicit and idempotent.
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;

create policy "org_member_select" on public.organizations
  for select to authenticated
  using (id in (select m.org_id from public.organization_memberships m where m.user_id = auth.uid()));

create policy "membership_self_select" on public.organization_memberships
  for select to authenticated
  using (user_id = auth.uid());
