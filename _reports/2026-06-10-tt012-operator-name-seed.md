# TT-012 — operator-name seed (required deploy step)

TT-012 replaces the hardcoded "Sam"/"Samantha" operator name with a per-org
`operatorName` stored in `org_settings.settings` (jsonb). New orgs get it seeded
from their business name at onboarding. **Existing orgs that onboarded before
this change have no `operatorName`, so their customer texts now sign with no
name** (the `[your name]` token is dropped when empty).

The deliberate decision (TT-012) was to keep **Sam's** texts signing exactly
`— Samantha`. That requires seeding her org explicitly — it is **not** automatic.

## State at time of writing (staging `exemhetaxosklljbrzeh`, 2026-06-10)

| org | org_id | settings row? | operatorName |
|-----|--------|---------------|--------------|
| Tidy Tails — Samantha (tenant 1) | `00000000-0000-0000-0000-00000000f001` | **no row** | — |
| Maple Grooming Co (tenant 2) | `…f002` | no row | — |
| Rusty's Dog House | `1bf5de76-…` | yes | null |
| Cheryl's Grooming | `af4fc8c9-…` | yes | null |

## Required: seed Sam (run once per environment, by an operator with DB access)

Sam's org has **no** `org_settings` row, so this INSERTs one (batched is her
existing behavior) and is also safe if a row appears later (the `ON CONFLICT`
merges only the `operatorName` key, preserving `scheduling_style`/locations):

```sql
insert into org_settings (org_id, scheduling_style, settings)
values (
  '00000000-0000-0000-0000-00000000f001',           -- confirm this is the live Sam org id
  'batched',
  jsonb_build_object('operatorName', 'Samantha')
)
on conflict (org_id) do update
  set settings = org_settings.settings || jsonb_build_object('operatorName', 'Samantha');
```

After running, the schedule "Reminder sender" row reads "Samantha" and her
booking/reminder/pickup texts sign `— Samantha` exactly as before.

## Optional: backfill other existing orgs with their business name

So pre-change orgs sign their own name instead of dropping the signature:

```sql
update org_settings s
set settings = s.settings || jsonb_build_object('operatorName', o.name)
from organizations o
where o.id = s.org_id
  and coalesce(s.settings->>'operatorName', '') = '';
```

## Production / Ship 2.2b

Prod (`pgkwovokciaqnbhpttba`) is on the baseline schema — **no `org_settings`
table yet**. The Sam seed above must become part of the 2.2b cutover, run after
the org schema lands in prod and Sam's prod `org_id` is known. Until then, this
only applies to staging.
