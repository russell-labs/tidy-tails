import { describe, expect, it } from "vitest";
import {
  buildCalendarEventWindow,
  buildGoogleCalendarEvent,
  buildGoogleCalendarDropOffDurationPatch,
  decryptRefreshToken,
  defaultDurationMinutes,
  encryptRefreshToken,
  googleFreeBusyRangeForDate,
  googleCalendarEventsToBusyBlocks,
  googleCalendarDeleteEventUrl,
  googleCalendarConnectionOwnerFilter,
  googleCalendarUserMessage,
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
  it("uses 15-minute drop-off windows for every booking type", () => {
    expect(defaultDurationMinutes("Full groom")).toBe(15);
    expect(defaultDurationMinutes("Bath only")).toBe(15);
    expect(defaultDurationMinutes("Nail trim")).toBe(15);
    expect(defaultDurationMinutes(null)).toBe(15);
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
    expect(event?.location).toBe("60 Olive Crescent, Orillia");
    expect(event?.start).toEqual({
      dateTime: "2026-06-29T10:00:00",
      timeZone: "America/Toronto",
    });
    expect(event?.end).toEqual({
      dateTime: "2026-06-29T10:15:00",
      timeZone: "America/Toronto",
    });
    expect(event?.description).toContain("Owner: Mary Anca");
    expect(event?.description).toContain("Fee: $80.00");
    expect(event?.description).toContain("Location: 60 Olive Crescent, Orillia");
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
    expect(event?.location).toBe("290 Millard Street, Orillia");
    expect(event?.description).toContain(
      "Location: 290 Millard Street, Orillia",
    );
  });

  it("builds one calendar event that names all pets in a household booking", () => {
    const event = buildGoogleCalendarEvent({
      appointment: {
        date: "2026-06-29",
        time_slot: "10am",
        service: "Grooming",
        price: 125,
        location: "gina",
        notes: "Booked together",
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
      pets: [
        {
          name: "Whiskey",
          breed: "Silver Terrier Yorkie",
          grooming_notes: "Long hair.",
        },
        {
          name: "Kiwi",
          breed: "Havanese",
          grooming_notes: "Short clip.",
        },
      ],
      sendCustomerInvite: true,
    });

    expect(event?.summary).toBe("Tidy Tails: Whiskey and Kiwi");
    expect(event?.description).toContain("Pet: Whiskey (Silver Terrier Yorkie)");
    expect(event?.description).toContain("Pet: Kiwi (Havanese)");
    expect(event?.description).toContain("Fee: $125.00");
  });
});

describe("Google Calendar drop-off duration repair", () => {
  it("builds a start/end patch for old long-duration booking events", () => {
    const patch = buildGoogleCalendarDropOffDurationPatch({
      date: "2026-05-28",
      timeSlot: "10:00am",
      service: "Full groom",
      event: {
        start: { dateTime: "2026-05-28T10:00:00-04:00" },
        end: { dateTime: "2026-05-28T11:30:00-04:00" },
      },
    });

    expect(patch).toEqual({
      start: {
        dateTime: "2026-05-28T10:00:00",
        timeZone: "America/Toronto",
      },
      end: {
        dateTime: "2026-05-28T10:15:00",
        timeZone: "America/Toronto",
      },
    });
  });

  it("does not patch events that already occupy the 15-minute drop-off window", () => {
    const patch = buildGoogleCalendarDropOffDurationPatch({
      date: "2026-05-28",
      timeSlot: "10:00am",
      service: "Full groom",
      event: {
        start: { dateTime: "2026-05-28T10:00:00-04:00" },
        end: { dateTime: "2026-05-28T10:15:00-04:00" },
      },
    });

    expect(patch).toBeNull();
  });
});

describe("Google Calendar event deletion", () => {
  it("asks Google to send cancellation updates so attendee calendars remove the event", () => {
    const url = new URL(
      googleCalendarDeleteEventUrl({
        calendarId: "primary",
        eventId: "event-123",
      }),
    );

    expect(url.pathname).toBe("/calendar/v3/calendars/primary/events/event-123");
    expect(url.searchParams.get("sendUpdates")).toBe("all");
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
        { time: "10:45am", available: true },
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
        available: true,
        source: "open",
      },
      {
        time: "10:45am",
        available: false,
        source: "google",
        reason: "Busy in Google Calendar",
      },
      { time: "12:00pm", available: true, source: "open" },
    ]);
  });

  it("keeps open slots selectable when Google Calendar availability cannot be trusted", () => {
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
        available: true,
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

  it("ignores cancelled, transparent, and all-day personal Google events for slot blocking", () => {
    expect(
      googleCalendarEventsToBusyBlocks([
        {
          status: "cancelled",
          start: { dateTime: "2026-05-29T10:30:00-04:00" },
          end: { dateTime: "2026-05-29T11:00:00-04:00" },
        },
        {
          status: "confirmed",
          transparency: "transparent",
          summary: "Dentist, visible but free",
          start: { dateTime: "2026-05-29T10:30:00-04:00" },
          end: { dateTime: "2026-05-29T11:00:00-04:00" },
        },
        {
          status: "confirmed",
          summary: "Family in Mexico",
          start: { date: "2026-05-29" },
          end: { date: "2026-05-30" },
        },
      ]),
    ).toEqual([]);
  });

  it("blocks timed events by default without requiring special title text", () => {
    expect(
      googleCalendarEventsToBusyBlocks([
        {
          status: "confirmed",
          summary: "Family errand",
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

  it("ignores all-day personal events for grooming availability", () => {
    expect(
      googleCalendarEventsToBusyBlocks([
        {
          status: "confirmed",
          summary: "Personal day",
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

describe("Google Calendar user-facing errors", () => {
  it("turns revoked refresh-token errors into a reconnect instruction", () => {
    expect(googleCalendarUserMessage("Token has been expired or revoked.")).toBe(
      "Google Calendar needs to be reconnected. Go to Settings and tap Reconnect Google Calendar.",
    );
  });
});

describe("Google Calendar connection ownership", () => {
  it("scopes disconnects to the signed-in groomer id", () => {
    expect(googleCalendarConnectionOwnerFilter("user-123")).toEqual({
      groomer_id: "user-123",
    });
  });
});
