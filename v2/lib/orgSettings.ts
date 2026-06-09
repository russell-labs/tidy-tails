// Pure shape + normalization for per-org settings read from the `org_settings`
// table (WS3 wrote them; WS4a is the first reader). Distinct from
// lib/operatorSettings.ts, which is Sam's cookie-stored calibration/templates —
// org_settings is DB-stored org identity: scheduling style, locations, and the
// 1:1 engine's knobs. No I/O here; the reader lives in orgSettings.server.ts.

import type { DurationDefaults } from "./scheduling/oneToOne";
import { DEFAULT_WORKING_DAY, type WorkingDay } from "./scheduling/time";
import { selectStrategy, type SchedulingStyle } from "./scheduling/strategy";

// WS4a needs only name + address from each location (payout is WS4b/WS4c).
export type OrgLocation = { name: string; address: string };

// WS4b — the captured economics for an owner-operator (own-facility) location.
export type BusinessStructure = "own" | "works_for_others" | "hybrid";

export type OwnedLocationExpenses = {
  rentMortgage: number | null;
  utilities: number | null;
  supplies: number | null;
  upkeep: number | null;
  cleaning: number | null;
};

export type OwnedLocation = {
  name: string;
  address: string;
  expenses: OwnedLocationExpenses;
};

export type OrgSettings = {
  schedulingStyle: SchedulingStyle;
  locations: OrgLocation[];
  // null → use the engine's built-in per-size defaults.
  durationDefaults: DurationDefaults | null;
  bufferMinutes: number; // default 0 (buffer off)
  workingDay: WorkingDay;
  softTarget: number; // informational daily dog target
  // WS4b — owner-operator economics, read additively from the same jsonb. null
  // businessStructure / empty ownedLocations for a Sam-like org (no settings).
  businessStructure: BusinessStructure | null;
  ownedLocations: OwnedLocation[];
};

export const DEFAULT_SOFT_TARGET = 7;

// The fail-safe value: a brand-new/absent org_settings row reads as Sam's
// batched waterfall with no 1:1 knobs.
export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  schedulingStyle: "batched",
  locations: [],
  durationDefaults: null,
  bufferMinutes: 0,
  workingDay: DEFAULT_WORKING_DAY,
  softTarget: DEFAULT_SOFT_TARGET,
  businessStructure: null,
  ownedLocations: [],
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeLocations(raw: unknown): OrgLocation[] {
  if (!Array.isArray(raw)) return [];
  const locations: OrgLocation[] = [];
  for (const entry of raw) {
    const rec = asRecord(entry);
    const name = asString(rec.name);
    const address = asString(rec.address);
    if (name) locations.push({ name, address });
  }
  return locations;
}

const EXPENSE_KEYS = [
  "rentMortgage",
  "utilities",
  "supplies",
  "upkeep",
  "cleaning",
] as const;

function asMoneyOrNull(value: unknown): number | null {
  // null / undefined / "" mean "not entered" — preserve null, never coerce to 0.
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function normalizeExpenses(raw: unknown): OwnedLocationExpenses {
  const rec = asRecord(raw);
  return Object.fromEntries(
    EXPENSE_KEYS.map((k) => [k, asMoneyOrNull(rec[k])]),
  ) as OwnedLocationExpenses;
}

function normalizeBusinessStructure(raw: unknown): BusinessStructure | null {
  return raw === "own" || raw === "works_for_others" || raw === "hybrid"
    ? raw
    : null;
}

function normalizeOwnedLocations(raw: unknown): OwnedLocation[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnedLocation[] = [];
  for (const entry of raw) {
    const rec = asRecord(entry);
    if (rec.type !== "owned") continue;
    const name = asString(rec.name);
    if (!name) continue;
    out.push({
      name,
      address: asString(rec.address),
      expenses: normalizeExpenses(rec.expenses),
    });
  }
  return out;
}

function normalizeDurationDefaults(raw: unknown): DurationDefaults | null {
  const rec = asRecord(raw);
  if (Object.keys(rec).length === 0) return null;
  const pick = (k: string, d: number) => clampInt(rec[k], d, 5, 480);
  return {
    small: pick("small", 30),
    medium: pick("medium", 60),
    large: pick("large", 90),
    xl: pick("xl", 120),
  };
}

export function normalizeOrgSettings(row: {
  scheduling_style?: unknown;
  settings?: unknown;
}): OrgSettings {
  const settings = asRecord(row.settings);
  const workingDayRec = asRecord(settings.workingDay);
  const startMinutes = clampInt(
    workingDayRec.startMinutes,
    DEFAULT_WORKING_DAY.startMinutes,
    0,
    24 * 60,
  );
  const endMinutes = clampInt(
    workingDayRec.endMinutes,
    DEFAULT_WORKING_DAY.endMinutes,
    0,
    24 * 60,
  );
  return {
    schedulingStyle: selectStrategy(
      typeof row.scheduling_style === "string" ? row.scheduling_style : null,
    ),
    locations: normalizeLocations(settings.locations),
    durationDefaults: normalizeDurationDefaults(settings.durationDefaults),
    bufferMinutes: clampInt(settings.bufferMinutes, 0, 0, 120),
    workingDay:
      endMinutes > startMinutes
        ? { startMinutes, endMinutes }
        : DEFAULT_WORKING_DAY,
    softTarget: clampInt(settings.softTarget, DEFAULT_SOFT_TARGET, 1, 50),
    businessStructure: normalizeBusinessStructure(settings.businessStructure),
    ownedLocations: normalizeOwnedLocations(settings.locations),
  };
}

// True when a submitted location name belongs to this org (server-authoritative
// per-org location validation; names are compared case-insensitively, trimmed).
export function isOrgLocation(settings: OrgSettings, location: string | null | undefined): boolean {
  const key = (location ?? "").trim().toLowerCase();
  if (!key) return false;
  return settings.locations.some((l) => l.name.trim().toLowerCase() === key);
}

export function orgLocationAddress(
  settings: OrgSettings,
  location: string | null | undefined,
): string | null {
  const key = (location ?? "").trim().toLowerCase();
  const match = settings.locations.find(
    (l) => l.name.trim().toLowerCase() === key,
  );
  return match?.address || null;
}
