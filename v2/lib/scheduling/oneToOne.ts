// The one_to_one (1:1) duration-block scheduling engine (WS4a).
//
// One dog per block. A booking gets a suggested, adjustable duration from the
// dog's size + service, then lands on an open block of that length with
// exclusive (overlap) conflict detection and an optional, default-off buffer.
// Capacity is plain time arithmetic against a soft target. Pure — no I/O, no
// React; unit-tested in oneToOne.test.ts.

import type { ServiceType } from "../booking";
import type { SizeClass } from "../dayCapacity";
import {
  DEFAULT_WORKING_DAY,
  blocksOverlap,
  formatMinutes,
  parseTimeToMinutes,
  type WorkingDay,
} from "./time";

// Per-size default block lengths (minutes), from Cheryl's intake: small 20–45
// (~30), medium 45–75 (~60), large 60–150 (~90). Overridable per org.
export type DurationDefaults = {
  small: number;
  medium: number;
  large: number;
  xl: number;
};

export const DEFAULT_DURATION_DEFAULTS: DurationDefaults = {
  small: 30,
  medium: 60,
  large: 90,
  xl: 120,
};

export const NAIL_TRIM_MINUTES = 15;
const STEP_MINUTES = 15;

// Auto-suggested block length for a service + dog size. The operator adjusts it
// per booking; the adjusted value is what persists in appointments.duration_minutes.
export function suggestedDurationMinutes(
  serviceType: ServiceType | string | null | undefined,
  size: SizeClass,
  overrides?: Partial<DurationDefaults>,
): number {
  if (serviceType === "nail_trim") return NAIL_TRIM_MINUTES;
  const defaults = { ...DEFAULT_DURATION_DEFAULTS, ...(overrides ?? {}) };
  const base =
    size === "small"
      ? defaults.small
      : size === "large"
        ? defaults.large
        : size === "xl"
          ? defaults.xl
          : defaults.medium; // medium + unknown
  // A bath is a bit shorter than a full groom; round to the 5-minute grid.
  if (serviceType === "bath_only") {
    return Math.max(NAIL_TRIM_MINUTES, Math.round((base * 0.75) / 5) * 5);
  }
  return base;
}

// An existing same-date appointment resolved to a block. `startMinutes` is null
// when its time_slot could not be parsed (legacy/hand-typed) — an "unplaceable"
// block that the overlap math must treat conservatively, never skip.
export type ExistingBlock = {
  startMinutes: number | null;
  durationMinutes: number;
};

// Resolve an appointment's (time_slot, duration_minutes) into an ExistingBlock.
// A null/zero duration falls back to a conservative length so the block still
// occupies space (fail TOWARD conflict). An unparseable time yields a null start.
export function resolveExistingBlock(
  timeSlot: string | null | undefined,
  durationMinutes: number | null | undefined,
  fallbackDurationMinutes: number,
): ExistingBlock {
  const start = parseTimeToMinutes(timeSlot);
  const duration =
    durationMinutes && durationMinutes > 0
      ? durationMinutes
      : fallbackDurationMinutes;
  return { startMinutes: start, durationMinutes: duration };
}

// True when any existing block could not be placed (unparseable time). The
// caller fails toward conflict: we cannot prove a candidate is clear, so we
// refuse rather than risk a silent double-book.
export function hasUnplaceableBlock(existing: ExistingBlock[]): boolean {
  return existing.some((block) => block.startMinutes === null);
}

// Exclusive conflict detection for a candidate block. Returns true (conflict) if
// the candidate overlaps any existing block within the buffer, OR if any existing
// block is unplaceable (fail toward conflict).
export function hasOverlapConflict({
  candidateStartMinutes,
  candidateDurationMinutes,
  existing,
  bufferMinutes = 0,
}: {
  candidateStartMinutes: number;
  candidateDurationMinutes: number;
  existing: ExistingBlock[];
  bufferMinutes?: number;
}): boolean {
  if (hasUnplaceableBlock(existing)) return true;
  return existing.some((block) =>
    blocksOverlap(
      candidateStartMinutes,
      candidateDurationMinutes,
      block.startMinutes as number,
      block.durationMinutes,
      bufferMinutes,
    ),
  );
}

// Open blocks of `durationMinutes` across the working day that don't conflict
// with any existing block (+ buffer). Empty when an unplaceable block exists
// (forces the operator to review that day before booking).
export function availableBlocks({
  durationMinutes,
  existing,
  bufferMinutes = 0,
  workingDay = DEFAULT_WORKING_DAY,
  stepMinutes = STEP_MINUTES,
}: {
  durationMinutes: number;
  existing: ExistingBlock[];
  bufferMinutes?: number;
  workingDay?: WorkingDay;
  stepMinutes?: number;
}): string[] {
  if (durationMinutes <= 0) return [];
  if (hasUnplaceableBlock(existing)) return [];
  const slots: string[] = [];
  for (
    let start = workingDay.startMinutes;
    start + durationMinutes <= workingDay.endMinutes;
    start += stepMinutes
  ) {
    const conflicts = existing.some((block) =>
      blocksOverlap(
        start,
        durationMinutes,
        block.startMinutes as number,
        block.durationMinutes,
        bufferMinutes,
      ),
    );
    if (!conflicts) slots.push(formatMinutes(start));
  }
  return slots;
}

export type OneToOneDaySummary = {
  date: string;
  totalDogs: number;
  bookedMinutes: number;
  // The working-day window length (minutes) the booked time is measured against,
  // so a consumer can render "Xh of ~Yh booked" without re-deriving the window.
  workingDayMinutes: number;
  softTarget: number;
  overTarget: boolean;
  // TT-010: heaviness from the day's STRUCTURE (1:1 has no load points). The
  // count of large/xl dogs booked, and whether the day is getting heavy.
  largeDogs: number;
  gettingHeavy: boolean;
};

// The day is "getting heavy" once booked time reaches ~80% of the working-day
// window, OR two or more large dogs are on the slate (a coat-work signal that
// the minutes alone miss). A soft caution, never a block.
const HEAVY_MINUTES_FRACTION = 0.8;
const HEAVY_LARGE_DOG_COUNT = 2;

// Informational capacity for a day: dogs booked and total booked minutes against
// a soft target (~5–7), plus the TT-010 heaviness signal. Never a hard block —
// `overTarget`/`gettingHeavy` only flag notes. `size` per block is optional so
// callers that don't track size (and existing call sites) keep working with a
// large-dog count of 0.
export function oneToOneDaySummary({
  date,
  blocks,
  softTarget,
  workingDay = DEFAULT_WORKING_DAY,
}: {
  date: string;
  blocks: { durationMinutes: number; size?: SizeClass }[];
  softTarget: number;
  workingDay?: WorkingDay;
}): OneToOneDaySummary {
  const bookedMinutes = blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  const workingDayMinutes = workingDay.endMinutes - workingDay.startMinutes;
  const largeDogs = blocks.filter(
    (b) => b.size === "large" || b.size === "xl",
  ).length;
  const heavyMinutes = workingDayMinutes * HEAVY_MINUTES_FRACTION;
  const gettingHeavy =
    bookedMinutes >= heavyMinutes || largeDogs >= HEAVY_LARGE_DOG_COUNT;
  return {
    date,
    totalDogs: blocks.length,
    bookedMinutes,
    workingDayMinutes,
    softTarget,
    overTarget: blocks.length > softTarget,
    largeDogs,
    gettingHeavy,
  };
}

function compactDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// The shared "getting full" caution phrase (TT-010). Lives in one place so the
// day card, the heaviness note, and the booking-flow strip all speak the same
// language: the day is filling, and — when large dogs are booked — check coat
// types before piling on another big coat.
function heavinessTail(largeDogs: number): string {
  const coat =
    largeDogs > 0 ? " Check coat types before adding another large dog." : "";
  return `your day's getting full.${coat}`;
}

// TT-010: the operator-facing caution for a heavy 1:1 day, or null when the day
// is not heavy. Names the large dogs already booked and the booked time, and —
// when large dogs are present — nudges a coat-type check before piling on
// another big coat (mirrors the batched day-fit caution's intent).
export function oneToOneHeavinessNote({
  largeDogs,
  bookedMinutes,
  gettingHeavy,
}: Pick<
  OneToOneDaySummary,
  "largeDogs" | "bookedMinutes" | "gettingHeavy"
>): string | null {
  if (!gettingHeavy) return null;
  const lead =
    largeDogs > 0
      ? `${largeDogs} large dog${largeDogs === 1 ? "" : "s"} and ${compactDuration(bookedMinutes)} booked`
      : `${compactDuration(bookedMinutes)} booked`;
  return `${lead} — ${heavinessTail(largeDogs)}`;
}

// TT-013: the one-line load summary for a 1:1 day — booked time against the
// working-day window plus the large-dog count. The shared vocabulary the
// booking-flow strip, the day card, and the week card all render from.
export function oneToOneLoadSummaryText({
  bookedMinutes,
  workingDayMinutes,
  largeDogs,
}: Pick<
  OneToOneDaySummary,
  "bookedMinutes" | "workingDayMinutes" | "largeDogs"
>): string {
  return `${compactDuration(bookedMinutes)} of ~${compactDuration(workingDayMinutes)} booked · ${largeDogs} large`;
}

// TT-013: the non-blocking day-load strip for the 1:1 booking flow. The load
// summary, with the shared heaviness caution appended only when the day is
// getting heavy. Advisory copy — it never gates a slot.
export function oneToOneLoadStripText(
  summary: Pick<
    OneToOneDaySummary,
    "bookedMinutes" | "workingDayMinutes" | "largeDogs" | "gettingHeavy"
  >,
): string {
  const base = oneToOneLoadSummaryText(summary);
  if (!summary.gettingHeavy) return base;
  return `${base} — ${heavinessTail(summary.largeDogs)}`;
}
