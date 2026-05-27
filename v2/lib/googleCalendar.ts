import crypto from "crypto";
import { customerBookingLocationLabel, formatPetNames } from "./booking";
import type { Appointment, Client, Pet } from "./data/types";
import { formatMoney, fullName } from "./format";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
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

export function googleCalendarUserMessage(rawMessage: string): string {
  if (/expired|revoked|invalid_grant/i.test(rawMessage)) {
    return "Google Calendar needs to be reconnected. Go to Settings and tap Reconnect Google Calendar.";
  }
  if (/insufficient|scope|permission/i.test(rawMessage)) {
    return "Google Calendar needs the new availability permission. Tap Reconnect Google Calendar in Settings and approve access again.";
  }
  return rawMessage;
}

export function googleCalendarConnectionOwnerFilter(
  groomerId: string,
): { groomer_id: string } {
  return { groomer_id: groomerId };
}

export type ParsedAppointmentTime = {
  hours: number;
  minutes: number;
};

export type CalendarEventWindow = {
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
};

export type GoogleCalendarBusyBlock = {
  start: string;
  end: string;
};

export type GoogleCalendarEventBlock = {
  status?: string;
  summary?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

export type CalendarAwareBookingSlot = {
  time: string;
  available: boolean;
  source: "open" | "tidy_tails" | "google";
  reason?: string;
};

export type CalendarEventInput = {
  appointment: Pick<
    Appointment,
    "date" | "time_slot" | "service" | "price" | "notes" | "location"
  >;
  client: Pick<Client, "first_name" | "last_name" | "phone" | "email" | "address">;
  pet: Pick<Pet, "name" | "breed" | "grooming_notes">;
  pets?: Pick<Pet, "name" | "breed" | "grooming_notes">[];
  sendCustomerInvite?: boolean;
  customerLocation?: string | null;
};

export type GoogleCalendarEventPayload = {
  summary: string;
  description: string;
  location?: string;
  attendees?: { email: string; displayName?: string }[];
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

export type GoogleCalendarEventTiming = {
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

export type GoogleCalendarEventTimePatch = Pick<
  GoogleCalendarEventPayload,
  "start" | "end"
>;

export function googleCalendarDeleteEventUrl({
  calendarId,
  eventId,
  sendUpdates = "all",
}: {
  calendarId: string;
  eventId: string;
  sendUpdates?: "all" | "externalOnly" | "none";
}): string {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events/${encodeURIComponent(eventId)}`,
  );
  url.searchParams.set("sendUpdates", sendUpdates);
  return url.toString();
}

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

function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
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
  // Calendar bookings are drop-off markers, not groom-duration blocks.
  void service;
  return 15;
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

export function buildGoogleCalendarDropOffDurationPatch({
  date,
  timeSlot,
  service,
  event,
}: {
  date: string;
  timeSlot: string | null | undefined;
  service: string | null;
  event: GoogleCalendarEventTiming;
}): GoogleCalendarEventTimePatch | null {
  const window = buildCalendarEventWindow(
    date,
    timeSlot,
    defaultDurationMinutes(service),
  );
  if (!window || !event.start?.dateTime || !event.end?.dateTime) return null;

  const currentStart = toCalendarLocalDateTime(
    event.start.dateTime,
    window.timeZone,
  );
  const currentEnd = toCalendarLocalDateTime(event.end.dateTime, window.timeZone);
  if (
    currentStart === window.startDateTime &&
    currentEnd === window.endDateTime
  ) {
    return null;
  }

  return {
    start: { dateTime: window.startDateTime, timeZone: window.timeZone },
    end: { dateTime: window.endDateTime, timeZone: window.timeZone },
  };
}

function localDateTimeToUtcIso(
  localDateTime: string,
  timeZone = GOOGLE_CALENDAR_TIME_ZONE,
): string {
  let utc = new Date(`${localDateTime}Z`);
  for (let i = 0; i < 3; i += 1) {
    const rendered = toCalendarLocalDateTime(utc.toISOString(), timeZone);
    if (!rendered) break;
    const drift =
      Date.parse(`${rendered}Z`) - Date.parse(`${localDateTime}Z`);
    utc = new Date(utc.getTime() - drift);
  }
  return utc.toISOString();
}

export function googleFreeBusyRangeForDate(date: string): {
  timeMin: string;
  timeMax: string;
  timeZone: string;
} {
  return {
    timeMin: localDateTimeToUtcIso(`${date}T00:00:00`),
    timeMax: localDateTimeToUtcIso(`${addDaysISO(date, 1)}T00:00:00`),
    timeZone: GOOGLE_CALENDAR_TIME_ZONE,
  };
}

export function toCalendarLocalDateTime(
  isoDateTime: string,
  timeZone = GOOGLE_CALENDAR_TIME_ZONE,
): string | null {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;
  const hour = get("hour") === "24" ? "00" : get("hour");
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const minute = get("minute");
  const second = get("second");
  if (!year || !month || !day || !hour || !minute || !second) return null;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

export function isGoogleCalendarWindowBusy(
  window: CalendarEventWindow,
  busyBlocks: GoogleCalendarBusyBlock[],
): boolean {
  return busyBlocks.some((block) => {
    const busyStart = toCalendarLocalDateTime(block.start, window.timeZone);
    const busyEnd = toCalendarLocalDateTime(block.end, window.timeZone);
    if (!busyStart || !busyEnd) return false;
    return window.startDateTime < busyEnd && window.endDateTime > busyStart;
  });
}

export function markGoogleCalendarBusySlots(
  slots: { time: string; available: boolean }[],
  date: string,
  service: string | null,
  busyBlocks: GoogleCalendarBusyBlock[],
): CalendarAwareBookingSlot[] {
  const duration = defaultDurationMinutes(service);
  return slots.map((slot) => {
    if (!slot.available) {
      return {
        ...slot,
        source: "tidy_tails",
        reason: "Already booked in Tidy Tails",
      };
    }
    const window = buildCalendarEventWindow(date, slot.time, duration);
    if (window && isGoogleCalendarWindowBusy(window, busyBlocks)) {
      return {
        ...slot,
        available: false,
        source: "google",
        reason: "Busy in Google Calendar",
      };
    }
    return { ...slot, source: "open" };
  });
}

export function markCalendarUnavailableSlots(
  slots: { time: string; available: boolean }[],
  reason: string,
): CalendarAwareBookingSlot[] {
  return slots.map((slot) => {
    if (!slot.available) {
      return {
        ...slot,
        source: "tidy_tails",
        reason: "Already booked in Tidy Tails",
      };
    }
    return {
      ...slot,
      source: "google",
      reason,
    };
  });
}

export function googleCalendarEventsToBusyBlocks(
  events: GoogleCalendarEventBlock[],
): GoogleCalendarBusyBlock[] {
  return events.flatMap((event) => {
    if (event.status === "cancelled") return [];
    if (event.transparency === "transparent") return [];
    const start = event.start?.dateTime;
    const end = event.end?.dateTime;
    if (!start || !end) return [];
    return [{ start, end }];
  });
}

export function buildGoogleCalendarEvent({
  appointment,
  client,
  pet,
  pets,
  sendCustomerInvite = false,
  customerLocation: configuredCustomerLocation,
}: CalendarEventInput): GoogleCalendarEventPayload | null {
  const window = buildCalendarEventWindow(
    appointment.date,
    appointment.time_slot,
    defaultDurationMinutes(appointment.service),
  );
  if (!window) return null;

  const owner = fullName(client.first_name, client.last_name);
  const customerLocation =
    configuredCustomerLocation ?? customerBookingLocationLabel(appointment.location);
  const calendarPets = pets?.length ? pets : [pet];
  const petSummaryName = formatPetNames(calendarPets.map((calendarPet) => calendarPet.name));
  const petDetails = calendarPets.flatMap((calendarPet) => [
    calendarPet.breed
      ? `Pet: ${calendarPet.name} (${calendarPet.breed})`
      : `Pet: ${calendarPet.name}`,
    calendarPet.grooming_notes
      ? `Grooming notes for ${calendarPet.name}: ${calendarPet.grooming_notes}`
      : null,
  ]);
  const details = [
    `Owner: ${owner}`,
    client.phone ? `Phone: ${client.phone}` : null,
    client.email ? `Email: ${client.email}` : null,
    ...petDetails,
    appointment.service ? `Service: ${appointment.service}` : null,
    appointment.price != null ? `Fee: ${formatMoney(appointment.price)}` : null,
    customerLocation ? `Location: ${customerLocation}` : null,
    appointment.notes ? `Booking notes: ${appointment.notes}` : null,
  ].filter(Boolean);
  const attendees =
    sendCustomerInvite && client.email
      ? [{ email: client.email, displayName: owner }]
      : undefined;

  return {
    summary: `Tidy Tails: ${petSummaryName}`,
    description: details.join("\n"),
    ...(customerLocation ? { location: customerLocation } : {}),
    ...(attendees ? { attendees } : {}),
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
