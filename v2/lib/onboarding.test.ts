import { describe, expect, it } from "vitest";
import {
  buildOrgSettings,
  MAX_LOCATIONS,
  normalizeOnboardingInput,
  type OnboardingInput,
} from "./onboarding";

function validRaw(overrides: Record<string, unknown> = {}) {
  return {
    businessName: "Cheryl's Mobile Grooming",
    schedulingStyle: "one_to_one",
    locations: [
      {
        name: "Downtown van",
        address: "100 King St W, Toronto",
        payoutType: "percent",
        salonKeepsPercent: 40,
        dailyRate: "",
      },
    ],
    ...overrides,
  };
}

describe("normalizeOnboardingInput", () => {
  it("accepts a valid single-location payload and trims fields", () => {
    const result = normalizeOnboardingInput(
      validRaw({ businessName: "  Cheryl's Mobile Grooming  " }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.businessName).toBe("Cheryl's Mobile Grooming");
    expect(result.value.schedulingStyle).toBe("one_to_one");
    expect(result.value.locations).toHaveLength(1);
    expect(result.value.locations[0]).toMatchObject({
      name: "Downtown van",
      address: "100 King St W, Toronto",
      payoutType: "percent",
      salonKeepsPercent: 40,
      dailyRate: null,
    });
  });

  it("captures multiple generic locations (no hardcoded gina/annette)", () => {
    const result = normalizeOnboardingInput(
      validRaw({
        locations: [
          { name: "North shop", address: "1 A St", payoutType: "percent", salonKeepsPercent: 30 },
          { name: "South shop", address: "2 B St", payoutType: "daily_rate", dailyRate: "85" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.locations.map((l) => l.name)).toEqual([
      "North shop",
      "South shop",
    ]);
  });

  it("maps a daily_rate location to dailyRate and zeroes the percent", () => {
    const result = normalizeOnboardingInput(
      validRaw({
        locations: [
          { name: "Van", address: "3 C St", payoutType: "daily_rate", dailyRate: "120.5", salonKeepsPercent: 40 },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.locations[0]).toMatchObject({
      payoutType: "daily_rate",
      dailyRate: 120.5,
      salonKeepsPercent: 0,
    });
  });

  it("clamps an out-of-range percent into 0..100", () => {
    const result = normalizeOnboardingInput(
      validRaw({
        locations: [
          { name: "Van", address: "3 C St", payoutType: "percent", salonKeepsPercent: 250 },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.locations[0].salonKeepsPercent).toBe(100);
  });

  it("defaults an unknown scheduling style to batched", () => {
    const result = normalizeOnboardingInput(validRaw({ schedulingStyle: "weird" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.schedulingStyle).toBe("batched");
  });

  it("rejects a missing business name", () => {
    const result = normalizeOnboardingInput(validRaw({ businessName: "   " }));
    expect(result).toEqual({ ok: false, error: "Enter your business name." });
  });

  it("rejects when there are no locations", () => {
    const result = normalizeOnboardingInput(validRaw({ locations: [] }));
    expect(result).toEqual({ ok: false, error: "Add at least one location." });
  });

  it("rejects a location missing its address", () => {
    const result = normalizeOnboardingInput(
      validRaw({
        locations: [{ name: "Van", address: "", payoutType: "percent", salonKeepsPercent: 30 }],
      }),
    );
    expect(result).toEqual({ ok: false, error: "Each location needs an address." });
  });

  it("rejects a daily_rate location with no rate", () => {
    const result = normalizeOnboardingInput(
      validRaw({
        locations: [{ name: "Van", address: "3 C St", payoutType: "daily_rate", dailyRate: "" }],
      }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Enter a daily rate for each daily-rate location.",
    });
  });

  it("rejects more than the location cap", () => {
    const many = Array.from({ length: MAX_LOCATIONS + 1 }, (_, i) => ({
      name: `Loc ${i}`,
      address: `${i} St`,
      payoutType: "percent",
      salonKeepsPercent: 30,
    }));
    const result = normalizeOnboardingInput(validRaw({ locations: many }));
    expect(result.ok).toBe(false);
  });

  it("rejects entirely non-object input", () => {
    expect(normalizeOnboardingInput(null).ok).toBe(false);
    expect(normalizeOnboardingInput("nope").ok).toBe(false);
  });
});

describe("buildOrgSettings", () => {
  it("splits scheduling style into its column and nests locations in jsonb", () => {
    const input: OnboardingInput = {
      businessName: "Cheryl's",
      schedulingStyle: "one_to_one",
      locations: [
        { name: "Van", address: "3 C St", payoutType: "percent", salonKeepsPercent: 40, dailyRate: null },
      ],
    };
    expect(buildOrgSettings(input)).toEqual({
      scheduling_style: "one_to_one",
      settings: { locations: input.locations },
    });
  });
});
