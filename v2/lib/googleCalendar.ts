import crypto from "crypto";
import type { Appointment, Client, Pet } from "./data/types";
import { formatMoney, fullName } from "./format";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export const GOOGLE_CALENDAR_TIME_ZONE = "America/Toronto";

export type GoogleCalendarStatus =
  | "disabled"
  | "not_connected"
  | "skipped"
  | "synced"
  | "failed";

export type GoogleCalendarSyncResult = {
  status: GoogleCalendarStatus;
  message: string;
  eventId?: string;
};

export type ParsedAppointmentTime = {
  hours: number;
  minutes: number;
};

export type CalendarEventWindow = {
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
};

export type CalendarEventInput = {
  appointment: Pick<
    Appointment,
    "date" | "time_slot" | "service" | "price" | "notes"
  >;
  client: Pick<Client, "first_name" | "last_name" | "phone">;
  pet: Pick<Pet, "name" | "breed" | "grooming_notes">;
};

export type GoogleCalendarEventPayload = {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

export type EncryptedToken = {
  ciphertext: string;
  iv: string;
  tag: string;
};

const TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i;
const SECRET_BYTES = 32;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function compact(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
}

export function parseAppointmentTime(
  raw: string | null | undefined,
): ParsedAppointmentTime | null {
  if (!raw) return null;
  const m = raw.trim().match(TIME_RE);
  if (!m) return null;

  let hours = Number(m[1]);
  const minutes = m[2] == null ? 0 : Number(m[2]);
  const meridiem = m[3] ? compact(m[3]) : null;

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (meridiem === "am") {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12) hours = 0;
  } else if (meridiem === "pm") {
    if (hours < 1 || hours > 12) return null;
    if (hours !== 12) hours += 12;
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return { hours, minutes };
}

export function defaultDurationMinutes(service: string | null): number {
  if (service === "Nail trim") return 30;
  if (service === "Bath only") return 60;
  if (service === "Full groom") return 90;
  return 60;
}

export function buildCalendarEventWindow(
  date: string,
  timeSlot: string | null | undefined,
  durationMinutes: number,
): CalendarEventWindow | null {
  const parsed = parseAppointmentTime(timeSlot);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !parsed) return null;

  const start = new Date(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      parsed.hours,
      parsed.minutes,
    ),
  );
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const toLocal = (d: Date) =>
    `${date}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;

  return {
    startDateTime: toLocal(start),
    endDateTime: toLocal(end),
    timeZone: GOOGLE_CALENDAR_TIME_ZONE,
  };
}

export function buildGoogleCalendarEvent({
  appointment,
  client,
  pet,
}: CalendarEventInput): GoogleCalendarEventPayload | null {
  const window = buildCalendarEventWindow(
    appointment.date,
    appointment.time_slot,
    defaultDurationMinutes(appointment.service),
  );
  if (!window) return null;

  const owner = fullName(client.first_name, client.last_name);
  const details = [
    `Owner: ${owner}`,
    client.phone ? `Phone: ${client.phone}` : null,
    pet.breed ? `Pet: ${pet.name} (${pet.breed})` : `Pet: ${pet.name}`,
    appointment.service ? `Service: ${appointment.service}` : null,
    appointment.price != null ? `Fee: ${formatMoney(appointment.price)}` : null,
    appointment.notes ? `Booking notes: ${appointment.notes}` : null,
    pet.grooming_notes ? `Grooming notes: ${pet.grooming_notes}` : null,
  ].filter(Boolean);

  return {
    summary: `Tidy Tails: ${pet.name}`,
    description: details.join("\n"),
    start: {
      dateTime: window.startDateTime,
      timeZone: window.timeZone,
    },
    end: {
      dateTime: window.endDateTime,
      timeZone: window.timeZone,
    },
  };
}

function keyFromSecret(secret: string): Buffer {
  const key = Buffer.from(secret, "base64");
  if (key.length !== SECRET_BYTES) {
    throw new Error("Google Calendar token secret must be 32 base64 bytes.");
  }
  return key;
}

export function encryptRefreshToken(
  token: string,
  secret: string,
  iv = crypto.randomBytes(12),
): EncryptedToken {
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptRefreshToken(
  encrypted: EncryptedToken,
  secret: string,
): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    keyFromSecret(secret),
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

