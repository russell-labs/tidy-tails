import { describe, expect, it } from "vitest";
import { SERVICE_TYPES } from "./booking";
import {
  ONE_TO_ONE_SERVICE_TYPES,
  buildOneToOneAppointmentInsert,
  validateOneToOneBooking,
} from "./oneToOneBooking";

const today = new Date("2026-06-08T12:00:00Z");

function validRaw(overrides: Record<string, string> = {}) {
  return {
    client_id: "c1",
    pet_id: "p1",
    date: "2026-06-20",
    time_slot: "10:00am",
    service_type: "full_groom",
    location: "Gina's",
    duration_minutes: "90",
    fee: "85",
    notes: "",
    ...overrides,
  };
}

describe("validateOneToOneBooking", () => {
  it("accepts a complete 1:1 booking", () => {
    const result = validateOneToOneBooking(validRaw(), today);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-06-20",
      time_slot: "10:00am",
      service_type: "full_groom",
      location: "Gina's",
      duration_minutes: 90,
      fee: 85,
      notes: null,
    });
  });

  it("requires dog, service, date, time, location, and duration", () => {
    const result = validateOneToOneBooking(
      { client_id: "c1" },
      today,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.pet_id).toBeTruthy();
    expect(result.errors.service_type).toBeTruthy();
    expect(result.errors.date).toBeTruthy();
    expect(result.errors.time_slot).toBeTruthy();
    expect(result.errors.location).toBeTruthy();
    expect(result.errors.duration_minutes).toBeTruthy();
  });

  it("rejects an out-of-range or non-integer duration", () => {
    expect(validateOneToOneBooking(validRaw({ duration_minutes: "0" }), today).ok).toBe(false);
    expect(validateOneToOneBooking(validRaw({ duration_minutes: "999" }), today).ok).toBe(false);
    expect(validateOneToOneBooking(validRaw({ duration_minutes: "45.5" }), today).ok).toBe(false);
  });

  it("rejects an unknown service and a too-long location", () => {
    expect(validateOneToOneBooking(validRaw({ service_type: "wash" }), today).ok).toBe(false);
    expect(
      validateOneToOneBooking(validRaw({ location: "x".repeat(65) }), today).ok,
    ).toBe(false);
  });

  it("accepts puppy_groom (now in the appointments.service_type CHECK, TT-019)", () => {
    const result = validateOneToOneBooking(validRaw({ service_type: "puppy_groom" }), today);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.service_type).toBe("puppy_groom");
  });

  it("accepts every service the app/agent can offer — the agent must never offer a service the 1:1 path rejects", () => {
    for (const service_type of SERVICE_TYPES) {
      expect(ONE_TO_ONE_SERVICE_TYPES).toContain(service_type);
      expect(validateOneToOneBooking(validRaw({ service_type }), today).ok).toBe(true);
    }
  });

  it("does not validate the location against an enum (per-org names allowed)", () => {
    const result = validateOneToOneBooking(validRaw({ location: "My mobile van" }), today);
    expect(result.ok).toBe(true);
  });
});

describe("buildOneToOneAppointmentInsert", () => {
  it("carries duration_minutes and status booked", () => {
    const result = validateOneToOneBooking(validRaw(), today);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildOneToOneAppointmentInsert(result.value)).toEqual({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-06-20",
      time_slot: "10:00am",
      service_type: "full_groom",
      location: "Gina's",
      duration_minutes: 90,
      fee: 85,
      notes: null,
      status: "booked",
    });
  });
});
