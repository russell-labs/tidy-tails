import { describe, expect, it } from "vitest";
import {
  appointmentDeleteKind,
  buildCancellationTextDraft,
  buildCancellationTextMessage,
  buildEditAppointmentUpdate,
  shouldBlockAppointmentDeleteForCalendarStatus,
  validateCancellationTextInput,
  validateEditAppointment,
} from "./editAppointment";

const TODAY = new Date("2026-05-18T12:00:00");

const valid = {
  client_id: "client-1",
  appointment_id: "appt-1",
  date: "2026-04-10",
  time_slot: "10:30am",
  service_type: "full_groom",
  location: "gina",
  fee: "60",
  tip: "10",
  payment_method: "interac",
  payment_status: "paid",
  notes: "#4, left ears and tail",
};

describe("validateEditAppointment", () => {
  it("normalizes editable visit details", () => {
    const result = validateEditAppointment(valid, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      client_id: "client-1",
      appointment_id: "appt-1",
      date: "2026-04-10",
      time_slot: "10:30am",
      service_type: "full_groom",
      location: "gina",
      fee: 60,
      tip: 10,
      payment_method: "interac",
      payment_status: "paid",
      notes: "#4, left ears and tail",
    });
  });

  it("requires client id, appointment id, and a valid date", () => {
    const result = validateEditAppointment(
      { ...valid, client_id: "", appointment_id: "", date: "" },
      TODAY,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.client_id).toBeTruthy();
    expect(result.errors.appointment_id).toBeTruthy();
    expect(result.errors.date).toBeTruthy();
  });

  it("allows empty optional fields as null", () => {
    const result = validateEditAppointment(
      {
        ...valid,
        time_slot: "",
        service_type: "",
        location: "",
        fee: "",
        tip: "",
        payment_method: "",
        payment_status: "",
        notes: "",
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.service_type).toBeNull();
    expect(result.value.location).toBeNull();
    expect(result.value.time_slot).toBeNull();
    expect(result.value.fee).toBeNull();
    expect(result.value.tip).toBeNull();
    expect(result.value.payment_method).toBe("cash");
    expect(result.value.payment_status).toBe("paid");
    expect(result.value.notes).toBeNull();
  });

  it("rejects invalid service, location, fee, tip, and payment values", () => {
    const result = validateEditAppointment(
      {
        ...valid,
        service_type: "spa",
        location: "mobile",
        fee: "-1",
        tip: "-2",
        payment_method: "cheque",
        payment_status: "maybe",
      },
      TODAY,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.service_type).toBeTruthy();
    expect(result.errors.location).toBeTruthy();
    expect(result.errors.fee).toBeTruthy();
    expect(result.errors.tip).toBeTruthy();
    expect(result.errors.payment_method).toBeTruthy();
    expect(result.errors.payment_status).toBeTruthy();
  });
});

describe("buildCancellationTextMessage", () => {
  it("renders a clear customer cancellation text", () => {
    expect(
      buildCancellationTextMessage({
        ownerFirstName: "Mary",
        petName: "Kiwi",
        date: "2026-05-29",
        time: "10:30am",
      }),
    ).toBe(
      "Hi Mary, Kiwi's Tidy Tails appointment on 2026-05-29 at 10:30am has been cancelled. - Samantha",
    );
  });
});

describe("validateCancellationTextInput", () => {
  it("accepts a reviewed cancellation text and trims it", () => {
    expect(validateCancellationTextInput("  Hi Mary, Kiwi is cancelled.  ")).toEqual({
      ok: true,
      value: "Hi Mary, Kiwi is cancelled.",
    });
  });

  it("rejects empty reviewed cancellation text", () => {
    expect(validateCancellationTextInput("   ")).toEqual({
      ok: false,
      message: "Write a cancellation text before sending.",
    });
  });

  it("rejects over-long cancellation text", () => {
    expect(validateCancellationTextInput("x".repeat(481))).toEqual({
      ok: false,
      message: "That cancellation text is too long.",
    });
  });
});

describe("buildCancellationTextDraft", () => {
  it("returns an inert draft that requires explicit operator confirmation", () => {
    expect(buildCancellationTextDraft("Hi Mary, Kiwi is cancelled.")).toEqual({
      message: "Hi Mary, Kiwi is cancelled.",
      requiresExplicitConfirmation: true,
    });
  });
});

describe("buildEditAppointmentUpdate", () => {
  it("maps editable visit details to live appointment columns", () => {
    const result = validateEditAppointment(valid, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildEditAppointmentUpdate(result.value)).toEqual({
      date: "2026-04-10",
      time_slot: "10:30am",
      service_type: "full_groom",
      location: "gina",
      fee: 60,
      tip: 10,
      net: 70,
      notes: "#4, left ears and tail [payment:interac; payment_status:paid]",
    });
  });

  it("marks waiting payments with a null net", () => {
    const result = validateEditAppointment(
      { ...valid, payment_method: "cash", payment_status: "waiting" },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildEditAppointmentUpdate(result.value).net).toBeNull();
  });
});

describe("appointmentDeleteKind", () => {
  it("allows future booked appointments to be deleted as bookings", () => {
    expect(
      appointmentDeleteKind({
        status: "booked",
        date: "2026-06-01",
        today: "2026-05-21",
      }),
    ).toBe("future_booking");
  });

  it("allows completed and past booked rows to be deleted as past visits", () => {
    expect(
      appointmentDeleteKind({
        status: "completed",
        date: "2026-05-01",
        today: "2026-05-21",
      }),
    ).toBe("past_visit");
    expect(
      appointmentDeleteKind({
        status: "booked",
        date: "2026-05-01",
        today: "2026-05-21",
      }),
    ).toBe("past_visit");
  });

  it("keeps cancelled and no-show rows delete-disabled", () => {
    expect(
      appointmentDeleteKind({
        status: "cancelled",
        date: "2026-05-01",
        today: "2026-05-21",
      }),
    ).toBe("disabled");
    expect(
      appointmentDeleteKind({
        status: "no_show",
        date: "2026-05-01",
        today: "2026-05-21",
      }),
    ).toBe("disabled");
  });
});

describe("shouldBlockAppointmentDeleteForCalendarStatus", () => {
  it("does not let Google Calendar failures block Tidy Tails cleanup", () => {
    expect(shouldBlockAppointmentDeleteForCalendarStatus("failed")).toBe(false);
    expect(shouldBlockAppointmentDeleteForCalendarStatus("not_connected")).toBe(false);
    expect(shouldBlockAppointmentDeleteForCalendarStatus("synced")).toBe(false);
  });
});
