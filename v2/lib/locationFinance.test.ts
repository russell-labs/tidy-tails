import { describe, expect, it } from "vitest";
import type { Appointment } from "./data/types";
import {
  calculateAppointmentMoney,
  calculateDayMoney,
  customerLocationLabelFromSettings,
  locationLabelFromSettings,
} from "./locationFinance";
import { DEFAULT_OPERATOR_SETTINGS } from "./operatorSettings";

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: overrides.id ?? "a1",
    client_id: overrides.client_id ?? "c1",
    pet_id: overrides.pet_id ?? "p1",
    date: overrides.date ?? "2026-06-12",
    time_slot: overrides.time_slot ?? "9:00am",
    service: overrides.service ?? "full_groom",
    price: overrides.price ?? 100,
    tip: overrides.tip ?? null,
    notes: overrides.notes ?? null,
    status: overrides.status ?? "booked",
    location: overrides.location ?? "gina",
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-05-27T00:00:00.000Z",
  };
}

describe("location finance", () => {
  it("defaults Gina to salon keeping 30 percent and Sam netting 70 percent", () => {
    expect(
      calculateAppointmentMoney(
        appointment({ price: 200, location: "gina" }),
        DEFAULT_OPERATOR_SETTINGS.locationSettings,
      ),
    ).toEqual({
      gross: 200,
      salonPayout: 60,
      samNet: 140,
      payoutLabel: "Salon keeps 30%",
    });
  });

  it("defaults Annette to salon keeping 35 percent and Sam netting 65 percent", () => {
    expect(
      calculateAppointmentMoney(
        appointment({ price: 200, location: "annette" }),
        DEFAULT_OPERATOR_SETTINGS.locationSettings,
      ).samNet,
    ).toBe(130);
  });

  it("lets a single Gina or Annette appointment override the salon payout percent", () => {
    expect(
      calculateAppointmentMoney(
        appointment({
          price: 200,
          location: "gina",
          notes: "Holiday special [salon_payout:15]",
        }),
        DEFAULT_OPERATOR_SETTINGS.locationSettings,
      ),
    ).toEqual({
      gross: 200,
      salonPayout: 30,
      samNet: 170,
      payoutLabel: "Salon keeps 15% override",
    });
  });

  it("sums day gross and net by appointment location", () => {
    expect(
      calculateDayMoney(
        [
          appointment({ id: "a1", pet_id: "p1", price: 100, location: "gina" }),
          appointment({
            id: "a2",
            pet_id: "p2",
            price: 100,
            location: "annette",
            notes: "[salon_payout:10]",
          }),
          appointment({
            id: "a3",
            pet_id: "p3",
            price: 50,
            location: "gina",
            status: "completed",
          }),
        ],
        "2026-06-12",
        DEFAULT_OPERATOR_SETTINGS.locationSettings,
      ),
    ).toEqual({
      gross: 200,
      salonPayout: 40,
      samNet: 160,
    });
  });

  it("uses settings-backed labels and customer address text", () => {
    const settings = {
      ...DEFAULT_OPERATOR_SETTINGS.locationSettings,
      gina: {
        ...DEFAULT_OPERATOR_SETTINGS.locationSettings.gina,
        displayName: "Gina's Salon",
        customerAddress: "Custom Gina address",
      },
    };

    expect(locationLabelFromSettings("gina", settings)).toBe("Gina's Salon");
    expect(customerLocationLabelFromSettings("gina", settings)).toBe(
      "Custom Gina address",
    );
  });
});
