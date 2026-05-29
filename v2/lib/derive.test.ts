import { describe, it, expect } from "vitest";
import type { Appointment, Pet } from "./data/types";
import {
  groupPetsForDisplay,
  lastAppointment,
  lastKnownPrice,
  lastKnownService,
  matchingPetRows,
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
  tip: number | null = null,
): Appointment {
  return {
    id: `a-${apptSeq++}`,
    client_id: "c",
    pet_id: "p",
    date,
    time_slot: null,
    service,
    price,
    tip,
    notes: null,
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: date,
  };
}

function pet(id: string, name: string, breed: string | null): Pet {
  return {
    id,
    client_id: "c",
    name,
    breed,
    color: null,
    sex: null,
    date_of_birth: null,
    allergies: false,
    allergies_detail: null,
    grooming_notes: null,
    typical_fee: null,
    created_at: `2026-01-0${id}`,
  };
}

function petAppt(
  petId: string,
  date: string,
  service: string | null = null,
  price: number | null = null,
): Appointment {
  return { ...appt(date, service, price), pet_id: petId };
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

describe("pet display grouping — duplicate imported rows", () => {
  it("collapses same-name/same-breed pet rows into one display group", () => {
    const oldChloe = pet("1", "Chloe", "Cavachon");
    const newChloe = pet("2", "Chloe", "Cavachon");
    const milo = pet("3", "Milo", "Cavachon");
    const appointments = [
      petAppt("1", "2023-12-21", "Full groom", 55),
      petAppt("2", "2025-12-22", "Full groom", 55),
      petAppt("3", "2025-12-22", "Full groom", 55),
    ];

    const groups = groupPetsForDisplay([oldChloe, newChloe, milo], appointments);

    expect(groups).toHaveLength(2);
    const chloe = groups.find((group) => group.pet.name === "Chloe");
    expect(chloe?.pets.map((p) => p.id).sort()).toEqual(["1", "2"]);
    expect(chloe?.appointments).toHaveLength(2);
    expect(chloe?.pet.id).toBe("2");
  });

  it("finds matching duplicate rows for a pet detail page", () => {
    const oldMilo = pet("1", "Milo", "Cavachon");
    const newMilo = pet("2", "milo", " cavachon ");
    const other = pet("3", "Milo", "Poodle");

    expect(matchingPetRows(oldMilo, [oldMilo, newMilo, other]).map((p) => p.id))
      .toEqual(["1", "2"]);
  });

  it("treats obvious breed aliases as the same pet", () => {
    const shepherd = pet("1", "Baron", "Sheppard");
    const germanShepherd = pet("2", "Baron", "German Shepherd");
    const vizsla = pet("3", "Baron", "Vizsla");

    const groups = groupPetsForDisplay(
      [shepherd, germanShepherd, vizsla],
      [petAppt("2", "2025-05-07")],
    );

    expect(groups).toHaveLength(2);
    expect(matchingPetRows(shepherd, [shepherd, germanShepherd, vizsla]).map((p) => p.id))
      .toEqual(["1", "2"]);
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
  it("sums fees, tips, total collected, counts visits, and averages over the window", () => {
    const list = [
      appt("2026-04-15", "Full groom", 80, 10),
      appt("2026-04-20", "Full groom", 100, 15),
      appt("2026-06-01", "Full groom", 999, 999), // outside the window
    ];
    expect(revenueInRange(list, "2026-04-01", "2026-04-30")).toEqual({
      count: 2,
      fees: 180,
      tips: 25,
      total: 205,
      averageFee: 90,
      averageTotal: 102.5,
    });
  });

  it("skips null prices in fees but still counts the visit and tip", () => {
    const list = [
      appt("2026-04-10", "Full groom", 80, 10),
      appt("2026-04-12", null, null, 5), // a visit with no fee recorded
      appt("2026-04-14", "Full groom", 100, null),
    ];
    // fees average over priced visits; total average covers all visits.
    expect(revenueInRange(list, "2026-04-01", "2026-04-30")).toEqual({
      count: 3,
      fees: 180,
      tips: 15,
      total: 195,
      averageFee: 90,
      averageTotal: 65,
    });
  });

  it("keeps waiting-on-payment visits out of collected fees and tips", () => {
    const paid = appt("2026-04-10", "Full groom", 80, 10);
    const waiting = {
      ...appt("2026-04-12", "Full groom", 100, 20),
      notes: "[payment:cash; payment_status:waiting]",
    };

    expect(revenueInRange([paid, waiting], "2026-04-01", "2026-04-30")).toEqual({
      count: 2,
      fees: 80,
      tips: 10,
      total: 90,
      averageFee: 80,
      averageTotal: 45,
    });
  });

  it("does not double count a booked appointment after the groom is logged", () => {
    const booked = { ...appt("2026-04-10", "Full groom", 60), status: "booked" };
    const logged = {
      ...appt("2026-04-10", "Full groom", 60, 5),
      status: "completed",
    };

    expect(revenueInRange([booked, logged], "2026-04-01", "2026-04-30")).toEqual({
      count: 1,
      fees: 60,
      tips: 5,
      total: 65,
      averageFee: 60,
      averageTotal: 65,
    });
  });
});
