import { describe, expect, it } from "vitest";
import type { Appointment, DayCloseoutOverride } from "./data/types";
import { calculateDayMoney } from "./locationFinance";
import { DEFAULT_OPERATOR_SETTINGS } from "./operatorSettings";

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: overrides.id ?? "a1",
    client_id: "c1",
    pet_id: "p1",
    date: "2026-06-12",
    time_slot: "9:00am",
    service: "Full groom",
    price: overrides.price ?? 100,
    tip: null,
    notes: overrides.notes ?? null,
    status: overrides.status ?? "booked",
    location: "location" in overrides ? overrides.location : "gina",
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-06-12T00:00:00.000Z",
  };
}

describe("location finance day closeouts", () => {
  it("uses day closeout overrides for salon payout without changing gross", () => {
    const overrides: DayCloseoutOverride[] = [{
      id: "override-1",
      date: "2026-06-12",
      location: "annette",
      final_payout: 40,
      calculated_payout: 35,
      note: "Rounded at end of day",
      created_at: "2026-06-12T20:00:00.000Z",
      updated_at: "2026-06-12T20:00:00.000Z",
    }];

    expect(
      calculateDayMoney(
        [
          appointment({ id: "gina", price: 100, location: "gina" }),
          appointment({ id: "annette", price: 100, location: "annette" }),
        ],
        "2026-06-12",
        DEFAULT_OPERATOR_SETTINGS.locationSettings,
        overrides,
      ),
    ).toEqual({
      gross: 200,
      salonPayout: 70,
      samNet: 130,
    });
  });

  it("keeps no-location appointment money in day totals", () => {
    expect(
      calculateDayMoney(
        [appointment({ id: "no-location", price: 80, location: null })],
        "2026-06-12",
        DEFAULT_OPERATOR_SETTINGS.locationSettings,
      ),
    ).toEqual({
      gross: 80,
      salonPayout: 0,
      samNet: 80,
    });
  });
});
