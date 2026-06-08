// Onboarding input capture for WS3 (the front door).
//
// Pure, DB-free shaping of the onboarding wizard's answers into the values the
// `createOrganization` server action persists: a business name, a scheduling
// style, and one or more GENERIC locations with per-location economics.
//
// WS3 only CAPTURES and STORES these — the 1:1 scheduling engine and the
// economics engine are WS4. Locations are arbitrary (name + address); there is
// no hardcoded gina/annette map here (that map in operatorSettings.ts is
// Sam-specific and stays untouched until WS4 generalizes the engine). The only
// shape reused from operatorSettings is `LocationPayoutType`.

import type { LocationPayoutType } from "./operatorSettings";

export type SchedulingStyle = "batched" | "one_to_one";

export const SCHEDULING_STYLES = ["batched", "one_to_one"] as const;

export type OnboardingLocation = {
  name: string;
  address: string;
  payoutType: LocationPayoutType;
  // Kept for BOTH payout types so WS4 reads one shape: for `percent` the salon
  // keeps this %; for `daily_rate` it is 0 and dailyRate carries the value.
  salonKeepsPercent: number;
  dailyRate: number | null;
};

export type OnboardingInput = {
  businessName: string;
  schedulingStyle: SchedulingStyle;
  locations: OnboardingLocation[];
};

export type OnboardingParseResult =
  | { ok: true; value: OnboardingInput }
  | { ok: false; error: string };

// The shape the server action writes into the org_settings row (minus org_id).
export type OrgSettingsSeed = {
  scheduling_style: SchedulingStyle;
  settings: { locations: OnboardingLocation[] };
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

function normalizeLocation(raw: unknown):
  | { ok: true; value: OnboardingLocation }
  | { ok: false; error: string } {
  const source =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  const name = asString(source.name).slice(0, LOCATION_FIELD_MAX);
  const address = asString(source.address).slice(0, LOCATION_FIELD_MAX);
  if (!name) return { ok: false, error: "Each location needs a name." };
  if (!address) return { ok: false, error: "Each location needs an address." };

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

  return { ok: true, value: { name, address, payoutType, salonKeepsPercent, dailyRate } };
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
      schedulingStyle: asSchedulingStyle(source.schedulingStyle),
      locations,
    },
  };
}

// Map a validated input into the org_settings seed the action persists.
export function buildOrgSettings(input: OnboardingInput): OrgSettingsSeed {
  return {
    scheduling_style: input.schedulingStyle,
    settings: { locations: input.locations },
  };
}
