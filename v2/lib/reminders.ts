// Pure logic for the Reminder Prep flow — preparing an appointment reminder
// text for Sam to review:
//   - pickReminderAppointment — the soonest upcoming appointment, or null
//   - buildReminderMessage    — a default reminder draft from owner/pet/date
//   - validateReminderInput   — recipient phone + editable message → ok/errors
//   - buildReminderDraft      — the inert, confirmation-required reminder draft
//
// Pure: no I/O, no Supabase, no Twilio, no React. The server action
// (lib/actions/reminders.ts) composes these.
//
// HARD PRODUCT RULE: the app may PREPARE a reminder; it never sends one
// automatically. Sam reviews and explicitly confirms every SMS in-app before
// dispatch — no automatic, batch, or background sending. This module reflects
// that: it produces a `ReminderDraft` — inert data — and exposes no function
// that sends. Every draft carries `requiresExplicitConfirmation: true`.
// Unit-tested in reminders.test.ts.

import type { Appointment, Pet } from "./data/types";
import { customerBookingLocationLabel, formatPetNames } from "./booking";
import { digitsOnly, formatDate } from "./format";
import { customerLocationLabelFromSettings } from "./locationFinance";
import { applyOperatorName } from "./operatorIdentity";
import type { LocationSettingsMap } from "./operatorSettings";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The appointment a reminder is about: the soonest one dated today or later.
 * Past appointments are ignored — a reminder is for an *upcoming* visit. Null
 * when the client has no upcoming appointment (the flow then offers a manual
 * draft). `today` is injected so the bound is deterministic in tests.
 */
export function pickReminderAppointment(
  appointments: Appointment[],
  today: Date = new Date(),
): Appointment | null {
  const todayISO = toISO(today);
  const upcoming = appointments
    .filter((a) => a.date >= todayISO)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? null;
}

// The context a default reminder message is built from.
export type ReminderContext = {
  ownerFirstName: string;
  petName: string | null; // null → "your dog"
  appointmentDate: string | null; // ISO; null → a generic check-in message
  appointmentTime?: string | null;
  appointmentLocation?: string | null;
  appointmentTemplate?: string;
  rebookTemplate?: string;
  locationSettings?: LocationSettingsMap;
  operatorName: string;
};

export type ReminderTemplateVars = {
  ownerFirstName: string;
  petName: string | null;
  appointmentDate: string | null;
  appointmentTime?: string | null;
  appointmentLocation?: string | null;
  locationSettings?: LocationSettingsMap;
  operatorName?: string;
};

export function renderReminderTemplate(
  template: string,
  vars: ReminderTemplateVars,
): string {
  const owner = vars.ownerFirstName.trim() || "there";
  const pet = (vars.petName ?? "").trim() || "your dog";
  const date = vars.appointmentDate ? formatDate(vars.appointmentDate) : "soon";
  const time = (vars.appointmentTime ?? "").trim() || "the scheduled time";
  const rawLocation = (vars.appointmentLocation ?? "").trim();
  const location =
    (vars.locationSettings
      ? customerLocationLabelFromSettings(
          vars.appointmentLocation,
          vars.locationSettings,
        )
      : null) ??
    customerBookingLocationLabel(vars.appointmentLocation) ??
    (rawLocation === "gina" || rawLocation === "annette"
      ? "the grooming location"
      : rawLocation || "the grooming location");

  const rendered = template
    .replaceAll("[first name]", owner)
    .replaceAll("[pet name]", pet)
    .replaceAll("[date]", date)
    .replaceAll("[time]", time)
    .replaceAll("[location]", location)
    .trim();
  return applyOperatorName(rendered, vars.operatorName ?? "");
}

function ensureAppointmentTime(
  message: string,
  template: string,
  time: string | null | undefined,
  operatorName: string,
): string {
  const appointmentTime = (time ?? "").trim();
  if (!appointmentTime || template.includes("[time]")) return message;
  if (message.toLowerCase().includes(appointmentTime.toLowerCase())) return message;
  // After rendering, the message ends with the resolved signature (or none).
  // Insert the appointment time just before it so the sign-off stays last.
  const name = operatorName.trim();
  const signature = name ? ` — ${name}` : "";
  if (signature && message.endsWith(signature)) {
    return `${message.slice(0, -signature.length)} Appointment time: ${appointmentTime}.${signature}`;
  }
  return `${message} Appointment time: ${appointmentTime}.`;
}

/**
 * Build a default reminder message. With an appointment date it is a dated
 * reminder; without one it is a generic check-in invite. The result is only a
 * starting point — the flow lets Sam edit it before review.
 */
export function buildReminderMessage(ctx: ReminderContext): string {
  const owner = ctx.ownerFirstName.trim() || "there";
  const pet = (ctx.petName ?? "").trim() || "your dog";
  if (ctx.appointmentDate) {
    const template =
      ctx.appointmentTemplate ??
      "Hi [first name], a friendly reminder that [pet name] has a grooming appointment at [location] on [date] at [time]. See you then! — [your name]";
    return ensureAppointmentTime(
      renderReminderTemplate(template, ctx),
      template,
      ctx.appointmentTime,
      ctx.operatorName,
    );
  }
  return renderReminderTemplate(
    ctx.rebookTemplate ??
      `Hi ${owner}, it's been a little while since ${pet}'s last visit to Tidy Tails. Would you like to book in for a groom? — [your name]`,
    ctx,
  );
}

export type ReminderTarget = {
  appointment: Appointment;
  petName: string | null;
  appointmentDate: string;
  appointmentTime: string | null;
  appointmentLocation: string | null;
  groupAppointmentIds: string[];
};

function sameReminderSlot(a: Appointment, b: Appointment): boolean {
  return (
    a.client_id === b.client_id &&
    a.date === b.date &&
    (a.time_slot ?? "").trim().toLowerCase() ===
      (b.time_slot ?? "").trim().toLowerCase()
  );
}

function isBookableReminderStatus(appointment: Appointment): boolean {
  return (appointment.status ?? "booked") === "booked";
}

export function buildReminderTarget(
  appointments: Appointment[],
  pets: Pick<Pet, "id" | "name">[],
  {
    appointmentId,
    today = new Date(),
  }: { appointmentId?: string | null; today?: Date } = {},
): ReminderTarget | null {
  const appointment =
    appointmentId != null && appointmentId !== ""
      ? appointments.find((candidate) => candidate.id === appointmentId)
      : pickReminderAppointment(appointments, today);

  if (!appointment) return null;

  const petNameById = new Map(pets.map((pet) => [pet.id, pet.name]));
  const group = appointments.filter(
    (candidate) =>
      isBookableReminderStatus(candidate) &&
      sameReminderSlot(candidate, appointment),
  );
  const petNames = group
    .map((candidate) => petNameById.get(candidate.pet_id) ?? "")
    .filter(Boolean);

  return {
    appointment,
    petName: petNames.length > 0 ? formatPetNames(petNames) : null,
    appointmentDate: appointment.date,
    appointmentTime: appointment.time_slot,
    appointmentLocation: appointment.location ?? null,
    groupAppointmentIds: group.map((candidate) => candidate.id),
  };
}

// Raw reminder input — the recipient phone and the (editable) message body.
export type ReminderInput = {
  phone: string;
  message: string;
};

// A validated reminder — phone digit-checked, message trimmed and bounded.
export type ValidatedReminder = {
  phone: string;
  message: string;
};

export type ReminderErrors = Partial<Record<keyof ReminderInput, string>>;

export type ReminderValidationResult =
  | { ok: true; value: ValidatedReminder }
  | { ok: false; errors: ReminderErrors };

// ~3 SMS segments — a reminder is short; this is a sanity bound, not a limit
// Sam should routinely hit.
const MESSAGE_MAX = 480;

/**
 * Validate the recipient phone and the editable message. The phone must carry
 * a North American digit count (10, or 11 with a leading 1) — in the flow it
 * is the client's number on file, so a failure means there is no usable number
 * to text. The message must be non-empty after trimming and within MESSAGE_MAX.
 */
export function validateReminderInput(
  raw: Partial<ReminderInput>,
): ReminderValidationResult {
  const errors: ReminderErrors = {};

  const phone = (raw.phone ?? "").trim();
  const phoneDigits = digitsOnly(phone);
  if (
    !(
      phoneDigits.length === 10 ||
      (phoneDigits.length === 11 && phoneDigits.startsWith("1"))
    )
  ) {
    errors.phone = "That phone number doesn't look right.";
  }

  const message = (raw.message ?? "").trim();
  if (!message) {
    errors.message = "Write a message before reviewing.";
  } else if (message.length > MESSAGE_MAX) {
    errors.message = "That message is too long.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, value: { phone, message } };
}

/**
 * A prepared reminder — inert data. It is NOT a sent message and carries no
 * "sent" state. `requiresExplicitConfirmation` is always true: it encodes the
 * hard product rule that a human must explicitly confirm every dispatch. There
 * is no function in this module that sends a draft.
 */
export type ReminderDraft = {
  to: string;
  message: string;
  requiresExplicitConfirmation: true;
};

/** Build the inert reminder draft from a validated reminder. */
export function buildReminderDraft(v: ValidatedReminder): ReminderDraft {
  return {
    to: v.phone,
    message: v.message,
    requiresExplicitConfirmation: true,
  };
}
