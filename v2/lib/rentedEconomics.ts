// WS4c B1 — rented-chair salon split for a one_to_one / hybrid org. A new
// reporting layer that consumes the rented economics captured at onboarding
// (org_settings → orgSettings.rentedLocations). Pure; no I/O; tested in
// rentedEconomics.test.ts.
//
// FEE-SIDE ONLY (deliberate): this reports the salon's cut on FEES and what the
// groomer keeps of those fees. Nail trims are excluded from the cut (B3). Tips
// are NOT split here — the rented tip arrangement (B2) is deferred, so a
// tips-inclusive "net" would overstate take for the very orgs B2 serves; tips
// still surface in the reports Revenue tiles. Sam's batched gina/annette split
// (lib/locationFinance.ts) and the WS4b owned take-home (lib/ownerEconomics.ts)
// are untouched.

import type { Appointment } from "./data/types";
import type { RentedLocation } from "./orgSettings";
import { collapseLoggedGroomDuplicates } from "./appointmentLedger";
import { parsePaymentInfo } from "./payments";

export type RentedSplit = {
  locationName: string;
  payoutType: RentedLocation["payoutType"];
  salonKeepsPercent: number;
  dailyRate: number | null;
  fees: number;
  // Nail trims are kept 100% (B3) — excluded from the cut base.
  nailTrimFees: number;
  // fees − nailTrimFees; the base a percent cut applies to.
  eligibleFees: number;
  salonCut: number;
  feesKept: number; // fees − salonCut
};

export type RentedSplitView = { locations: RentedSplit[] };

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Same collected-in-range filtering as lib/derive.ts revenueInRange (collapse
// logged-groom duplicates, date window, exclude "waiting on payment"), so the
// rented split reconciles with the reports Revenue tiles.
function collectedAtLocation(
  appointments: Appointment[],
  locationName: string,
  from: string,
  to: string,
): Appointment[] {
  return collapseLoggedGroomDuplicates(appointments).filter(
    (a) =>
      a.location === locationName &&
      a.date >= from &&
      a.date <= to &&
      parsePaymentInfo(a.notes).status !== "waiting",
  );
}

export function rentedLocationSplit({
  location,
  appointments,
  from,
  to,
}: {
  location: RentedLocation;
  appointments: Appointment[];
  from: string;
  to: string;
}): RentedSplit {
  const atLocation = collectedAtLocation(appointments, location.name, from, to);

  const fees = round(atLocation.reduce((sum, a) => sum + (a.price ?? 0), 0));
  const nailTrimFees = round(
    atLocation
      .filter((a) => a.service === "nail_trim")
      .reduce((sum, a) => sum + (a.price ?? 0), 0),
  );
  const eligibleFees = round(fees - nailTrimFees);

  // daily_rate: a flat per-day rent regardless of how many dogs; percent: the
  // configured cut on eligible (non-nail-trim) fees.
  const salonCut =
    location.payoutType === "daily_rate"
      ? round((location.dailyRate ?? 0) * new Set(atLocation.map((a) => a.date)).size)
      : round(eligibleFees * (location.salonKeepsPercent / 100));

  return {
    locationName: location.name,
    payoutType: location.payoutType,
    salonKeepsPercent: location.salonKeepsPercent,
    dailyRate: location.dailyRate,
    fees,
    nailTrimFees,
    eligibleFees,
    salonCut,
    feesKept: round(fees - salonCut),
  };
}

export function buildRentedSplitView({
  rentedLocations,
  appointments,
  from,
  to,
}: {
  rentedLocations: RentedLocation[];
  appointments: Appointment[];
  from: string;
  to: string;
}): RentedSplitView {
  return {
    locations: rentedLocations.map((location) =>
      rentedLocationSplit({ location, appointments, from, to }),
    ),
  };
}
