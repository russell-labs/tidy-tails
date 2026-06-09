---
venture: tidy-tails
doc-type: cc-plan
ticket: WS4a
created: 2026-06-08
owner: Russell
reviewer: Cowork
branch: feat/ws4a-1to1-scheduling
environment: staging only (no production deploy)
status: PLAN — awaiting Cowork review; NO code written yet
depends-on: 2026-06-08-codex-kickoff-ws4a-1to1-scheduling-engine.md, 2026-06-08-cheryl-intake-answers.md
---

# WS4a — 1:1 scheduling engine (implementation plan, PLAN-FIRST)

For an org whose `scheduling_style = one_to_one` (Cheryl), the app schedules one
dog at a time in duration blocks: booking picks a service + dog, gets a suggested,
adjustable duration, and lands on an open block of that length with exclusive
(overlap) conflict detection. The day view shows time blocks with an optional,
default-off 15-min buffer. Capacity is informational time arithmetic against soft
targets. **Sam's `batched` waterfall is byte-for-byte unchanged.** Staging only.

This plan was written against the real code (not the old spec). Key verified
facts and the resulting decisions are below; nothing here is built yet.

---

## 0. Ground truth confirmed in code

- **No SchedulingStrategy seam exists.** Waterfall logic is the pure modules
  `lib/dayCapacity.ts` (`assessDayFit`, `summarizeDayLoad`, `dogWorkProfile`) and
  `lib/booking.ts` (`availableBookingTimeSlots`, `bookedTimesForDate`,
  `hasBookedTimeConflict`, `BOOKING_TIME_SLOTS` = fixed 9am–noon/15-min tiles).
- **`scheduling_style` is written, never read.** WS3 Slice B writes
  `org_settings.scheduling_style` (`'batched' | 'one_to_one'`, default `batched`)
  and `org_settings.settings.locations[]`. **No code reads `org_settings` yet** —
  WS4a is the first reader.
- **Appointments have no duration.** `lib/data/types.ts` `Appointment` has
  `time_slot` (free-text, nullable, e.g. `"10:00am"`), `location` (text),
  `service`/`service_type`, `date`, `status`. No length/duration field; no
  duration in any migration.
- **`appointments.location` is enum-constrained.** Baseline migration line 315:
  `appointments_location_check check (location = ANY (ARRAY['annette','gina']))`.
  A new tenant's location string is **rejected by the database** today. This is a
  multi-tenancy gap WS4a must resolve to let Cheryl book at her locations.
- **The waterfall is consumed in more places than the two named surfaces** (see
  §1 table) — notably the **edit-appointment** flow as well as create.

---

## 1. The SchedulingStrategy seam

### Design: wrap, don't move (stated deviation from the kickoff wording)
The kickoff says "extract/move" the waterfall behind the seam. **We will WRAP it
instead:** `lib/dayCapacity.ts` and `lib/booking.ts` stay byte-identical, and the
`batched` strategy *delegates* to them. Rationale: those functions are exactly
what Sam's unit tests pin; a zero-diff wrap is the strongest possible
"Sam-unchanged" guarantee (no internals move, nothing to regress). Cowork should
accept this trade-off knowingly — it is a deliberate choice, not an oversight.

### New module `lib/scheduling/`
- `strategy.ts` — the `SchedulingStrategy` interface + `selectStrategy(style)`.
- `waterfall.ts` — `waterfallStrategy`, thin delegation to the existing functions.
- `oneToOne.ts` — `oneToOneStrategy`, the new duration-block logic (§2–§4).
- `time.ts` — pure time helpers (parse `"10:00am"` → minutes; overlap math).

The interface covers exactly what the consumers below need (names indicative):
```
type SchedulingStrategy = {
  style: 'batched' | 'one_to_one';
  // schedule view + in-booking capacity (waterfall: load points; 1:1: time/count)
  daySummary(args): DaySummaryLike;
  // booking/edit slot offering (waterfall: fixed tiles; 1:1: open blocks of length)
  availableSlots(args): SlotLike[];
  // write-path gate (waterfall: exact-time collision; 1:1: overlap + buffer)
  hasConflict(args): boolean;
  // 1:1 only; waterfall returns null
  suggestedDurationMinutes?(serviceType, size, overrides): number | null;
};
```
`batched` methods return the existing functions' output unchanged. `one_to_one`
methods implement §2–§4.

### Selection point (fail-safe)
New reader in `lib/data/repo.ts` (beside `currentOrgId`): `loadOrgSettings()` /
`loadSchedulingStyle()` → reads `org_settings` for the current org through the
existing membership-scoped session client. **Fail-safe default `'batched'`** when
there is no row, no session, or any error. Sam's org (created by the WS2.4
cutover, not the wizard) has **no `org_settings` row**, so she always resolves to
`batched`. `selectStrategy()` also maps any unknown value → `batched`.

`scheduling_style` reaches **both** sides authoritatively:
- **server-side** in every write action and server page via the reader (the gate
  of record), and
- **client-side** as a **prop** passed from the server page/sheet host into the
  booking/edit client components (so the UI renders the right picker) — the
  client never reads it on its own.

### Every waterfall consumer, classified (from a full grep)
| File | Symbols used | WS4a treatment |
|------|--------------|----------------|
| `app/(app)/schedule/page.tsx` | `summarizeDayLoad` | route via `strategy.daySummary`; branch day-view rendering (§4) |
| `components/AddAppointment.tsx` | `assessDayFit`, `availableBookingTimeSlots`, `bookedTimesForDate`, `BOOKING_LOCATIONS` | strategy + 1:1 booking variant (§3); locations from org settings (§5) |
| `components/EditAppointment.tsx` | `availableBookingTimeSlots`, `bookedTimesForDate`, `BOOKING_LOCATIONS` | **same 1:1 treatment as create** — editing a Cheryl block must also respect blocks/overlap/locations |
| `lib/actions/appointments.ts` | `hasBookedTimeConflict` | create write-path gate → `strategy.hasConflict` (§3) |
| `lib/actions/editAppointment.ts` | `hasBookedTimeConflict` | edit write-path gate → `strategy.hasConflict` |
| `lib/actions/dayCapacity.ts` | `assessDayFit`, `summarizeDayLoad` | route via strategy (in-booking day-fit messaging) |
| `lib/actions/availability.ts` | `availableBookingTimeSlots` | route via strategy |
| `lib/editAppointment.ts` | `BOOKING_LOCATIONS` (validation) | location seam (§5); per-org validation |
| `lib/dayCloseout.ts` | `BOOKING_LOCATIONS` | **batched-only / out of scope** — day closeout is finance (WS4b). Flagged, left as-is. |

A consumer silently left on waterfall would give Cheryl the wrong behavior *there*
while Sam stays green (so tests wouldn't catch it) — hence this exhaustive table.

---

## 2. Duration model

### Persisted: additive `appointments.duration_minutes integer` (nullable)
A 1:1 engine must place blocks and detect overlaps, and the per-booking
adjustment must survive a reload — so duration is **persisted**, not derived each
render. Migration **0006** (§ Migration) adds `duration_minutes int` (nullable,
no default). Waterfall (Sam) rows are written with `null` and ignore it entirely.

### Suggested duration (auto, adjustable)
Pure `suggestedDurationMinutes(serviceType, sizeClass, overrides?)` in
`lib/scheduling/`. Built-in defaults derived from Cheryl's intake:
- small ~30m (range 20–45), medium ~60m (45–75), large ~90m (60–150).
- service-aware: nail-trim short (~15–20m), bath shorter than full groom.
Size comes from the existing `inferSizeClass` (reused from `dayCapacity.ts`, not
moved). The suggestion is the default; the operator **adjusts per booking**, and
the adjusted value is what persists in `duration_minutes`.

### Where defaults are configured (per-org seam, minimal)
Optional `org_settings.settings.durationDefaults` overrides the built-ins; absent
→ built-ins. WS4a does **not** add a settings-editor UI (onboarding didn't capture
durations). The override seam exists; a configuration surface is a later slice.

---

## 3. 1:1 booking flow + exclusive conflict detection

Flow: choose dog + service → **suggested duration** shown and adjustable → pick an
**open block of that length** → confirm. Implemented as a `one_to_one` branch in
the booking surface (and the matching edit surface), gated by the
`scheduling_style` prop; the `batched` branch is the existing UI untouched.

### Open-block offering
`oneToOneStrategy.availableSlots` generates candidate start times across the
working day at a step (e.g. 15m), keeping only blocks of the requested length that
**don't overlap** any existing block (+ buffer if enabled). The picker writes a
**canonical** start time via the existing `formatSlotTime` so stored values are
uniform.

### Exclusive conflict detection (server-authoritative)
The gate lives in the **write actions** (`actions/appointments.ts` and
`actions/editAppointment.ts`), not just the UI — mirroring how
`hasBookedTimeConflict` is enforced today (appointments.ts line ~237). For 1:1:
a candidate `[start, start+duration)` conflicts if it overlaps any existing block
on that date. (Edit excludes the row being edited.)

**Two fail-safe rules (both unit-tested):**
- **Existing block with `duration_minutes = null`** (legacy/pre-WS4a row): fail
  *toward* conflict — treat it as occupying at least its suggested/typical length
  (or flag), never silently allow an overlap.
- **Unparseable existing `time_slot`** (free-text, Sam can hand-type): fail
  *toward* flag/conflict, never skip it out of the overlap set.

### Buffer
Optional, **default off**, one-tap 15-min cleanup gap. When on, the
overlap/availability math requires a 15-min gap between adjacent blocks. When off
(default), adjacent blocks may touch. Stored as a per-org setting
(`org_settings.settings.bufferMinutes`, default 0/off).

### Conflict is date-level and location-independent — stated assumption
Cheryl is a **solo groomer working one location per day** (her shop 4 days,
Gina's Wednesdays), so two blocks on the same date conflict regardless of
location. WS4a assumes this. **Flagged for Cowork:** revisit if multiple
groomers/locations-same-day ever arrive (would make conflict location-scoped).

---

## 4. 1:1 schedule day view

New `one_to_one` day-view rendering (branch in `schedule/page.tsx`, e.g. a
`OneToOneDay` component), shown only when the strategy is `one_to_one`; the
`batched` view (today's `OpenedDay`/`DaySummaryCard`/`AppointmentList`) is
untouched. The 1:1 view lists blocks ordered by start time, one dog per block,
with visible gaps and the buffer drawn when enabled.

**Capacity = informational time arithmetic, never a hard block:** show dogs booked
and total booked minutes against a **soft target** (~5–7 her shop, ~7 Gina's —
default per-org, informational pill only). Over target → a gentle note, not a
rejection. Week view for `one_to_one`: a simple per-day count/min summary (full
block rendering is the day view's job); kept minimal for WS4a.

---

## 5. Locations — minimal seam (defer the rest to WS4b)

### The constraint relaxation (NOT "additive" — named honestly)
`appointments.location`'s enum CHECK cannot be per-org, so storing Cheryl's
location **requires relaxing it**. Migration 0006 **drops
`appointments_location_check`** and **adds a light sanity CHECK** (location
non-empty, `length <= 64`) — real validation moves to app level (the submitted
location must be one of the org's `org_settings` location names). This is a
*constraint relaxation*: non-destructive (every existing row stays valid),
reversible, but a global change to a shared column — called out as such for
Cowork, not buried under "additive."
- **Scoped to `appointments_location_check` only.** The sibling gina/annette
  enums on `booking_requests.preferred_location`, `clients.preferred_location`,
  and `day_closeout_overrides.location` are **left alone** — the WS4a booking
  write path does not write them (confirmed by the consumer grep).
- Isolation gate inspects **policies, not CHECKs** → stays green. Cutover
  rehearsal applies only baseline 0001 → 0006 never runs there → unaffected.

### How locations key onto appointments: store the NAME
1:1 booking/edit reads the tenant's `org_settings.settings.locations[]` to
populate the location picker (instead of hardcoded `BOOKING_LOCATIONS`), and
stores the chosen location's **name** in `appointments.location` (now free text).
The name is all WS4a needs (picker + tag + display). **Validation:** the org's
location names must be **unique + non-empty** so the stored value is unambiguous.
- **Customer-facing copy uses the ADDRESS, not the name** (per the v2 product
  contract): the 1:1 booking-confirmation text's `[location]` resolves to the
  location's `address` from `org_settings` — not the name, not Sam's
  `CUSTOMER_BOOKING_LOCATION_LABELS`.
- **Stated limitation:** a later rename won't rewrite past appointments, and a
  name is not a stable id for economics joins. **WS4b** introduces explicit
  location ids (and can backfill) when it generalizes payout. WS4a needs no id.
- Sam keeps `gina`/`annette` codes (still valid under the loosened CHECK); her
  picker and labels are unchanged.

---

## 6. Sam-unaffected + isolation-green proof

- `dayCapacity.ts` / `booking.ts` are **not edited** — the `batched` strategy
  delegates to them, so Sam's code path and outputs are byte-identical.
- Every consumer (§1 table) either routes through the strategy (and `batched`
  returns the same result) or is consciously batched-only (`dayCloseout.ts`).
- Sam's org resolves to `batched` (no `org_settings` row → fail-safe default), so
  she never enters a 1:1 branch.
- Sam's cookie-based `operatorSettings` (calibration, locationSettings) is
  untouched; the new `org_settings` read supplies only `scheduling_style` (+ 1:1
  locations/durations).
- **Isolation gate green:** migration 0006 adds a column and relaxes a CHECK —
  **no RLS policy change** → `cross_tenant_isolation.sql` structural + behavioral
  checks unaffected. The new `org_settings`/duration reads ride existing
  membership-scoped RLS. 0006 is not applied in the cutover-rehearsal job.
- All existing tests (`booking.test.ts`, `dayCapacity.test.ts`, `schedule.test.ts`,
  `sam-workflows.spec.ts`) stay green **unchanged**.

---

## 7. Test plan

**Unit (vitest):**
- **Strategy selection:** `'batched'`→waterfall, `'one_to_one'`→1:1,
  unknown/null/missing-row → waterfall (fail-safe).
- **Waterfall delegation:** `waterfallStrategy.daySummary(...)` deep-equals
  `summarizeDayLoad(...)` (and slots/conflict equivalents) on sample data — pins
  "Sam unchanged" at the seam.
- **Duration:** `suggestedDurationMinutes` across size × service, with and without
  `org_settings` overrides; clamps/ranges from the intake.
- **Time helpers:** parse `"10:00am"`→minutes round-trips with `formatSlotTime`;
  **unparseable time → fail toward conflict** (tested).
- **Exclusive conflict:** overlap rejected; adjacent allowed (buffer off);
  adjacent rejected (buffer on); **null `duration_minutes` existing block → fail
  toward conflict** (tested); edit excludes the edited row.
- **Open-block generation:** only non-overlapping blocks of the requested length;
  buffer respected.
- **Org-settings reader:** no row → `batched`; row present → its value.
- **Location validation:** non-org / duplicate / empty names rejected; valid org
  name accepted; customer copy resolves to address.

**SQL / isolation:** migration 0006 rehearsed on **staging with a backup taken
first**; `cross_tenant_isolation.sql` re-run and **green** (no policy change). No
sibling isolation SQL needed (no new policy/table). No prod.

**E2E (Playwright):** the automated harness runs **fixtures mode** (single
batched dataset), so the true 1:1 path is verified as a **staging acceptance
demo** with a `one_to_one` org (book a block → see it on the day view → an overlap
is rejected → buffer toggle), consistent with how WS3 Slice B/C were verified.
Optionally add a fixtures-mode 1:1 smoke if we introduce a forced-`one_to_one`
test seam — noted, not required for WS4a.

---

## Migration 0006 (proposed — additive column + one constraint relaxation)
`v2/supabase/migrations/20260606000006_one_to_one_scheduling.sql` (number after
0005), staging-first:
1. `alter table public.appointments add column duration_minutes integer;`
   (nullable, no default — purely additive; waterfall rows stay null).
2. `alter table public.appointments drop constraint appointments_location_check;`
   then `add constraint appointments_location_check check (char_length(location) between 1 and 64);`
   (relaxation, scoped to this one constraint; siblings untouched).

Guardrails: additive column + scoped CHECK relaxation only; **rehearsed on staging
with a backup**; isolation gate stays green; **never applied to production** in
this workstream.

## Workflow
Plan-first: **this document → Cowork review → Russell approval → then build**,
opened as its own PR off `feat/ws4a-1to1-scheduling`. Staging only, no production
deploy. Never enter Russell's or Sam's credentials.
