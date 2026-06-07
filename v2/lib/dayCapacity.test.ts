import { describe, expect, it } from "vitest";
import type { Appointment, Pet } from "./data/types";
import { DEFAULT_SCHEDULE_CALIBRATION } from "./operatorSettings";
import {
  assessDayFit,
  dogWorkProfile,
  inferSizeClass,
  summarizeDayLoad,
} from "./dayCapacity";

function pet(overrides: Partial<Pet> & { id: string; name?: string }): Pet {
  return {
    id: overrides.id,
    client_id: overrides.client_id ?? "c1",
    name: overrides.name ?? "Dog",
    breed: overrides.breed ?? null,
    color: null,
    sex: null,
    date_of_birth: null,
    allergies: false,
    allergies_detail: null,
    grooming_notes: overrides.grooming_notes ?? null,
    typical_fee: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function capacityPet(
  overrides: Partial<Pet> & {
    id: string;
    name?: string;
    size?: string;
    temperament_notes?: string;
  },
) {
  return {
    ...pet(overrides),
    size: overrides.size,
    temperament_notes: overrides.temperament_notes,
  };
}

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    client_id: overrides.client_id ?? "c1",
    pet_id: overrides.pet_id ?? "p1",
    date: overrides.date ?? "2026-05-29",
    time_slot: "time_slot" in overrides ? (overrides.time_slot ?? null) : "9:00am",
    service: overrides.service ?? "Full groom",
    price: overrides.price ?? 50,
    tip: null,
    notes: null,
    status: overrides.status ?? "booked",
    location: overrides.location ?? null,
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("day capacity rubric", () => {
  it("infers small and large dogs from common breed words", () => {
    expect(inferSizeClass(pet({ id: "small", breed: "Bichon Frise" }))).toBe(
      "small",
    );
    expect(inferSizeClass(pet({ id: "large", breed: "German Shepherd" }))).toBe(
      "large",
    );
  });

  it("honors an explicit size field when present", () => {
    const p = pet({ id: "xl", breed: "Mixed" }) as Pet & { size: string };
    p.size = "xl";
    expect(inferSizeClass(p)).toBe("xl");
  });

  it("scores styled long-coat work heavier than a short shave", () => {
    const styled = dogWorkProfile(
      pet({
        id: "styled",
        breed: "Havanese",
        grooming_notes: "Keep length, styled scissor finish and topknot.",
      }),
      "full_groom",
    );
    const shave = dogWorkProfile(
      pet({
        id: "shave",
        breed: "Havanese",
        grooming_notes: "Short all over, #7 complete cut.",
      }),
      "full_groom",
    );
    expect(styled!.points).toBeGreaterThan(shave!.points);
    expect(styled!.tags).toContain("styled finish");
    expect(shave!.tags).toContain("straight shave/short cut");
  });

  it("adds handling weight for temperament warnings", () => {
    const calm = dogWorkProfile(
      pet({ id: "calm", breed: "Boxer", grooming_notes: "Easy-going bath." }),
      "bath_only",
    );
    const wary = dogWorkProfile(
      pet({
        id: "wary",
        breed: "Boxer",
        grooming_notes: "Wary of strangers and needs a firm hand.",
      }),
      "bath_only",
    );
    expect(wary!.points).toBeGreaterThan(calm!.points);
    expect(wary!.tags).toContain("extra handling");
  });

  it("uses Sam's calibration that small full grooms are not automatically easy", () => {
    const small = dogWorkProfile(
      pet({ id: "small", breed: "Chihuahua" }),
      "full_groom",
    );
    const medium = dogWorkProfile(
      pet({ id: "medium", breed: "Mixed breed" }),
      "full_groom",
    );

    expect(small!.points).toBe(medium!.points);
  });

  it("summarizes day load using the full scheduled slate", () => {
    const pets = [
      pet({ id: "p1", breed: "German Shepherd" }),
      pet({ id: "p2", breed: "Bichon" }),
    ];
    const summary = summarizeDayLoad({
      date: "2026-05-29",
      pets,
      appointments: [
        appointment({ pet_id: "p1", status: "booked" }),
        appointment({ pet_id: "p2", status: "completed" }),
        appointment({ pet_id: "p3", status: "completed", time_slot: null }),
      ],
    });
    expect(summary.totalDogs).toBe(2);
    expect(summary.largeDogs).toBe(1);
  });

  it("flags a fourth large dog as not recommended", () => {
    const pets = [
      pet({ id: "p1", breed: "German Shepherd" }),
      pet({ id: "p2", breed: "Labrador Retriever" }),
      pet({ id: "p3", breed: "Bernese Mountain Dog" }),
      pet({ id: "p4", breed: "Newfoundland" }),
    ];
    const assessment = assessDayFit({
      date: "2026-05-29",
      pets,
      appointments: [
        appointment({ pet_id: "p1" }),
        appointment({ pet_id: "p2", time_slot: "10:30am" }),
        appointment({ pet_id: "p3", time_slot: "12:00pm" }),
      ],
      candidatePet: pets[3],
      serviceType: "full_groom",
    });
    expect(assessment.status).toBe("not_recommended");
    expect(assessment.messages.join(" ")).toMatch(/too many large dogs/i);
  });

  it("treats two large plus three small dogs as a full but possible day", () => {
    const pets = [
      pet({ id: "l1", breed: "German Shepherd" }),
      pet({ id: "l2", breed: "Labrador Retriever" }),
      pet({ id: "s1", breed: "Bichon" }),
      pet({ id: "s2", breed: "Yorkshire Terrier" }),
      pet({ id: "s3", breed: "Maltese" }),
    ];
    const assessment = assessDayFit({
      date: "2026-05-29",
      pets,
      appointments: [
        appointment({ pet_id: "l1" }),
        appointment({ pet_id: "l2", time_slot: "10:30am" }),
        appointment({ pet_id: "s1", time_slot: "12:00pm" }),
        appointment({ pet_id: "s2", time_slot: "1:30pm" }),
      ],
      candidatePet: pets[4],
      serviceType: "full_groom",
    });
    expect(assessment.projectedDogs).toBe(5);
    expect(["possible", "heavy"]).toContain(assessment.status);
    expect(assessment.messages.join(" ")).toMatch(/Check details/i);
  });

  it("does not apply an automatic same-household discount", () => {
    const pets = [
      pet({ id: "p1", breed: "Bichon" }),
      pet({ id: "p2", breed: "Bichon" }),
    ];
    const one = dogWorkProfile(pets[0], "full_groom");
    const assessment = assessDayFit({
      date: "2026-05-29",
      pets,
      appointments: [],
      candidatePets: [
        { pet: pets[0], serviceType: "full_groom" },
        { pet: pets[1], serviceType: "full_groom" },
      ],
    });

    expect(assessment.projectedLoadPoints).toBe(one!.points * 2);
  });

  it("honors a groomer-specific calibration profile", () => {
    const custom = {
      ...DEFAULT_SCHEDULE_CALIBRATION,
      heavyDogCount: 6,
      largeDogMax: 4,
      warningLanguage: "Review this custom day.",
    };
    const pets = [
      pet({ id: "p1", breed: "German Shepherd" }),
      pet({ id: "p2", breed: "Labrador Retriever" }),
      pet({ id: "p3", breed: "Bernese Mountain Dog" }),
      pet({ id: "p4", breed: "Newfoundland" }),
    ];
    const assessment = assessDayFit({
      date: "2026-05-29",
      pets,
      appointments: [
        appointment({ pet_id: "p1" }),
        appointment({ pet_id: "p2", time_slot: "10:30am" }),
        appointment({ pet_id: "p3", time_slot: "12:00pm" }),
      ],
      candidatePet: pets[3],
      serviceType: "full_groom",
      calibration: custom,
    });

    expect(assessment.status).not.toBe("not_recommended");
    expect(assessment.messages.join(" ")).toMatch(/Review this custom day/);
  });

  it("warns about Annette's two-large-crate limit separately from labor fit", () => {
    const pets = [
      capacityPet({ id: "p1", size: "large" }),
      capacityPet({ id: "p2", size: "large" }),
      capacityPet({ id: "p3", size: "large" }),
    ];
    const assessment = assessDayFit({
      date: "2026-05-29",
      pets,
      appointments: [
        appointment({ pet_id: "p1", location: "annette" }),
        appointment({ pet_id: "p2", location: "annette", time_slot: "10:30am" }),
      ],
      candidatePet: pets[2],
      serviceType: "full_groom",
      location: "annette",
    });

    expect(assessment.status).toBe("not_recommended");
    expect(assessment.messages.join(" ")).toMatch(/Annette.*2 large crates/i);
  });

  it("keeps four large dogs at Gina as a strong labor warning even though they fit space", () => {
    const pets = [
      capacityPet({ id: "p1", size: "large" }),
      capacityPet({ id: "p2", size: "large" }),
      capacityPet({ id: "p3", size: "large" }),
      capacityPet({ id: "p4", size: "large" }),
    ];
    const assessment = assessDayFit({
      date: "2026-05-29",
      pets,
      appointments: [
        appointment({ pet_id: "p1", location: "gina" }),
        appointment({ pet_id: "p2", location: "gina", time_slot: "10:30am" }),
        appointment({ pet_id: "p3", location: "gina", time_slot: "12:00pm" }),
      ],
      candidatePet: pets[3],
      serviceType: "full_groom",
      location: "gina",
    });

    expect(assessment.status).toBe("heavy");
    expect(assessment.messages.join(" ")).toMatch(/4 large dogs/i);
    expect(assessment.messages.join(" ")).toMatch(/bathing and drying solo/i);
  });

  it("flags Jackson Wicks as end-of-day special handling", () => {
    const assessment = assessDayFit({
      date: "2026-05-29",
      pets: [],
      appointments: [],
      candidatePet: capacityPet({
        id: "jackson",
        name: "Jackson Wicks",
        size: "large",
      }),
      serviceType: "full_groom",
    });

    expect(assessment.dogProfile?.tags).toContain("special handling");
    expect(assessment.messages.join(" ")).toMatch(/Jackson Wicks/i);
    expect(assessment.messages.join(" ")).toMatch(/end of day/i);
  });

  it("projects every dog in a multi-pet household booking", () => {
    const pets = [
      pet({ id: "p1", breed: "Bichon" }),
      pet({ id: "p2", breed: "Golden Retriever" }),
    ];
    const assessment = assessDayFit({
      date: "2026-05-29",
      pets,
      appointments: [],
      candidatePets: [
        { pet: pets[0], serviceType: "full_groom" },
        { pet: pets[1], serviceType: "full_groom" },
      ],
    });

    expect(assessment.projectedDogs).toBe(2);
    expect(assessment.projectedLargeDogs).toBe(1);
    expect(assessment.messages[0]).toMatch(/These dogs read as/i);
  });

  it("asks for service context when the service is not chosen", () => {
    const assessment = assessDayFit({
      date: "2026-05-29",
      pets: [pet({ id: "p1", breed: "Bichon" })],
      appointments: [],
      candidatePet: pet({ id: "p1", breed: "Bichon" }),
      serviceType: "",
    });
    expect(assessment.messages[0]).toMatch(/Choose the likely service/);
  });

  // TT-001: the booking note must reflect the whole day across every household
  // in the operator's org, not just the household being booked.
  it("assesses the whole day's load across multiple households, not just the booked one", () => {
    // Three dogs already booked that day across TWO other households.
    const dayPets = [
      pet({ id: "p1", client_id: "c1", breed: "Bichon" }), // small
      pet({ id: "p2", client_id: "c1", breed: "Maltese" }), // small
      pet({ id: "p3", client_id: "c2", breed: "Golden Retriever" }), // large
    ];
    const dayAppointments = [
      appointment({ id: "a1", client_id: "c1", pet_id: "p1", date: "2026-06-08", time_slot: "9:00am" }),
      appointment({ id: "a2", client_id: "c1", pet_id: "p2", date: "2026-06-08", time_slot: "10:30am" }),
      appointment({ id: "a3", client_id: "c2", pet_id: "p3", date: "2026-06-08", time_slot: "12:00pm" }),
    ];
    // A new/empty household books one more dog onto the same day.
    const candidate = pet({ id: "pc", client_id: "c3", breed: "Havanese" }); // small

    const assessment = assessDayFit({
      date: "2026-06-08",
      appointments: dayAppointments,
      pets: dayPets,
      candidatePets: [{ pet: candidate, serviceType: "full_groom" }],
      serviceType: "full_groom",
    });

    // Base reflects the full day (all households) — not "1 dog · looks open".
    expect(assessment.totalDogs).toBe(3);
    expect(assessment.largeDogs).toBe(1); // the Golden Retriever
    // Projected = every dog booked that day + the one being added.
    expect(assessment.projectedDogs).toBe(4);
    expect(assessment.projectedLargeDogs).toBe(1);
    expect(assessment.projectedLoadPoints).toBeGreaterThan(assessment.loadPoints);
  });

  // TT-001: the full-day set REPLACES the per-household base; it must not be
  // concatenated with the household's own rows, which would double-count them.
  it("counts a household's existing same-day booking exactly once", () => {
    const dayPets = [
      pet({ id: "pA", client_id: "c1", breed: "Bichon" }), // c1 already booked today
      pet({ id: "pB", client_id: "c1", breed: "Maltese" }), // c1's other pet, being booked now
      pet({ id: "pX", client_id: "c2", breed: "Poodle" }), // another household
    ];
    const dayAppointments = [
      appointment({ id: "a1", client_id: "c1", pet_id: "pA", date: "2026-06-08", time_slot: "9:00am" }),
      appointment({ id: "a2", client_id: "c2", pet_id: "pX", date: "2026-06-08", time_slot: "10:30am" }),
    ];
    // Only the new pet (pB) is the candidate; pA is already in the base.
    const assessment = assessDayFit({
      date: "2026-06-08",
      appointments: dayAppointments,
      pets: dayPets,
      candidatePets: [{ pet: pet({ id: "pB", client_id: "c1", breed: "Maltese" }), serviceType: "full_groom" }],
      serviceType: "full_groom",
    });

    // 2 already booked (pA + pX) + 1 new (pB) = 3. pA is not double-counted.
    expect(assessment.totalDogs).toBe(2);
    expect(assessment.projectedDogs).toBe(3);
  });
});
