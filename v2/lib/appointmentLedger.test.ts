import { describe, expect, it } from "vitest";
import type { Appointment } from "./data/types";
import { collapseLoggedGroomDuplicates } from "./appointmentLedger";

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: overrides.id ?? "a1",
    client_id: overrides.client_id ?? "c1",
    pet_id: overrides.pet_id ?? "p1",
    date: overrides.date ?? "2026-05-28",
    time_slot: overrides.time_slot ?? "10:30am",
    service: overrides.service ?? "Full groom",
    price: overrides.price ?? 60,
    tip: overrides.tip ?? null,
    notes: overrides.notes ?? null,
    status: overrides.status ?? "booked",
    location: overrides.location ?? "gina",
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: overrides.created_at ?? "2026-05-28T00:00:00.000Z",
  };
}

describe("collapseLoggedGroomDuplicates", () => {
  it("hides the booked row when a completed groom exists for the same dog and day", () => {
    const rows = collapseLoggedGroomDuplicates([
      appointment({ id: "booked", status: "booked", time_slot: "10:30am" }),
      appointment({
        id: "logged",
        status: "completed",
        time_slot: null,
        tip: 5,
        notes: "#7 left ears and tail",
      }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["logged"]);
  });

  it("keeps bookings for other dogs or days", () => {
    const rows = collapseLoggedGroomDuplicates([
      appointment({ id: "booked", status: "booked" }),
      appointment({ id: "other-pet", pet_id: "p2", status: "completed" }),
      appointment({ id: "other-day", date: "2026-05-29", status: "completed" }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["booked", "other-pet", "other-day"]);
  });
});
