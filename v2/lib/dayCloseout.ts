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
