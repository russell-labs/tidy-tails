import { describe, it, expect } from "vitest";
import type { Appointment, Pet } from "./data/types";
import {
  availableBookingTimeSlots,
  BOOKING_TIME_SLOTS,
  buildBookingTextMessage,
  bookedTimesForDate,
  buildAppointmentInsert,
  buildAppointmentInserts,
  customerBookingLocationLabel,
  chooseBookingMessageDraft,
  findOwnedPet,
  findOwnedPets,
  googleAvailabilityBlocksBooking,
  hasBookedTimeConflict,
  renderBookingMessageTemplate,
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
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-01-01",
    ...overrides,
  };
}

describe("validateBookingInput — required fields", () => {
  it("accepts multiple selected household pets", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_ids: "p1,p2",
        date: "2026-06-01",
        time_slot: "10:30am",
        service_type: "full_groom",
        fee: "70",
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.pet_ids).toEqual(["p1", "p2"]);
      expect(r.value.pet_bookings).toEqual([
        { pet_id: "p1", service_type: "full_groom", fee: 70 },
        { pet_id: "p2", service_type: "full_groom", fee: 70 },
      ]);
    }
  });

  it("rejects an empty multi-pet selection", () => {
    const r = validateBookingInput(
      { client_id: "c1", pet_ids: " , ", date: "2026-06-01", time_slot: "10:30am" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.pet_id).toBe("Choose at least one pet.");
  });

  it("rejects a booking without a service so schedule work is never ambiguous", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.service_type).toBe("Pick a service.");
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
    if (!r.ok) expect(r.errors.time_slot).toBe("Choose a drop-off time.");
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
        location: "gina",
        send_invite: "on",
        customer_email: "mary@example.com",
        send_booking_text: "on",
        booking_message: "Hi Mary, Whiskey is booked.",
        save_reminder_phone: "on",
        customer_phone: "705-330-1807",
        fee: "72.50",
        notes: "Use hypoallergenic shampoo",
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.time_slot).toBe("10:00");
      expect(r.value.service_type).toBe("full_groom");
      expect(r.value.location).toBe("gina");
      expect(r.value.send_invite).toBe(true);
      expect(r.value.customer_email).toBe("mary@example.com");
      expect(r.value.send_booking_text).toBe(true);
      expect(r.value.booking_message).toBe("Hi Mary, Whiskey is booked.");
      expect(r.value.save_reminder_phone).toBe(true);
      expect(r.value.customer_phone).toBe("705-330-1807");
      expect(r.value.fee).toBe(72.5);
      expect(r.value.notes).toBe("Use hypoallergenic shampoo");
    }
  });

  it("accepts a per-booking salon payout override for Gina or Annette", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:00",
        service_type: "full_groom",
        location: "gina",
        salon_payout_override: "15",
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.salon_payout_override).toBe(15);
  });

  it("rejects a salon payout override without a salon location", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:00",
        service_type: "full_groom",
        salon_payout_override: "15",
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.salon_payout_override).toBeTruthy();
  });

  it("requires a valid owner email when email invite is selected", () => {
    const missing = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        send_invite: "on",
      },
      TODAY,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.customer_email).toBeTruthy();

    const malformed = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        send_invite: "on",
        customer_email: "mary",
      },
      TODAY,
    );
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.errors.customer_email).toBeTruthy();
  });

  it("requires a usable phone when booking text is selected", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        send_booking_text: "on",
        customer_phone: "555-0100",
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.customer_phone).toBeTruthy();
  });

  it("requires editable booking text when booking text is selected", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        send_booking_text: "on",
        customer_phone: "705-330-1807",
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.booking_message).toBeTruthy();
  });

  it("requires a usable phone when reminder phone saving is selected", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        save_reminder_phone: "on",
        customer_phone: "555-0100",
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.customer_phone).toBeTruthy();
  });

  it("accepts a fee of 0", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        service_type: "nail_trim",
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

  it("accepts puppy groom as a service_type enum", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        service_type: "puppy_groom",
      },
      TODAY,
    );

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.service_type).toBe("puppy_groom");
  });

  it("rejects a location outside the live schema enum", () => {
    const r = validateBookingInput(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        location: "mobile",
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.location).toBeTruthy();
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

  it("returns all requested pets when each belongs to the client", () => {
    const owned = findOwnedPets(pets, ["p1", "p2"], "c1");
    expect(owned).not.toBeNull();
    expect(owned?.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("returns null if any requested pet is missing or belongs elsewhere", () => {
    expect(findOwnedPets([...pets, pet("p9", "c2")], ["p1", "p9"], "c1")).toBeNull();
    expect(findOwnedPets(pets, ["p1", "p404"], "c1")).toBeNull();
  });
});

describe("buildAppointmentInsert — payload + null policy", () => {
  it("builds a minimal payload with optionals null and status booked", () => {
    const payload = buildAppointmentInsert({
      client_id: "c1",
      pet_id: "p1",
      pet_ids: ["p1"],
      pet_bookings: [{ pet_id: "p1", service_type: null, fee: null }],
      date: "2026-06-01",
      time_slot: "10:30am",
      service_type: null,
      location: null,
      send_invite: false,
      customer_email: null,
      send_booking_text: false,
      booking_message: null,
      save_reminder_phone: false,
      sms_consent: false,
      customer_phone: null,
      fee: null,
      notes: null,
    });
    expect(payload).toEqual({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-06-01",
      time_slot: "10:30am",
      service_type: null,
      location: null,
      fee: null,
      notes: null,
      status: "booked",
    });
  });

  it("carries through every populated field", () => {
    const payload = buildAppointmentInsert({
      client_id: "c1",
      pet_id: "p1",
      pet_ids: ["p1"],
      pet_bookings: [{ pet_id: "p1", service_type: "nail_trim", fee: 25 }],
      date: "2026-06-01",
      time_slot: "10:00",
      service_type: "nail_trim",
      location: "annette",
      send_invite: true,
      customer_email: "owner@example.com",
      send_booking_text: true,
      booking_message: "Hi, you're booked.",
      save_reminder_phone: true,
      sms_consent: true,
      customer_phone: "705-555-0199",
      fee: 25,
      notes: "quick visit",
      salon_payout_override: 15,
    });
    expect(payload.time_slot).toBe("10:00");
    expect(payload.service_type).toBe("nail_trim");
    expect(payload.location).toBe("annette");
    expect(payload.fee).toBe(25);
    expect(payload.notes).toBe("quick visit [salon_payout:15]");
    expect(payload.status).toBe("booked");
    expect(payload).not.toHaveProperty("send_invite");
  });

  it("never sets id, created_at, tip, rent_paid, or net — DB defaults / conservative NULL", () => {
    const payload = buildAppointmentInsert({
      client_id: "c1",
      pet_id: "p1",
      pet_ids: ["p1"],
      pet_bookings: [{ pet_id: "p1", service_type: null, fee: null }],
      date: "2026-06-01",
      time_slot: "10:30am",
      service_type: null,
      location: null,
      send_invite: false,
      customer_email: null,
      send_booking_text: false,
      booking_message: null,
      save_reminder_phone: false,
      sms_consent: false,
      customer_phone: null,
      fee: null,
      notes: null,
    });
    for (const k of ["id", "created_at", "tip", "rent_paid", "net"]) {
      expect(payload).not.toHaveProperty(k);
    }
  });

  it("builds one appointment row per selected household pet", () => {
    const payloads = buildAppointmentInserts({
      client_id: "c1",
      pet_id: "p1",
      pet_ids: ["p1", "p2"],
      pet_bookings: [
        { pet_id: "p1", service_type: "full_groom", fee: 80 },
        { pet_id: "p2", service_type: "bath_only", fee: 45 },
      ],
      date: "2026-06-01",
      time_slot: "10:30am",
      service_type: "full_groom",
      location: "gina",
      send_invite: false,
      customer_email: null,
      send_booking_text: false,
      booking_message: null,
      save_reminder_phone: false,
      sms_consent: false,
      customer_phone: null,
      fee: 80,
      notes: "Together",
    });

    expect(payloads).toEqual([
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-06-01",
        time_slot: "10:30am",
        service_type: "full_groom",
        location: "gina",
        fee: 80,
        notes: "Together",
        status: "booked",
      },
      {
        client_id: "c1",
        pet_id: "p2",
        date: "2026-06-01",
        time_slot: "10:30am",
        service_type: "bath_only",
        location: "gina",
        fee: 45,
        notes: "Together",
        status: "booked",
      },
    ]);
  });
});

describe("buildBookingTextMessage", () => {
  it("summarizes the booking details for a customer SMS", () => {
    expect(
      buildBookingTextMessage({
        ownerFirstName: "Mary",
        petName: "Whiskey",
        date: "2026-06-01",
        time: "10:30am",
        service: "Full groom",
        location: "290 Millard Street, Orillia",
      }),
    ).toBe(
      "Hi Mary, Whiskey is booked for full groom on 2026-06-01 at 10:30am at 290 Millard Street, Orillia. See you then! — Samantha",
    );
  });

  it("summarizes multiple pets in one customer SMS", () => {
    expect(
      buildBookingTextMessage({
        ownerFirstName: "Mary",
        petName: "Whiskey and Kiwi",
        date: "2026-06-01",
        time: "10:30am",
        service: "Full groom",
        location: "290 Millard Street, Orillia",
      }),
    ).toBe(
      "Hi Mary, Whiskey and Kiwi are booked for full groom on 2026-06-01 at 10:30am at 290 Millard Street, Orillia. See you then! — Samantha",
    );
  });

  it("falls back gracefully when optional details are missing", () => {
    expect(
      buildBookingTextMessage({
        ownerFirstName: null,
        petName: "Kiwi",
        date: "2026-06-01",
        time: null,
        service: null,
        location: null,
      }),
    ).toBe("Hi there, Kiwi is booked on 2026-06-01. See you then! — Samantha");
  });
});

describe("customer-facing booking labels", () => {
  it("uses addresses, not private location nicknames, for customers", () => {
    expect(customerBookingLocationLabel("gina")).toBe(
      "60 Olive Crescent, Orillia",
    );
    expect(customerBookingLocationLabel("annette")).toBe(
      "290 Millard Street, Orillia",
    );
  });

  it("renders editable booking confirmation templates", () => {
    expect(
      renderBookingMessageTemplate(
        "Hi [first name], [pet name] is booked for [service] on [date] at [time] at [location].",
        {
          ownerFirstName: "Mary",
          petName: "Whiskey",
          date: "Jun 29, 2026",
          time: "10am",
          service: "Full groom",
          location: "60 Olive Crescent, Orillia",
        },
      ),
    ).toBe(
      "Hi Mary, Whiskey is booked for Full groom on Jun 29, 2026 at 10am at 60 Olive Crescent, Orillia.",
    );
  });
});

describe("chooseBookingMessageDraft", () => {
  it("defaults to the normal booking confirmation even without prior outbound platform SMS", () => {
    expect(
      chooseBookingMessageDraft({
        hasPriorAppointments: true,
        hasPriorOutboundSms: false,
        bookingConfirmationTemplate: "normal",
        firstPlatformTextTemplate: "intro",
      }),
    ).toEqual({ kind: "booking_confirmation", template: "normal" });
  });

  it("uses normal booking confirmation for new customers or customers already texted through the platform", () => {
    expect(
      chooseBookingMessageDraft({
        hasPriorAppointments: false,
        hasPriorOutboundSms: false,
        bookingConfirmationTemplate: "normal",
        firstPlatformTextTemplate: "intro",
      }),
    ).toEqual({ kind: "booking_confirmation", template: "normal" });
    expect(
      chooseBookingMessageDraft({
        hasPriorAppointments: true,
        hasPriorOutboundSms: true,
        bookingConfirmationTemplate: "normal",
        firstPlatformTextTemplate: "intro",
      }),
    ).toEqual({ kind: "booking_confirmation", template: "normal" });
  });
});

describe("booking time slots", () => {
  it("offers 15-minute morning drop-off tiles from 9 through noon", () => {
    expect(BOOKING_TIME_SLOTS.slice(0, 4)).toEqual([
      "9:00am",
      "9:15am",
      "9:30am",
      "9:45am",
    ]);
    expect(BOOKING_TIME_SLOTS.at(-1)).toBe("12:00pm");
    expect(BOOKING_TIME_SLOTS).toHaveLength(13);
    expect(BOOKING_TIME_SLOTS).not.toContain("12:15pm");
    expect(BOOKING_TIME_SLOTS).not.toContain("1:30pm");
  });

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

  it("detects a same-day booked-time conflict for server-side saves", () => {
    expect(
      hasBookedTimeConflict(
        [appointment({ date: "2026-06-01", time_slot: "10:30 AM" })],
        "2026-06-01",
        "10:30am",
      ),
    ).toBe(true);
    expect(
      hasBookedTimeConflict(
        [appointment({ date: "2026-06-01", time_slot: "10:30 AM" })],
        "2026-06-01",
        "12:00pm",
      ),
    ).toBe(false);
  });

  it("allows another pet from the same household at the same drop-off time", () => {
    expect(
      hasBookedTimeConflict(
        [appointment({ client_id: "c1", pet_id: "p1", date: "2026-06-01", time_slot: "10:30 AM" })],
        "2026-06-01",
        "10:30am",
        { clientId: "c1", selectedPetIds: ["p2"] },
      ),
    ).toBe(false);
  });

  it("still blocks the same pet or another household at the same drop-off time", () => {
    expect(
      hasBookedTimeConflict(
        [appointment({ client_id: "c1", pet_id: "p1", date: "2026-06-01", time_slot: "10:30 AM" })],
        "2026-06-01",
        "10:30am",
        { clientId: "c1", selectedPetIds: ["p1"] },
      ),
    ).toBe(true);
    expect(
      hasBookedTimeConflict(
        [appointment({ client_id: "c2", pet_id: "p9", date: "2026-06-01", time_slot: "10:30 AM" })],
        "2026-06-01",
        "10:30am",
        { clientId: "c1", selectedPetIds: ["p1"] },
      ),
    ).toBe(true);
  });
});

describe("googleAvailabilityBlocksBooking", () => {
  it("only blocks booking when Google reports the selected window is busy", () => {
    expect(googleAvailabilityBlocksBooking("busy")).toBe(true);
    expect(googleAvailabilityBlocksBooking("failed")).toBe(false);
    expect(googleAvailabilityBlocksBooking("not_connected")).toBe(false);
    expect(googleAvailabilityBlocksBooking("disabled")).toBe(false);
  });
});
