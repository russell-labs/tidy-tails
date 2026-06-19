import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORG_SETTINGS,
  isOrgLocation,
  normalizeOrgSettings,
  orgLocationAddress,
  resolveLocationForDate,
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

describe("orgSettings — rented economics (WS4c B1)", () => {
  const hybrid = {
    scheduling_style: "one_to_one",
    settings: {
      businessStructure: "hybrid",
      locations: [
        { type: "owned", name: "Home Studio", address: "5 Maple St", expenses: {} },
        {
          type: "rented",
          name: "Bayfield Pet Spa",
          address: "9 King St",
          payoutType: "percent",
          salonKeepsPercent: 30,
          dailyRate: null,
        },
      ],
    },
  };

  it("exposes rented locations with their payout config", () => {
    expect(normalizeOrgSettings(hybrid).rentedLocations).toEqual([
      {
        name: "Bayfield Pet Spa",
        address: "9 King St",
        payoutType: "percent",
        salonKeepsPercent: 30,
        dailyRate: null,
      },
    ]);
  });

  it("ignores owned locations in the rented list", () => {
    const rented = normalizeOrgSettings(hybrid).rentedLocations;
    expect(rented).toHaveLength(1);
    expect(rented[0].name).toBe("Bayfield Pet Spa");
  });

  it("reads a daily-rate rented location", () => {
    const rented = normalizeOrgSettings({
      scheduling_style: "one_to_one",
      settings: {
        locations: [
          {
            type: "rented",
            name: "Chair Co",
            address: "1 Bay St",
            payoutType: "daily_rate",
            salonKeepsPercent: 0,
            dailyRate: 40,
          },
        ],
      },
    }).rentedLocations;
    expect(rented).toEqual([
      {
        name: "Chair Co",
        address: "1 Bay St",
        payoutType: "daily_rate",
        salonKeepsPercent: 0,
        dailyRate: 40,
      },
    ]);
  });

  it("clamps salonKeepsPercent into 0..100 and drops nameless entries", () => {
    const rented = normalizeOrgSettings({
      settings: {
        locations: [
          { type: "rented", name: "", address: "x", payoutType: "percent", salonKeepsPercent: 50 },
          { type: "rented", name: "Over", address: "y", payoutType: "percent", salonKeepsPercent: 150 },
        ],
      },
    }).rentedLocations;
    expect(rented).toEqual([
      {
        name: "Over",
        address: "y",
        payoutType: "percent",
        salonKeepsPercent: 100,
        dailyRate: null,
      },
    ]);
  });

  it("defaults rentedLocations to [] for a Sam-like (no settings) org", () => {
    expect(
      normalizeOrgSettings({ scheduling_style: "batched", settings: {} }).rentedLocations,
    ).toEqual([]);
  });
});

describe("weekday location schedule — normalization", () => {
  it("defaults to an empty weekday map when the column is absent", () => {
    expect(normalizeOrgSettings({}).weekdayLocations).toEqual({});
    expect(DEFAULT_ORG_SETTINGS.weekdayLocations).toEqual({});
  });

  it("reads numeric/string weekday keys and trims location names", () => {
    const result = normalizeOrgSettings({
      weekday_locations: { "1": "Annette", 3: "  Gina  ", "5": "Annette" },
    });
    expect(result.weekdayLocations).toEqual({
      1: "Annette",
      3: "Gina",
      5: "Annette",
    });
  });

  it("drops out-of-range days and blank/non-string values (those days are off)", () => {
    const result = normalizeOrgSettings({
      weekday_locations: {
        0: "Sunday Spot",
        2: "", // blank -> off
        4: 42, // non-string -> off
        7: "Nope", // out of range -> dropped
        "-1": "AlsoNope", // out of range -> dropped
      },
    });
    expect(result.weekdayLocations).toEqual({ 0: "Sunday Spot" });
  });

  it("ignores a non-object weekday_locations value", () => {
    expect(
      normalizeOrgSettings({ weekday_locations: "not-an-object" }).weekdayLocations,
    ).toEqual({});
    expect(
      normalizeOrgSettings({ weekday_locations: [1, 2, 3] }).weekdayLocations,
    ).toEqual({});
  });
});

describe("resolveLocationForDate", () => {
  // 2026-06-15 is a Monday; the week runs Mon..Sun through 2026-06-21 (Sunday).
  const settings = normalizeOrgSettings({
    scheduling_style: "one_to_one",
    settings: {
      locations: [
        { name: "Annette", address: "290 Millard Street, Orillia" },
        { name: "Gina", address: "60 Olive Crescent, Orillia" },
      ],
    },
    weekday_locations: {
      1: "Annette", // Monday
      2: "Gina", // Tuesday
      3: "Annette", // Wednesday
      // Thursday (4) absent -> off
      5: "Gina", // Friday
      // Saturday (6) + Sunday (0) absent -> off
    },
  });

  it("resolves a weekday with a configured location to that location", () => {
    expect(resolveLocationForDate(settings, "2026-06-15")).toEqual({
      location: "Annette",
      off: false,
    }); // Monday
    expect(resolveLocationForDate(settings, "2026-06-16")).toEqual({
      location: "Gina",
      off: false,
    }); // Tuesday
    expect(resolveLocationForDate(settings, "2026-06-19")).toEqual({
      location: "Gina",
      off: false,
    }); // Friday
  });

  it("resolves an unconfigured weekday to off", () => {
    expect(resolveLocationForDate(settings, "2026-06-18")).toEqual({
      location: null,
      off: true,
    }); // Thursday — absent
    expect(resolveLocationForDate(settings, "2026-06-20")).toEqual({
      location: null,
      off: true,
    }); // Saturday — absent
    expect(resolveLocationForDate(settings, "2026-06-21")).toEqual({
      location: null,
      off: true,
    }); // Sunday — absent
  });

  it("returns the canonical org spelling even if the stored value differs in case/spacing", () => {
    const messy = normalizeOrgSettings({
      settings: { locations: [{ name: "Annette", address: "x" }] },
      weekday_locations: { 1: "  annette " },
    });
    expect(resolveLocationForDate(messy, "2026-06-15")).toEqual({
      location: "Annette",
      off: false,
    });
  });

  it("degrades to off when the configured location is no longer an org location", () => {
    const stale = normalizeOrgSettings({
      settings: { locations: [{ name: "Annette", address: "x" }] },
      weekday_locations: { 1: "Gina" }, // Gina was removed from locations
    });
    expect(resolveLocationForDate(stale, "2026-06-15")).toEqual({
      location: null,
      off: true,
    });
  });

  it("is off for every day on an org that has never set a schedule", () => {
    const s = normalizeOrgSettings({ scheduling_style: "batched", settings: {} });
    for (const date of [
      "2026-06-15",
      "2026-06-16",
      "2026-06-17",
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21",
    ]) {
      expect(resolveLocationForDate(s, date)).toEqual({ location: null, off: true });
    }
  });
});
