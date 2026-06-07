"use server";

import { loadAppointments, loadPets } from "@/lib/data/repo";
import type { Appointment, Pet } from "@/lib/data/types";

// TT-001 — the Add appointment day-fit note and slot list must reflect the
// WHOLE day, not just the household being booked. The booking modal only has the
// current household's record, so this action loads the full day for the
// operator's org and returns it for `assessDayFit` / the slot helpers.
//
// Scoping: `loadAppointments()` / `loadPets()` resolve the signed-in operator
// (currentGroomerId) and read through per-org RLS — the same readers
// `loadDataset()` feeds the Schedule day view, so the counts match it by
// construction. No org/RLS change here; no other org's rows are ever returned.
export type DayCapacityState = {
  date: string;
  appointments: Appointment[];
  pets: Pet[];
};

export async function getDayCapacity(date: string): Promise<DayCapacityState> {
  // Guard a malformed date the same way checkBookingAvailability does, so a
  // half-typed date never triggers a full read.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { date, appointments: [], pets: [] };
  }

  const [allAppointments, allPets] = await Promise.all([
    loadAppointments(),
    loadPets(),
  ]);

  // The full day's appointments across every household in the operator's org…
  const appointments = allAppointments.filter(
    (appointment) => appointment.date === date,
  );
  // …plus only the pets those appointments reference (what summarizeDayLoad
  // needs to look up each booked dog's work profile).
  const referenced = new Set(appointments.map((appointment) => appointment.pet_id));
  const pets = allPets.filter((pet) => referenced.has(pet.id));

  return { date, appointments, pets };
}
