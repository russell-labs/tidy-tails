// Pure logic for the Log Groom flow:
//   - validateGroomLog — raw form input → a validated completed groom or errors
//   - buildGroomInsert — the appointments INSERT payload for a completed groom
//
// A completed groom is a finished visit recorded after the fact, so its date is
// bounded to the past year through today — never the future. Pure: no I/O, no
// Supabase, no React. The service enum is reused from booking.ts (one
// definition); the server action (lib/actions/grooms.ts) composes these and
// reuses findOwnedPet for the ownership check. Unit-tested in groom.test.ts.

import { SERVICE_TYPES, type ServiceType } from "./booking";
import type { Appointment } from "./data/types";
import {
  isPaymentMethod,
  isPaymentStatus,
  withPaymentInfo,
  type PaymentMethod,
  type PaymentStatus,
} from "./payments";

// Raw Log Groom form input — every field arrives as a string (or absent).
export type GroomLogInput = {
  client_id: string;
  pet_id: string;
  date: string;
  service_type: string;
  fee: string;
  tip: string;
  payment_method: string;
  payment_status: string;
  notes: string;
};

// A validated completed groom — optionals normalized to value-or-null.
export type ValidatedGroomLog = {
  client_id: string;
  pet_id: string;
  date: string;
  service_type: ServiceType | null;
  fee: number | null;
  tip: number | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  notes: string | null;
};

export type GroomLogErrors = Partial<Record<keyof GroomLogInput, string>>;

export type GroomValidationResult =
  | { ok: true; value: ValidatedGroomLog }
  | { ok: false; errors: GroomLogErrors };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOTES_MAX = 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function oneYearBackISO(d: Date): string {
  const c = new Date(d);
  c.setFullYear(c.getFullYear() - 1);
  return toISO(c);
}

function optionalText(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/**
 * Validate raw Log Groom form input. `today` is injected so the date bounds are
 * deterministic in tests. A completed groom is a visit that already happened,
 * so the date is required and bounded to one year back through today — past or
 * today, never the future. Service / fee / notes are optional, normalized to
 * value-or-null (the conservative-NULL policy — never fabricate a value).
 */
export function validateGroomLog(
  raw: Partial<GroomLogInput>,
  today: Date = new Date(),
): GroomValidationResult {
  const errors: GroomLogErrors = {};

  const client_id = (raw.client_id ?? "").trim();
  const pet_id = (raw.pet_id ?? "").trim();
  if (!client_id) errors.client_id = "Missing client.";
  if (!pet_id) errors.pet_id = "Choose a pet.";

  const date = (raw.date ?? "").trim();
  if (!date) {
    errors.date = "Choose the groom date.";
  } else if (
    !ISO_DATE.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00`))
  ) {
    errors.date = "That date isn't valid.";
  } else if (date > toISO(today)) {
    errors.date = "A completed groom can't be dated in the future.";
  } else if (date < oneYearBackISO(today)) {
    errors.date = "That date looks too far back — check the year.";
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

  const tipRaw = (raw.tip ?? "").trim();
  let tip: number | null = null;
  if (tipRaw) {
    const n = Number(tipRaw);
    if (!Number.isFinite(n) || n < 0) {
      errors.tip = "Tip must be a number that isn't negative.";
    } else {
      tip = n;
    }
  }

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
      service_type,
      fee,
      tip,
      payment_method,
      payment_status,
      notes,
    },
  };
}

// The appointments INSERT payload for a completed groom — only the columns the
// Log Groom flow owns.
export type GroomInsert = {
  client_id: string;
  pet_id: string;
  date: string;
  service_type: ServiceType | null;
  fee: number | null;
  tip: number | null;
  net: number | null;
  notes: string | null;
  status: "completed";
};

/**
 * Build the appointments INSERT payload from a validated completed groom.
 * `status` is "completed" — this records a visit that already happened. `id`,
 * `created_at`, `rent_paid` take their DB defaults; `time_slot` / `location`
 * are deliberately left unset (NULL). `net` is computed only when the visit is
 * marked paid; waiting-on-payment rows stay NULL so they do not masquerade as
 * collected revenue.
 */
export function buildGroomInsert(g: ValidatedGroomLog): GroomInsert {
  const total = (g.fee ?? 0) + (g.tip ?? 0);
  return {
    client_id: g.client_id,
    pet_id: g.pet_id,
    date: g.date,
    service_type: g.service_type,
    fee: g.fee,
    tip: g.tip,
    net: g.payment_status === "paid" ? total : null,
    notes: withPaymentInfo(g.notes, {
      method: g.payment_method,
      status: g.payment_status,
    }),
    status: "completed",
  };
}

export function findBookedAppointmentForGroom(
  appointments: Appointment[],
  groom: Pick<ValidatedGroomLog, "client_id" | "pet_id" | "date">,
): Appointment | null {
  return (
    appointments.find(
      (appointment) =>
        appointment.client_id === groom.client_id &&
        appointment.pet_id === groom.pet_id &&
        appointment.date === groom.date &&
        appointment.status === "booked",
    ) ?? null
  );
}
