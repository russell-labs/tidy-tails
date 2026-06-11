import {
  BOOKING_LOCATION_LABELS,
  CUSTOMER_BOOKING_LOCATION_LABELS,
  bookingLocationLabel,
  type BookingLocation,
} from "./booking";
import { collapseLoggedGroomDuplicates } from "./appointmentLedger";
import { isScheduleSlateAppointment } from "./appointmentWorkflow";
import type { Appointment, DailyIncome, DayCloseoutOverride } from "./data/types";
import type { LocationSettingsMap } from "./operatorSettings";
import { parseSalonPayoutOverride } from "./payoutOverride";

export type AppointmentMoney = {
  gross: number;
  salonPayout: number;
  samNet: number;
  payoutLabel: string | null;
};

export type DayMoney = {
  gross: number;
  salonPayout: number;
  samNet: number;
};

export type DayLocationMoney = DayMoney & {
  date: string;
  location: string;
  calculatedSalonPayout: number;
  override: DayCloseoutOverride | null;
};

function daySlateAppointments(
  appointments: Appointment[],
  date: string,
): Appointment[] {
  return collapseLoggedGroomDuplicates(appointments).filter(
    (appointment) =>
      isScheduleSlateAppointment(appointment) && appointment.date === date,
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function bookingLocation(
  location: string | null | undefined,
): BookingLocation | null {
  return location === "gina" || location === "annette" ? location : null;
}

function locationSettings(
  location: string | null | undefined,
  settings: LocationSettingsMap,
) {
  const code = bookingLocation(location);
  return code ? settings[code] : null;
}

export function locationLabelFromSettings(
  location: string | null | undefined,
  settings: LocationSettingsMap | null | undefined,
): string | null {
  const code = bookingLocation(location);
  if (!code) return null;
  return (settings?.[code]?.displayName || BOOKING_LOCATION_LABELS[code]) ?? null;
}

export function customerLocationLabelFromSettings(
  location: string | null | undefined,
  settings: LocationSettingsMap | null | undefined,
): string | null {
  const code = bookingLocation(location);
  if (!code) return null;
  return (
    (settings?.[code]?.customerAddress || CUSTOMER_BOOKING_LOCATION_LABELS[code]) ??
    null
  );
}

/**
 * The customer-facing location label an appointment summary shows the operator:
 * the settings-defined customer address when present, otherwise the built-in
 * booking-location label. This resolution was duplicated inline in the booking
 * and edit-appointment summary builders.
 */
export function customerFacingLocationLabel(
  location: string | null | undefined,
  settings: LocationSettingsMap | null | undefined,
): string | null {
  return (
    customerLocationLabelFromSettings(location, settings) ??
    bookingLocationLabel(location)
  );
}

export function calculateAppointmentMoney(
  appointment: Pick<Appointment, "price" | "location" | "notes">,
  settings: LocationSettingsMap,
): AppointmentMoney {
  const gross = appointment.price ?? 0;
  const location = locationSettings(appointment.location, settings);
  if (!location || gross <= 0) {
    return {
      gross,
      salonPayout: 0,
      samNet: gross,
      payoutLabel: location ? "No fee" : null,
    };
  }

  const payoutOverride = parseSalonPayoutOverride(appointment.notes);
  if (payoutOverride != null) {
    const salonPayout = roundMoney(gross * (payoutOverride / 100));
    return {
      gross,
      salonPayout,
      samNet: roundMoney(gross - salonPayout),
      payoutLabel: `Salon keeps ${payoutOverride}% override`,
    };
  }

  if (location.payoutType === "daily_rate") {
    return {
      gross,
      salonPayout: 0,
      samNet: gross,
      payoutLabel:
        location.dailyRate != null ? `Daily rate $${location.dailyRate}` : null,
    };
  }

  const salonPayout = roundMoney(gross * (location.salonKeepsPercent / 100));
  return {
    gross,
    salonPayout,
    samNet: roundMoney(gross - salonPayout),
    payoutLabel: `Salon keeps ${location.salonKeepsPercent}%`,
  };
}

export function calculateDayMoney(
  appointments: Appointment[],
  date: string,
  settings: LocationSettingsMap,
  overrides: DayCloseoutOverride[] = [],
  dailyIncomes: DailyIncome[] = [],
): DayMoney {
  const locations = calculateDayLocationMoney(
    appointments,
    date,
    settings,
    overrides,
    dailyIncomes,
  );
  const unassigned = daySlateAppointments(appointments, date).filter(
    (appointment) => !bookingLocation(appointment.location),
  );
  const unassignedGross = roundMoney(
    unassigned.reduce(
      (sum, appointment) => sum + calculateAppointmentMoney(appointment, settings).gross,
      0,
    ),
  );
  const unassignedPayout = roundMoney(
    unassigned.reduce(
      (sum, appointment) =>
        sum + calculateAppointmentMoney(appointment, settings).salonPayout,
      0,
    ),
  );
  const gross = roundMoney(
    locations.reduce((sum, location) => sum + location.gross, 0) +
      unassignedGross,
  );
  const salonPayout = roundMoney(
    locations.reduce((sum, location) => sum + location.salonPayout, 0) +
      unassignedPayout,
  );
  return {
    gross,
    salonPayout,
    samNet: roundMoney(gross - salonPayout),
  };
}

export function calculateDayLocationMoney(
  appointments: Appointment[],
  date: string,
  settings: LocationSettingsMap,
  overrides: DayCloseoutOverride[] = [],
  dailyIncomes: DailyIncome[] = [],
): DayLocationMoney[] {
  const booked = daySlateAppointments(appointments, date);
  const locations = new Set<string>();
  for (const appointment of booked) {
    if (bookingLocation(appointment.location)) locations.add(appointment.location!);
  }
  for (const override of overrides) {
    if (override.date === date && bookingLocation(override.location)) {
      locations.add(override.location);
    }
  }
  // TT-014: a lump-sum daily-income entry creates a location row even on a day
  // with no individual bookings (a rented-chair day Sam grooms with someone).
  for (const income of dailyIncomes) {
    if (income.date === date && bookingLocation(income.location)) {
      locations.add(income.location);
    }
  }

  return Array.from(locations).sort().map((location) => {
    const code = bookingLocation(location)!;
    const locationAppointments = booked.filter(
      (appointment) => bookingLocation(appointment.location) === code,
    );
    const appointmentGross = roundMoney(
      locationAppointments.reduce(
        (sum, appointment) => sum + calculateAppointmentMoney(appointment, settings).gross,
        0,
      ),
    );
    const percentPayout = roundMoney(
      locationAppointments.reduce(
        (sum, appointment) =>
          sum + calculateAppointmentMoney(appointment, settings).salonPayout,
        0,
      ),
    );
    // TT-014: daily income is GROSS cash at this location; the existing cut
    // derives take-home. It adds to gross, and (for percent locations) the cut
    // scales with it. For a daily-rate location the rent is flat, so daily
    // income lifts gross and net without changing the payout.
    const setting = settings[code];
    const dailyIncomeGross = roundMoney(
      dailyIncomes
        .filter((income) => income.date === date && income.location === code)
        .reduce((sum, income) => sum + income.amount, 0),
    );
    const gross = roundMoney(appointmentGross + dailyIncomeGross);
    const dailyIncomePercentPayout =
      setting.payoutType === "daily_rate"
        ? 0
        : roundMoney(dailyIncomeGross * (setting.salonKeepsPercent / 100));
    const calculatedSalonPayout = roundMoney(
      setting.payoutType === "daily_rate" && setting.dailyRate != null
        ? setting.dailyRate
        : percentPayout + dailyIncomePercentPayout,
    );
    const override =
      overrides.find(
        (candidate) => candidate.date === date && candidate.location === code,
      ) ?? null;
    const salonPayout = roundMoney(
      override ? override.final_payout : calculatedSalonPayout,
    );

    return {
      date,
      location: code,
      gross,
      calculatedSalonPayout,
      salonPayout,
      samNet: roundMoney(gross - salonPayout),
      override,
    };
  });
}
