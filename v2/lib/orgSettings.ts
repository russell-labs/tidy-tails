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

export type OrgSettings = {
  schedulingStyle: SchedulingStyle;
  locations: OrgLocation[];
  // null → use the engine's built-in per-size defaults.
  durationDefaults: DurationDefaults | null;
  bufferMinutes: number; // default 0 (buffer off)
  workingDay: WorkingDay;
  softTarget: number; // informational daily dog target
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
