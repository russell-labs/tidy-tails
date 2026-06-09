import { describe, expect, it } from "vitest";
import {
  buildOwnerTakeHomeView,
  isWholeMonth,
  ownerLocationTakeHome,
} from "./ownerEconomics";
import type { Appointment } from "./data/types";

function appt(p: Partial<Appointment>): Appointment {
  return {
    id: "a",
    client_id: "c",
    pet_id: "p",
    date: "2026-05-10",
    time_slot: "10:00am",
    service: "Full groom",
    price: 100,
    tip: null,
    notes: null,
    status: "booked",
    location: "Cheryl's Shop",
    duration_minutes: null,
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...p,
  };
}

const FULL = {
  rentMortgage: 1200,
  utilities: 150,
  supplies: 80,
  upkeep: 20,
  cleaning: 50,
};
const NONE = {
  rentMortgage: null,
  utilities: null,
  supplies: null,
  upkeep: null,
  cleaning: null,
};
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
  it("take-home = (collected fees + tips) − monthly expenses", () => {
    const r = ownerLocationTakeHome({
      locationName: "Cheryl's Shop",
      appointments: [
        appt({ price: 100, tip: 15 }),
        appt({ id: "b", price: 60, tip: 5 }),
      ],
      from: month.from,
      to: month.to,
      expenses: FULL,
    });
    expect(r.fees).toBe(160);
    expect(r.tips).toBe(20);
    expect(r.collected).toBe(180);
    expect(r.totalExpenses).toBe(1500);
    expect(r.hasExpensesOnFile).toBe(true);
    expect(r.takeHome).toBe(-1320); // 180 − 1500
    expect(r.expenseLines).toEqual([
      { key: "rentMortgage", label: "Rent / mortgage", amount: 1200 },
      { key: "utilities", label: "Utilities", amount: 150 },
      { key: "supplies", label: "Supplies", amount: 80 },
      { key: "upkeep", label: "Upkeep", amount: 20 },
      { key: "cleaning", label: "Cleaning", amount: 50 },
    ]);
  });

  it("owner keeps her tips: they add to collected and take-home", () => {
    const noTip = ownerLocationTakeHome({
      locationName: "Cheryl's Shop",
      appointments: [appt({ price: 100 })],
      from: month.from,
      to: month.to,
      expenses: { ...NONE, rentMortgage: 50 },
    });
    const withTip = ownerLocationTakeHome({
      locationName: "Cheryl's Shop",
      appointments: [appt({ price: 100, tip: 30 })],
      from: month.from,
      to: month.to,
      expenses: { ...NONE, rentMortgage: 50 },
    });
    expect(withTip.tips).toBe(30);
    expect(withTip.collected).toBe(noTip.collected + 30);
    expect(withTip.takeHome).toBe((noTip.takeHome ?? 0) + 30);
  });

  it("excludes waiting (unpaid) appointments from fees and tips", () => {
    const r = ownerLocationTakeHome({
      locationName: "Cheryl's Shop",
      appointments: [
        appt({ price: 100, tip: 10 }),
        appt({
          id: "b",
          price: 60,
          tip: 20,
          notes: "[payment:cash; payment_status:waiting]",
        }),
      ],
      from: month.from,
      to: month.to,
      expenses: FULL,
    });
    expect(r.fees).toBe(100);
    expect(r.tips).toBe(10);
    expect(r.collected).toBe(110);
  });

  it("only counts appointments at this owned location", () => {
    const r = ownerLocationTakeHome({
      locationName: "Cheryl's Shop",
      appointments: [
        appt({ price: 100 }),
        appt({ id: "b", price: 60, location: "Somewhere Else" }),
      ],
      from: month.from,
      to: month.to,
      expenses: FULL,
    });
    expect(r.collected).toBe(100);
  });

  it("no expenses on file → take-home is null, not collected−0", () => {
    const r = ownerLocationTakeHome({
      locationName: "Cheryl's Shop",
      appointments: [appt({ price: 100, tip: 20 })],
      from: month.from,
      to: month.to,
      expenses: NONE,
    });
    expect(r.collected).toBe(120);
    expect(r.hasExpensesOnFile).toBe(false);
    expect(r.takeHome).toBeNull();
    expect(r.totalExpenses).toBe(0);
  });

  it("partial expenses (some null) count only what was entered", () => {
    const r = ownerLocationTakeHome({
      locationName: "Cheryl's Shop",
      appointments: [appt({ price: 100 })],
      from: month.from,
      to: month.to,
      expenses: { ...NONE, rentMortgage: 1200 },
    });
    expect(r.hasExpensesOnFile).toBe(true);
    expect(r.totalExpenses).toBe(1200);
    expect(r.takeHome).toBe(-1100);
    expect(r.expenseLines).toEqual([
      { key: "rentMortgage", label: "Rent / mortgage", amount: 1200 },
    ]);
  });
});

describe("buildOwnerTakeHomeView", () => {
  it("flags whole-month and computes per owned location", () => {
    const view = buildOwnerTakeHomeView({
      ownedLocations: [
        { name: "Cheryl's Shop", address: "5 Maple St", expenses: FULL },
      ],
      appointments: [appt({ price: 100, tip: 15 })],
      from: month.from,
      to: month.to,
    });
    expect(view.isWholeMonth).toBe(true);
    expect(view.locations).toHaveLength(1);
    expect(view.locations[0].collected).toBe(115);
    expect(view.locations[0].takeHome).toBe(-1385);
  });

  it("flags a partial range as not whole month", () => {
    const view = buildOwnerTakeHomeView({
      ownedLocations: [
        { name: "Cheryl's Shop", address: "5 Maple St", expenses: FULL },
      ],
      appointments: [appt({ price: 100 })],
      from: "2026-05-01",
      to: "2026-05-15",
    });
    expect(view.isWholeMonth).toBe(false);
  });
});
