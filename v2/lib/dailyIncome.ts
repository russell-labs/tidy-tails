import { BOOKING_LOCATIONS, type BookingLocation } from "./booking";
import type { DailyIncome } from "./data/types";

// TT-014: a lump-sum cash total for a rented-chair day where Sam grooms with
// someone and doesn't log individual dogs. The amount is GROSS cash collected,
// attached to the rented location for that date; the existing per-location cut
// derives take-home (see lib/locationFinance.ts). Mirrors lib/dayCloseout.ts.

export type DailyIncomeInput = {
  date: string;
  location: string;
  amount: string;
  note: string;
};

export type ValidatedDailyIncome = {
  date: string;
  location: BookingLocation;
  amount: number;
  note: string | null;
};

export type DailyIncomeErrors = Partial<Record<keyof DailyIncomeInput, string>>;

export type DailyIncomeValidation =
  | { ok: true; value: ValidatedDailyIncome }
  | { ok: false; errors: DailyIncomeErrors };

export type DailyIncomeUpsert = {
  date: string;
  location: BookingLocation;
  amount: number;
  note: string | null;
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

export function dailyIncomeKey(date: string, location: string): string {
  return `${date}::${location}`;
}

/**
 * Sum of gross daily-income amounts whose date falls within [from, to]
 * inclusive. This is the lump-sum cash that rolls into the reports "Total
 * collected" alongside appointment fees + tips (TT-014).
 */
export function sumDailyIncomeInRange(
  dailyIncomes: DailyIncome[],
  from: string,
  to: string,
): number {
  return roundMoney(
    dailyIncomes
      .filter((income) => income.date >= from && income.date <= to)
      .reduce((sum, income) => sum + income.amount, 0),
  );
}

export function validateDailyIncomeInput(
  raw: Partial<DailyIncomeInput>,
): DailyIncomeValidation {
  const errors: DailyIncomeErrors = {};

  const date = (raw.date ?? "").trim();
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) {
    errors.date = "Choose a valid date.";
  }

  const location = (raw.location ?? "").trim();
  if (!isBookingLocation(location)) {
    errors.location = "Choose Gina or Annette.";
  }

  const amountRaw = (raw.amount ?? "").trim();
  const amount = Number(amountRaw);
  if (!amountRaw || !Number.isFinite(amount) || amount <= 0) {
    errors.amount = "Enter the amount you collected.";
  }

  const noteRaw = (raw.note ?? "").trim();
  if (noteRaw.length > NOTE_MAX) {
    errors.note = "Note is too long.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      date,
      location: location as BookingLocation,
      amount: roundMoney(amount),
      note: noteRaw || null,
    },
  };
}

export function buildDailyIncomeUpsert(
  value: ValidatedDailyIncome,
  updatedAt = new Date().toISOString(),
): DailyIncomeUpsert {
  return {
    date: value.date,
    location: value.location,
    amount: value.amount,
    note: value.note,
    updated_at: updatedAt,
  };
}
