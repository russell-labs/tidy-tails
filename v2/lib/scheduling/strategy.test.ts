import { describe, expect, it } from "vitest";
import { availableBookingTimeSlots, hasBookedTimeConflict } from "../booking";
import { summarizeDayLoad } from "../dayCapacity";
import type { Appointment, Pet } from "../data/types";
import { isOneToOne, selectStrategy, waterfall } from "./strategy";

describe("selectStrategy (fail-safe)", () => {
  it("maps one_to_one and batched directly", () => {
    expect(selectStrategy("one_to_one")).toBe("one_to_one");
    expect(selectStrategy("batched")).toBe("batched");
  });

  it("defaults anything else to batched (Sam-safe)", () => {
    expect(selectStrategy(null)).toBe("batched");
    expect(selectStrategy(undefined)).toBe("batched");
    expect(selectStrategy("")).toBe("batched");
    expect(selectStrategy("weird")).toBe("batched");
    expect(isOneToOne("weird")).toBe(false);
    expect(isOneToOne("one_to_one")).toBe(true);
  });
});

describe("waterfall delegates identically to the existing functions", () => {
  const pets: Pet[] = [
    {
      id: "p1",
      client_id: "c1",
      name: "Biscuit",
      breed: "Goldendoodle",
      size: "medium",
      color: null,
      age: null,
      sex: null,
      date_of_birth: null,
      allergies: false,
      allergies_detail: null,
      grooming_notes: null,
      typical_fee: 70,
      created_at: "2026-01-01T00:00:00.000Z",
    } as Pet,
  ];
  const appointments: Appointment[] = [
    {
      id: "a1",
      client_id: "c1",
      pet_id: "p1",
      date: "2026-06-20",
      time_slot: "10:00am",
      service: "Full groom",
      price: 70,
      tip: null,
      notes: null,
      status: "booked",
      location: "gina",
      google_calendar_id: null,
      google_event_id: null,
      google_sync_status: null,
      google_sync_error: null,
      google_synced_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
    } as Appointment,
  ];

  it("daySummary matches summarizeDayLoad", () => {
    const viaStrategy = waterfall.daySummary({ date: "2026-06-20", appointments, pets });
    const direct = summarizeDayLoad({ date: "2026-06-20", appointments, pets });
    expect(viaStrategy).toEqual(direct);
  });

  it("availableSlots matches availableBookingTimeSlots", () => {
    expect(waterfall.availableSlots(appointments, "2026-06-20")).toEqual(
      availableBookingTimeSlots(appointments, "2026-06-20"),
    );
  });

  it("hasConflict matches hasBookedTimeConflict", () => {
    expect(waterfall.hasConflict(appointments, "2026-06-20", "10:00am")).toBe(
      hasBookedTimeConflict(appointments, "2026-06-20", "10:00am"),
    );
    expect(waterfall.hasConflict(appointments, "2026-06-20", "10:00am")).toBe(true);
  });
});
