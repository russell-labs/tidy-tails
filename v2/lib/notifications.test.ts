import { describe, expect, it } from "vitest";
import type { Appointment } from "./data/types";
import { shouldShowTomorrowReviewNotification } from "./notifications";

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: "a1",
    client_id: "c1",
    pet_id: "p1",
    date: "2026-05-28",
    time_slot: "10:00am",
    service: "Full groom",
    price: 80,
    tip: null,
    notes: null,
    status: "booked",
    location: "gina",
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-05-27",
    ...overrides,
  };
}

describe("shouldShowTomorrowReviewNotification", () => {
  it("shows after 6 PM when tomorrow has booked appointments", () => {
    expect(
      shouldShowTomorrowReviewNotification({
        appointments: [appointment({})],
        now: new Date("2026-05-27T22:00:00Z"),
        timeZone: "America/Toronto",
      }),
    ).toBe(true);
  });

  it("does not show before 6 PM", () => {
    expect(
      shouldShowTomorrowReviewNotification({
        appointments: [appointment({})],
        now: new Date("2026-05-27T20:00:00Z"),
        timeZone: "America/Toronto",
      }),
    ).toBe(false);
  });

  it("ignores completed appointments tomorrow", () => {
    expect(
      shouldShowTomorrowReviewNotification({
        appointments: [appointment({ status: "completed" })],
        now: new Date("2026-05-27T22:00:00Z"),
        timeZone: "America/Toronto",
      }),
    ).toBe(false);
  });
});
