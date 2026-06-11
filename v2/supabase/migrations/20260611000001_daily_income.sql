-- TT-014: lump-sum daily income for rented-chair days with no individual
-- bookings. Stores GROSS cash collected, attached to the rented location for
-- that date; the existing per-location cut derives take-home. Mirrors the
-- day_closeout_overrides table + per-org RLS conventions. Org-scoped, staging-first.

create table public.daily_income (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null,
  groomer_id uuid not null default auth.uid(),
  date date not null,
  location text not null,            -- 'gina' | 'annette' (validated app-side)
  amount numeric(10,2) not null,     -- GROSS cash collected; location cut derives take-home
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_income_pkey primary key (id),
  constraint daily_income_org_id_fkey foreign key (org_id) references organizations(id),
  constraint daily_income_groomer_id_fkey foreign key (groomer_id) references auth.users(id),
  constraint daily_income_groomer_date_location_key unique (groomer_id, date, location)
);

create index idx_daily_income_org_date on public.daily_income using btree (org_id, date);

-- RLS is also auto-enabled by the ensure_rls event trigger; enabling here is explicit.
alter table public.daily_income enable row level security;

create policy "groomer_select" on public.daily_income
  for select to public using (org_id in (select public.user_org_ids()));
create policy "groomer_insert" on public.daily_income
  for insert to public with check (org_id in (select public.user_org_ids()));
create policy "groomer_update" on public.daily_income
  for update to public using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));
create policy "groomer_delete" on public.daily_income
  for delete to public using (org_id in (select public.user_org_ids()));

create trigger update_daily_income_updated_at
  before update on public.daily_income
  for each row execute function update_updated_at_column();
