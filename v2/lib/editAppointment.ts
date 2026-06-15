import {
  BOOKING_LOCATIONS,
  type BookingLocation,
  SERVICE_TYPES,
  type ServiceType,
} from "./booking";
import {
  isPaymentMethod,
  isPaymentStatus,
  withPaymentInfo,
  type PaymentMethod,
  type PaymentStatus,
} from "./payments";
import {
  validateSalonPayoutOverrideInput,
  withSalonPayoutOverride,
} from "./payoutOverride";
import { applyOperatorName } from "./operatorIdentity";

export type EditAppointmentInput = {
  client_id: string;
  appointment_id: string;
  date: string;
  time_slot: string;
  service_type: string;
  location: string;
  fee: string;
  tip: string;
  payment_method: string;
  payment_status: string;
  notes: string;
  salon_payout_override?: string;
  send_booking_update_text: string;
  booking_update_message: string;
};

/**
 * Model context for validation. Default (batched) keeps the gina/annette enum and
 * the exact behavior the batched callers rely on. For a one_to_one org the location
 * is validated against the org's OWN location names (server-supplied), never the
 * enum — this is what lets the SHARED edit surface serve both models, universal-first.
 */
export type EditAppointmentModelContext = {
  schedulingStyle?: "batched" | "one_to_one";
  orgLocations?: string[];
};

export type ValidatedEditAppointment = {
  client_id: string;
  appointment_id: string;
  date: string;
  time_slot: string | null;
  service_type: ServiceType | null;
  // string (not just BookingLocation) so a one_to_one org's own location name
  // round-trips through the shared validator.
  location: string | null;
  fee: number | null;
  tip: number | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  notes: string | null;
  salon_payout_override?: number | null;
};

export type EditAppointmentErrors = Partial<
  Record<keyof EditAppointmentInput, string>
>;

export type EditAppointmentValidationResult =
  | { ok: true; value: ValidatedEditAppointment }
  | { ok: false; errors: EditAppointmentErrors };

export type EditAppointmentUpdate = {
  date: string;
  time_slot: string | null;
  service_type: ServiceType | null;
  location: string | null;
  fee: number | null;
  tip: number | null;
  net: number | null;
  notes: string | null;
};

export type AppointmentDeleteKind = "future_booking" | "past_visit" | "disabled";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_SLOT_MAX = 40;
const NOTES_MAX = 1000;
const CANCELLATION_MESSAGE_MAX = 480;
const BOOKING_UPDATE_MESSAGE_MAX = 480;

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

function parseMoney(
  raw: string | undefined,
  field: "fee" | "tip",
  errors: EditAppointmentErrors,
): number | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) {
    errors[field] = `${field === "fee" ? "Fee" : "Tip"} must be a number that isn't negative.`;
    return null;
  }
  return n;
}

export function validateEditAppointment(
  raw: Partial<EditAppointmentInput>,
  today: Date = new Date(),
  context: EditAppointmentModelContext = {},
): EditAppointmentValidationResult {
  const errors: EditAppointmentErrors = {};
  const schedulingStyle = context.schedulingStyle ?? "batched";

  const client_id = (raw.client_id ?? "").trim();
  const appointment_id = (raw.appointment_id ?? "").trim();
  if (!client_id) errors.client_id = "Missing client.";
  if (!appointment_id) errors.appointment_id = "Choose a visit.";

  const date = (raw.date ?? "").trim();
  if (!date) {
    errors.date = "Choose a date.";
  } else if (
    !ISO_DATE.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00`))
  ) {
    errors.date = "That date isn't valid.";
  } else if (
    date < shiftYearISO(today, -5) ||
    date > shiftYearISO(today, 2)
  ) {
    errors.date = "That date looks too far off - check the year.";
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
  let location: string | null = null;
  if (locationRaw) {
    if (schedulingStyle === "one_to_one") {
      const allowed = (context.orgLocations ?? []).map((name) =>
        name.trim().toLowerCase(),
      );
      if (allowed.includes(locationRaw.toLowerCase())) {
        location = locationRaw; // preserve the operator's casing
      } else {
        errors.location = "Choose one of your locations.";
      }
    } else if ((BOOKING_LOCATIONS as readonly string[]).includes(locationRaw)) {
      location = locationRaw as BookingLocation;
    } else {
      errors.location = "Choose Gina's or Annette's.";
    }
  }

  const fee = parseMoney(raw.fee, "fee", errors);
  const tip = parseMoney(raw.tip, "tip", errors);

  const paymentMethodRaw = (raw.payment_method ?? "cash").trim() || "cash";
  let payment_method: PaymentMethod = "cash";
  if (!isPaymentMethod(paymentMethodRaw)) {
    errors.payment_method = "Choose cash, Interac, or other.";
  } else {
    payment_method = paymentMethodRaw;
  }

  const paymentStatusRaw = (raw.payment_status ?? "paid").trim() || "paid";
  let payment_status: PaymentStatus = "paid";
  if (!isPaymentStatus(paymentStatusRaw)) {
    errors.payment_status = "Choose paid or waiting on payment.";
  } else {
    payment_status = paymentStatusRaw;
  }

  const time_slot = optionalText(raw.time_slot);
  if (time_slot && time_slot.length > TIME_SLOT_MAX) {
    errors.time_slot = "That time is too long.";
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
      appointment_id,
      date,
      time_slot,
      service_type,
      location,
      fee,
      tip,
      payment_method,
      payment_status,
      notes,
      salon_payout_override: payoutOverride.ok ? payoutOverride.value : null,
    },
  };
}

export function buildEditAppointmentUpdate(
  v: ValidatedEditAppointment,
): EditAppointmentUpdate {
  const total = (v.fee ?? 0) + (v.tip ?? 0);
  return {
    date: v.date,
    time_slot: v.time_slot,
    service_type: v.service_type,
    location: v.location,
    fee: v.fee,
    tip: v.tip,
    net: v.payment_status === "paid" ? total : null,
    notes: withPaymentInfo(
      withSalonPayoutOverride(v.notes, v.salon_payout_override ?? null),
      {
        method: v.payment_method,
        status: v.payment_status,
      },
    ),
  };
}

export function buildSharedAppointmentGroupUpdate(
  v: ValidatedEditAppointment,
): Pick<EditAppointmentUpdate, "date" | "time_slot" | "location"> {
  return {
    date: v.date,
    time_slot: v.time_slot,
    location: v.location,
  };
}

export function buildSharedAppointmentGroupRowUpdate(
  v: ValidatedEditAppointment,
  existing: Pick<{
    price: number | null;
    tip: number | null;
    notes: string | null;
  }, "price" | "tip" | "notes">,
): Pick<
  EditAppointmentUpdate,
  "date" | "time_slot" | "location" | "net" | "notes"
> {
  const total = (existing.price ?? 0) + (existing.tip ?? 0);
  return {
    ...buildSharedAppointmentGroupUpdate(v),
    net: v.payment_status === "paid" ? total : null,
    notes: withPaymentInfo(existing.notes, {
      method: v.payment_method,
      status: v.payment_status,
    }),
  };
}

export function appointmentDeleteKind({
  status,
  date,
  today,
}: {
  status: string | null | undefined;
  date: string;
  today: string;
}): AppointmentDeleteKind {
  if (status === "booked") return date >= today ? "future_booking" : "past_visit";
  if (status === "completed") return "past_visit";
  return "disabled";
}

/**
 * Resolve a single appointment by pet + date (+ time to disambiguate), the way
 * the agent layer identifies a visit WITHOUT ever handling a raw appointment id.
 *
 * This is the ONE resolver used by BOTH the propose tool (to build the confirm
 * card and disambiguate up front) and the confirm action (to re-resolve the
 * authoritative id server-side before the write). Sharing it is what makes
 * "a same-day duplicate disambiguates instead of writing the wrong visit" true
 * by construction — the two paths cannot drift. It matches RAW on
 * client_id + pet_id + date (never the display-grouped history, which can carry
 * a sibling-duplicate pet's row under a different pet_id that the id re-resolve
 * would then miss); time_slot is compared by exact trimmed string.
 *
 * Pure (no IO) so it is safe to import from the agent path and from client code.
 */
export type AppointmentMatchRow = {
  id: string;
  client_id: string;
  pet_id: string;
  date: string;
  time_slot: string | null;
};

export type AppointmentMatchResult<T> =
  | { kind: "found"; appointment: T }
  | { kind: "none" }
  | { kind: "ambiguous"; times: string[] };

/** Display label for a row's time in a disambiguation prompt (never empty). */
function timeSlotLabel(timeSlot: string | null): string {
  const t = (timeSlot ?? "").trim();
  return t === "" ? "(no time set)" : t;
}

export function findAppointmentByPetDate<T extends AppointmentMatchRow>(
  appointments: readonly T[],
  // `petId` accepts a SET so a split-duplicate pet (Chloe/Chloe) resolves a visit
  // filed under EITHER row — the same grouping the read screens use — instead of
  // missing one filed under the non-canonical id.
  criteria: { clientId: string; petId: string | readonly string[]; date: string; timeSlot?: string | null },
): AppointmentMatchResult<T> {
  const petIds = Array.isArray(criteria.petId) ? criteria.petId : [criteria.petId];
  const candidates = appointments.filter(
    (a) =>
      a.client_id === criteria.clientId &&
      petIds.includes(a.pet_id) &&
      a.date === criteria.date,
  );
  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length === 1) return { kind: "found", appointment: candidates[0] };

  // More than one visit for this pet on this date — only a time can break the
  // tie. Compare on the exact stored string so the model can echo it back.
  const wantTime = (criteria.timeSlot ?? "").trim();
  if (wantTime !== "") {
    const narrowed = candidates.filter(
      (a) => (a.time_slot ?? "").trim() === wantTime,
    );
    if (narrowed.length === 1) return { kind: "found", appointment: narrowed[0] };
  }

  // No time, a time that matches none, or a time shared by two rows: refuse and
  // surface the distinct stored times so the caller asks which — never a guess.
  const times = Array.from(
    new Set(candidates.map((a) => timeSlotLabel(a.time_slot))),
  ).sort();
  return { kind: "ambiguous", times };
}

/**
 * A no-show is a status transition that KEEPS the record. Only a still-`booked`
 * appointment can become a no-show: a completed groom is a logged business
 * record (edit/void it instead), and a cancellation or an existing no-show is
 * already an exception. Mirrors how the workflow controls refuse exception rows.
 */
export function canMarkAppointmentNoShow(
  status: string | null | undefined,
): boolean {
  return status === "booked";
}

export function shouldBlockAppointmentDeleteForCalendarStatus(
  status: string,
): boolean {
  const blockingStatuses = new Set<string>();
  return blockingStatuses.has(status);
}

export function buildCancellationTextMessage({
  ownerFirstName,
  petName,
  date,
  time,
  operatorName,
}: {
  ownerFirstName: string | null;
  petName: string;
  date: string;
  time: string | null;
  operatorName: string;
}): string {
  const who = ownerFirstName?.trim() || "there";
  const when = time ? `${date} at ${time}` : date;
  return applyOperatorName(
    `Hi ${who}, ${petName}'s Tidy Tails appointment on ${when} has been cancelled. - [your name]`,
    operatorName,
  );
}

export function buildBookingUpdateTextMessage({
  ownerFirstName,
  petName,
  date,
  time,
  service,
  location,
  operatorName,
}: {
  ownerFirstName: string | null;
  petName: string;
  date: string;
  time: string | null;
  service: string | null;
  location: string | null;
  operatorName: string;
}): string {
  const who = ownerFirstName?.trim() || "there";
  const serviceText = service?.trim() || "Grooming";
  const when = time ? `${date} at ${time}` : date;
  const where = location?.trim() ? ` at ${location.trim()}` : "";
  return applyOperatorName(
    `Hi ${who}, updated booking for ${petName}: ${serviceText} on ${when}${where}. See you then! - [your name]`,
    operatorName,
  );
}

export function validateBookingUpdateTextInput(
  raw: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const message = raw.trim();
  if (!message) {
    return { ok: false, message: "Write a booking update text before sending." };
  }
  if (message.length > BOOKING_UPDATE_MESSAGE_MAX) {
    return { ok: false, message: "That booking update text is too long." };
  }
  return { ok: true, value: message };
}

export function validateCancellationTextInput(
  raw: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const message = raw.trim();
  if (!message) {
    return { ok: false, message: "Write a cancellation text before sending." };
  }
  if (message.length > CANCELLATION_MESSAGE_MAX) {
    return { ok: false, message: "That cancellation text is too long." };
  }
  return { ok: true, value: message };
}

export type CancellationTextDraft = {
  message: string;
  requiresExplicitConfirmation: true;
};

export function buildCancellationTextDraft(message: string): CancellationTextDraft {
  return {
    message,
    requiresExplicitConfirmation: true,
  };
}
