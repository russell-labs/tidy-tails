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
    businessStructure: "own",
    schedulingStyle: "one_to_one",
    locations: [
      {
        type: "rented",
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

describe("normalizeOnboardingInput — rented locations (unchanged split model)", () => {
  it("accepts a valid single rented location and trims fields", () => {
    const result = normalizeOnboardingInput(
      validRaw({ businessName: "  Cheryl's Mobile Grooming  " }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.businessName).toBe("Cheryl's Mobile Grooming");
    expect(result.value.schedulingStyle).toBe("one_to_one");
    expect(result.value.locations[0]).toMatchObject({
      type: "rented",
      name: "Downtown van",
      address: "100 King St W, Toronto",
      payoutType: "percent",
      salonKeepsPercent: 40,
      dailyRate: null,
    });
  });

  it("maps a daily_rate location to dailyRate and zeroes the percent", () => {
    const result = normalizeOnboardingInput(
      validRaw({
        locations: [
          { type: "rented", name: "Van", address: "3 C St", payoutType: "daily_rate", dailyRate: "120.5", salonKeepsPercent: 40 },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.locations[0]).toMatchObject({
      type: "rented",
      payoutType: "daily_rate",
      dailyRate: 120.5,
      salonKeepsPercent: 0,
    });
  });

  it("clamps an out-of-range percent into 0..100", () => {
    const result = normalizeOnboardingInput(
      validRaw({
        locations: [
          { type: "rented", name: "Van", address: "3 C St", payoutType: "percent", salonKeepsPercent: 250 },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const loc = result.value.locations[0];
    expect(loc.type === "rented" && loc.salonKeepsPercent).toBe(100);
  });

  it("rejects a daily_rate location with no rate", () => {
    const result = normalizeOnboardingInput(
      validRaw({
        locations: [{ type: "rented", name: "Van", address: "3 C St", payoutType: "daily_rate", dailyRate: "" }],
      }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Enter a daily rate for each daily-rate location.",
    });
  });

  it("treats a location with no type as the pre-TT-004 rented model (back-compat)", () => {
    const result = normalizeOnboardingInput(
      validRaw({
        locations: [{ name: "Legacy", address: "9 Old St", payoutType: "percent", salonKeepsPercent: 30 }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.locations[0].type).toBe("rented");
  });
});

describe("normalizeOnboardingInput — owned locations (TT-004)", () => {
  it("captures an owned location with expenses and NO payout", () => {
    const result = normalizeOnboardingInput(
      validRaw({
        businessStructure: "own",
        locations: [
          {
            type: "owned",
            name: "Rusty's Shop",
            address: "5 Main St",
            // payout fields are ignored for owned
            payoutType: "percent",
            salonKeepsPercent: 30,
            expenses: {
              rentMortgage: "1500",
              utilities: "200.50",
              supplies: "",
              upkeep: "0",
              cleaning: "75",
            },
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const loc = result.value.locations[0];
    expect(loc.type).toBe("owned");
    if (loc.type !== "owned") return;
    expect(loc).not.toHaveProperty("payoutType");
    expect(loc.expenses).toEqual({
      rentMortgage: 1500,
      utilities: 200.5,
      supplies: null, // blank stays null (optional)
      upkeep: 0,
      cleaning: 75,
    });
  });

  it("an owned location needs no payout to be valid", () => {
    const result = normalizeOnboardingInput(
      validRaw({
        locations: [{ type: "owned", name: "Shop", address: "1 St" }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const loc = result.value.locations[0];
    expect(loc.type === "owned" && loc.expenses.rentMortgage).toBeNull();
  });
});

describe("normalizeOnboardingInput — business structure", () => {
  function structureOf(raw: unknown): string | null {
    const result = normalizeOnboardingInput(raw);
    return result.ok ? result.value.businessStructure : null;
  }

  it("preserves a valid structure", () => {
    for (const s of ["own", "works_for_others", "hybrid"] as const) {
      expect(structureOf(validRaw({ businessStructure: s }))).toBe(s);
    }
  });

  it("defaults an unknown structure to own", () => {
    expect(structureOf(validRaw({ businessStructure: "weird" }))).toBe("own");
  });

  it("defaults a missing structure to own", () => {
    const noStructure = { ...validRaw() };
    delete (noStructure as Record<string, unknown>).businessStructure;
    expect(structureOf(noStructure)).toBe("own");
  });
});

describe("normalizeOnboardingInput — guards", () => {
  it("rejects a missing business name", () => {
    expect(normalizeOnboardingInput(validRaw({ businessName: "   " }))).toEqual({
      ok: false,
      error: "Enter your business name.",
    });
  });

  it("rejects when there are no locations", () => {
    expect(normalizeOnboardingInput(validRaw({ locations: [] }))).toEqual({
      ok: false,
      error: "Add at least one location.",
    });
  });

  it("rejects a location missing its address", () => {
    expect(
      normalizeOnboardingInput(
        validRaw({ locations: [{ type: "rented", name: "Van", address: "", payoutType: "percent", salonKeepsPercent: 30 }] }),
      ),
    ).toEqual({ ok: false, error: "Each location needs an address." });
  });

  it("rejects more than the location cap", () => {
    const many = Array.from({ length: MAX_LOCATIONS + 1 }, (_, i) => ({
      type: "rented",
      name: `Loc ${i}`,
      address: `${i} St`,
      payoutType: "percent",
      salonKeepsPercent: 30,
    }));
    expect(normalizeOnboardingInput(validRaw({ locations: many })).ok).toBe(false);
  });

  it("rejects entirely non-object input", () => {
    expect(normalizeOnboardingInput(null).ok).toBe(false);
    expect(normalizeOnboardingInput("nope").ok).toBe(false);
  });
});

describe("buildOrgSettings", () => {
  it("nests businessStructure + typed locations under settings", () => {
    const input: OnboardingInput = {
      businessName: "Rusty's Shop",
      businessStructure: "hybrid",
      schedulingStyle: "one_to_one",
      locations: [
        {
          type: "owned",
          name: "Rusty's Shop",
          address: "5 Main St",
          expenses: { rentMortgage: 1500, utilities: null, supplies: null, upkeep: null, cleaning: null },
        },
        {
          type: "rented",
          name: "Gina's",
          address: "60 Olive",
          payoutType: "percent",
          salonKeepsPercent: 47,
          dailyRate: null,
        },
      ],
    };
    expect(buildOrgSettings(input)).toEqual({
      scheduling_style: "one_to_one",
      settings: {
        businessStructure: "hybrid",
        locations: input.locations,
      },
    });
  });
});
