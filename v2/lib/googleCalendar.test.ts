import { describe, expect, it } from "vitest";
import {
  buildCalendarEventWindow,
  buildGoogleCalendarEvent,
  decryptRefreshToken,
  defaultDurationMinutes,
  encryptRefreshToken,
  googleFreeBusyRangeForDate,
  googleCalendarEventsToBusyBlocks,
  isGoogleCalendarWindowBusy,
  markCalendarUnavailableSlots,
  markGoogleCalendarBusySlots,
  parseAppointmentTime,
  toCalendarLocalDateTime,
} from "./googleCalendar";

const baseSecret = Buffer.from("0123456789abcdef0123456789abcdef").toString(
  "base64",
);

describe("Google Calendar appointment time parsing", () => {
  it.each([
    ["9:00am", { hours: 9, minutes: 0 }],
    ["10:30 AM", { hours: 10, minutes: 30 }],
    ["12:00pm", { hours: 12, minutes: 0 }],
    ["1:30pm", { hours: 13, minutes: 30 }],
    ["15:00", { hours: 15, minutes: 0 }],
  ])("parses %s", (raw, expected) => {
    expect(parseAppointmentTime(raw)).toEqual(expected);
  });

  it.each(["morning", "25:00", "10:99", "", null])(
    "rejects non-specific time %j",
    (raw) => {
      expect(parseAppointmentTime(raw)).toBeNull();
    },
  );
});

describe("Google Calendar event building", () => {
  it("uses service-based default durations", () => {
    expect(defaultDurationMinutes("Full groom")).toBe(90);
    expect(defaultDurationMinutes("Bath only")).toBe(60);
    expect(defaultDurationMinutes("Nail trim")).toBe(30);
    expect(defaultDurationMinutes(null)).toBe(60);
  });

  it("builds local Toronto dateTime values for a specific appointment slot", () => {
    expect(buildCalendarEventWindow("2026-06-29", "10:30am", 90)).toEqual({
      startDateTime: "2026-06-29T10:30:00",
      endDateTime: "2026-06-29T12:00:00",
      timeZone: "America/Toronto",
    });
  });

  it("returns null when the appointment has no calendar-specific time", () => {
    expect(buildCalendarEventWindow("2026-06-29", "morning", 90)).toBeNull();
  });

  it("builds a groomer-readable calendar event", () => {
    const event = buildGoogleCalendarEvent({
      appointment: {
        date: "2026-06-29",
        time_slot: "10am",
        service: "Full groom",
        price: 80,
        location: "gina",
        notes: "Bring harness",
      },
      client: {
        first_name: "Mary",
        last_name: "Anca",
        phone: "705-330-1807",
        email: "mary@example.com",
        address: "1 Main St",
      },
      pet: {
        name: "Whiskey",
        breed: "Silver Terrier Yorkie",
        grooming_notes: "Long hair; typical fee $50-$60.",
      },
    });

    expect(event?.summary).toBe("Tidy Tails: Whiskey");
    expect(event?.location).toBe("Tidy Tails at Gina's");
    expect(event?.start).toEqual({
      dateTime: "2026-06-29T10:00:00",
      timeZone: "America/Toronto",
    });
    expect(event?.description).toContain("Owner: Mary Anca");
    expect(event?.description).toContain("Fee: $80.00");
    expect(event?.description).toContain("Location: Tidy Tails at Gina's");
    expect(event?.attendees).toBeUndefined();
  });

  it("adds a customer attendee only when Sam chooses to email the invite", () => {
    const event = buildGoogleCalendarEvent({
      appointment: {
        date: "2026-06-29",
        time_slot: "10am",
        service: "Full groom",
        price: 80,
        location: "annette",
        notes: null,
      },
      client: {
        first_name: "Mary",
        last_name: "Anca",
        phone: "705-330-1807",
        email: "mary@example.com",
        address: null,
      },
      pet: {
        name: "Whiskey",
        breed: "Silver Terrier Yorkie",
        grooming_notes: null,
      },
      sendCustomerInvite: true,
    });

    expect(event?.attendees).toEqual([
      { email: "mary@example.com", displayName: "Mary Anca" },
    ]);
    expect(event?.location).toBe(
      "Tidy Tails at Annette's, 290 Millard Street, Orillia",
    );
    expect(event?.description).toContain(
      "Location: Tidy Tails at Annette's, 290 Millard Street, Orillia",
    );
  });
});

describe("Google Calendar availability", () => {
  it("builds a full Toronto-day free/busy query range", () => {
    const range = googleFreeBusyRangeForDate("2026-06-29");

    expect(range.timeZone).toBe("America/Toronto");
    expect(toCalendarLocalDateTime(range.timeMin)).toBe("2026-06-29T00:00:00");
    expect(toCalendarLocalDateTime(range.timeMax)).toBe("2026-06-30T00:00:00");
  });

  it("detects Google busy blocks that overlap the appointment window", () => {
    const window = buildCalendarEventWindow("2026-06-29", "10:30am", 90);

    expect(window).not.toBeNull();
    expect(
      isGoogleCalendarWindowBusy(window!, [
        {
          start: "2026-06-29T10:45:00-04:00",
          end: "2026-06-29T11:15:00-04:00",
        },
      ]),
    ).toBe(true);
  });

  it("detects a Google busy block that starts at the same time as the slot", () => {
    const window = buildCalendarEventWindow("2026-05-29", "10:30am", 90);

    expect(window).not.toBeNull();
    expect(
      isGoogleCalendarWindowBusy(window!, [
        {
          start: "2026-05-29T10:30:00-04:00",
          end: "2026-05-29T11:30:00-04:00",
        },
      ]),
    ).toBe(true);
  });

  it("does not block adjacent Google busy windows", () => {
    const window = buildCalendarEventWindow("2026-06-29", "10:30am", 90);

    expect(
      isGoogleCalendarWindowBusy(window!, [
        {
          start: "2026-06-29T12:00:00-04:00",
          end: "2026-06-29T13:00:00-04:00",
        },
      ]),
    ).toBe(false);
  });

  it("marks Google-busy slots while preserving Tidy Tails conflicts", () => {
    const slots = markGoogleCalendarBusySlots(
      [
        { time: "9:00am", available: false },
        { time: "10:30am", available: true },
        { time: "12:00pm", available: true },
      ],
      "2026-06-29",
      "Full groom",
      [
        {
          start: "2026-06-29T10:45:00-04:00",
          end: "2026-06-29T11:15:00-04:00",
        },
      ],
    );

    expect(slots).toEqual([
      {
        time: "9:00am",
        available: false,
        source: "tidy_tails",
        reason: "Already booked in Tidy Tails",
      },
      {
        time: "10:30am",
        available: false,
        source: "google",
        reason: "Busy in Google Calendar",
      },
      { time: "12:00pm", available: true, source: "open" },
    ]);
  });

  it("fails closed when Google Calendar availability cannot be trusted", () => {
    const slots = markCalendarUnavailableSlots(
      [
        { time: "9:00am", available: true },
        { time: "10:30am", available: false },
      ],
      "Google Calendar availability failed",
    );

    expect(slots).toEqual([
      {
        time: "9:00am",
        available: false,
        source: "google",
        reason: "Google Calendar availability failed",
      },
      {
        time: "10:30am",
        available: false,
        source: "tidy_tails",
        reason: "Already booked in Tidy Tails",
      },
    ]);
  });

  it("converts visible timed Google events into busy blocks", () => {
    expect(
      googleCalendarEventsToBusyBlocks([
        {
          status: "confirmed",
          summary: "Virtual visit",
          start: { dateTime: "2026-05-29T10:30:00-04:00" },
          end: { dateTime: "2026-05-29T11:00:00-04:00" },
        },
      ]),
    ).toEqual([
      {
        start: "2026-05-29T10:30:00-04:00",
        end: "2026-05-29T11:00:00-04:00",
      },
    ]);
  });

  it("ignores cancelled and all-day Google events for slot blocking", () => {
    expect(
      googleCalendarEventsToBusyBlocks([
        {
          status: "cancelled",
          start: { dateTime: "2026-05-29T10:30:00-04:00" },
          end: { dateTime: "2026-05-29T11:00:00-04:00" },
        },
        {
          status: "confirmed",
          start: { date: "2026-05-29" },
          end: { date: "2026-05-30" },
        },
      ]),
    ).toEqual([]);
  });
});

describe("Google Calendar refresh-token encryption", () => {
  it("round-trips a refresh token without storing it in plaintext", () => {
    const encrypted = encryptRefreshToken(
      "refresh-token-value",
      baseSecret,
      Buffer.alloc(12, 7),
    );

    expect(encrypted.ciphertext).not.toContain("refresh-token-value");
    expect(decryptRefreshToken(encrypted, baseSecret)).toBe(
      "refresh-token-value",
    );
  });

  it("rejects secrets that are not 32 base64 bytes", () => {
    expect(() => encryptRefreshToken("token", "too-short")).toThrow(
      /32 base64 bytes/,
    );
  });
});
