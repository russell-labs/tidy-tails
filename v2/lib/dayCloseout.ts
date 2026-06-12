import { BOOKING_LOCATIONS, type BookingLocation } from "./booking";

export type DayCloseoutInput = {
  date: string;
  location: string;
  final_payout: string;
  calculated_payout: string;
  note: string;
};

export type ValidatedDayCloseout = {
  date: string;
  location: BookingLocation;
  final_payout: number;
  calculated_payout: number | null;
  note: string;
};

export type DayCloseoutErrors = Partial<Record<keyof DayCloseoutInput, string>>;

export type DayCloseoutValidation =
  | { ok: true; value: ValidatedDayCloseout }
  | { ok: false; errors: DayCloseoutErrors };

export type DayCloseoutUpsert = {
  date: string;
  location: BookingLocation;
  final_payout: number;
  calculated_payout: number | null;
  note: string;
  updated_at: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_MAX = 500;

function isBookingLocation(value: string): value is BookingLocation {
  return (BOOKING_LOCATIONS as readonly string[]).includes(value);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseMoney(
  value: string,
  field: "final_payout" | "calculated_payout",
  errors: DayCloseoutErrors,
): number | null {
  const trimmed = value.trim();
  if (!trimmed && field === "calculated_payout") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    errors[field] = "Enter a non-negative dollar amount.";
    return null;
  }
  return roundMoney(n);
}

export function dayCloseoutKey(date: string, location: string): string {
  return `${date}::${location}`;
}

// TT-021 — "paid by salon, I keep 100%" days. On a rented-chair day where the
// salon pays Sam directly, the configured percentage cut should not apply.
// Instead of forcing her to hand-enter a 0% override every time, this builds a
// closeout that zeroes the salon payout (final_payout 0) through the SAME
// override path — keeping the would-be cut as calculated_payout for the record
// and supplying the canned, NOT-NULL note the table requires. Percentage days
// (no such closeout) are untouched.
export const PAID_BY_SALON_NOTE = "Paid by salon — kept 100%";

export function paidBySalonCloseoutInput(params: {
  date: string;
  location: string;
  calculatedPayout: number;
}): DayCloseoutInput {
  return {
    date: params.date,
    location: params.location,
    final_payout: "0",
    calculated_payout: params.calculatedPayout.toFixed(2),
    note: PAID_BY_SALON_NOTE,
  };
}

export function validateDayCloseoutInput(
  raw: Partial<DayCloseoutInput>,
): DayCloseoutValidation {
  const errors: DayCloseoutErrors = {};
  const date = (raw.date ?? "").trim();
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) {
    errors.date = "Choose a valid date.";
  }

  const location = (raw.location ?? "").trim();
  if (!isBookingLocation(location)) {
    errors.location = "Choose Gina or Annette.";
  }

  const final_payout = parseMoney(raw.final_payout ?? "", "final_payout", errors);
  const calculated_payout = parseMoney(
    raw.calculated_payout ?? "",
    "calculated_payout",
    errors,
  );

  const note = (raw.note ?? "").trim();
  if (!note) {
    errors.note = "Add a closeout note.";
  } else if (note.length > NOTE_MAX) {
    errors.note = "Closeout note is too long.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      date,
      location: location as BookingLocation,
      final_payout: final_payout ?? 0,
      calculated_payout,
      note,
    },
  };
}

export function buildDayCloseoutUpsert(
  value: ValidatedDayCloseout,
  updatedAt = new Date().toISOString(),
): DayCloseoutUpsert {
  return {
    date: value.date,
    location: value.location,
    final_payout: value.final_payout,
    calculated_payout: value.calculated_payout,
    note: value.note,
    updated_at: updatedAt,
  };
}
