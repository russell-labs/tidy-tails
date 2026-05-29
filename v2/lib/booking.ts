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
import {
  validateSalonPayoutOverrideInput,
  withSalonPayoutOverride,
} from "./payoutOverride";

// The CHECK-constrained service_type enum codes in the live schema.
export const SERVICE_TYPES = [
  "full_groom",
  "puppy_groom",
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

// Tappable drop-off suggestions. Calendar events only block a 15-minute
// drop-off window, so the tiles use the same cadence. Sam can still type later
// times manually; the tiles deliberately stop at noon to keep the day book
// biased toward morning staggered drop-offs.
export const BOOKING_TIME_SLOTS = buildMorningDropOffSlots();

export type BookingTimeSlot = {
  time: string;
  available: boolean;
};

// Raw booking form input — every field arrives as a string (or absent).
export type BookingInput = {
  client_id: string;
  pet_id: string;
  pet_ids: string;
  pet_services: string;
  pet_fees: string;
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
  salon_payout_override?: string;
};

// A validated booking — optionals normalized to value-or-null.
export type ValidatedBooking = {
  client_id: string;
  pet_id: string;
  pet_ids: string[];
  pet_bookings: PetBooking[];
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
  salon_payout_override?: number | null;
};

export type PetBooking = {
  pet_id: string;
  service_type: ServiceType | null;
  fee: number | null;
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

function formatSlotTime(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? "pm" : "am";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${pad(minutes)}${suffix}`;
}

function buildMorningDropOffSlots(): string[] {
  const slots: string[] = [];
  for (let minutes = 9 * 60; minutes <= 12 * 60; minutes += 15) {
    slots.push(formatSlotTime(minutes));
  }
  return slots;
}

function parsePetIds(raw: Partial<BookingInput>): string[] {
  const multi = (raw.pet_ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const ids = multi.length > 0 ? multi : [(raw.pet_id ?? "").trim()].filter(Boolean);
  return Array.from(new Set(ids));
}

function parsePetFieldMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]),
    );
  } catch {
    return {};
  }
}

function parseFee(rawFee: string): { value: number | null; error?: string } {
  const feeRaw = rawFee.trim();
  if (!feeRaw) return { value: null };
  const n = Number(feeRaw);
  if (!Number.isFinite(n) || n < 0) {
    return {
      value: null,
      error: "Fee must be a number that isn't negative.",
    };
  }
  return { value: n };
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
  options: { clientId?: string; selectedPetIds?: string[] } = {},
): boolean {
  const key = normalizeTimeForCompare(timeSlot);
  if (!key) return false;
  const selected = new Set(options.selectedPetIds ?? []);
  return appointments.some((appointment) => {
    if (appointment.date !== date) return false;
    if (normalizeTimeForCompare(appointment.time_slot) !== key) return false;
    if (
      options.clientId &&
      appointment.client_id === options.clientId &&
      !selected.has(appointment.pet_id)
    ) {
      return false;
    }
    return true;
  });
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

export function googleAvailabilityBlocksBooking(status: string): boolean {
  return status === "busy";
}

/**
 * Validate raw booking form input. `today` is injected so the date sanity
 * bounds are deterministic in tests. The date is required and bounded to one
 * year back / two years forward of today — a typo guard against a wrong year,
 * not a business rule. A time is required so new bookings are actionable in the
 * day book. A service is required so the schedule, reminders, and groom log
 * never carry ambiguous "Service not set" work into Sam's day.
 */
export function validateBookingInput(
  raw: Partial<BookingInput>,
  today: Date = new Date(),
): ValidationResult {
  const errors: BookingErrors = {};

  const client_id = (raw.client_id ?? "").trim();
  const pet_ids = parsePetIds(raw);
  const pet_id = pet_ids[0] ?? "";
  if (!client_id) errors.client_id = "Missing client.";
  if (pet_ids.length === 0) errors.pet_id = "Choose at least one pet.";

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
  } else {
    errors.service_type = "Pick a service.";
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

  const globalFee = parseFee(raw.fee ?? "");
  if (globalFee.error) errors.fee = globalFee.error;
  const fee = globalFee.value;
  const petServices = parsePetFieldMap(raw.pet_services);
  const petFees = parsePetFieldMap(raw.pet_fees);
  const pet_bookings: PetBooking[] = [];
  for (const selectedPetId of pet_ids) {
    const perPetServiceRaw = (petServices[selectedPetId] ?? "").trim();
    let perPetService = service_type;
    if (perPetServiceRaw) {
      if ((SERVICE_TYPES as readonly string[]).includes(perPetServiceRaw)) {
        perPetService = perPetServiceRaw as ServiceType;
      } else {
        errors.service_type = "Pick a service from the list.";
      }
    }
    if (!perPetService) errors.service_type = "Pick a service.";
    const perPetFeeRaw = petFees[selectedPetId] ?? "";
    const perPetFee = perPetFeeRaw.trim() ? parseFee(perPetFeeRaw) : globalFee;
    if (perPetFee.error) errors.fee = perPetFee.error;
    pet_bookings.push({
      pet_id: selectedPetId,
      service_type: perPetService,
      fee: perPetFee.value,
    });
  }

  const notes = optionalText(raw.notes);
  if (notes && notes.length > NOTES_MAX) {
    errors.notes = "Those notes are too long.";
  }
  const payoutOverride = validateSalonPayoutOverrideInput(
    raw.salon_payout_override,
  );
  if (!payoutOverride.ok) {
    errors.salon_payout_override = payoutOverride.message;
  } else if (payoutOverride.value != null && !location) {
    errors.salon_payout_override =
      "Choose Gina's or Annette's before overriding salon payout.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      client_id,
      pet_id,
      pet_ids,
      pet_bookings,
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
      salon_payout_override: payoutOverride.ok ? payoutOverride.value : null,
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

export function findOwnedPets(
  pets: Pet[],
  petIds: string[],
  clientId: string,
): Pet[] | null {
  const owned = petIds.map((petId) => findOwnedPet(pets, petId, clientId));
  if (owned.some((pet) => pet == null)) return null;
  return owned as Pet[];
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
  return buildAppointmentInserts(b)[0];
}

export function buildAppointmentInserts(b: ValidatedBooking): AppointmentInsert[] {
  const petBookings =
    b.pet_bookings?.length > 0
      ? b.pet_bookings
      : [{ pet_id: b.pet_id, service_type: b.service_type, fee: b.fee }];
  return petBookings.map((petBooking) => ({
    client_id: b.client_id,
    pet_id: petBooking.pet_id,
    date: b.date,
    time_slot: b.time_slot,
    service_type: petBooking.service_type,
    location: b.location,
    fee: petBooking.fee,
    notes: withSalonPayoutOverride(
      b.notes,
      b.salon_payout_override ?? null,
    ),
    status: "booked",
  }));
}

export function formatPetNames(petNames: string[]): string {
  const names = petNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return "the dogs";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function totalBookingFee(payloads: AppointmentInsert[]): number | null {
  const fees = payloads.map((payload) => payload.fee).filter((fee) => fee != null);
  if (fees.length === 0) return null;
  return fees.reduce((sum, fee) => sum + fee, 0);
}

export type BookingMessageDraftKind =
  | "booking_confirmation"
  | "first_platform";

export function chooseBookingMessageDraft({
  bookingConfirmationTemplate,
}: {
  hasPriorAppointments: boolean;
  hasPriorOutboundSms: boolean;
  bookingConfirmationTemplate: string;
  firstPlatformTextTemplate: string;
}): { kind: BookingMessageDraftKind; template: string } {
  // Default to the plain confirmation. The first-platform intro remains
  // selectable in the review step, but auto-selecting it based on SMS history
  // is surprising when Sam books without sending a real owner text.
  return { kind: "booking_confirmation", template: bookingConfirmationTemplate };
}

function pluralVerbForPetName(petName: string): "is" | "are" {
  return /\band\b|,/.test(petName) ? "are" : "is";
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
  return `Hi ${who}, ${petName} ${pluralVerbForPetName(petName)} booked${servicePart} on ${when}${locationPart}. See you then! — Samantha`;
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
