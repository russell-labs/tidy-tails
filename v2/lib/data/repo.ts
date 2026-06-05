// Data access layer for Tidy Tails v2.
//
// This is the ONLY place the app reads data. Everything here is read-only:
//   - default: anonymized fixtures bundled in fixtures.ts
//   - opt-in (NEXT_PUBLIC_USE_LIVE_DATA=on): SELECT-only reads from live Supabase
//
// The live path reads through the auth-aware server Supabase client (Ship
// 2.2a) — the same session client that gates every route — so reads carry the
// signed-in operator's identity. On top of that, every live read is *explicitly*
// scoped to the operator in app code: it filters `.eq("groomer_id", <operator>)`
// and fails closed (no session -> no rows). This is defense in depth — it
// selects exactly the rows the `groomer_id = auth.uid()` RLS SELECT policy
// already allows, since `getCurrentUser().id` is the validated `auth.uid()` —
// and it is the prerequisite for multi-operator tenancy, where the app must not
// depend on RLS alone. Row shaping is done by the pure mappers in live.ts.
//
// There is no write path in this app — only `.select()` is ever called.
//
// Intended for use by Server Components only.

import { createServerSupabase, getCurrentUser } from "../supabase/server";
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
//
// Every live read is filtered to the signed-in operator via `.eq("groomer_id",
// groomerId)`. The public loaders resolve the operator with `currentGroomerId()`
// and fail closed when there is no session (no operator -> no rows), so the
// scope is enforced in app code rather than trusted to RLS alone.

// The signed-in operator's id (the validated `auth.uid()`), or null when there
// is no session. Live reads fail closed on null.
async function currentGroomerId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}

async function liveSelect(table: string, groomerId: string): Promise<Row[]> {
  const supabase = await createServerSupabase();
  return fetchAllRows(async (from, to) => {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("groomer_id", groomerId)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(`Live read failed (${table}): ${error.message}`);
    return (data ?? []) as Row[];
  });
}

async function liveSelectOptional(
  table: string,
  groomerId: string,
): Promise<{ rows: Row[]; ready: boolean }> {
  try {
    return { rows: await liveSelect(table, groomerId), ready: true };
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

// The optional `groomerId` lets a caller that already resolved the operator
// (e.g. loadDataset) thread it through instead of re-validating the session for
// each table. When omitted, the loader resolves it itself. Either way the live
// read fails closed when there is no operator.
export async function loadClients(groomerId?: string | null): Promise<Client[]> {
  if (dataMode() !== "live") return FIXTURE_CLIENTS;
  const gid = groomerId ?? (await currentGroomerId());
  if (!gid) return [];
  return (await liveSelect("clients", gid)).map(mapClientRow);
}

export async function loadPets(groomerId?: string | null): Promise<Pet[]> {
  if (dataMode() !== "live") return FIXTURE_PETS;
  const gid = groomerId ?? (await currentGroomerId());
  if (!gid) return [];
  return (await liveSelect("pets", gid)).map(mapPetRow);
}

export async function loadAppointments(
  groomerId?: string | null,
): Promise<Appointment[]> {
  if (dataMode() !== "live") return FIXTURE_APPOINTMENTS;
  const gid = groomerId ?? (await currentGroomerId());
  if (!gid) return [];
  return (await liveSelect("appointments", gid)).map(mapAppointmentRow);
}

export async function loadVaccinations(): Promise<Vaccination[]> {
  // The `vaccinations` table is a v2 schema addition (design-lock spec §6.2).
  // It does not exist on live v1, so the live path returns an empty set.
  return dataMode() === "live" ? [] : FIXTURE_VACCINATIONS;
}

export async function loadDayCloseoutOverrides(
  groomerId?: string | null,
): Promise<DayCloseoutOverride[]> {
  return (await loadDayCloseoutOverrideState(groomerId)).overrides;
}

export async function loadDayCloseoutOverrideState(groomerId?: string | null): Promise<{
  overrides: DayCloseoutOverride[];
  ready: boolean;
}> {
  if (dataMode() !== "live") return { overrides: [], ready: true };
  const gid = groomerId ?? (await currentGroomerId());
  // Fail closed: no session means no rows. The table itself is still "ready"
  // (it exists and the query would succeed) — this matches RLS returning an
  // empty set rather than a missing-table error.
  if (!gid) return { overrides: [], ready: true };
  const { rows, ready } = await liveSelectOptional("day_closeout_overrides", gid);
  return { overrides: rows.map(mapDayCloseoutOverrideRow), ready };
}

export type Dataset = {
  clients: Client[];
  pets: Pet[];
  appointments: Appointment[];
  vaccinations: Vaccination[];
};

export async function loadDataset(): Promise<Dataset> {
  // Resolve the operator once and thread it into every table load, so a full
  // dataset costs a single session validation instead of one per table. When
  // there is no session on the live path, `groomerId` is null and each loader
  // fails closed to an empty set.
  const groomerId = dataMode() === "live" ? await currentGroomerId() : null;
  const [clients, pets, appointments, vaccinations] = await Promise.all([
    loadClients(groomerId),
    loadPets(groomerId),
    loadAppointments(groomerId),
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
