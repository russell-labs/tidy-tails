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

export type ValidatedEditAppointment = {
  client_id: string;
  appointment_id: string;
  date: string;
  time_slot: string | null;
  service_type: ServiceType | null;
  location: BookingLocation | null;
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
  location: BookingLocation | null;
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
): EditAppointmentValidationResult {
  const errors: EditAppointmentErrors = {};

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
  let location: BookingLocation | null = null;
  if (locationRaw) {
    if ((BOOKING_LOCATIONS as readonly string[]).includes(locationRaw)) {
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
}: {
  ownerFirstName: string | null;
  petName: string;
  date: string;
  time: string | null;
}): string {
  const who = ownerFirstName?.trim() || "there";
  const when = time ? `${date} at ${time}` : date;
  return `Hi ${who}, ${petName}'s Tidy Tails appointment on ${when} has been cancelled. - Samantha`;
}

export function buildBookingUpdateTextMessage({
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
  const serviceText = service?.trim() || "Grooming";
  const when = time ? `${date} at ${time}` : date;
  const where = location?.trim() ? ` at ${location.trim()}` : "";
  return `Hi ${who}, updated booking for ${petName}: ${serviceText} on ${when}${where}. See you then! - Samantha`;
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
