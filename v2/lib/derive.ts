// Derived computations: lapsed clients, vaccination status, revenue.
// All pure — no data access. Callers pass in the records they already loaded.

import type { Appointment, Client, Pet, Vaccination } from "./data/types";
import { daysFromToday } from "./format";
import { parsePaymentInfo } from "./payments";

/**
 * Most recent *past* appointment in a list — the client's last actual visit —
 * or null. A booking dated after `today` is a future appointment, not a visit,
 * so it is excluded: "last visit" never shows a date that has not happened yet.
 * An appointment dated exactly `today` counts as a visit. `today` (an ISO
 * `YYYY-MM-DD` date) defaults to the current date.
 */
export function lastAppointment(
  appointments: Appointment[],
  today: string = iso(new Date()),
): Appointment | null {
  const pastVisits = appointments.filter((a) => a.date <= today);
  if (pastVisits.length === 0) return null;
  return [...pastVisits].sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** Newest-first copy of an appointment list. */
export function sortByDateDesc(appointments: Appointment[]): Appointment[] {
  return [...appointments].sort((a, b) => b.date.localeCompare(a.date));
}

/** Whole days since this client was last seen, or null if never. */
export function daysSinceLastVisit(appointments: Appointment[]): number | null {
  const last = lastAppointment(appointments);
  if (!last) return null;
  return -daysFromToday(last.date);
}

/**
 * The service a pet usually gets — the most frequently booked one. A frequency
 * tie is broken toward the service on the most recent appointment, so "usual"
 * tracks what Sam is doing lately. Appointments with no recorded service are
 * skipped; null when none of the history records a service.
 */
export function usualService(appointments: Appointment[]): string | null {
  const known = appointments.filter((a) => a.service != null);
  if (known.length === 0) return null;

  const counts = new Map<string, number>();
  for (const a of known) {
    counts.set(a.service!, (counts.get(a.service!) ?? 0) + 1);
  }
  const max = Math.max(...counts.values());
  const topServices = new Set(
    [...counts].filter(([, n]) => n === max).map(([service]) => service),
  );
  if (topServices.size === 1) return [...topServices][0];

  // Tie: pick the tied service seen on the most recent appointment.
  for (const a of sortByDateDesc(known)) {
    if (a.service != null && topServices.has(a.service)) return a.service;
  }
  return null; // unreachable — topServices is non-empty
}

/**
 * The price a pet's groom usually costs — the median of past prices. Median,
 * not average or most-recent, so a one-off high or low charge does not skew the
 * figure Sam quotes on a call. Appointments with no recorded price are skipped;
 * null when none of the history records a price.
 */
export function usualPrice(appointments: Appointment[]): number | null {
  const prices = appointments
    .map((a) => a.price)
    .filter((p): p is number => p != null)
    .sort((x, y) => x - y);
  if (prices.length === 0) return null;

  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 === 0
    ? (prices[mid - 1] + prices[mid]) / 2
    : prices[mid];
}

/** Most recent non-null price, used as the editable default for a new booking. */
export function lastKnownPrice(appointments: Appointment[]): number | null {
  for (const appointment of sortByDateDesc(appointments)) {
    if (appointment.price != null) return appointment.price;
  }
  return null;
}

/** Most recent non-null service, used as the editable default for a new booking. */
export function lastKnownService(appointments: Appointment[]): string | null {
  for (const appointment of sortByDateDesc(appointments)) {
    if (appointment.service != null) return appointment.service;
  }
  return null;
}

export type PetDisplayGroup = {
  pet: Pet;
  pets: Pet[];
  appointments: Appointment[];
};

function petDisplayKey(pet: Pet): string {
  return [
    normalizePetName(pet.name),
    normalizeBreedForDuplicateDetection(pet.breed),
  ].join("::");
}

function normalizePetName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeBreedForDuplicateDetection(breed: string | null): string {
  const value = (breed ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\bsheppard\b/g, "shepherd")
    .replace(/\bgerman shepherd\b/g, "shepherd")
    .replace(/\bg\\.?\s*pyrennes\b/g, "great pyrenees")
    .replace(/\bpyrennes\b/g, "pyrenees");

  return value;
}

function primaryPetForGroup(pets: Pet[], appointments: Appointment[]): Pet {
  return [...pets].sort((a, b) => {
    const aLast = lastAppointment(appointments.filter((appt) => appt.pet_id === a.id));
    const bLast = lastAppointment(appointments.filter((appt) => appt.pet_id === b.id));
    const dateCompare = (bLast?.date ?? "").localeCompare(aLast?.date ?? "");
    if (dateCompare !== 0) return dateCompare;
    return b.created_at.localeCompare(a.created_at);
  })[0];
}

/**
 * Display duplicate pet rows with the same name/breed as one pet profile.
 *
 * Some imported card histories created split rows like Chloe/Chloe and
 * Milo/Milo under the same household. The database rows are kept intact until a
 * proper reconciliation pass, but the product view should answer Sam's question
 * as one animal with one combined history.
 */
export function groupPetsForDisplay(
  pets: Pet[],
  appointments: Appointment[],
): PetDisplayGroup[] {
  const groups = new Map<string, Pet[]>();
  for (const pet of pets) {
    const key = petDisplayKey(pet);
    const current = groups.get(key) ?? [];
    current.push(pet);
    groups.set(key, current);
  }

  return [...groups.values()].map((groupPets) => {
    const ids = new Set(groupPets.map((p) => p.id));
    const groupAppointments = appointments.filter((a) => ids.has(a.pet_id));
    return {
      pet: primaryPetForGroup(groupPets, appointments),
      pets: groupPets,
      appointments: groupAppointments,
    };
  });
}

export function matchingPetRows(pet: Pet, pets: Pet[]): Pet[] {
  const key = petDisplayKey(pet);
  return pets.filter((candidate) => petDisplayKey(candidate) === key);
}

export type LapsedClient = {
  client: Client;
  pets: Pet[];
  lastVisit: Appointment | null;
  daysSince: number | null;
};

/** Clients with no appointment within `thresholdDays`. Most-overdue first. */
export function lapsedClients(
  clients: Client[],
  appointments: Appointment[],
  pets: Pet[],
  thresholdDays: number,
): LapsedClient[] {
  return clients
    .map((client) => {
      const own = appointments.filter((a) => a.client_id === client.id);
      const last = lastAppointment(own);
      const daysSince = daysSinceLastVisit(own);
      return {
        client,
        pets: pets.filter((p) => p.client_id === client.id),
        lastVisit: last,
        daysSince,
      };
    })
    .filter((row) => row.daysSince == null || row.daysSince >= thresholdDays)
    .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity));
}

export type VaxState = "current" | "expiring" | "expired" | "unknown";

/** Status of a single vaccination record. "expiring" = within 30 days. */
export function vaccinationState(vax: Vaccination): VaxState {
  const days = daysFromToday(vax.expires_at);
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "current";
}

/** Worst status across a pet's vaccination records. */
export function petVaccinationState(records: Vaccination[]): VaxState {
  if (records.length === 0) return "unknown";
  const states = records.map(vaccinationState);
  if (states.includes("expired")) return "expired";
  if (states.includes("expiring")) return "expiring";
  return "current";
}

export type RevenueSummary = {
  count: number;
  fees: number;
  tips: number;
  total: number;
  averageFee: number;
  averageTotal: number;
};

/**
 * Totals for appointments whose date falls within [from, to] inclusive.
 * `count` is every visit in the window. Fees and tips are kept separate so the
 * app can match Sam's Excel books: groom fee, optional tip, total collected.
 * A missing fee/tip never reads as a fabricated row-level $0, but totals treat
 * missing values as absent amounts.
 */
export function revenueInRange(
  appointments: Appointment[],
  from: string,
  to: string,
): RevenueSummary {
  const inRange = appointments.filter((a) => a.date >= from && a.date <= to);
  const collected = inRange.filter(
    (a) => parsePaymentInfo(a.notes).status !== "waiting",
  );
  const priced = collected.filter((a) => a.price != null);
  const fees = priced.reduce((sum, a) => sum + (a.price ?? 0), 0);
  const tips = collected.reduce((sum, a) => sum + (a.tip ?? 0), 0);
  const total = fees + tips;
  return {
    count: inRange.length,
    fees,
    tips,
    total,
    averageFee: priced.length ? fees / priced.length : 0,
    averageTotal: inRange.length ? total / inRange.length : 0,
  };
}

/** First and last day of the month containing `ref` (defaults to today). */
export function monthBounds(ref: Date = new Date()): { from: string; to: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  return { from: iso(first), to: iso(last) };
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
