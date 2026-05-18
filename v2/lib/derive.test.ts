import { describe, it, expect } from "vitest";
import type { Appointment } from "./data/types";
import {
  lastAppointment,
  lastKnownPrice,
  lastKnownService,
  revenueInRange,
  usualPrice,
  usualService,
} from "./derive";

// Minimal Appointment builder — only the fields these helpers read matter.
// service / price accept null: live rows (e.g. backfills) can lack either.
let apptSeq = 0;
function appt(
  date: string,
  service: string | null,
  price: number | null,
): Appointment {
  return {
    id: `a-${apptSeq++}`,
    client_id: "c",
    pet_id: "p",
    date,
    service,
    price,
    notes: null,
    created_at: date,
  };
}

describe("lastAppointment — last-visit derivation", () => {
  it("returns null when there are no appointments", () => {
    expect(lastAppointment([])).toBeNull();
  });

  it("returns the single appointment when there is only one", () => {
    const only = appt("2026-02-01", "Full groom", 80);
    expect(lastAppointment([only])).toBe(only);
  });

  it("picks the most recent appointment regardless of input order", () => {
    const newest = appt("2026-05-01", "Full groom", 80);
    const list = [
      appt("2026-01-10", "Bath & tidy", 50),
      newest,
      appt("2026-03-22", "Full groom", 80),
    ];
    expect(lastAppointment(list)).toBe(newest);
  });

  it("ignores a future-dated booking, returning the most recent past visit", () => {
    const lastPastVisit = appt("2026-05-10", "Full groom", 80);
    const list = [
      appt("2026-03-01", "Bath & tidy", 50),
      lastPastVisit,
      appt("2026-08-01", "Full groom", 80), // a future booking, not a visit
    ];
    expect(lastAppointment(list, "2026-05-18")).toBe(lastPastVisit);
  });

  it("returns null when every appointment is a future booking", () => {
    const list = [
      appt("2026-06-01", "Full groom", 80),
      appt("2026-07-15", "Full groom", 80),
    ];
    expect(lastAppointment(list, "2026-05-18")).toBeNull();
  });

  it("counts an appointment dated today as a past visit, not a future booking", () => {
    const todayVisit = appt("2026-05-18", "Full groom", 80);
    const list = [appt("2026-04-01", "Bath & tidy", 50), todayVisit];
    expect(lastAppointment(list, "2026-05-18")).toBe(todayVisit);
  });
});

describe("booking defaults — most recent known values", () => {
  it("uses the most recent non-null price", () => {
    const list = [
      appt("2026-01-01", "Full groom", 50),
      appt("2026-04-10", null, 60),
      appt("2026-05-01", null, null),
    ];
    expect(lastKnownPrice(list)).toBe(60);
  });

  it("uses the most recent non-null service", () => {
    const list = [
      appt("2026-01-01", "Bath & tidy", 50),
      appt("2026-04-10", null, 60),
      appt("2026-05-01", "Full groom", 80),
    ];
    expect(lastKnownService(list)).toBe("Full groom");
  });
});

describe("usualService — most common service", () => {
  it("returns null when there are no appointments", () => {
    expect(usualService([])).toBeNull();
  });

  it("returns the only service for a single appointment", () => {
    expect(usualService([appt("2026-02-01", "Nail trim", 25)])).toBe("Nail trim");
  });

  it("returns the most frequently booked service", () => {
    const list = [
      appt("2026-01-01", "Full groom", 80),
      appt("2026-02-01", "Full groom", 80),
      appt("2026-03-01", "Bath & tidy", 50),
    ];
    expect(usualService(list)).toBe("Full groom");
  });

  it("breaks a frequency tie with the most recent appointment's service", () => {
    const list = [
      appt("2026-01-01", "Bath & tidy", 50),
      appt("2026-01-02", "Full groom", 80),
      appt("2026-03-01", "Bath & tidy", 50),
      appt("2026-03-02", "Full groom", 80), // newest — both services tie 2–2
    ];
    expect(usualService(list)).toBe("Full groom");
  });

  it("ignores appointments with no recorded service", () => {
    const list = [
      appt("2026-01-01", null, 60),
      appt("2026-02-01", null, 60),
      appt("2026-03-01", "Full groom", 80),
    ];
    expect(usualService(list)).toBe("Full groom");
  });

  it("returns null when no appointment has a recorded service", () => {
    const list = [appt("2026-01-01", null, 60), appt("2026-02-01", null, 60)];
    expect(usualService(list)).toBeNull();
  });
});

describe("usualPrice — typical price (median)", () => {
  it("returns null when there are no appointments", () => {
    expect(usualPrice([])).toBeNull();
  });

  it("returns the only price for a single appointment", () => {
    expect(usualPrice([appt("2026-02-01", "Full groom", 72)])).toBe(72);
  });

  it("returns the middle price for an odd number of appointments", () => {
    const list = [
      appt("2026-01-01", "Full groom", 70),
      appt("2026-02-01", "Full groom", 90),
      appt("2026-03-01", "Full groom", 80),
    ];
    expect(usualPrice(list)).toBe(80);
  });

  it("averages the two middle prices for an even number of appointments", () => {
    const list = [
      appt("2026-01-01", "Full groom", 70),
      appt("2026-02-01", "Full groom", 80),
    ];
    expect(usualPrice(list)).toBe(75);
  });

  it("is not skewed by a single outlier price", () => {
    const list = [
      appt("2026-01-01", "Full groom", 70),
      appt("2026-02-01", "Full groom", 72),
      appt("2026-03-01", "Full groom", 74),
      appt("2026-04-01", "Full groom", 76),
      appt("2026-05-01", "Full groom", 500),
    ];
    expect(usualPrice(list)).toBe(74);
  });

  it("ignores appointments with no recorded price", () => {
    const list = [
      appt("2026-01-01", "Full groom", null),
      appt("2026-02-01", "Full groom", 70),
      appt("2026-03-01", "Full groom", 90),
      appt("2026-04-01", "Full groom", null),
      appt("2026-05-01", "Full groom", 80),
    ];
    expect(usualPrice(list)).toBe(80); // median of [70, 80, 90]
  });

  it("returns null when no appointment has a recorded price", () => {
    const list = [
      appt("2026-01-01", "Full groom", null),
      appt("2026-02-01", "Full groom", null),
    ];
    expect(usualPrice(list)).toBeNull();
  });
});

describe("revenueInRange — totals over a date window", () => {
  it("sums gross, counts visits, and averages over the window", () => {
    const list = [
      appt("2026-04-15", "Full groom", 80),
      appt("2026-04-20", "Full groom", 100),
      appt("2026-06-01", "Full groom", 999), // outside the window
    ];
    expect(revenueInRange(list, "2026-04-01", "2026-04-30")).toEqual({
      count: 2,
      gross: 180,
      average: 90,
    });
  });

  it("skips null prices in gross but still counts the visit", () => {
    const list = [
      appt("2026-04-10", "Full groom", 80),
      appt("2026-04-12", null, null), // a visit with no fee recorded
      appt("2026-04-14", "Full groom", 100),
    ];
    // gross sums the 2 priced visits; count is all 3; average is over the priced.
    expect(revenueInRange(list, "2026-04-01", "2026-04-30")).toEqual({
      count: 3,
      gross: 180,
      average: 90,
    });
  });
});
