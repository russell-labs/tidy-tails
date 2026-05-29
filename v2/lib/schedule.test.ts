import { describe, expect, it } from "vitest";
import type { Appointment, Client, Pet } from "./data/types";
import { FIXTURE_APPOINTMENTS } from "./data/fixtures";
import {
  appointmentsForDay,
  appointmentsForWeek,
  bookedFeesForDate,
  scheduleView,
  shiftDay,
  shiftWeek,
  weekRangeForDate,
} from "./schedule";

function appt(overrides: Partial<Appointment>): Appointment {
  return {
    id: "a1",
    client_id: "c1",
    pet_id: "p1",
    date: "2026-05-18",
    time_slot: "10:30am",
    service: "Full groom",
    price: 50,
    tip: null,
    notes: null,
    status: "booked",
    location: "gina",
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-05-18",
    ...overrides,
  };
}

const clients = [
  {
    id: "c1",
    first_name: "Mary",
    last_name: "Anca",
    phone: "705-330-1807",
    alt_contact: null,
    email: null,
    address: null,
    notes: null,
    created_at: "2026-01-01",
  },
] satisfies Client[];

const pets = [
  {
    id: "p1",
    client_id: "c1",
    name: "Whiskey",
    breed: "Yorkie",
    color: null,
    sex: null,
    date_of_birth: null,
    allergies: false,
    allergies_detail: null,
    grooming_notes: null,
    typical_fee: null,
    created_at: "2026-01-01",
  },
] satisfies Pet[];

describe("week schedule helpers", () => {
  it("builds a Sunday-to-Saturday range for the selected week", () => {
    expect(weekRangeForDate("2026-05-19").start).toBe("2026-05-17");
    expect(weekRangeForDate("2026-05-19").end).toBe("2026-05-23");
  });

  it("shifts a week by seven-day increments", () => {
    expect(shiftWeek("2026-05-17", 1)).toBe("2026-05-24");
    expect(shiftWeek("2026-05-17", -1)).toBe("2026-05-10");
  });

  it("shifts a selected day by one-day increments", () => {
    expect(shiftDay("2026-05-21", 1)).toBe("2026-05-22");
    expect(shiftDay("2026-05-21", -1)).toBe("2026-05-20");
  });

  it("defaults to week view unless day view is requested", () => {
    expect(scheduleView("day")).toBe("day");
    expect(scheduleView("week")).toBe("week");
    expect(scheduleView(undefined)).toBe("week");
    expect(scheduleView("month")).toBe("week");
  });

  it("returns booked appointments for the selected week in date/time order", () => {
    const range = weekRangeForDate("2026-05-19");
    const rows = appointmentsForWeek({
      appointments: [
        appt({ id: "completed", status: "completed", date: "2026-05-18" }),
        appt({ id: "later", date: "2026-05-19", time_slot: "1:30pm" }),
        appt({ id: "earlier", date: "2026-05-19", time_slot: "9:00am" }),
        appt({ id: "outside", date: "2026-06-01" }),
      ],
      clients,
      pets,
      range,
    });

    expect(rows.map((row) => row.appointment.id)).toEqual(["earlier", "later"]);
    expect(rows[0].client?.first_name).toBe("Mary");
    expect(rows[0].pet?.name).toBe("Whiskey");
  });

  it("returns booked appointments for a selected day in time order", () => {
    const rows = appointmentsForDay({
      appointments: [
        appt({ id: "tomorrow", date: "2026-05-22", time_slot: "9:00am" }),
        appt({ id: "later", date: "2026-05-21", time_slot: "1:30pm" }),
        appt({ id: "earlier", date: "2026-05-21", time_slot: "9:00am" }),
      ],
      clients,
      pets,
      date: "2026-05-21",
    });

    expect(rows.map((row) => row.appointment.id)).toEqual(["earlier", "later"]);
  });

  it("does not show the booked row after the same dog has a logged groom that day", () => {
    const rows = appointmentsForDay({
      appointments: [
        appt({ id: "booked", date: "2026-05-21", status: "booked" }),
        appt({
          id: "logged",
          date: "2026-05-21",
          status: "completed",
          time_slot: null,
        }),
      ],
      clients,
      pets,
      date: "2026-05-21",
    });

    expect(rows).toEqual([]);
  });

  it("totals booked fees for a selected day", () => {
    expect(
      bookedFeesForDate([
        appt({ id: "one", date: "2026-05-21", price: 80 }),
        appt({ id: "two", pet_id: "p2", date: "2026-05-21", price: 45 }),
        appt({ id: "no-fee", pet_id: "p3", date: "2026-05-21", price: null }),
        appt({
          id: "completed",
          pet_id: "p9",
          date: "2026-05-21",
          status: "completed",
          price: 90,
        }),
        appt({ id: "logged", date: "2026-05-21", status: "completed", price: 80 }),
        appt({ id: "other-day", date: "2026-05-22", price: 100 }),
      ], "2026-05-21"),
    ).toBe(45);
  });
});

describe("fixture schedule coverage", () => {
  it("includes at least one future booked appointment for local QA", () => {
    const today = new Date("2026-05-27T12:00:00");
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    expect(
      FIXTURE_APPOINTMENTS.some(
        (appointment) =>
          appointment.status === "booked" && appointment.date >= todayISO,
      ),
    ).toBe(true);
  });
});
