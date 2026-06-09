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
