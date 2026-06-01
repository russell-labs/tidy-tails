// Data access layer for Tidy Tails v2.
//
// This is the ONLY place the app reads data. Everything here is read-only:
//   - default: anonymized fixtures bundled in fixtures.ts
//   - opt-in (NEXT_PUBLIC_USE_LIVE_DATA=on): SELECT-only reads from live Supabase
//
// The live path reads through the auth-aware server Supabase client (Ship
// 2.2a) — the same session client that gates every route — so reads carry the
// signed-in operator's identity. That is inert under today's permissive RLS
// and forward-compatible with the Ship 2.2b cutover to auth.uid()-scoped
// policies. Row shaping is done by the pure mappers in live.ts.
//
// There is no write path in this app — only `.select()` is ever called.
//
// Intended for use by Server Components only.

import { createServerSupabase } from "../supabase/server";
import type {
  Appointment,
  Client,
  ClientRecord,
  DayCloseoutOverride,
  Pet,
  Vaccination,
} from "./types";
import {
  FIXTURE_APPOINTMENTS,
  FIXTURE_CLIENTS,
  FIXTURE_PETS,
  FIXTURE_VACCINATIONS,
} from "./fixtures";
import {
  fetchAllRows,
  mapAppointmentRow,
  mapClientRow,
  mapDayCloseoutOverrideRow,
  mapPetRow,
  type Row,
} from "./live";

export type DataMode = "fixtures" | "live";

export function dataMode(): DataMode {
  return process.env.NEXT_PUBLIC_USE_LIVE_DATA === "on" ? "live" : "fixtures";
}

// ---- live reads (SELECT only) -------------------------------------------------
// Reads page through fetchAllRows so a table larger than the PostgREST row cap
// (Supabase default: 1000) is never silently truncated — `appointments` is the
// table that will cross that cap first. Rows are ordered by `id` so the paged
// ranges are deterministic; the app re-sorts for display regardless.

async function liveSelect(table: string): Promise<Row[]> {
  const supabase = await createServerSupabase();
  return fetchAllRows(async (from, to) => {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(`Live read failed (${table}): ${error.message}`);
    return (data ?? []) as Row[];
  });
}

async function liveSelectOptional(table: string): Promise<{ rows: Row[]; ready: boolean }> {
  try {
    return { rows: await liveSelect(table), ready: true };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Could not find the table") ||
        error.message.includes("day_closeout_overrides"))
    ) {
      return { rows: [], ready: false };
    }
    throw error;
  }
}

// ---- public load functions ---------------------------------------------------

export async function loadClients(): Promise<Client[]> {
  if (dataMode() !== "live") return FIXTURE_CLIENTS;
  return (await liveSelect("clients")).map(mapClientRow);
}

export async function loadPets(): Promise<Pet[]> {
  if (dataMode() !== "live") return FIXTURE_PETS;
  return (await liveSelect("pets")).map(mapPetRow);
}

export async function loadAppointments(): Promise<Appointment[]> {
  if (dataMode() !== "live") return FIXTURE_APPOINTMENTS;
  return (await liveSelect("appointments")).map(mapAppointmentRow);
}

export async function loadVaccinations(): Promise<Vaccination[]> {
  // The `vaccinations` table is a v2 schema addition (design-lock spec §6.2).
  // It does not exist on live v1, so the live path returns an empty set.
  return dataMode() === "live" ? [] : FIXTURE_VACCINATIONS;
}

export async function loadDayCloseoutOverrides(): Promise<DayCloseoutOverride[]> {
  return (await loadDayCloseoutOverrideState()).overrides;
}

export async function loadDayCloseoutOverrideState(): Promise<{
  overrides: DayCloseoutOverride[];
  ready: boolean;
}> {
  if (dataMode() !== "live") return { overrides: [], ready: true };
  const { rows, ready } = await liveSelectOptional("day_closeout_overrides");
  return { overrides: rows.map(mapDayCloseoutOverrideRow), ready };
}

export type Dataset = {
  clients: Client[];
  pets: Pet[];
  appointments: Appointment[];
  vaccinations: Vaccination[];
};

export async function loadDataset(): Promise<Dataset> {
  const [clients, pets, appointments, vaccinations] = await Promise.all([
    loadClients(),
    loadPets(),
    loadAppointments(),
    loadVaccinations(),
  ]);
  return { clients, pets, appointments, vaccinations };
}

/** A single client with their pets and appointments attached, or null. */
export async function getClientRecord(id: string): Promise<ClientRecord | null> {
  const { clients, pets, appointments } = await loadDataset();
  const client = clients.find((c) => c.id === id);
  if (!client) return null;
  return {
    client,
    pets: pets.filter((p) => p.client_id === id),
    appointments: appointments.filter((a) => a.client_id === id),
  };
}
