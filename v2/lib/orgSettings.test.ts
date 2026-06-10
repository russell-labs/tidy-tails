import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORG_SETTINGS,
  isOrgLocation,
  normalizeOrgSettings,
  orgLocationAddress,
} from "./orgSettings";
import { DEFAULT_WORKING_DAY } from "./scheduling/time";

describe("normalizeOrgSettings", () => {
  it("reads an empty/absent row as the batched fail-safe default", () => {
    expect(normalizeOrgSettings({})).toEqual(DEFAULT_ORG_SETTINGS);
  });

  it("defaults an unknown scheduling_style to batched", () => {
    expect(normalizeOrgSettings({ scheduling_style: "weird" }).schedulingStyle).toBe(
      "batched",
    );
  });

  it("defaults operatorName to an empty string when absent", () => {
    expect(normalizeOrgSettings({}).operatorName).toBe("");
  });

  it("reads and trims a per-org operatorName from settings", () => {
    expect(
      normalizeOrgSettings({ settings: { operatorName: "  Cheryl  " } }).operatorName,
    ).toBe("Cheryl");
  });

  it("ignores a non-string operatorName", () => {
    expect(
      normalizeOrgSettings({ settings: { operatorName: 42 } }).operatorName,
    ).toBe("");
  });

  it("reads a one_to_one org with locations and knobs", () => {
    const result = normalizeOrgSettings({
      scheduling_style: "one_to_one",
      settings: {
        locations: [
          { name: "My shop", address: "1 King St", payoutType: "percent" },
          { name: "Gina's", address: "60 Olive Crescent" },
          { name: "", address: "dropped — no name" },
        ],
        bufferMinutes: 15,
        softTarget: 6,
        durationDefaults: { small: 25, large: 120 },
        workingDay: { startMinutes: 540, endMinutes: 1020 },
      },
    });
    expect(result.schedulingStyle).toBe("one_to_one");
    expect(result.locations).toEqual([
      { name: "My shop", address: "1 King St" },
      { name: "Gina's", address: "60 Olive Crescent" },
    ]);
    expect(result.bufferMinutes).toBe(15);
    expect(result.softTarget).toBe(6);
    expect(result.durationDefaults).toEqual({ small: 25, medium: 60, large: 120, xl: 120 });
    expect(result.workingDay).toEqual({ startMinutes: 540, endMinutes: 1020 });
  });

  it("falls back the working day when the window is invalid", () => {
    const result = normalizeOrgSettings({
      scheduling_style: "one_to_one",
      settings: { workingDay: { startMinutes: 1000, endMinutes: 500 } },
    });
    expect(result.workingDay).toEqual(DEFAULT_WORKING_DAY);
  });
});

describe("per-org location validation", () => {
  const settings = normalizeOrgSettings({
    scheduling_style: "one_to_one",
    settings: {
      locations: [{ name: "My shop", address: "1 King St" }, { name: "Gina's", address: "60 Olive" }],
    },
  });

  it("accepts an org location (case-insensitive) and rejects others", () => {
    expect(isOrgLocation(settings, "My shop")).toBe(true);
    expect(isOrgLocation(settings, "  gina's ")).toBe(true);
    expect(isOrgLocation(settings, "gina")).toBe(false); // Sam's code is not Cheryl's location
    expect(isOrgLocation(settings, "")).toBe(false);
    expect(isOrgLocation(settings, null)).toBe(false);
  });

  it("resolves a location to its address for customer copy", () => {
    expect(orgLocationAddress(settings, "Gina's")).toBe("60 Olive");
    expect(orgLocationAddress(settings, "nope")).toBeNull();
  });
});

describe("orgSettings — economics (WS4b)", () => {
  const raw = {
    scheduling_style: "one_to_one",
    settings: {
      businessStructure: "own",
      locations: [
        {
          type: "owned",
          name: "Cheryl's Shop",
          address: "5 Maple St",
          expenses: {
            rentMortgage: 1200,
            utilities: 150,
            supplies: 80,
            upkeep: null,
            cleaning: 40,
          },
        },
      ],
    },
  };

  it("exposes businessStructure", () => {
    expect(normalizeOrgSettings(raw).businessStructure).toBe("own");
  });

  it("exposes owned locations with their expenses", () => {
    expect(normalizeOrgSettings(raw).ownedLocations).toEqual([
      {
        name: "Cheryl's Shop",
        address: "5 Maple St",
        expenses: {
          rentMortgage: 1200,
          utilities: 150,
          supplies: 80,
          upkeep: null,
          cleaning: 40,
        },
      },
    ]);
  });

  it("keeps the legacy name+address locations list working", () => {
    expect(normalizeOrgSettings(raw).locations).toEqual([
      { name: "Cheryl's Shop", address: "5 Maple St" },
    ]);
  });

  it("ignores rented locations in the owned list", () => {
    const hybrid = {
      scheduling_style: "one_to_one",
      settings: {
        businessStructure: "hybrid",
        locations: [
          { type: "owned", name: "Cheryl's Shop", address: "5 Maple St", expenses: {} },
          { type: "rented", name: "Gina's", address: "60 Olive", payoutType: "percent", salonKeepsPercent: 47, dailyRate: null },
        ],
      },
    };
    const owned = normalizeOrgSettings(hybrid).ownedLocations;
    expect(owned).toHaveLength(1);
    expect(owned[0].name).toBe("Cheryl's Shop");
  });

  it("defaults to empty economics for a Sam-like (no settings) org", () => {
    const s = normalizeOrgSettings({ scheduling_style: "batched", settings: {} });
    expect(s.businessStructure).toBeNull();
    expect(s.ownedLocations).toEqual([]);
  });
});
