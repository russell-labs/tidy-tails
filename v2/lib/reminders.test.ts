import { describe, it, expect } from "vitest";
import type { Appointment } from "./data/types";
import {
  buildReminderDraft,
  buildReminderMessage,
  pickReminderAppointment,
  validateReminderInput,
} from "./reminders";

// Fixed "today" so the upcoming-appointment tests are deterministic.
const TODAY = new Date("2026-05-17T12:00:00");

// Minimal Appointment builder — pickReminderAppointment only reads `date`.
function appt(date: string): Appointment {
  return {
    id: `a-${date}`,
    client_id: "c1",
    pet_id: "p1",
    date,
    service: null,
    price: null,
    notes: null,
    created_at: date,
  };
}

describe("pickReminderAppointment — missing / upcoming appointment handling", () => {
  it("returns null for an empty appointment list", () => {
    expect(pickReminderAppointment([], TODAY)).toBeNull();
  });

  it("returns null when every appointment is in the past", () => {
    const past = [appt("2026-05-01"), appt("2026-03-22"), appt("2025-12-10")];
    expect(pickReminderAppointment(past, TODAY)).toBeNull();
  });

  it("treats today's appointment as upcoming", () => {
    const today = appt("2026-05-17");
    expect(pickReminderAppointment([today], TODAY)).toBe(today);
  });

  it("returns the soonest appointment when several are upcoming", () => {
    const soonest = appt("2026-05-20");
    const list = [appt("2026-06-15"), soonest, appt("2026-05-29")];
    expect(pickReminderAppointment(list, TODAY)).toBe(soonest);
  });

  it("ignores past appointments when an upcoming one exists", () => {
    const upcoming = appt("2026-05-25");
    const list = [appt("2026-01-10"), appt("2026-05-02"), upcoming];
    expect(pickReminderAppointment(list, TODAY)).toBe(upcoming);
  });
});

describe("buildReminderMessage — message generation", () => {
  it("builds an appointment reminder naming the owner, pet, and date", () => {
    const msg = buildReminderMessage({
      ownerFirstName: "Hannah",
      petName: "Waffles",
      appointmentDate: "2026-05-23",
    });
    expect(msg).toContain("Hannah");
    expect(msg).toContain("Waffles");
    expect(msg).toContain("2026"); // the formatted appointment date
  });

  it("builds a generic check-in message when there is no upcoming appointment", () => {
    const msg = buildReminderMessage({
      ownerFirstName: "Hannah",
      petName: "Waffles",
      appointmentDate: null,
    });
    expect(msg).toContain("Hannah");
    expect(msg).toContain("Waffles");
    // The no-appointment message must differ from the dated reminder.
    const dated = buildReminderMessage({
      ownerFirstName: "Hannah",
      petName: "Waffles",
      appointmentDate: "2026-05-23",
    });
    expect(msg).not.toBe(dated);
  });

  it("falls back to 'your dog' when the pet name is unknown", () => {
    const msg = buildReminderMessage({
      ownerFirstName: "Hannah",
      petName: null,
      appointmentDate: "2026-05-23",
    });
    expect(msg).toContain("your dog");
  });

  it("falls back gracefully when the owner first name is blank", () => {
    const msg = buildReminderMessage({
      ownerFirstName: "  ",
      petName: "Waffles",
      appointmentDate: null,
    });
    expect(msg).toContain("there");
  });
});

describe("validateReminderInput — editable message validation", () => {
  it("accepts a normal phone and message", () => {
    const r = validateReminderInput({
      phone: "705-555-0106",
      message: "Hi Hannah, see you Friday!",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects an empty message", () => {
    const r = validateReminderInput({ phone: "705-555-0106", message: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.message).toBeTruthy();
  });

  it("rejects a whitespace-only message", () => {
    const r = validateReminderInput({ phone: "705-555-0106", message: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.message).toBeTruthy();
  });

  it("rejects an over-long message", () => {
    const r = validateReminderInput({
      phone: "705-555-0106",
      message: "x".repeat(481),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.message).toBeTruthy();
  });

  it("trims surrounding whitespace from the message", () => {
    const r = validateReminderInput({
      phone: "705-555-0106",
      message: "  See you soon  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.message).toBe("See you soon");
  });
});

describe("validateReminderInput — phone validation", () => {
  it("accepts a 10-digit phone", () => {
    const r = validateReminderInput({ phone: "7055550106", message: "Hi" });
    expect(r.ok).toBe(true);
  });

  it("accepts an 11-digit phone with a leading country code 1", () => {
    const r = validateReminderInput({ phone: "1-705-555-0106", message: "Hi" });
    expect(r.ok).toBe(true);
  });

  it("rejects a phone with too few digits", () => {
    const r = validateReminderInput({ phone: "555-0106", message: "Hi" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toBeTruthy();
  });

  it("rejects a recipient with no phone digits at all", () => {
    const r = validateReminderInput({ phone: "", message: "Hi" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toBeTruthy();
  });
});

describe("buildReminderDraft — draft shape", () => {
  it("carries the validated phone and message into the draft", () => {
    const draft = buildReminderDraft({
      phone: "7055550106",
      message: "See you Friday",
    });
    expect(draft.to).toBe("7055550106");
    expect(draft.message).toBe("See you Friday");
  });

  it("carries only recipient, message, and the confirmation flag — a draft has no 'sent' state", () => {
    const draft = buildReminderDraft({
      phone: "7055550106",
      message: "Hi",
    });
    expect(Object.keys(draft).sort()).toEqual([
      "message",
      "requiresExplicitConfirmation",
      "to",
    ]);
  });
});

describe("the never-auto-send rule", () => {
  it("marks every prepared draft as requiring explicit confirmation, regardless of input", () => {
    const inputs = [
      { phone: "7055550106", message: "Short" },
      { phone: "1-705-555-0106", message: "A longer reminder message here." },
      { phone: "705 555 0106", message: "x".repeat(200) },
    ];
    for (const input of inputs) {
      const draft = buildReminderDraft(input);
      expect(draft.requiresExplicitConfirmation).toBe(true);
    }
  });
});
