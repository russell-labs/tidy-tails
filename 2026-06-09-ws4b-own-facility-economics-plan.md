---
venture: tidy-tails
doc-type: cc-plan
ticket: WS4b
created: 2026-06-09
owner: Russell
reviewer: Cowork
branch: feat/ws4b-own-facility-economics
environment: staging only (no production deploy)
status: PLAN — awaiting Cowork review; NO code written yet
depends-on: 2026-06-08-ws4a-1to1-scheduling-plan.md (1:1 engine, migration 0006), TT-004/005 onboarding economics
---

# WS4b — own-facility economics (implementation plan, PLAN-FIRST)

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. **Do not start until Cowork has resolved §2 Open Decisions.**

**Goal:** For an owner-operator (an org with a location typed `owned`, e.g. Cheryl's own shop), surface **TAKE-HOME = collected gross − expenses** with owner-operator framing — no "salon keeps" language, no split — by consuming the economics already captured at onboarding. **Sam's rented finance stays byte-for-byte unchanged.**

**Architecture:** Take-home is a **new, additive reporting layer**, not a change to Sam's split math. `lib/locationFinance.ts` (gina/annette split) is untouched. A new pure module `lib/ownerEconomics.ts` computes take-home; the `lib/orgSettings.ts` reader is extended (additively) to expose each location's `type` + `expenses`; reports and the bookkeeper export branch on whether the org has an owned location. **WS4b core ships with ZERO migrations** (expenses already live in `org_settings.settings` jsonb; owner appointments already carry their location name as free text since migration 0006).

**Tech stack:** Next.js 16 server components + server actions, Supabase (read `org_settings`), Vitest. Same patterns as WS4a.

This plan was written against the real code (not a spec). The verified facts and resulting decisions are in §0–§1; the genuinely-open calls are cordoned in §2. Nothing is built yet.

---

## 0. Ground truth confirmed in code

**Two finance systems exist and they do not share config — this is the whole game.**

- **Sam's RENTED finance (do not touch).** `lib/locationFinance.ts` reads the **cookie** `operatorSettings.locationSettings` (`gina`/`annette`, `payoutType` percent|daily_rate, `salonKeepsPercent`, `dailyRate`) and computes the per-location split (`calculateAppointmentMoney`, `calculateDayMoney`, `calculateDayLocationMoney`). It is surfaced in the batched schedule money card, day closeout, reports "Salon payouts", and the bookkeeper "Day Closeouts" sheet. Config source is the cookie, **never `org_settings`**.
- **Owner economics (captured, not yet consumed).** Onboarding (`lib/onboarding.ts` → `lib/actions/onboarding.ts`) writes to `org_settings.settings` jsonb:
  ```json
  { "businessStructure": "own | works_for_others | hybrid",
    "locations": [
      { "type": "owned",  "name": "...", "address": "...",
        "expenses": { "rentMortgage": n|null, "utilities": n|null,
                      "supplies": n|null, "upkeep": n|null, "cleaning": n|null } },
      { "type": "rented", "name": "...", "address": "...",
        "payoutType": "percent|daily_rate", "salonKeepsPercent": n, "dailyRate": n|null } ] }
  ```
  Expense categories are fixed: `EXPENSE_CATEGORIES` in `lib/onboarding.ts` (rentMortgage/utilities/supplies/upkeep/cleaning), each `number | null` ("$ optional" in the wizard — owners may enter none).
- **The reader drops the economics today.** `lib/orgSettings.ts` `normalizeLocations()` keeps only `{ name, address }` per location and exposes no `businessStructure`. WS4b must add `type` + `expenses` (owned) and `businessStructure` — additively.
- **`bookingLocation()` hard-codes gina/annette** (`lib/locationFinance.ts:47`). Any other `appointment.location` is "unassigned" and already flows **gross → samNet with no split**. So owner-operator appointments never route through Sam's split — the non-entanglement is structural, not something we must engineer.
- **Owner appointments carry the owned-location NAME as free text.** The 1:1 booking path (`lib/oneToOneBooking.ts`, wired via `components/OneToOneAddAppointment.tsx` / `OneToOneOpenedDay.tsx` / `createOneToOneBooking`) validates `location` as free text (non-empty, ≤64 chars; membership against org locations is **not** enforced — the code only length-checks). **Migration 0006 relaxed `appointments.location`** from the gina/annette CHECK to `null or char_length 1..64`. So `appointment.location` for an owner is the location name they typed — a real join key to `org_settings.locations[].name`.
- **The schedule already branches on `schedulingStyle === "one_to_one"`** (`app/(app)/schedule/page.tsx:170`) and **hides Sam's batched Sam-net/gross money card** for 1:1 orgs (comment at line ~304: "the Sam-net/gross money card is batched finance; a one_to_one org's …"). The 1:1 day view is `components/OneToOneOpenedDay.tsx`. This is a clean, pre-existing seam where owner economics slots in without touching Sam's view.
- **`revenueInRange(appointments, from, to)`** (`lib/derive.ts:244`) already sums collected gross/fees/tips for a date range, excluding `payment_status: waiting`. `monthBounds(ref)` (`lib/derive.ts`) gives a calendar month's `{from,to}`. Reuse both.
- **Highest migration = `20260606000006`.** No `expenses` table exists. **`day_closeout_overrides.location` STILL has the gina/annette CHECK** (baseline `20260606000001_baseline_schema.sql:333`, left alone by 0006) — see §2.1.
- **No owner-operator fixtures exist** (`lib/data/fixtures.ts` has no `one_to_one` / owned-location org). WS4b must add them to test the path.

---

## 1. Design decisions (resolved)

1. **Take-home is a new layer; Sam's split math is untouched.** New pure module `lib/ownerEconomics.ts`. `lib/locationFinance.ts`, `lib/operatorSettings.ts`, `lib/dayCloseout.ts`, `lib/payments.ts`, `lib/payoutOverride.ts`, `lib/bookkeeperExport.ts`'s rented logic — **no behavioral edits**. Reports/export only **add** an owner branch guarded by "org has an owned location."
2. **Per-owned-location, keyed by location name.** Take-home for an owned location = collected gross of appointments whose `location === ownedLocation.name`, minus that location's recurring monthly expenses. For the common case (one owned location) this is exact. Appointments whose `location` matches no owned location name fall into an honest "unassigned" line (shown, not silently folded in).
3. **Monthly, never pro-rated.** Recurring expenses are monthly figures. Take-home is shown **only for a whole-calendar-month period** (`isWholeMonth(from,to)` via `monthBounds`). For non-month ranges, show collected gross labeled as gross and a note that take-home needs a full month — **do not** approximate a partial-month expense share.
4. **Honesty about "no expenses on file."** Expenses are `number | null` and owners may enter none. Distinguish:
   - **At least one category non-null** → `hasExpensesOnFile = true`; `takeHome = gross − sum(non-null)`.
   - **All categories null** → `hasExpensesOnFile = false`; `takeHome = null`; surface gross labeled "collected" with a prompt to add costs. **Never present "gross − 0" as take-home.**
5. **Owner-operator framing, no split vocabulary.** Labels: "Collected", "Costs", "Your take-home". No "salon keeps", no "payout", no percentage.
6. **Trigger = the org has an owned location** (`type === "owned"` in extended `org_settings`). In practice these are the `schedulingStyle === "one_to_one"` orgs, but the economic trigger is the owned location, not the scheduling style.

---

## 2. OPEN DECISIONS FOR COWORK (resolve before coding)

### 2.1 Owner-operator day closeout — needs a Cowork ruling (and possibly a migration)
The spec lists "owner-operator day closeout (no split; keep the override for cash rounding)." Two problems make this the one genuinely-unresolved piece:

- **Semantic gap.** Sam's day-closeout override (`day_closeout_overrides`: `final_payout` vs `calculated_payout`) means *"what Sam physically paid the salon, rounded."* An owner-operator pays no one — there is no payout to round. So `final_payout`/`calculated_payout` has **no referent** for an owner. Overloading it ("treat `final_payout` as cash banked") would be confusing in six months.
- **DB constraint.** `day_closeout_overrides.location` still has `CHECK (location = ANY('gina','annette'))`. An owned-location closeout keyed by the owned-location name would be **rejected by the database** → it requires a migration **0007** relaxing that CHECK on a **Sam-shared table** (additive-style, but a real constraint change that must be staging-rehearsed and re-isolation-gated).

**Recommendation:** **Defer the owner-operator day closeout from WS4b v1.** With no payout to round, the cash-rounding override has no honest meaning yet, and avoiding the `day_closeout_overrides` CHECK change keeps WS4b a **zero-migration, Sam-can't-be-touched** slice. If Cowork wants a v1 owner closeout, the minimal honest version is a **day-level "cash reconciled vs collected gross" note** (rounding the day's collected total, not a payout), which needs the 0007 CHECK relaxation — scope it as a sibling task. **This plan's tasks build the zero-migration reporting layer; the closeout is written as a flagged stub (§4 Task 6), not fake-concrete steps.**

### 2.2 Confirm jsonb-only (no expenses table) for v1
Recommendation: **yes, jsonb-only.** Recurring monthly expenses already in `org_settings.settings` are enough for an honest *estimated monthly take-home*, and using them means **WS4b touches no schema** → the cross-tenant isolation gate is trivially green and "Sam unaffected" is trivially true. A dated/one-off `expenses` table (actual receipts, mid-month purchases) is the natural next slice (**WS4b.2**), additive as migration 0007; defer it. Cowork: confirm or ask for the table now.

### 2.3 Reports: replace vs add
For an owned org the "Salon payouts" section is meaningless (no salon). Recommendation: **for owned orgs, render "Your take-home" in place of "Salon payouts"** (the 1:1 schedule view already hides the batched money card, so this matches existing behavior). Sam's reports are byte-identical because her org has no owned location. Cowork: confirm.

### 2.4 Bookkeeper export
Recommendation: for owned orgs, add an **"Owner Economics" sheet** (per-location: month, collected gross, each expense line, total costs, take-home) and **leave the per-visit and "Day Closeouts" sheets unchanged**. Sam's workbook is byte-identical (no owned location → sheet not added). Cowork: confirm sheet vs inline.

---

## 3. File structure

| File | Responsibility | Change |
|------|----------------|--------|
| `v2/lib/orgSettings.ts` | Org settings reader/types | **Modify** — expose `businessStructure` + per-location `type` + `expenses`; add `ownedLocations` accessor. Additive; existing `OrgLocation {name,address}` consumers keep working. |
| `v2/lib/ownerEconomics.ts` | **New** pure module — expense totals, per-location take-home, whole-month guard, honesty rules | **Create** |
| `v2/lib/ownerEconomics.test.ts` | Unit tests for the module | **Create** |
| `v2/lib/orgSettings.test.ts` | Reader tests (extend) | **Modify** |
| `v2/lib/data/fixtures.ts` | Add an owner-operator org (one_to_one, owned location + expenses + appointments) | **Modify** |
| `v2/app/(app)/reports/page.tsx` | Branch: owned org → "Your take-home"; else unchanged | **Modify** |
| `v2/lib/bookkeeperExport.ts` | Owner Economics sheet for owned orgs; rented path unchanged | **Modify** |
| `v2/lib/bookkeeperExport.test.ts` | Owner sheet tests + Sam-unchanged proof | **Modify** |
| `v2/app/(app)/reports/export/route.ts` | Pass org economics into the workbook builder | **Modify** |
| `v2/lib/ownerCloseout.ts` (+ test) | **Flagged stub only** — see §2.1 / Task 6 | **Defer** |

---

## 4. Tasks

> Run all commands from `v2/`. Test runner: `node_modules/.bin/vitest run <file>` (CI uses `npm run test`). Commit after each green step.

### Task 1 — Extend the org-settings reader to expose economics

**Files:** Modify `v2/lib/orgSettings.ts`; Test `v2/lib/orgSettings.test.ts`

- [ ] **Step 1 — Failing test.** Add to `v2/lib/orgSettings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeOrgSettings } from "./orgSettings";

describe("orgSettings — economics (WS4b)", () => {
  const raw = {
    scheduling_style: "one_to_one",
    settings: {
      businessStructure: "own",
      locations: [
        {
          type: "owned",
          name: "Cheryl's Shop",
          address: "5 Maple St",
          expenses: { rentMortgage: 1200, utilities: 150, supplies: 80, upkeep: null, cleaning: 40 },
        },
      ],
    },
  };

  it("exposes businessStructure", () => {
    expect(normalizeOrgSettings(raw).businessStructure).toBe("own");
  });

  it("exposes owned locations with their expenses", () => {
    const owned = normalizeOrgSettings(raw).ownedLocations;
    expect(owned).toEqual([
      {
        name: "Cheryl's Shop",
        address: "5 Maple St",
        expenses: { rentMortgage: 1200, utilities: 150, supplies: 80, upkeep: null, cleaning: 40 },
      },
    ]);
  });

  it("keeps the legacy name+address locations list working", () => {
    expect(normalizeOrgSettings(raw).locations).toEqual([
      { name: "Cheryl's Shop", address: "5 Maple St" },
    ]);
  });

  it("defaults to empty economics for a Sam-like (no settings) org", () => {
    const s = normalizeOrgSettings({ scheduling_style: "batched", settings: {} });
    expect(s.businessStructure).toBeNull();
    expect(s.ownedLocations).toEqual([]);
  });
});
```

- [ ] **Step 2 — Run, expect FAIL** (`businessStructure`/`ownedLocations` undefined):
  `node_modules/.bin/vitest run lib/orgSettings.test.ts`

- [ ] **Step 3 — Implement (additive).** In `v2/lib/orgSettings.ts` add types + parsing. Keep `OrgLocation`, `normalizeLocations`, and `OrgSettings.locations` exactly as-is; add alongside:

```ts
export type BusinessStructure = "own" | "works_for_others" | "hybrid";

export type OwnedLocationExpenses = {
  rentMortgage: number | null;
  utilities: number | null;
  supplies: number | null;
  upkeep: number | null;
  cleaning: number | null;
};

export type OwnedLocation = {
  name: string;
  address: string;
  expenses: OwnedLocationExpenses;
};

// add to OrgSettings:
//   businessStructure: BusinessStructure | null;
//   ownedLocations: OwnedLocation[];

const EXPENSE_KEYS = ["rentMortgage", "utilities", "supplies", "upkeep", "cleaning"] as const;

function asMoneyOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function normalizeExpenses(raw: unknown): OwnedLocationExpenses {
  const rec = asRecord(raw);
  return Object.fromEntries(
    EXPENSE_KEYS.map((k) => [k, asMoneyOrNull(rec[k])]),
  ) as OwnedLocationExpenses;
}

function normalizeBusinessStructure(raw: unknown): BusinessStructure | null {
  return raw === "own" || raw === "works_for_others" || raw === "hybrid" ? raw : null;
}

function normalizeOwnedLocations(raw: unknown): OwnedLocation[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnedLocation[] = [];
  for (const entry of raw) {
    const rec = asRecord(entry);
    if (rec.type !== "owned") continue;
    const name = asString(rec.name);
    if (!name) continue;
    out.push({ name, address: asString(rec.address), expenses: normalizeExpenses(rec.expenses) });
  }
  return out;
}
```
  Wire `businessStructure` + `ownedLocations` into `normalizeOrgSettings` (reading `settings.businessStructure` and `settings.locations`), and into `DEFAULT_ORG_SETTINGS` (`businessStructure: null`, `ownedLocations: []`). `asRecord`/`asString` already exist in this file.

- [ ] **Step 4 — Run, expect PASS.** `node_modules/.bin/vitest run lib/orgSettings.test.ts`
- [ ] **Step 5 — Commit.** `git add lib/orgSettings.ts lib/orgSettings.test.ts && git commit -m "WS4b: expose businessStructure + owned-location expenses in orgSettings reader"`

---

### Task 2 — `lib/ownerEconomics.ts` pure take-home module

**Files:** Create `v2/lib/ownerEconomics.ts`, `v2/lib/ownerEconomics.test.ts`

- [ ] **Step 1 — Failing test.** Create `v2/lib/ownerEconomics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isWholeMonth, ownerLocationTakeHome } from "./ownerEconomics";
import type { Appointment } from "./data/types";

function appt(p: Partial<Appointment>): Appointment {
  return {
    id: "a", client_id: "c", pet_id: "p", date: "2026-05-10", time_slot: "10:00am",
    service: "Full groom", price: 100, tip: null, notes: null, status: "booked",
    location: "Cheryl's Shop", google_calendar_id: null, google_event_id: null,
    google_sync_status: null, google_sync_error: null, google_synced_at: null,
    created_at: "2026-01-01T00:00:00.000Z", ...p,
  };
}
const FULL = { rentMortgage: 1200, utilities: 150, supplies: 80, upkeep: 20, cleaning: 50 };
const NONE = { rentMortgage: null, utilities: null, supplies: null, upkeep: null, cleaning: null };
const month = { from: "2026-05-01", to: "2026-05-31" };

describe("isWholeMonth", () => {
  it("is true for the first..last of a month", () => {
    expect(isWholeMonth("2026-05-01", "2026-05-31")).toBe(true);
  });
  it("is false for a partial range", () => {
    expect(isWholeMonth("2026-05-01", "2026-05-15")).toBe(false);
  });
});

describe("ownerLocationTakeHome", () => {
  it("take-home = collected gross − monthly expenses", () => {
    const r = ownerLocationTakeHome({
      locationName: "Cheryl's Shop",
      appointments: [appt({ price: 100 }), appt({ id: "b", price: 60 })],
      from: month.from, to: month.to, expenses: FULL,
    });
    expect(r.gross).toBe(160);
    expect(r.totalExpenses).toBe(1500);
    expect(r.hasExpensesOnFile).toBe(true);
    expect(r.takeHome).toBe(-1340);
    expect(r.expenseLines).toEqual([
      { key: "rentMortgage", label: "Rent / mortgage", amount: 1200 },
      { key: "utilities", label: "Utilities", amount: 150 },
      { key: "supplies", label: "Supplies", amount: 80 },
      { key: "upkeep", label: "Upkeep", amount: 20 },
      { key: "cleaning", label: "Cleaning", amount: 50 },
    ]);
  });

  it("excludes waiting (unpaid) appointments from gross", () => {
    const r = ownerLocationTakeHome({
      locationName: "Cheryl's Shop",
      appointments: [appt({ price: 100 }), appt({ id: "b", price: 60, notes: "[payment:cash; payment_status:waiting]" })],
      from: month.from, to: month.to, expenses: FULL,
    });
    expect(r.gross).toBe(100);
  });

  it("only counts appointments at this owned location", () => {
    const r = ownerLocationTakeHome({
      locationName: "Cheryl's Shop",
      appointments: [appt({ price: 100 }), appt({ id: "b", price: 60, location: "Somewhere Else" })],
      from: month.from, to: month.to, expenses: FULL,
    });
    expect(r.gross).toBe(100);
  });

  it("no expenses on file → take-home is null, not gross−0", () => {
    const r = ownerLocationTakeHome({
      locationName: "Cheryl's Shop",
      appointments: [appt({ price: 100 })],
      from: month.from, to: month.to, expenses: NONE,
    });
    expect(r.hasExpensesOnFile).toBe(false);
    expect(r.takeHome).toBeNull();
    expect(r.totalExpenses).toBe(0);
  });

  it("partial expenses (some null) count only what was entered", () => {
    const r = ownerLocationTakeHome({
      locationName: "Cheryl's Shop",
      appointments: [appt({ price: 100 })],
      from: month.from, to: month.to,
      expenses: { ...NONE, rentMortgage: 1200 },
    });
    expect(r.hasExpensesOnFile).toBe(true);
    expect(r.totalExpenses).toBe(1200);
    expect(r.takeHome).toBe(-1100);
    expect(r.expenseLines).toEqual([{ key: "rentMortgage", label: "Rent / mortgage", amount: 1200 }]);
  });
});
```

- [ ] **Step 2 — Run, expect FAIL** (module not found): `node_modules/.bin/vitest run lib/ownerEconomics.test.ts`

- [ ] **Step 3 — Implement.** Create `v2/lib/ownerEconomics.ts`:

```ts
import type { Appointment } from "./data/types";
import type { OwnedLocationExpenses } from "./orgSettings";
import { revenueInRange } from "./derive";
import { monthBounds } from "./derive";

const EXPENSE_LABELS: { key: keyof OwnedLocationExpenses; label: string }[] = [
  { key: "rentMortgage", label: "Rent / mortgage" },
  { key: "utilities", label: "Utilities" },
  { key: "supplies", label: "Supplies" },
  { key: "upkeep", label: "Upkeep" },
  { key: "cleaning", label: "Cleaning" },
];

export type ExpenseLine = { key: keyof OwnedLocationExpenses; label: string; amount: number };

export type OwnerTakeHome = {
  locationName: string;
  gross: number;
  expenseLines: ExpenseLine[];
  totalExpenses: number;
  hasExpensesOnFile: boolean;
  takeHome: number | null;
};

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** True only when [from,to] is exactly the first..last day of a calendar month. */
export function isWholeMonth(from: string, to: string): boolean {
  const bounds = monthBounds(new Date(`${from}T00:00:00`));
  return bounds.from === from && bounds.to === to;
}

export function ownerLocationTakeHome({
  locationName,
  appointments,
  from,
  to,
  expenses,
}: {
  locationName: string;
  appointments: Appointment[];
  from: string;
  to: string;
  expenses: OwnedLocationExpenses;
}): OwnerTakeHome {
  const atLocation = appointments.filter((a) => a.location === locationName);
  const gross = round(revenueInRange(atLocation, from, to).fees);

  const expenseLines = EXPENSE_LABELS.flatMap(({ key, label }) => {
    const amount = expenses[key];
    return amount != null ? [{ key, label, amount: round(amount) }] : [];
  });
  const hasExpensesOnFile = expenseLines.length > 0;
  const totalExpenses = round(expenseLines.reduce((s, l) => s + l.amount, 0));
  const takeHome = hasExpensesOnFile ? round(gross - totalExpenses) : null;

  return { locationName, gross, expenseLines, totalExpenses, hasExpensesOnFile, takeHome };
}
```
  Note: `revenueInRange(...).fees` is the collected fee total (excludes `waiting`); take-home uses fees, not fees+tips, since tips are not owner-operator business revenue against fixed costs. (Cowork: confirm fees-only vs fees+tips in §2.)

- [ ] **Step 4 — Run, expect PASS.** `node_modules/.bin/vitest run lib/ownerEconomics.test.ts`
- [ ] **Step 5 — Commit.** `git add lib/ownerEconomics.ts lib/ownerEconomics.test.ts && git commit -m "WS4b: ownerEconomics take-home module (monthly, honest no-expenses handling)"`

---

### Task 3 — Owner-operator fixtures

**Files:** Modify `v2/lib/data/fixtures.ts`

- [ ] **Step 1 — Add a fixture org/accessor** exposing: an `org_settings` with `businessStructure: "own"`, one `owned` location `"Cheryl's Shop"` with non-null expenses, and several appointments at `location: "Cheryl's Shop"` across a single month (some paid, one `waiting`). Mirror the existing fixtures' shape and `isoDaysAgo` date helpers. Export whatever the existing fixtures pattern uses (e.g. an added entry + a named getter) so reports/export tests and a manual fixtures-mode run can exercise the owner path.
- [ ] **Step 2 — Typecheck.** `npm run typecheck` → PASS.
- [ ] **Step 3 — Commit.** `git add lib/data/fixtures.ts && git commit -m "WS4b: owner-operator fixtures (one_to_one org, owned location, expenses, appointments)"`

*(Implementer: match the exact fixtures export convention in `lib/data/fixtures.ts`; do not restructure it.)*

---

### Task 4 — Reports: "Your take-home" for owned orgs (Sam unchanged)

**Files:** Modify `v2/app/(app)/reports/page.tsx`

- [ ] **Step 1 — Load org settings.** The page already calls `readOperatorSettings()`. Add `loadOrgSettings()` to the same `await Promise.all([...])` block and read `ownedLocations` / `businessStructure`.
- [ ] **Step 2 — Branch the finance section.** Compute `const ownedLocations = orgSettings.ownedLocations;` Then:

```tsx
{ownedLocations.length > 0 ? (
  <OwnerTakeHomeSection
    locations={ownedLocations}
    appointments={appointments}
    from={from}
    to={to}
  />
) : (
  /* EXISTING "Salon payouts" section — unchanged, verbatim */
)}
```
  `OwnerTakeHomeSection` (new local component in this file) calls `ownerLocationTakeHome(...)` per owned location. When `isWholeMonth(from,to)` is false, render collected gross labeled "Collected" with "Pick a single month to see take-home." When `hasExpensesOnFile` is false, render gross + "Add your monthly costs in Settings to see take-home." Otherwise render: Collected, each expense line, Total costs, **Your take-home**. **No "salon"/"payout"/percentage words.**

- [ ] **Step 3 — Sam-unaffected positive test (NOT just "old tests pass").** Add `v2/app/(app)/reports/page.test.tsx` (or a pure helper test if the section logic is extracted): assert that for an org with `ownedLocations: []` the finance branch renders the identical "Salon payouts" output as before (snapshot or explicit assertion on the rendered rows). If the rendering is hard to unit-test, extract the take-home rows into a pure helper `buildOwnerTakeHomeRows(...)` and test that; then assert the page calls the existing salon-payout path untouched when `ownedLocations` is empty.
- [ ] **Step 4 — Verify.** `npm run typecheck && npm run lint && npm run test` → PASS.
- [ ] **Step 5 — Commit.** `git add "app/(app)/reports/page.tsx" <test> && git commit -m "WS4b: reports show owner take-home for owned orgs; Sam's salon payouts unchanged"`

---

### Task 5 — Bookkeeper export: Owner Economics sheet (Sam's workbook byte-identical)

**Files:** Modify `v2/lib/bookkeeperExport.ts`, `v2/lib/bookkeeperExport.test.ts`, `v2/app/(app)/reports/export/route.ts`

- [ ] **Step 1 — Failing test.** In `v2/lib/bookkeeperExport.test.ts` add:
  - With `ownedLocations: []` (Sam), `createBookkeeperWorkbookBuffer(...)` produces the **same sheets as today** ("Bookkeeper Export", "Day Closeouts") and **no** "Owner Economics" sheet (positive Sam-unchanged proof).
  - With one owned location + expenses + appointments, an **"Owner Economics"** sheet exists with headers `["Month","Location","Collected","Rent / mortgage","Utilities","Supplies","Upkeep","Cleaning","Total costs","Take-home"]` and one row whose Collected/Total costs/Take-home match `ownerLocationTakeHome`. Where `hasExpensesOnFile` is false, Take-home cell is blank (not 0).
- [ ] **Step 2 — Run, expect FAIL.** `node_modules/.bin/vitest run lib/bookkeeperExport.test.ts`
- [ ] **Step 3 — Implement.** Add an optional `ownerEconomics?: { ownedLocations: OwnedLocation[] }` (or pass `ownedLocations` + period) param to `createBookkeeperWorkbookBuffer`. When present and non-empty, append an "Owner Economics" worksheet built from `ownerLocationTakeHome` per location for the export's month. **Do not modify `BOOKKEEPER_HEADERS`, `buildBookkeeperRows`, or the "Day Closeouts" sheet.** When the param is absent/empty, the function's output is unchanged.
- [ ] **Step 4 — Wire the route.** In `route.ts`, `await loadOrgSettings()` and pass `ownedLocations` (+ the resolved month bounds) into `createBookkeeperWorkbookBuffer`. Sam's org → empty → identical file.
- [ ] **Step 5 — Run, expect PASS.** `node_modules/.bin/vitest run lib/bookkeeperExport.test.ts`
- [ ] **Step 6 — Commit.** `git add lib/bookkeeperExport.ts lib/bookkeeperExport.test.ts "app/(app)/reports/export/route.ts" && git commit -m "WS4b: Owner Economics export sheet for owned orgs; Sam's workbook unchanged"`

---

### Task 6 — Owner-operator day closeout — **FLAGGED, NOT BUILT** (see §2.1)

Do **not** implement until Cowork rules on §2.1. If approved, it is a sibling slice:
- Migration `20260606000007` relaxing `day_closeout_overrides_location_check` to free text (same shape as 0006's appointments relaxation), **staging-rehearsed with a backup + isolation gate**.
- New `lib/ownerCloseout.ts` + action branch that records a **day-level cash-reconciliation note** (collected gross vs cash banked) for an owned location — **no split, no payout language** — separate from `validateDayCloseoutInput` so Sam's path is untouched.
This task intentionally has no concrete TDD steps: its data model is undecided (§2.1) and inventing steps would be a placeholder.

---

## 5. Test plan

- **Pure unit (Vitest), the spine of WS4b:**
  - `ownerEconomics.test.ts` — gross = location+month collected (excl. waiting); take-home = gross − monthly expenses; **no-expenses → null** (not gross−0); partial expenses; whole-month guard; location-name matching.
  - `orgSettings.test.ts` — economics exposed; legacy `locations` list still works; Sam-like (no settings) defaults to empty economics.
  - `bookkeeperExport.test.ts` — Owner Economics sheet correctness **and** Sam-unchanged (empty owned → identical workbook).
- **Reports** — owned org renders take-home (whole-month) / collected-only (partial range) / add-costs prompt (no expenses); empty-owned org renders the existing salon-payout section unchanged.
- **Fixtures-mode manual check** — run the app in fixtures mode as the owner-operator org; confirm reports show take-home with owner framing and no split words.
- **Full gate:** `npm run typecheck && npm run lint && npm run test && npm run build`.

## 6. Sam-unaffected proof (spec item 5)

1. **Untouched-path proof:** `locationFinance.test.ts`, `locationFinance.closeout.test.ts`, `dayCloseout.test.ts`, `payments.test.ts`, `payoutOverride.test.ts` run green with **zero edits** — Sam's split math/config is not modified.
2. **Changed-path proof (the discriminating test):** a rented/Sam-like org (`ownedLocations: []`) run through the **new** reports + export branches yields **byte-identical** output to before WS4b (the export test asserts identical sheets; the reports test asserts the existing salon-payout rows). This proves the owner branch never leaks into Sam's branch.
3. **Zero migrations** in WS4b core → the cross-tenant isolation gate and cutover rehearsal are unaffected by construction.

## 7. Non-goals (unchanged from the brief)

- WS4c rented payout math (Gina's 47% split, tip-splitting, nail-trim exclusion).
- Any change to Sam's rented finance, cookie `operatorSettings`, or `locationFinance.ts` behavior.
- 1:1 scheduling changes. No production deploy. No DB migration in WS4b core (the optional Task 6 closeout is the only piece that would add migration 0007, and only if Cowork approves §2.1).
- **Hybrid orgs** (owned + rented in one org): out of scope. Per-location-name take-home is defined for owned locations only; an org mixing gina/annette rented locations with owned locations is not a real configuration today (BOOKING_LOCATIONS is fixed to Sam) and is deferred.

## 8. CI / migration discipline

- WS4b core: **no migration.** CI `verify` (typecheck/lint/test/build), the cross-tenant isolation gate, and the cutover rehearsal all pass unchanged.
- If Task 6 is approved: migration `20260606000007`, additive constraint relaxation, **staging-rehearsed with a fresh backup**, isolation gate green, numbered after 0006 — same discipline as WS4a's 0006.

---

## Self-review (done against the brief)

- (1) own-facility take-home model → Tasks 1–2 (owned vs rented branching is structural; reader + pure module). ✓
- (2) expense storage/entry → §2.2 recommends jsonb-only v1, table deferred to WS4b.2. ✓
- (3) take-home reports + bookkeeper export with expense lines → Tasks 4–5; Sam's unchanged. ✓
- (4) owner-operator day closeout → §2.1 + Task 6, flagged for Cowork (semantic gap + `day_closeout_overrides` CHECK ⇒ migration). ✓ (deliberately not auto-built)
- (5) Sam-unaffected proof → §6, including the positive changed-path test. ✓
- (6) test plan → §5. ✓
- Placeholder scan: Task 6 is an intentional flagged stub (decision-blocked), not a hidden placeholder; all built tasks carry real test + impl code.
- Type consistency: `OwnedLocationExpenses`, `OwnedLocation`, `OwnerTakeHome`, `ExpenseLine`, `ownerLocationTakeHome`, `isWholeMonth`, `ownedLocations`, `businessStructure` used consistently across Tasks 1–5.
