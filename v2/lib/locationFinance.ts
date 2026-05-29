import {
  BOOKING_LOCATION_LABELS,
  CUSTOMER_BOOKING_LOCATION_LABELS,
  type BookingLocation,
} from "./booking";
import { collapseLoggedGroomDuplicates } from "./appointmentLedger";
import type { Appointment } from "./data/types";
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
): DayMoney {
  const booked = collapseLoggedGroomDuplicates(appointments).filter(
    (appointment) =>
      (appointment.status ?? "completed") === "booked" &&
      appointment.date === date,
  );
  const percentTotals = booked.reduce(
    (totals, appointment) => {
      const money = calculateAppointmentMoney(appointment, settings);
      return {
        gross: totals.gross + money.gross,
        salonPayout: totals.salonPayout + money.salonPayout,
      };
    },
    { gross: 0, salonPayout: 0 },
  );

  const dailyRateByLocation = new Map<string, number>();
  for (const appointment of booked) {
    const code = bookingLocation(appointment.location);
    if (!code) continue;
    const setting = settings[code];
    if (setting.payoutType !== "daily_rate" || setting.dailyRate == null) continue;
    dailyRateByLocation.set(code, setting.dailyRate);
  }

  const dailyRates = Array.from(dailyRateByLocation.values()).reduce(
    (sum, rate) => sum + rate,
    0,
  );
  const salonPayout = roundMoney(percentTotals.salonPayout + dailyRates);
  return {
    gross: roundMoney(percentTotals.gross),
    salonPayout,
    samNet: roundMoney(percentTotals.gross - salonPayout),
  };
}
