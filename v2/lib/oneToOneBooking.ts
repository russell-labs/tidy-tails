// Pure validation + payload for the one_to_one (1:1) booking flow (WS4a).
//
// One dog per block. Unlike the batched booking (lib/booking.ts), this captures a
// duration and a free-text location (validated against the org's own locations
// server-side, not the hardcoded gina/annette enum), and it carries no
// SMS/invite machinery — reminders for the 1:1 persona are WS4d. Pure: no I/O,
// no React; the server action (lib/actions/oneToOneBooking.ts) composes it and
// the booking sheet reuses the validator for its review step.

import type { ServiceType } from "./booking";

// The services the live appointments.service_type CHECK actually accepts
// (full_groom / bath_only / nail_trim / other) — note SERVICE_TYPES also lists
// 'puppy_groom', which the DB rejects. The 1:1 picker and this validator offer
// only the persistable set so a booking never fails the CHECK on insert.
export const ONE_TO_ONE_SERVICE_TYPES = [
  "full_groom",
  "bath_only",
  "nail_trim",
  "other",
] as const satisfies readonly ServiceType[];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOTES_MAX = 1000;
const LOCATION_MAX = 64;
const TIME_SLOT_MAX = 40;
const MIN_DURATION = 5;
const MAX_DURATION = 600;

export type OneToOneBookingInput = {
  client_id: string;
  pet_id: string;
  date: string;
  time_slot: string;
  service_type: string;
  location: string;
  duration_minutes: string;
  fee: string;
  notes: string;
};

export type ValidatedOneToOneBooking = {
  client_id: string;
  pet_id: string;
  date: string;
  time_slot: string;
  service_type: ServiceType;
  location: string;
  duration_minutes: number;
  fee: number | null;
  notes: string | null;
};

export type OneToOneBookingErrors = Partial<
  Record<keyof OneToOneBookingInput, string>
>;

export type OneToOneValidationResult =
  | { ok: true; value: ValidatedOneToOneBooking }
  | { ok: false; errors: OneToOneBookingErrors };

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

export function validateOneToOneBooking(
  raw: Partial<OneToOneBookingInput>,
  today: Date = new Date(),
): OneToOneValidationResult {
  const errors: OneToOneBookingErrors = {};

  const client_id = (raw.client_id ?? "").trim();
  const pet_id = (raw.pet_id ?? "").trim();
  if (!client_id) errors.client_id = "Missing client.";
  if (!pet_id) errors.pet_id = "Choose a dog.";

  const date = (raw.date ?? "").trim();
  if (!date) {
    errors.date = "Choose a date.";
  } else if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) {
    errors.date = "That date isn't valid.";
  } else if (date < shiftYearISO(today, -1) || date > shiftYearISO(today, 2)) {
    errors.date = "That date looks too far off — check the year.";
  }

  const time_slot = (raw.time_slot ?? "").trim();
  if (!time_slot) {
    errors.time_slot = "Choose a start time.";
  } else if (time_slot.length > TIME_SLOT_MAX) {
    errors.time_slot = "That start time is too long.";
  }

  const serviceRaw = (raw.service_type ?? "").trim();
  let service_type: ServiceType | null = null;
  if (!serviceRaw) {
    errors.service_type = "Pick a service.";
  } else if ((ONE_TO_ONE_SERVICE_TYPES as readonly string[]).includes(serviceRaw)) {
    service_type = serviceRaw as ServiceType;
  } else {
    errors.service_type = "Pick a service from the list.";
  }

  const location = (raw.location ?? "").trim();
  if (!location) {
    errors.location = "Choose a location.";
  } else if (location.length > LOCATION_MAX) {
    errors.location = "That location name is too long.";
  }

  const durationRaw = (raw.duration_minutes ?? "").trim();
  const duration = Number(durationRaw);
  let duration_minutes = 0;
  if (!durationRaw) {
    errors.duration_minutes = "Choose how long this booking runs.";
  } else if (
    !Number.isFinite(duration) ||
    !Number.isInteger(duration) ||
    duration < MIN_DURATION ||
    duration > MAX_DURATION
  ) {
    errors.duration_minutes = `Length must be ${MIN_DURATION}–${MAX_DURATION} minutes.`;
  } else {
    duration_minutes = duration;
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
      service_type: service_type as ServiceType,
      location,
      duration_minutes,
      fee,
      notes,
    },
  };
}

export type OneToOneAppointmentInsert = {
  client_id: string;
  pet_id: string;
  date: string;
  time_slot: string;
  service_type: ServiceType;
  location: string;
  duration_minutes: number;
  fee: number | null;
  notes: string | null;
  status: "booked";
};

export function buildOneToOneAppointmentInsert(
  b: ValidatedOneToOneBooking,
): OneToOneAppointmentInsert {
  return {
    client_id: b.client_id,
    pet_id: b.pet_id,
    date: b.date,
    time_slot: b.time_slot,
    service_type: b.service_type,
    location: b.location,
    duration_minutes: b.duration_minutes,
    fee: b.fee,
    notes: b.notes,
    status: "booked",
  };
}
