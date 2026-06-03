import { describe, expect, it } from "vitest";
import {
  parseSalonPayoutOverride,
  stripSalonPayoutOverride,
  validateSalonPayoutOverrideInput,
  withSalonPayoutOverride,
} from "./payoutOverride";

// These functions encode the salon payout split into the appointment notes
// field; locationFinance derives the operator's net pay from the parsed value.
// A silent regression here miscalculates real payouts, so the behavior is
// pinned here explicitly.

describe("parseSalonPayoutOverride", () => {
  it("reads a whole-percent marker", () => {
    expect(parseSalonPayoutOverride("[salon_payout:30]")).toBe(30);
  });

  it("reads a decimal marker embedded in notes", () => {
    expect(parseSalonPayoutOverride("Gentle dog [salon_payout:35.5]")).toBe(
      35.5,
    );
  });

  it("accepts the boundary values 0 and 100", () => {
    expect(parseSalonPayoutOverride("[salon_payout:0]")).toBe(0);
    expect(parseSalonPayoutOverride("[salon_payout:100]")).toBe(100);
  });

  it("rejects an out-of-range percent", () => {
    expect(parseSalonPayoutOverride("[salon_payout:150]")).toBeNull();
  });

  it("returns null when there is no marker", () => {
    expect(parseSalonPayoutOverride("just some notes")).toBeNull();
  });

  it("handles null and undefined input", () => {
    expect(parseSalonPayoutOverride(null)).toBeNull();
    expect(parseSalonPayoutOverride(undefined)).toBeNull();
  });
});

describe("stripSalonPayoutOverride", () => {
  it("removes the marker and keeps the surrounding notes", () => {
    expect(stripSalonPayoutOverride("Gentle dog [salon_payout:30]")).toBe(
      "Gentle dog",
    );
  });

  it("returns null when the notes were only the marker", () => {
    expect(stripSalonPayoutOverride("[salon_payout:30]")).toBeNull();
  });

  it("collapses the whitespace left behind", () => {
    expect(
      stripSalonPayoutOverride("morning  [salon_payout:30]  drop off"),
    ).toBe("morning drop off");
  });

  it("returns null for empty or nullish input", () => {
    expect(stripSalonPayoutOverride(null)).toBeNull();
    expect(stripSalonPayoutOverride("")).toBeNull();
  });
});

describe("withSalonPayoutOverride", () => {
  it("appends a marker to plain notes", () => {
    expect(withSalonPayoutOverride("Good boy", 35)).toBe(
      "Good boy [salon_payout:35]",
    );
  });

  it("creates a marker-only string when notes are empty", () => {
    expect(withSalonPayoutOverride(null, 30)).toBe("[salon_payout:30]");
  });

  it("replaces an existing marker rather than duplicating it", () => {
    expect(withSalonPayoutOverride("Old [salon_payout:20]", 40)).toBe(
      "Old [salon_payout:40]",
    );
  });

  it("removes the marker when the percent is null", () => {
    expect(withSalonPayoutOverride("Notes [salon_payout:20]", null)).toBe(
      "Notes",
    );
  });

  it("round-trips through parse", () => {
    expect(parseSalonPayoutOverride(withSalonPayoutOverride("x", 30))).toBe(30);
  });
});

describe("validateSalonPayoutOverrideInput", () => {
  it("treats empty input as a cleared override", () => {
    expect(validateSalonPayoutOverrideInput("")).toEqual({
      ok: true,
      value: null,
    });
  });

  it("accepts valid percents", () => {
    expect(validateSalonPayoutOverrideInput("30")).toEqual({
      ok: true,
      value: 30,
    });
    expect(validateSalonPayoutOverrideInput("0")).toEqual({
      ok: true,
      value: 0,
    });
    expect(validateSalonPayoutOverrideInput("100")).toEqual({
      ok: true,
      value: 100,
    });
  });

  it("rejects out-of-range and non-numeric input", () => {
    expect(validateSalonPayoutOverrideInput("-1").ok).toBe(false);
    expect(validateSalonPayoutOverrideInput("101").ok).toBe(false);
    expect(validateSalonPayoutOverrideInput("abc").ok).toBe(false);
  });
});
