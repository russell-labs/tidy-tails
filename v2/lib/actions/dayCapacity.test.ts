import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment, Pet } from "@/lib/data/types";

vi.mock("@/lib/data/repo", () => ({
  loadAppointments: vi.fn(),
  loadPets: vi.fn(),
}));

import { getDayCapacity } from "./dayCapacity";
import { loadAppointments, loadPets } from "@/lib/data/repo";

const loadAppointmentsMock = vi.mocked(loadAppointments);
const loadPetsMock = vi.mocked(loadPets);

function appt(overrides: Partial<Appointment> & { id: string; pet_id: string; date: string }): Appointment {
  return {
    client_id: "c",
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
    ...overrides,
  } as Appointment;
}

function pet(id: string): Pet {
  return { id, client_id: "c", name: id, breed: null, size: "small" } as Pet;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDayCapacity", () => {
  it("returns only the selected date's appointments and the pets they reference", async () => {
    loadAppointmentsMock.mockResolvedValue([
      appt({ id: "a1", pet_id: "p1", date: "2026-06-08" }), // other household, same day
      appt({ id: "a2", pet_id: "p2", date: "2026-06-08", client_id: "c2" }),
      appt({ id: "a3", pet_id: "p3", date: "2026-06-09" }), // different day — excluded
    ]);
    loadPetsMock.mockResolvedValue([pet("p1"), pet("p2"), pet("p3"), pet("p4")]);

    const result = await getDayCapacity("2026-06-08");

    expect(result.date).toBe("2026-06-08");
    expect(result.appointments.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
    // only the pets referenced by that day's appointments (p1, p2) — not p3 (other day) or p4 (unbooked)
    expect(result.pets.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("reads org-scoped via the same operator readers the Schedule view uses", async () => {
    loadAppointmentsMock.mockResolvedValue([]);
    loadPetsMock.mockResolvedValue([]);

    await getDayCapacity("2026-06-08");

    expect(loadAppointmentsMock).toHaveBeenCalledTimes(1);
    expect(loadPetsMock).toHaveBeenCalledTimes(1);
  });

  it("returns empty and issues no read for a malformed date", async () => {
    const result = await getDayCapacity("not-a-date");

    expect(result).toEqual({ date: "not-a-date", appointments: [], pets: [] });
    expect(loadAppointmentsMock).not.toHaveBeenCalled();
    expect(loadPetsMock).not.toHaveBeenCalled();
  });
});
