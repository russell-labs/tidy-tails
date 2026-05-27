import { describe, expect, it } from "vitest";
import type { Appointment } from "./data/types";
import {
  PASSED_AWAY_MARKER,
  activePets,
  buildMergeDuplicatePetPlan,
  buildPassedAwayGroomingNotes,
  canDeletePetProfile,
  isPetPassedAway,
} from "./petLifecycle";
import type { Pet } from "./data/types";

function appointment(petId: string, clientId = "client-1"): Appointment {
  return {
    id: `appt-${petId}`,
    client_id: clientId,
    pet_id: petId,
    date: "2026-05-25",
    time_slot: "9:00am",
    service: "Full groom",
    price: 50,
    tip: null,
    notes: null,
    status: "booked",
    location: null,
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function pet(overrides: Partial<Pet>): Pet {
  return {
    id: "pet-1",
    client_id: "client-1",
    name: "Milo",
    breed: null,
    size: null,
    color: null,
    age: null,
    sex: null,
    date_of_birth: null,
    allergies: false,
    allergies_detail: null,
    grooming_notes: null,
    typical_fee: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("pet lifecycle helpers", () => {
  it("adds one structured passed-away marker without losing notes", () => {
    expect(buildPassedAwayGroomingNotes("Likes short ears.")).toBe(
      `${PASSED_AWAY_MARKER}\n\nLikes short ears.`,
    );
    expect(buildPassedAwayGroomingNotes(`${PASSED_AWAY_MARKER}\n\nExisting`)).toBe(
      `${PASSED_AWAY_MARKER}\n\nExisting`,
    );
  });

  it("identifies passed-away pets and filters them from active flows", () => {
    const living = { grooming_notes: "Happy" };
    const passed = { grooming_notes: PASSED_AWAY_MARKER };
    expect(isPetPassedAway(living)).toBe(false);
    expect(isPetPassedAway(passed)).toBe(true);
    expect(activePets([living, passed])).toEqual([living]);
  });

  it("allows deleting only profiles without appointment history", () => {
    expect(
      canDeletePetProfile({
        petId: "pet-1",
        appointments: [appointment("pet-2")],
      }),
    ).toBe(true);
    expect(
      canDeletePetProfile({
        petId: "pet-1",
        appointments: [appointment("pet-1")],
      }),
    ).toBe(false);
  });

  it("builds a duplicate-pet merge plan that preserves details and moves history", () => {
    const keep = pet({
      id: "keep",
      breed: null,
      grooming_notes: "Use blue shampoo.",
      typical_fee: null,
    });
    const duplicate = pet({
      id: "duplicate",
      breed: "Cockapoo",
      allergies: true,
      allergies_detail: "Chicken",
      grooming_notes: "Nervous for nails.",
      typical_fee: 82,
    });

    const plan = buildMergeDuplicatePetPlan({
      keep,
      duplicate,
      appointments: [appointment("duplicate"), appointment("other")],
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.appointmentIdsToMove).toEqual(["appt-duplicate"]);
    expect(plan.keeperPetUpdate).toMatchObject({
      breed: "Cockapoo",
      allergies: true,
      allergies_detail: "Chicken",
      standard_fee: 82,
    });
    expect(plan.keeperPetUpdate.grooming_notes).toContain("Use blue shampoo.");
    expect(plan.keeperPetUpdate.grooming_notes).toContain(
      "Merged duplicate profile duplicate",
    );
    expect(plan.keeperPetUpdate.grooming_notes).toContain("Nervous for nails.");
  });

  it("rejects merging a pet profile into itself", () => {
    const same = pet({ id: "same" });
    expect(
      buildMergeDuplicatePetPlan({
        keep: same,
        duplicate: same,
        appointments: [],
      }),
    ).toEqual({ ok: false, error: "Choose two different pet profiles." });
  });

  it("allows merging a duplicate dog file from another household", () => {
    const keep = pet({ id: "keep", client_id: "right-household" });
    const duplicate = pet({
      id: "duplicate",
      client_id: "wrong-household",
      grooming_notes: "Imported under the wrong Stillman.",
    });

    const plan = buildMergeDuplicatePetPlan({
      keep,
      duplicate,
      appointments: [
        appointment("duplicate", "wrong-household"),
        appointment("keep", "right-household"),
      ],
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.appointmentIdsToMove).toEqual(["appt-duplicate"]);
    expect(plan.keeperPetUpdate.grooming_notes).toContain(
      "Imported under the wrong Stillman.",
    );
  });
});
