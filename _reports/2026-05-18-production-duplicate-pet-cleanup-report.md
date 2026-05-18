---
title: Production duplicate pet cleanup report
venture: tidy-tails
date: 2026-05-18
status: COMPLETE
type: data-cleanup-report
database: pgkwovokciaqnbhpttba
---

# Production Duplicate Pet Cleanup Report

## Summary

On 2026-05-18, production duplicate pet records were consolidated after a fresh
service-role backup. The cleanup was limited to imported-card duplicate debris:
same household, repeated pet name, either equivalent breed/history split across
rows or a zero-history same-name stub. Appointment history was preserved by
re-pointing appointments to the retained pet row before deleting redundant pet
rows.

Production backup taken before mutation:

`/Users/russellcole/Developer/RussellLabs/venture-ops/backups/tidy-tails/2026-05-18-pre-duplicate-pet-cleanup/`

Manifest status: `complete`  
Key role: `service_role`  
Warnings: none

## Before / After

| Table | Before | After | Delta |
|---|---:|---:|---:|
| `clients` | 137 | 134 | -3 |
| `pets` | 188 | 168 | -20 |
| `appointments` | 737 | 737 | 0 |
| `automations_log` | 0 | 0 | 0 |
| `sam_review_responses` | 70 | 70 | 0 |

Integrity verification after cleanup:

| Check | Result |
|---|---:|
| orphan `pets.client_id` | 0 |
| orphan `appointments.client_id` | 0 |
| orphan `appointments.pet_id` | 0 |
| same-name duplicate pet groups within one household | 0 |

## Consolidations Applied

### Same pet, split imported rows

The following duplicate pet rows were merged by keeping the most recent /
highest-history pet row, moving all appointment history onto it, then deleting
the redundant row:

| Household | Pet | Redundant rows deleted | Appointments moved |
|---|---|---:|---:|
| Lisa J. Lawlor | Posie | 1 | 3 |
| Lisa Madden | Milo | 1 | 10 |
| Lisa Madden | Chloe | 1 | 9 |
| Peggy Lund | Jake | 1 | 2 |
| Nadine Scotland | Chakia | 1 | 1 |
| Jennifer L. Kitchen | Raksha | 1 | 1 |
| Jennifer L. Kitchen | Rosie | 1 | 1 |
| Melissa Wicks | Jackson | 1 | 5 |
| Jane Donaldson | Baron (Sheppard → German Shepherd) | 1 | 0 |
| Aaliyha Rye | Ralph | 1 | 1 |
| Aaliyha Rye | Louis | 1 | 1 |
| Andrews (Stacey Waslyk) | Bobbi | 1 | 5 |

Subtotal: 12 pet rows deleted, 39 appointment rows re-pointed.

### Landry / Laundry canonicalization

Russell's confirmed rule: one household, Lisa Landry, with two pets: Cash and
Charlotte.

Final production state:

| Household | Pet | Breed | Appointments |
|---|---|---|---:|
| Lisa Landry | Cash | Lab X | 1 |
| Lisa Landry | Charlotte | Great Pyrenees | 4 |

Actions:

- Retained canonical client `e19cff76-c204-4af6-b69c-1e8f39a7bd9b`.
- Moved the Lab X appointment to Cash.
- Moved all Great Pyrenees appointments to Charlotte.
- Deleted 3 redundant Lisa Landry/Laundry client rows.
- Deleted 4 redundant Landry/Laundry pet rows.

### Zero-history same-name stubs

The following same-name pet rows had no appointments and no grooming notes, while
the same household had a real same-name pet with appointment history. They were
deleted:

| Household | Stub pet | Stub breed |
|---|---|---|
| Stacey Cameron | Stella | Doodle |
| Stillman | Stilly | large Doodle |
| Jane Donaldson | Baron | Vizsla |
| Korrie Silver | Gavi | Medium Mix |

## Spot Checks

After cleanup:

- Lisa Madden has exactly 2 pets: Chloe (34 appointments) and Milo (35 appointments).
- Lisa Landry has exactly 1 household and exactly 2 pets: Cash and Charlotte.
- Jane Donaldson no longer has duplicate Baron rows.
- Korrie Silver no longer has duplicate Gavi rows.
- No appointment rows were lost.

## Scope Notes

This was a production data cleanup, not a code change. It used the existing
service-role backup and REST safety pattern:

1. Take a fresh backup.
2. Dry-run a deterministic merge plan.
3. Re-point appointments before deleting redundant pets.
4. Verify counts and FK integrity after mutation.

No SMS was sent. No Vercel env flags were changed. No schema/RLS change was
made.
