// Pure logic for the M2 "Add appointment" booking flow:
//   - validateBookingInput — raw form input → a validated booking or errors
//   - findOwnedPet — pet/client ownership check
//   - buildAppointmentInsert — the appointments INSERT payload + null policy
//
// Pure: no I/O, no Supabase, no React. The server action
// (lib/actions/appointments.ts) composes these; the booking sheet
// (components/AddAppointment.tsx) reuses the validator client-side for the
// review step — one validator, both paths. Unit-tested in booking.test.ts.

import type { Appointment, Pet } from "./data/types";

// The four CHECK-constrained service_type enum codes in the live schema.
export const SERVICE_TYPES = [
  "full_groom",
  "bath_only",
  "nail_trim",
  "other",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

// The live appointments.location CHECK constraint currently allows these two
// physical shop locations. Work-context / payout modeling is a separate schema
// step; this value is what customers should see in calendar invites and texts.
export const BOOKING_LOCATIONS = ["gina", "annette"] as const;
export type BookingLocation = (typeof BOOKING_LOCATIONS)[number];

export const BOOKING_LOCATION_LABELS: Record<BookingLocation, string> = {
  gina: "Tidy Tails (Gina)",
  annette: "Tidy Tails (Annette)",
};

export const CUSTOMER_BOOKING_LOCATION_LABELS: Record<BookingLocation, string> = {
  gina: "60 Olive Crescent, Orillia",
  annette: "290 Millard Street, Orillia",
};

export function bookingLocationLabel(
  location: BookingLocation | string | null | undefined,
): string | null {
  if (!location) return null;
  return BOOKING_LOCATION_LABELS[location as BookingLocation] ?? null;
}

export function customerBookingLocationLabel(
  location: BookingLocation | string | null | undefined,
): string | null {
  if (!location) return null;
  return CUSTOMER_BOOKING_LOCATION_LABELS[location as BookingLocation] ?? null;
}

// First-pass day-book slots. This is not external calendar sync; it makes the
// booking sheet calendar-aware against appointments already stored in Tidy
// Tails, so Sam can tap an open slot instead of typing from a blank field.
export const BOOKING_TIME_SLOTS = [
  "9:00am",
  "10:30am",
  "12:00pm",
  "1:30pm",
  "3:00pm",
] as const;

export type BookingTimeSlot = {
  time: string;
  available: boolean;
};

// Raw booking form input — every field arrives as a string (or absent).
export type BookingInput = {
  client_id: string;
  pet_id: string;
  date: string;
  time_slot: string;
  service_type: string;
  location: string;
  send_invite: string;
  customer_email: string;
  send_booking_text: string;
  booking_message: string;
  save_reminder_phone: string;
  customer_phone: string;
  fee: string;
  notes: string;
};

// A validated booking — optionals normalized to value-or-null.
export type ValidatedBooking = {
  client_id: string;
  pet_id: string;
  date: string;
  time_slot: string;
  service_type: ServiceType | null;
  location: BookingLocation | null;
  send_invite: boolean;
  customer_email: string | null;
  send_booking_text: boolean;
  booking_message: string | null;
  save_reminder_phone: boolean;
  customer_phone: string | null;
  fee: number | null;
  notes: string | null;
};

export type BookingErrors = Partial<Record<keyof BookingInput, string>>;

export type ValidationResult =
  | { ok: true; value: ValidatedBooking }
  | { ok: false; errors: BookingErrors };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_SLOT_MAX = 40;
const NOTES_MAX = 1000;
export const BOOKING_MESSAGE_MAX = 480;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftYearISO(d: Date, years: number): string {
  const c = new Date(d);
  c.setFullYear(c.getFullYear() + years);
  return toISO(c);
}

function optionalText(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

function isChecked(v: string | undefined): boolean {
  return ["on", "true", "1", "yes"].includes((v ?? "").trim().toLowerCase());
}

export function normalizeTimeForCompare(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\./g, "");
}

export function hasBookedTimeConflict(
  appointments: Appointment[],
  date: string,
  timeSlot: string | null | undefined,
): boolean {
  const key = normalizeTimeForCompare(timeSlot);
  if (!key) return false;
  return bookedTimesForDate(appointments, date)
    .map(normalizeTimeForCompare)
    .includes(key);
}

export function bookedTimesForDate(
  appointments: Appointment[],
  date: string,
): string[] {
  const seen = new Set<string>();
  const booked: string[] = [];
  for (const appointment of appointments) {
    if (appointment.date !== date || !appointment.time_slot) continue;
    const key = normalizeTimeForCompare(appointment.time_slot);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    booked.push(appointment.time_slot);
  }
  return booked;
}

export function availableBookingTimeSlots(
  appointments: Appointment[],
  date: string,
): BookingTimeSlot[] {
  const booked = new Set(
    bookedTimesForDate(appointments, date).map(normalizeTimeForCompare),
  );
  return BOOKING_TIME_SLOTS.map((time) => ({
    time,
    available: !booked.has(normalizeTimeForCompare(time)),
  }));
}

/**
 * Validate raw booking form input. `today` is injected so the date sanity
 * bounds are deterministic in tests. The date is required and bounded to one
 * year back / two years forward of today — a typo guard against a wrong year,
 * not a business rule. A time is required so new bookings are actionable in the
 * day book; service/fee/notes remain optional, normalized to value-or-null.
 */
export function validateBookingInput(
  raw: Partial<BookingInput>,
  today: Date = new Date(),
): ValidationResult {
  const errors: BookingErrors = {};

  const client_id = (raw.client_id ?? "").trim();
  const pet_id = (raw.pet_id ?? "").trim();
  if (!client_id) errors.client_id = "Missing client.";
  if (!pet_id) errors.pet_id = "Choose a pet.";

  const date = (raw.date ?? "").trim();
  if (!date) {
    errors.date = "Choose a date.";
  } else if (
    !ISO_DATE.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00`))
  ) {
    errors.date = "That date isn't valid.";
  } else if (
    date < shiftYearISO(today, -1) ||
    date > shiftYearISO(today, 2)
  ) {
    errors.date = "That date looks too far off — check the year.";
  }

  const time_slot = (raw.time_slot ?? "").trim();
  if (!time_slot) {
    errors.time_slot = "Choose a drop-off time.";
  } else if (time_slot.length > TIME_SLOT_MAX) {
    errors.time_slot = "That drop-off time is too long.";
  }

  const serviceRaw = (raw.service_type ?? "").trim();
  let service_type: ServiceType | null = null;
  if (serviceRaw) {
    if ((SERVICE_TYPES as readonly string[]).includes(serviceRaw)) {
      service_type = serviceRaw as ServiceType;
    } else {
      errors.service_type = "Pick a service from the list.";
    }
  }

  const locationRaw = (raw.location ?? "").trim();
  let location: BookingLocation | null = null;
  if (locationRaw) {
    if ((BOOKING_LOCATIONS as readonly string[]).includes(locationRaw)) {
      location = locationRaw as BookingLocation;
    } else {
      errors.location = "Choose Gina's or Annette's.";
    }
  }

  const send_invite = isChecked(raw.send_invite);
  const customer_email = optionalText(raw.customer_email);
  if (send_invite) {
    if (!customer_email) {
      errors.customer_email = "Enter the owner's email for the invite.";
    } else if (!EMAIL_RE.test(customer_email)) {
      errors.customer_email = "That email doesn't look right.";
    }
  } else if (customer_email && !EMAIL_RE.test(customer_email)) {
    errors.customer_email = "That email doesn't look right.";
  }

  const send_booking_text = isChecked(raw.send_booking_text);
  const booking_message = optionalText(raw.booking_message);
  if (send_booking_text) {
    if (!booking_message) {
      errors.booking_message = "Write the booking text before sending.";
    } else if (booking_message.length > BOOKING_MESSAGE_MAX) {
      errors.booking_message = `Keep the booking text under ${BOOKING_MESSAGE_MAX} characters.`;
    }
  } else if (booking_message && booking_message.length > BOOKING_MESSAGE_MAX) {
    errors.booking_message = `Keep the booking text under ${BOOKING_MESSAGE_MAX} characters.`;
  }

  const save_reminder_phone = isChecked(raw.save_reminder_phone);
  const customer_phone = optionalText(raw.customer_phone);
  if (send_booking_text || save_reminder_phone) {
    const phoneDigits = digitsOnly(customer_phone ?? "");
    if (
      !(
        phoneDigits.length === 10 ||
        (phoneDigits.length === 11 && phoneDigits.startsWith("1"))
      )
    ) {
      errors.customer_phone = "Enter a 10-digit phone number for texts.";
    }
  }

  const feeRaw = (raw.fee ?? "").trim();
  let fee: number | null = null;
  if (feeRaw) {
    const n = Number(feeRaw);
    if (!Number.isFinite(n) || n < 0) {
      errors.fee = "Fee must be a number that isn't negative.";
    } else {
      fee = n;
    }
  }

  const notes = optionalText(raw.notes);
  if (notes && notes.length > NOTES_MAX) {
    errors.notes = "Those notes are too long.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      client_id,
      pet_id,
      date,
      time_slot,
      service_type,
      location,
      send_invite,
      customer_email,
      send_booking_text,
      booking_message: send_booking_text ? booking_message : null,
      save_reminder_phone,
      customer_phone,
      fee,
      notes,
    },
  };
}

/**
 * The pet — only if it appears in `pets` and is owned by `clientId`. The
 * appointments table has no constraint tying a pet to its client, so the
 * server action must run this before any insert: never link an appointment to
 * a pet the chosen client does not own.
 */
export function findOwnedPet(
  pets: Pet[],
  petId: string,
  clientId: string,
): Pet | null {
  const pet = pets.find((p) => p.id === petId);
  if (!pet) return null;
  return pet.client_id === clientId ? pet : null;
}

// The appointments INSERT payload — only the columns M2 owns.
export type AppointmentInsert = {
  client_id: string;
  pet_id: string;
  date: string;
  time_slot: string | null;
  service_type: ServiceType | null;
  location: BookingLocation | null;
  fee: number | null;
  notes: string | null;
  status: "booked";
};

/**
 * Build the appointments INSERT payload from a validated booking. Sets only
 * the columns M2 owns; `id`, `created_at`, `tip`, `rent_paid` take their DB
 * defaults, and `net` is deliberately left unset (NULL) — unknown at booking
 * time, never fabricated (the Phase 3.5 conservative-NULL policy).
 * `send_invite` is an action side effect flag, not a database column.
 */
export function buildAppointmentInsert(b: ValidatedBooking): AppointmentInsert {
  return {
    client_id: b.client_id,
    pet_id: b.pet_id,
    date: b.date,
    time_slot: b.time_slot,
    service_type: b.service_type,
    location: b.location,
    fee: b.fee,
    notes: b.notes,
    status: "booked",
  };
}

export function buildBookingTextMessage({
  ownerFirstName,
  petName,
  date,
  time,
  service,
  location,
}: {
  ownerFirstName: string | null;
  petName: string;
  date: string;
  time: string | null;
  service: string | null;
  location: string | null;
}): string {
  const who = ownerFirstName?.trim() || "there";
  const when = time ? `${date} at ${time}` : date;
  const servicePart = service ? ` for ${service.toLowerCase()}` : "";
  const locationPart = location ? ` at ${location}` : "";
  return `Hi ${who}, ${petName} is booked${servicePart} on ${when}${locationPart}. See you then! — Samantha`;
}

export function renderBookingMessageTemplate(
  template: string,
  vars: {
    ownerFirstName: string | null;
    petName: string;
    date: string;
    time: string | null;
    service: string | null;
    location: string | null;
  },
): string {
  return template
    .replace(/\[first name\]/gi, vars.ownerFirstName?.trim() || "there")
    .replace(/\[pet name\]/gi, vars.petName)
    .replace(/\[date\]/gi, vars.date)
    .replace(/\[time\]/gi, vars.time || "the scheduled time")
    .replace(/\[service\]/gi, vars.service ?? "grooming")
    .replace(/\[location\]/gi, vars.location ?? "the grooming location")
    .trim();
}
