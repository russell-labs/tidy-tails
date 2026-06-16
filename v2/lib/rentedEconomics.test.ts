import { describe, expect, it } from "vitest";
import { buildRentedSplitView, rentedLocationSplit } from "./rentedEconomics";
import type { RentedLocation } from "./orgSettings";
import type { Appointment } from "./data/types";

function appt(p: Partial<Appointment>): Appointment {
  return {
    id: "a",
    client_id: "c",
    pet_id: "p",
    date: "2026-05-10",
    time_slot: "10:00am",
    service: "full_groom",
    price: 100,
    tip: null,
    notes: null,
    status: "completed",
    location: "Bayfield Pet Spa",
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

const PERCENT: RentedLocation = {
  name: "Bayfield Pet Spa",
  address: "9 King St",
  payoutType: "percent",
  salonKeepsPercent: 30,
  dailyRate: null,
};

const month = { from: "2026-05-01", to: "2026-05-31" };

describe("rentedLocationSplit", () => {
  it("salon cut is the percent of fees, EXCLUDING nail trims (B3)", () => {
    const r = rentedLocationSplit({
      location: PERCENT,
      appointments: [
        appt({ id: "1", service: "full_groom", price: 100 }),
        appt({ id: "2", service: "bath_only", price: 60 }),
        appt({ id: "3", service: "nail_trim", price: 20 }),
      ],
      from: month.from,
      to: month.to,
    });
    expect(r.fees).toBe(180);
    expect(r.nailTrimFees).toBe(20);
    expect(r.eligibleFees).toBe(160); // 180 − 20 nail trim
    expect(r.salonCut).toBe(48); // 30% of 160, not 180
    expect(r.feesKept).toBe(132); // 180 − 48
  });

  it("a nail-trim-only day keeps 100% (cut is 0)", () => {
    const r = rentedLocationSplit({
      location: PERCENT,
      appointments: [appt({ service: "nail_trim", price: 25 })],
      from: month.from,
      to: month.to,
    });
    expect(r.fees).toBe(25);
    expect(r.eligibleFees).toBe(0);
    expect(r.salonCut).toBe(0);
    expect(r.feesKept).toBe(25);
  });

  it("tips never enter the fee-side split (B2 deferred)", () => {
    const noTip = rentedLocationSplit({
      location: PERCENT,
      appointments: [appt({ price: 100 })],
      from: month.from,
      to: month.to,
    });
    const bigTip = rentedLocationSplit({
      location: PERCENT,
      appointments: [appt({ price: 100, tip: 50 })],
      from: month.from,
      to: month.to,
    });
    expect(bigTip.salonCut).toBe(noTip.salonCut);
    expect(bigTip.feesKept).toBe(noTip.feesKept);
    expect("tips" in bigTip).toBe(false);
  });

  it("only counts appointments at this rented location", () => {
    const r = rentedLocationSplit({
      location: PERCENT,
      appointments: [
        appt({ id: "1", price: 100 }),
        appt({ id: "2", price: 200, location: "Home Studio" }),
      ],
      from: month.from,
      to: month.to,
    });
    expect(r.fees).toBe(100);
    expect(r.salonCut).toBe(30);
  });

  it("excludes waiting (unpaid) appointments", () => {
    const r = rentedLocationSplit({
      location: PERCENT,
      appointments: [
        appt({ id: "1", price: 100 }),
        appt({
          id: "2",
          price: 200,
          notes: "[payment:cash; payment_status:waiting]",
        }),
      ],
      from: month.from,
      to: month.to,
    });
    expect(r.fees).toBe(100);
    expect(r.salonCut).toBe(30);
  });

  it("only counts appointments within [from, to]", () => {
    const r = rentedLocationSplit({
      location: PERCENT,
      appointments: [
        appt({ id: "1", date: "2026-05-10", price: 100 }),
        appt({ id: "2", date: "2026-04-10", price: 100 }),
        appt({ id: "3", date: "2026-06-10", price: 100 }),
      ],
      from: month.from,
      to: month.to,
    });
    expect(r.fees).toBe(100);
  });

  it("rounds the cut to cents", () => {
    const r = rentedLocationSplit({
      location: { ...PERCENT, salonKeepsPercent: 53 },
      appointments: [appt({ price: 99.99 })],
      from: month.from,
      to: month.to,
    });
    expect(r.salonCut).toBe(52.99); // 99.99 × 0.53 = 52.9947 → 52.99
    expect(r.feesKept).toBe(47); // 99.99 − 52.99
  });

  it("a daily-rate location charges the flat rate per worked day", () => {
    const daily: RentedLocation = {
      name: "Bayfield Pet Spa",
      address: "9 King St",
      payoutType: "daily_rate",
      salonKeepsPercent: 0,
      dailyRate: 40,
    };
    const r = rentedLocationSplit({
      location: daily,
      appointments: [
        appt({ id: "1", date: "2026-05-10", price: 100 }),
        appt({ id: "2", date: "2026-05-10", price: 80 }),
        appt({ id: "3", date: "2026-05-12", price: 90 }),
      ],
      from: month.from,
      to: month.to,
    });
    expect(r.fees).toBe(270);
    expect(r.salonCut).toBe(80); // $40 × 2 distinct days
    expect(r.feesKept).toBe(190);
  });
});

describe("buildRentedSplitView", () => {
  it("computes a split per rented location", () => {
    const view = buildRentedSplitView({
      rentedLocations: [
        PERCENT,
        { ...PERCENT, name: "Other Salon", salonKeepsPercent: 50 },
      ],
      appointments: [
        appt({ id: "1", price: 100, location: "Bayfield Pet Spa" }),
        appt({ id: "2", price: 100, location: "Other Salon" }),
      ],
      from: month.from,
      to: month.to,
    });
    expect(view.locations).toHaveLength(2);
    expect(view.locations[0]).toMatchObject({ locationName: "Bayfield Pet Spa", salonCut: 30 });
    expect(view.locations[1]).toMatchObject({ locationName: "Other Salon", salonCut: 50 });
  });

  it("is empty when the org has no rented locations", () => {
    const view = buildRentedSplitView({
      rentedLocations: [],
      appointments: [appt({ price: 100 })],
      from: month.from,
      to: month.to,
    });
    expect(view.locations).toEqual([]);
  });
});
