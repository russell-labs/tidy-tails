import { describe, expect, it } from "vitest";
import type { Appointment } from "./data/types";
import { canDeleteHousehold } from "./householdLifecycle";

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appt-1",
    client_id: "client-1",
    pet_id: "pet-1",
    date: "2026-05-01",
    time_slot: "10:30am",
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
    ...overrides,
  };
}

describe("canDeleteHousehold", () => {
  it("allows deleting a household with no appointment history", () => {
    expect(canDeleteHousehold({ appointments: [] })).toBe(true);
  });

  it("blocks deleting a household that has any appointment history", () => {
    expect(canDeleteHousehold({ appointments: [appointment()] })).toBe(false);
  });
});
