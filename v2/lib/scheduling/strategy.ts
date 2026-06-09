// SchedulingStrategy selection (WS4a).
//
// One fail-safe decision point: an org's `scheduling_style` chooses how the app
// schedules. `'batched'` is Sam's existing waterfall; `'one_to_one'` is Cheryl's
// duration-block engine. ANY other value (null, missing org_settings row,
// unknown string, read error) resolves to `'batched'` so Sam's behavior is the
// safe default.
//
// The waterfall path is realized by leaving the existing pure functions
// (lib/booking.ts, lib/dayCapacity.ts) and Sam's booking/edit components +
// actions byte-unchanged — the strongest "Sam unaffected" guarantee. The thin
// `waterfall` delegates below exist so a test can pin that delegation is
// equivalent to calling those functions directly; the one_to_one engine lives in
// ./oneToOne.

import {
  availableBookingTimeSlots,
  hasBookedTimeConflict,
} from "../booking";
import type { Appointment } from "../data/types";
import { summarizeDayLoad } from "../dayCapacity";
import type { SchedulingStyle } from "../onboarding";

export type { SchedulingStyle };

// Resolve any input to a concrete style, defaulting to 'batched' (fail-safe).
export function selectStrategy(
  style: string | null | undefined,
): SchedulingStyle {
  return style === "one_to_one" ? "one_to_one" : "batched";
}

export function isOneToOne(style: string | null | undefined): boolean {
  return selectStrategy(style) === "one_to_one";
}

// Thin delegates to the existing waterfall functions — behavior-identical, used
// to prove equivalence in tests. Sam's real call sites still call the originals.
export const waterfall = {
  daySummary: summarizeDayLoad,
  availableSlots: (appointments: Appointment[], date: string) =>
    availableBookingTimeSlots(appointments, date),
  hasConflict: hasBookedTimeConflict,
} as const;
