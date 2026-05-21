import { describe, expect, it } from "vitest";
import type { Appointment, Pet } from "./data/types";
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

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    client_id: overrides.client_id ?? "c1",
    pet_id: overrides.pet_id ?? "p1",
    date: overrides.date ?? "2026-05-29",
    time_slot: overrides.time_slot ?? "9:00am",
    service: overrides.service ?? "Full groom",
    price: overrides.price ?? 50,
    tip: null,
    notes: null,
    status: overrides.status ?? "booked",
    location: null,
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

  it("summarizes booked day load using booked appointments only", () => {
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
      ],
    });
    expect(summary.totalDogs).toBe(1);
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
});
