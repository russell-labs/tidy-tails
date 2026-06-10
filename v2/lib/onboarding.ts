// Onboarding input capture for the front door (WS3 + TT-004/005).
//
// Pure, DB-free shaping of the onboarding wizard's answers into the values the
// `createOrganization` server action persists. It captures the business
// STRUCTURE (own / works-for-others / both), a single scheduling style for the
// owned operation, and one or more locations each typed OWNED or RENTED:
//   - owned  → the groomer keeps 100% and tracks expenses (no payout split).
//   - rented → the existing percent / daily-rate split with the shop.
//
// This is the CAPTURE side of WS4b: it only stores the structure + per-location
// type + expenses into org_settings.settings. Take-home / expense REPORTING and
// the rented-location PAYOUT MATH (Gina's split, tip-splitting) remain WS4b/WS4c.
// No DB migration — it all rides the existing org_settings.settings jsonb.

import type { LocationPayoutType } from "./operatorSettings";

export type SchedulingStyle = "batched" | "one_to_one";
export const SCHEDULING_STYLES = ["batched", "one_to_one"] as const;

export type BusinessStructure = "own" | "works_for_others" | "hybrid";
export const BUSINESS_STRUCTURES = ["own", "works_for_others", "hybrid"] as const;

// Owned-location expense categories (TT-004). Optional labeled amounts — we
// capture whatever the operator enters; nothing is required. Reporting is WS4b.
export type LocationExpenses = {
  rentMortgage: number | null;
  utilities: number | null;
  supplies: number | null;
  upkeep: number | null;
  cleaning: number | null;
};

export const EXPENSE_CATEGORIES = [
  { key: "rentMortgage", label: "Rent / mortgage" },
  { key: "utilities", label: "Utilities" },
  { key: "supplies", label: "Supplies" },
  { key: "upkeep", label: "Upkeep" },
  { key: "cleaning", label: "Cleaning" },
] as const satisfies readonly { key: keyof LocationExpenses; label: string }[];

export type OwnedLocation = {
  type: "owned";
  name: string;
  address: string;
  expenses: LocationExpenses;
};

export type RentedLocation = {
  type: "rented";
  name: string;
  address: string;
  // For `percent` the shop keeps this %; for `daily_rate` it is 0 and dailyRate
  // carries the value. (A percentage is the same number whether framed "the shop
  // keeps X%" or "you owe X%" — copy differs, the stored split does not.)
  payoutType: LocationPayoutType;
  salonKeepsPercent: number;
  dailyRate: number | null;
};

export type OnboardingLocation = OwnedLocation | RentedLocation;

export type OnboardingInput = {
  businessName: string;
  businessStructure: BusinessStructure;
  schedulingStyle: SchedulingStyle;
  locations: OnboardingLocation[];
};

export type OnboardingParseResult =
  | { ok: true; value: OnboardingInput }
  | { ok: false; error: string };

// The shape the server action writes into the org_settings row (minus org_id).
export type OrgSettingsSeed = {
  scheduling_style: SchedulingStyle;
  settings: {
    businessStructure: BusinessStructure;
    locations: OnboardingLocation[];
    // TT-012 — the name that signs this org's customer texts. Seeded from the
    // business name so a brand-new org never inherits another operator's name;
    // it can be refined later. Read back via lib/orgSettings.ts.
    operatorName: string;
  };
};

export const MAX_LOCATIONS = 10;
const BUSINESS_NAME_MAX = 120;
const LOCATION_FIELD_MAX = 200;

function asString(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function asSchedulingStyle(raw: unknown): SchedulingStyle {
  // Coerce anything unexpected to the load-based default (Sam's style); the
  // wizard always submits a valid choice, so this only guards malformed input.
  return raw === "one_to_one" ? "one_to_one" : "batched";
}

function asBusinessStructure(raw: unknown): BusinessStructure {
  return raw === "works_for_others" || raw === "hybrid"
    ? raw
    : "own"; // default: runs their own business
}

function asPayoutType(raw: unknown): LocationPayoutType {
  return raw === "daily_rate" ? "daily_rate" : "percent";
}

function clampPercent(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

function asMoney(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function normalizeExpenses(raw: unknown): LocationExpenses {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    rentMortgage: asMoney(source.rentMortgage),
    utilities: asMoney(source.utilities),
    supplies: asMoney(source.supplies),
    upkeep: asMoney(source.upkeep),
    cleaning: asMoney(source.cleaning),
  };
}

function normalizeLocation(raw: unknown):
  | { ok: true; value: OnboardingLocation }
  | { ok: false; error: string } {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = asString(source.name).slice(0, LOCATION_FIELD_MAX);
  const address = asString(source.address).slice(0, LOCATION_FIELD_MAX);
  if (!name) return { ok: false, error: "Each location needs a name." };
  if (!address) return { ok: false, error: "Each location needs an address." };

  // Back-compat: a location with no `type` is the pre-TT-004 rented model.
  if (source.type === "owned") {
    return {
      ok: true,
      value: { type: "owned", name, address, expenses: normalizeExpenses(source.expenses) },
    };
  }

  const payoutType = asPayoutType(source.payoutType);
  const salonKeepsPercent =
    payoutType === "percent" ? clampPercent(source.salonKeepsPercent) : 0;
  const dailyRate = payoutType === "daily_rate" ? asMoney(source.dailyRate) : null;
  if (payoutType === "daily_rate" && dailyRate == null) {
    return {
      ok: false,
      error: "Enter a daily rate for each daily-rate location.",
    };
  }

  return {
    ok: true,
    value: { type: "rented", name, address, payoutType, salonKeepsPercent, dailyRate },
  };
}

// Server-authoritative validation + normalization of the wizard payload.
export function normalizeOnboardingInput(raw: unknown): OnboardingParseResult {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const businessName = asString(source.businessName).slice(0, BUSINESS_NAME_MAX);
  if (!businessName) {
    return { ok: false, error: "Enter your business name." };
  }

  const rawLocations = Array.isArray(source.locations) ? source.locations : [];
  if (rawLocations.length === 0) {
    return { ok: false, error: "Add at least one location." };
  }
  if (rawLocations.length > MAX_LOCATIONS) {
    return { ok: false, error: `Add at most ${MAX_LOCATIONS} locations.` };
  }

  const locations: OnboardingLocation[] = [];
  for (const rawLocation of rawLocations) {
    const result = normalizeLocation(rawLocation);
    if (!result.ok) return { ok: false, error: result.error };
    locations.push(result.value);
  }

  return {
    ok: true,
    value: {
      businessName,
      businessStructure: asBusinessStructure(source.businessStructure),
      schedulingStyle: asSchedulingStyle(source.schedulingStyle),
      locations,
    },
  };
}

// Map a validated input into the org_settings seed the action persists.
export function buildOrgSettings(input: OnboardingInput): OrgSettingsSeed {
  return {
    scheduling_style: input.schedulingStyle,
    settings: {
      businessStructure: input.businessStructure,
      locations: input.locations,
      operatorName: input.businessName,
    },
  };
}
