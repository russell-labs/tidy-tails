// WS4b — owner-operator take-home. A new reporting layer that consumes the
// economics captured at onboarding (org_settings → orgSettings.ownedLocations)
// and never touches Sam's gina/annette split (lib/locationFinance.ts). Pure; no
// I/O; unit-tested in ownerEconomics.test.ts.
//
// TAKE-HOME = collected (FEES + TIPS) − monthly expenses. The owner works at her
// own shop, so she keeps her tips — fees and tips are shown as separate lines
// and both count toward take-home. Monthly only (recurring expenses are monthly
// figures; we never pro-rate). No "salon keeps"/payout/split vocabulary.

import type { Appointment } from "./data/types";
import type { OwnedLocation, OwnedLocationExpenses } from "./orgSettings";
import { monthBounds, revenueInRange } from "./derive";

const EXPENSE_LABELS: { key: keyof OwnedLocationExpenses; label: string }[] = [
  { key: "rentMortgage", label: "Rent / mortgage" },
  { key: "utilities", label: "Utilities" },
  { key: "supplies", label: "Supplies" },
  { key: "upkeep", label: "Upkeep" },
  { key: "cleaning", label: "Cleaning" },
];

export type ExpenseLine = {
  key: keyof OwnedLocationExpenses;
  label: string;
  amount: number;
};

export type OwnerTakeHome = {
  locationName: string;
  fees: number;
  tips: number;
  collected: number; // fees + tips
  expenseLines: ExpenseLine[];
  totalExpenses: number;
  hasExpensesOnFile: boolean;
  // collected − totalExpenses when at least one expense is on file; otherwise
  // null — we never present "collected − 0" as a take-home figure.
  takeHome: number | null;
};

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** True only when [from,to] is exactly the first..last day of a calendar month. */
export function isWholeMonth(from: string, to: string): boolean {
  const bounds = monthBounds(new Date(`${from}T00:00:00`));
  return bounds.from === from && bounds.to === to;
}

export function ownerLocationTakeHome({
  locationName,
  appointments,
  from,
  to,
  expenses,
}: {
  locationName: string;
  appointments: Appointment[];
  from: string;
  to: string;
  expenses: OwnedLocationExpenses;
}): OwnerTakeHome {
  const atLocation = appointments.filter((a) => a.location === locationName);
  const revenue = revenueInRange(atLocation, from, to);
  const fees = round(revenue.fees);
  const tips = round(revenue.tips);
  const collected = round(fees + tips);

  const expenseLines = EXPENSE_LABELS.flatMap(({ key, label }) => {
    const amount = expenses[key];
    return amount != null ? [{ key, label, amount: round(amount) }] : [];
  });
  const hasExpensesOnFile = expenseLines.length > 0;
  const totalExpenses = round(expenseLines.reduce((s, l) => s + l.amount, 0));
  const takeHome = hasExpensesOnFile ? round(collected - totalExpenses) : null;

  return {
    locationName,
    fees,
    tips,
    collected,
    expenseLines,
    totalExpenses,
    hasExpensesOnFile,
    takeHome,
  };
}

export type OwnerTakeHomeView = {
  isWholeMonth: boolean;
  locations: OwnerTakeHome[];
};

// The view-model the reports + export surfaces render: per owned location, plus
// whether the period is a whole month (take-home is only honest for a full
// month of recurring expenses).
export function buildOwnerTakeHomeView({
  ownedLocations,
  appointments,
  from,
  to,
}: {
  ownedLocations: OwnedLocation[];
  appointments: Appointment[];
  from: string;
  to: string;
}): OwnerTakeHomeView {
  return {
    isWholeMonth: isWholeMonth(from, to),
    locations: ownedLocations.map((location) =>
      ownerLocationTakeHome({
        locationName: location.name,
        appointments,
        from,
        to,
        expenses: location.expenses,
      }),
    ),
  };
}
