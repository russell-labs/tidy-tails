import { describe, it, expect } from "vitest";
import type { Appointment, Pet } from "./data/types";
import {
  availableBookingTimeSlots,
  bookedTimesForDate,
  buildAppointmentInsert,
  findOwnedPet,
  validateBookingInput,
} from "./booking";

// Fixed "today" so the date sanity-bounds tests are deterministic.
const TODAY = new Date("2026-05-17T12:00:00");

// Minimal synthetic pet — only id and client_id matter to these helpers.
function pet(id: string, clientId: string): Pet {
  return {
    id,
    client_id: clientId,
    name: "Dog",
    breed: null,
    color: null,
    sex: null,
    date_of_birth: null,
    allergies: false,
    allergies_detail: null,
    grooming_notes: null,
    typical_fee: null,
    created_at: "2025-01-01",
  };
}

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: "a1",
    client_id: "c1",
    pet_id: "p1",
    date: "2026-06-01",
    time_slot: null,
    service: null,
    price: null,
    tip: null,
    notes: null,
    created_at: "2026-01-01",
    ...overrides,
  };
}

describe("validateBookingInput — required fields", () => {
  it("accepts a minimal booking (client, pet, date, time) with optionals empty", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        service_type: null,
        fee: null,
        notes: null,
      });
    }
  });

  it("rejects a missing date", () => {
    const r = validateBookingInput({ client_id: "c1", pet_id: "p1" }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.date).toBeTruthy();
  });

  it("rejects a missing time", () => {
    const r = validateBookingInput(
      { client_id: "c1", pet_id: "p1", date: "2026-06-01" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.time_slot).toBe("Choose a time.");
  });

  it("rejects a missing client_id", () => {
    const r = validateBookingInput(
      { pet_id: "p1", date: "2026-06-01", time_slot: "10:30am" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.client_id).toBeTruthy();
  });

  it("rejects a missing pet_id", () => {
    const r = validateBookingInput(
      { client_id: "c1", date: "2026-06-01", time_slot: "10:30am" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.pet_id).toBeTruthy();
  });
});

describe("validateBookingInput — date sanity bounds (typo guard)", () => {
  it("rejects an unparseable date", () => {
    const r = validateBookingInput(
      { client_id: "c1", pet_id: "p1", date: "June 1" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.date).toBeTruthy();
  });

  it("rejects a date far in the future (year typo)", () => {
    const r = validateBookingInput(
      { client_id: "c1", pet_id: "p1", date: "2099-01-01" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.date).toBeTruthy();
  });

  it("rejects a date far in the past (year typo)", () => {
    const r = validateBookingInput(
      { client_id: "c1", pet_id: "p1", date: "2000-01-01" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.date).toBeTruthy();
  });
});

describe("validateBookingInput — optional fields", () => {
  it("accepts a fully populated booking", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:00",
        service_type: "full_groom",
        fee: "72.50",
        notes: "Use hypoallergenic shampoo",
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.time_slot).toBe("10:00");
      expect(r.value.service_type).toBe("full_groom");
      expect(r.value.fee).toBe(72.5);
      expect(r.value.notes).toBe("Use hypoallergenic shampoo");
    }
  });

  it("accepts a fee of 0", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        fee: "0",
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.fee).toBe(0);
  });

  it("rejects a negative fee", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        fee: "-5",
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.fee).toBeTruthy();
  });

  it("rejects a non-numeric fee", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        fee: "lots",
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.fee).toBeTruthy();
  });

  it("rejects a service_type outside the enum", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        service_type: "deluxe_spa",
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.service_type).toBeTruthy();
  });
});

describe("findOwnedPet — pet/client ownership check", () => {
  const pets = [pet("p1", "c1"), pet("p2", "c1")];

  it("returns the pet when it is in the list and owned by the client", () => {
    expect(findOwnedPet(pets, "p1", "c1")?.id).toBe("p1");
  });

  it("returns null when the pet belongs to a different client", () => {
    expect(findOwnedPet([pet("p9", "c2")], "p9", "c1")).toBeNull();
  });

  it("returns null when the pet is not in the list at all", () => {
    expect(findOwnedPet(pets, "p404", "c1")).toBeNull();
  });
});

describe("buildAppointmentInsert — payload + null policy", () => {
  it("builds a minimal payload with optionals null and status booked", () => {
    const payload = buildAppointmentInsert({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-06-01",
      time_slot: "10:30am",
      service_type: null,
      fee: null,
      notes: null,
    });
    expect(payload).toEqual({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-06-01",
      time_slot: "10:30am",
      service_type: null,
      fee: null,
      notes: null,
      status: "booked",
    });
  });

  it("carries through every populated field", () => {
    const payload = buildAppointmentInsert({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-06-01",
      time_slot: "10:00",
      service_type: "nail_trim",
      fee: 25,
      notes: "quick visit",
    });
    expect(payload.time_slot).toBe("10:00");
    expect(payload.service_type).toBe("nail_trim");
    expect(payload.fee).toBe(25);
    expect(payload.notes).toBe("quick visit");
    expect(payload.status).toBe("booked");
  });

  it("never sets id, created_at, tip, rent_paid, location, or net — DB defaults / conservative NULL", () => {
    const payload = buildAppointmentInsert({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-06-01",
      time_slot: "10:30am",
      service_type: null,
      fee: null,
      notes: null,
    });
    for (const k of ["id", "created_at", "tip", "rent_paid", "location", "net"]) {
      expect(payload).not.toHaveProperty(k);
    }
  });
});

describe("booking time slots", () => {
  it("lists booked free-text times for the selected date only", () => {
    expect(
      bookedTimesForDate(
        [
          appointment({ date: "2026-06-01", time_slot: "10:30am" }),
          appointment({ date: "2026-06-01", time_slot: " 10:30 AM " }),
          appointment({ date: "2026-06-02", time_slot: "3:00pm" }),
          appointment({ date: "2026-06-01", time_slot: null }),
        ],
        "2026-06-01",
      ),
    ).toEqual(["10:30am"]);
  });

  it("marks default day-book slots unavailable when already booked", () => {
    const slots = availableBookingTimeSlots(
      [appointment({ date: "2026-06-01", time_slot: "10:30 AM" })],
      "2026-06-01",
    );
    expect(slots.find((slot) => slot.time === "10:30am")).toMatchObject({
      available: false,
    });
    expect(slots.find((slot) => slot.time === "9:00am")).toMatchObject({
      available: true,
    });
  });
});
