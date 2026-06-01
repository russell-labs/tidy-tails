import { describe, expect, it } from "vitest";
import {
  buildDayCloseoutUpsert,
  dayCloseoutKey,
  validateDayCloseoutInput,
} from "./dayCloseout";

describe("day closeout overrides", () => {
  it("validates a day/location payout override with a required note", () => {
    expect(
      validateDayCloseoutInput({
        date: "2026-06-01",
        location: "annette",
        final_payout: "85.50",
        calculated_payout: "84.63",
        note: "Rounded at end of day",
      }),
    ).toEqual({
      ok: true,
      value: {
        date: "2026-06-01",
        location: "annette",
        final_payout: 85.5,
        calculated_payout: 84.63,
        note: "Rounded at end of day",
      },
    });
  });

  it("rejects invalid dates, locations, negative payouts, and empty notes", () => {
    const result = validateDayCloseoutInput({
      date: "tomorrow",
      location: "mobile",
      final_payout: "-1",
      calculated_payout: "nope",
      note: " ",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.date).toBeTruthy();
      expect(result.errors.location).toBeTruthy();
      expect(result.errors.final_payout).toBeTruthy();
      expect(result.errors.calculated_payout).toBeTruthy();
      expect(result.errors.note).toBeTruthy();
    }
  });

  it("builds the upsert payload without touching appointment money", () => {
    const result = validateDayCloseoutInput({
      date: "2026-06-01",
      location: "gina",
      final_payout: "60",
      calculated_payout: "58.25",
      note: "Rounded cash closeout",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(buildDayCloseoutUpsert(result.value, "2026-06-01T20:00:00.000Z")).toEqual({
      date: "2026-06-01",
      location: "gina",
      final_payout: 60,
      calculated_payout: 58.25,
      note: "Rounded cash closeout",
      updated_at: "2026-06-01T20:00:00.000Z",
    });
    expect(dayCloseoutKey("2026-06-01", "gina")).toBe("2026-06-01::gina");
  });
});
