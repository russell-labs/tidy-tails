import {
  BOOKING_LOCATIONS,
  type BookingLocation,
  SERVICE_TYPES,
  type ServiceType,
} from "./booking";

export type EditAppointmentInput = {
  client_id: string;
  appointment_id: string;
  date: string;
  time_slot: string;
  service_type: string;
  location: string;
  fee: string;
  tip: string;
  notes: string;
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
  notes: string | null;
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
  notes: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_SLOT_MAX = 40;
const NOTES_MAX = 1000;

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

  const time_slot = optionalText(raw.time_slot);
  if (time_slot && time_slot.length > TIME_SLOT_MAX) {
    errors.time_slot = "That time is too long.";
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
      appointment_id,
      date,
      time_slot,
      service_type,
      location,
      fee,
      tip,
      notes,
    },
  };
}

export function buildEditAppointmentUpdate(
  v: ValidatedEditAppointment,
): EditAppointmentUpdate {
  return {
    date: v.date,
    time_slot: v.time_slot,
    service_type: v.service_type,
    location: v.location,
    fee: v.fee,
    tip: v.tip,
    notes: v.notes,
  };
}
