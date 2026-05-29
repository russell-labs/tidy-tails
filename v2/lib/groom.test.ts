import { describe, it, expect } from "vitest";
import type { Appointment } from "./data/types";
import {
  buildGroomInsert,
  findBookedAppointmentForGroom,
  validateGroomLog,
} from "./groom";

// Fixed "today" so the date sanity-bounds tests are deterministic.
const TODAY = new Date("2026-05-17T12:00:00");

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: overrides.id ?? "a1",
    client_id: overrides.client_id ?? "c1",
    pet_id: overrides.pet_id ?? "p1",
    date: overrides.date ?? "2026-05-10",
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
    created_at: overrides.created_at ?? "2026-05-10T00:00:00.000Z",
  };
}

describe("validateGroomLog — required fields", () => {
  it("accepts a minimal completed groom (client, pet, date) with optionals empty", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "2026-05-10" },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        client_id: "c1",
        pet_id: "p1",
        date: "2026-05-10",
        service_type: null,
        fee: null,
        tip: null,
        payment_method: "cash",
        payment_status: "paid",
        notes: null,
      });
    }
  });

  it("rejects a missing date", () => {
    const r = validateGroomLog({ client_id: "c1", pet_id: "p1" }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.date).toBeTruthy();
  });

  it("rejects a missing client_id", () => {
    const r = validateGroomLog({ pet_id: "p1", date: "2026-05-10" }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.client_id).toBeTruthy();
  });

  it("rejects a missing pet_id", () => {
    const r = validateGroomLog({ client_id: "c1", date: "2026-05-10" }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.pet_id).toBeTruthy();
  });
});

describe("validateGroomLog — date sanity bounds (a groom is past or today)", () => {
  it("accepts today's date", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "2026-05-17" },
      TODAY,
    );
    expect(r.ok).toBe(true);
  });

  it("rejects an unparseable date", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "last Tuesday" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.date).toBeTruthy();
  });

  it("rejects a future date — a completed groom cannot be in the future", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "2026-05-18" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.date).toBeTruthy();
  });

  it("accepts a date exactly one year back", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "2025-05-17" },
      TODAY,
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a date more than a year back (year typo)", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "2020-01-01" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.date).toBeTruthy();
  });
});

describe("validateGroomLog — optional fields", () => {
  it("accepts a fully populated completed groom", () => {
    const r = validateGroomLog(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-05-10",
        service_type: "full_groom",
        fee: "72.50",
        tip: "12.50",
        payment_method: "interac",
        payment_status: "paid",
        notes: "Matted behind the ears — trimmed short",
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.service_type).toBe("full_groom");
      expect(r.value.fee).toBe(72.5);
      expect(r.value.tip).toBe(12.5);
      expect(r.value.payment_method).toBe("interac");
      expect(r.value.payment_status).toBe("paid");
      expect(r.value.notes).toBe("Matted behind the ears — trimmed short");
    }
  });

  it("accepts waiting-on-payment as a first-class closeout state", () => {
    const r = validateGroomLog(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-05-10",
        payment_method: "cash",
        payment_status: "waiting",
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.payment_method).toBe("cash");
      expect(r.value.payment_status).toBe("waiting");
    }
  });

  it("rejects invalid payment method and status", () => {
    const r = validateGroomLog(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-05-10",
        payment_method: "cheque",
        payment_status: "maybe",
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.payment_method).toBeTruthy();
      expect(r.errors.payment_status).toBeTruthy();
    }
  });

  it("accepts a fee of 0", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "2026-05-10", fee: "0" },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.fee).toBe(0);
  });

  it("rejects a negative fee", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "2026-05-10", fee: "-5" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.fee).toBeTruthy();
  });

  it("accepts a tip of 0", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "2026-05-10", tip: "0" },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.tip).toBe(0);
  });

  it("rejects a negative tip", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "2026-05-10", tip: "-5" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.tip).toBeTruthy();
  });

  it("rejects a non-numeric tip", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "2026-05-10", tip: "thanks" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.tip).toBeTruthy();
  });

  it("rejects a non-numeric fee", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "2026-05-10", fee: "cash" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.fee).toBeTruthy();
  });

  it("rejects a service_type outside the enum", () => {
    const r = validateGroomLog(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-05-10",
        service_type: "deluxe_spa",
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.service_type).toBeTruthy();
  });

  it("treats an empty service_type as null, not an error", () => {
    const r = validateGroomLog(
      { client_id: "c1", pet_id: "p1", date: "2026-05-10", service_type: "" },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.service_type).toBeNull();
  });

  it("rejects over-long notes", () => {
    const r = validateGroomLog(
      {
        client_id: "c1",
        pet_id: "p1",
        date: "2026-05-10",
        notes: "x".repeat(1001),
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.notes).toBeTruthy();
  });
});

describe("buildGroomInsert — payload + null policy", () => {
  it("builds a minimal payload with optionals null and status completed", () => {
    const payload = buildGroomInsert({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-05-10",
      service_type: null,
      fee: null,
      tip: null,
      payment_method: "cash",
      payment_status: "paid",
      notes: null,
    });
    expect(payload).toEqual({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-05-10",
      service_type: null,
      fee: null,
      tip: null,
      net: 0,
      notes: "[payment:cash; payment_status:paid]",
      status: "completed",
    });
  });

  it("carries through every populated field", () => {
    const payload = buildGroomInsert({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-05-10",
      service_type: "bath_only",
      fee: 40,
      tip: 10,
      payment_method: "interac",
      payment_status: "paid",
      notes: "calm visit",
    });
    expect(payload.service_type).toBe("bath_only");
    expect(payload.fee).toBe(40);
    expect(payload.tip).toBe(10);
    expect(payload.net).toBe(50);
    expect(payload.notes).toBe("calm visit [payment:interac; payment_status:paid]");
    expect(payload.status).toBe("completed");
  });

  it("marks waiting payments with null net so reports can separate collected from owing", () => {
    const payload = buildGroomInsert({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-05-10",
      service_type: "bath_only",
      fee: 40,
      tip: 10,
      payment_method: "cash",
      payment_status: "waiting",
      notes: "pay next visit",
    });
    expect(payload.net).toBeNull();
    expect(payload.notes).toBe("pay next visit [payment:cash; payment_status:waiting]");
  });

  it("never sets id, created_at, rent_paid, time_slot, or location — DB defaults / conservative NULL", () => {
    const payload = buildGroomInsert({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-05-10",
      service_type: null,
      fee: null,
      tip: null,
      payment_method: "cash",
      payment_status: "paid",
      notes: null,
    });
    for (const k of [
      "id",
      "created_at",
      "rent_paid",
      "time_slot",
      "location",
    ]) {
      expect(payload).not.toHaveProperty(k);
    }
  });
});

describe("findBookedAppointmentForGroom", () => {
  it("finds the booked appointment Sam is completing for that dog and day", () => {
    const match = findBookedAppointmentForGroom(
      [
        appointment({ id: "wrong-day", date: "2026-05-09" }),
        appointment({ id: "booked", date: "2026-05-10" }),
        appointment({ id: "already-completed", status: "completed" }),
      ],
      { client_id: "c1", pet_id: "p1", date: "2026-05-10" },
    );

    expect(match?.id).toBe("booked");
  });
});
