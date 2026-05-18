import { describe, expect, it } from "vitest";
import {
  buildCalendarEventWindow,
  buildGoogleCalendarEvent,
  decryptRefreshToken,
  defaultDurationMinutes,
  encryptRefreshToken,
  parseAppointmentTime,
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
        notes: "Bring harness",
      },
      client: {
        first_name: "Mary",
        last_name: "Anca",
        phone: "705-330-1807",
      },
      pet: {
        name: "Whiskey",
        breed: "Silver Terrier Yorkie",
        grooming_notes: "Long hair; typical fee $50-$60.",
      },
    });

    expect(event?.summary).toBe("Tidy Tails: Whiskey");
    expect(event?.start).toEqual({
      dateTime: "2026-06-29T10:00:00",
      timeZone: "America/Toronto",
    });
    expect(event?.description).toContain("Owner: Mary Anca");
    expect(event?.description).toContain("Fee: $80.00");
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

