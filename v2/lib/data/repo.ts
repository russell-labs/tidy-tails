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
import { activeImpersonation } from "../admin/impersonation.server";
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
// Every live read is filtered by `liveReadScope()`: normally the signed-in
// operator via `.eq("groomer_id", auth.uid())`, and — only while a platform
// admin holds an active impersonation session (TT-015) — by `.eq("org_id",
// <impersonated org>)` instead. The loaders fail closed when there is no scope
// (no session and no impersonation -> no rows), so the scope is enforced in app
// code rather than trusted to RLS alone. Writes never use this seam.

// The signed-in operator's id (the validated `auth.uid()`), or null when there
// is no session. Live reads fail closed on null. Exported so the other live
// read paths (audit, booking requests, SMS list) scope with the same seam.
export async function currentGroomerId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}

// ---- org context (WS2.3) -----------------------------------------------------
// The signed-in operator's organization id, resolved from their membership row
// (single-org per operator for now). Returns null when there is no session or
// no membership. This is the read seam; writes never use it directly — they go
// through requireOrgId() below, which fails closed on null.
//
// The query runs through the same auth-aware session client as every other
// live read, so the per-org RLS `membership_self_select` policy
// (`user_id = auth.uid()`) returns exactly the operator's own membership.
export async function currentOrgId(): Promise<string | null> {
  const userId = (await getCurrentUser())?.id;
  if (!userId) return null;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as { org_id: string } | null)?.org_id ?? null;
}

// Resolve the operator's org id for a write, or fail closed. Every tenant-row
// INSERT must carry org_id: under per-org RLS an INSERT without it is rejected
// (sqlstate 42501), and on the service-role webhook (which bypasses RLS) a null
// would silently orphan the row outside the operator's org. Throwing here
// guarantees we never write a null org_id — no session/membership means no
// write, with a clear error rather than a silent corruption.
//
// SECURITY INVARIANT (TT-015): this stays MEMBER-ONLY and impersonation-UNAWARE
// on purpose. It must never return an impersonated org — that purity is what
// guarantees an admin's writes can never target a tenant org. A platform admin
// has no membership, so currentOrgId() is null and this throws on any write.
export async function requireOrgId(): Promise<string> {
  const orgId = await currentOrgId();
  if (!orgId) {
    throw new Error(
      "No organization context for the current operator — refusing to write tenant data without an org_id.",
    );
  }
  return orgId;
}

// ---- read scope (TT-015 impersonation pivot) ---------------------------------
// The column+value every live SELECT scopes on. Normally the operator seam
// `groomer_id = auth.uid()`. While a platform admin has an active impersonation
// session, reads pivot to `org_id = <impersonated org>` — and ONLY reads: this
// feeds SELECTs, never a write (writes go through requireOrgId, above, which is
// deliberately impersonation-unaware). Every read still fails closed: a null
// scope yields an empty set, never a leak.
export type LiveReadScope =
  | { column: "groomer_id"; value: string }
  | { column: "org_id"; value: string };

export async function liveReadScope(): Promise<LiveReadScope | null> {
  const impersonation = await activeImpersonation();
  if (impersonation) return { column: "org_id", value: impersonation.orgId };
  const groomerId = await currentGroomerId();
  if (!groomerId) return null;
  return { column: "groomer_id", value: groomerId };
}

// The org whose data is currently on screen: the impersonated org while a
// session is active, else the operator's own org. READ/DISPLAY ONLY — never use
// this to scope a write (use requireOrgId for that).
export async function effectiveOrgId(): Promise<string | null> {
  const impersonation = await activeImpersonation();
  if (impersonation) return impersonation.orgId;
  return currentOrgId();
}

async function liveSelect(table: string, scope: LiveReadScope): Promise<Row[]> {
  const supabase = await createServerSupabase();
  return fetchAllRows(async (from, to) => {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(scope.column, scope.value)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(`Live read failed (${table}): ${error.message}`);
    return (data ?? []) as Row[];
  });
}

async function liveSelectOptional(
  table: string,
  scope: LiveReadScope,
): Promise<{ rows: Row[]; ready: boolean }> {
  try {
    return { rows: await liveSelect(table, scope), ready: true };
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

// The optional `scope` lets a caller that already resolved it (e.g. loadDataset)
// thread it through instead of re-resolving the read scope for each table. When
// omitted, the loader resolves it itself. Either way the live read fails closed
// (no scope -> empty set). While impersonating, the scope is the impersonated
// org; normally the signed-in operator.
export async function loadClients(scope?: LiveReadScope | null): Promise<Client[]> {
  if (dataMode() !== "live") return FIXTURE_CLIENTS;
  const s = scope ?? (await liveReadScope());
  if (!s) return [];
  return (await liveSelect("clients", s)).map(mapClientRow);
}

export async function loadPets(scope?: LiveReadScope | null): Promise<Pet[]> {
  if (dataMode() !== "live") return FIXTURE_PETS;
  const s = scope ?? (await liveReadScope());
  if (!s) return [];
  return (await liveSelect("pets", s)).map(mapPetRow);
}

export async function loadAppointments(
  scope?: LiveReadScope | null,
): Promise<Appointment[]> {
  if (dataMode() !== "live") return FIXTURE_APPOINTMENTS;
  const s = scope ?? (await liveReadScope());
  if (!s) return [];
  return (await liveSelect("appointments", s)).map(mapAppointmentRow);
}

export async function loadVaccinations(): Promise<Vaccination[]> {
  // The `vaccinations` table is a v2 schema addition (design-lock spec §6.2).
  // It does not exist on live v1, so the live path returns an empty set.
  return dataMode() === "live" ? [] : FIXTURE_VACCINATIONS;
}

export async function loadDayCloseoutOverrides(
  scope?: LiveReadScope | null,
): Promise<DayCloseoutOverride[]> {
  return (await loadDayCloseoutOverrideState(scope)).overrides;
}

export async function loadDayCloseoutOverrideState(scope?: LiveReadScope | null): Promise<{
  overrides: DayCloseoutOverride[];
  ready: boolean;
}> {
  if (dataMode() !== "live") return { overrides: [], ready: true };
  const s = scope ?? (await liveReadScope());
  // Fail closed: no scope means no rows. The table itself is still "ready"
  // (it exists and the query would succeed) — this matches RLS returning an
  // empty set rather than a missing-table error.
  if (!s) return { overrides: [], ready: true };
  const { rows, ready } = await liveSelectOptional("day_closeout_overrides", s);
  return { overrides: rows.map(mapDayCloseoutOverrideRow), ready };
}

export type Dataset = {
  clients: Client[];
  pets: Pet[];
  appointments: Appointment[];
  vaccinations: Vaccination[];
};

export async function loadDataset(): Promise<Dataset> {
  // Resolve the read scope once and thread it into every table load, so a full
  // dataset costs a single scope resolution instead of one per table. When there
  // is no scope on the live path (no session, no impersonation), it is null and
  // each loader fails closed to an empty set. While impersonating, the scope is
  // the impersonated org, so the whole dataset is that org's — consistently.
  const scope = dataMode() === "live" ? await liveReadScope() : null;
  const [clients, pets, appointments, vaccinations] = await Promise.all([
    loadClients(scope),
    loadPets(scope),
    loadAppointments(scope),
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
