// Agentic layer — READ-ONLY tools.
//
// Each tool is a thin, typed wrapper over an EXISTING org-scoped read path. No
// business logic lives here: the tools call the same loaders Sam's screens call
// (`loadDataset`, `readOperatorSettings`, `loadDayCloseoutOverrides`) and the
// same pure derivations (`appointmentsForDay`, `searchHouseholds`,
// `groupPetsForDisplay`, `calculateDayMoney`, `lapsedClients`). Because every
// load goes through `createServerSupabase` (the request's authed session), the
// tools inherit RLS + the org_id guard automatically — the agent gets NO direct
// DB access and physically cannot reach another tenant's rows.
//
// SAFETY INVARIANTS (asserted by lib/agent/agentSafety.test.ts):
//   1. Read-only. There is NO write/send/log/delete tool in this phase. The
//      agent cannot book, text, log, or delete — there is simply no tool for it.
//   2. No service-role bypass. This module (and the whole lib/agent path) must
//      never import the admin/service-role Supabase client; every data access
//      goes through the request's authed session, so it stays RLS-bound.
//   3. Operator data only; customer-authored text stays out. Tools expose the
//      operator's OWN notes — per-visit groom notes (`appointment.notes`) and a
//      pet's standing `grooming_notes` (clipper number, coat, behavior, products)
//      — because they are Sam's own org-scoped data. They do NOT load or echo
//      CUSTOMER-authored free text: inbound SMS message bodies and self-serve
//      booking-request notes are never read here. `loadDataset` only returns
//      clients/pets/appointments/vaccinations, so that surface is structurally
//      unreachable — customer content is data, never instructions. The safety
//      test forbids the customer-text loaders by name across the whole agent path.
//
// Server-only: imported by the agent runner inside a server action's request
// scope (it reaches into `next/headers` via readOperatorSettings). Never import
// from client code.

import {
  loadDataset,
  loadDayCloseoutOverrides,
  type Dataset,
} from "@/lib/data/repo";
import type { Appointment, Client, Pet } from "@/lib/data/types";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import { appointmentsForDay } from "@/lib/schedule";
import { searchHouseholds, type SearchHousehold } from "@/lib/search";
import { groupPetsForDisplay, lapsedClients } from "@/lib/derive";
import {
  calculateDayMoney,
  calculateDayLocationMoney,
  locationLabelFromSettings,
} from "@/lib/locationFinance";
import { formatPhone, fullName } from "@/lib/format";
import { todayISO } from "@/lib/dates";

/** Thrown for caller-correctable bad input; surfaced to the agent as a tool error. */
export class AgentToolError extends Error {}

/** A read tool the agent may call. Shape mirrors the Anthropic tool-use schema. */
export type AgentReadTool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
  /** Execute the tool. Runs in the request scope, so loaders resolve the org. */
  run: (input: Record<string, unknown>) => Promise<unknown>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireIsoDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    throw new AgentToolError(
      `\`${field}\` must be an ISO date in YYYY-MM-DD form (got ${JSON.stringify(value)}).`,
    );
  }
  return value;
}

function optionalIsoDate(value: unknown, field: string): string | null {
  if (value == null || value === "") return null;
  return requireIsoDate(value, field);
}

/** Inclusive list of ISO dates from start..end, capped so a stray range can't blow up. */
function datesInRange(start: string, end: string, cap = 31): string[] {
  if (end < start) {
    throw new AgentToolError("`end_date` must not be before `start_date`.");
  }
  const out: string[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last && out.length < cap) {
    out.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
        cursor.getDate(),
      ).padStart(2, "0")}`,
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function ownerName(client: Client | null): string {
  return client ? fullName(client.first_name, client.last_name) : "Unknown owner";
}

function toSearchHouseholds(dataset: Dataset): SearchHousehold[] {
  return dataset.clients.map((client) => ({
    id: client.id,
    firstName: client.first_name,
    lastName: client.last_name,
    phone: client.phone,
    pets: dataset.pets
      .filter((pet) => pet.client_id === client.id)
      .map((pet) => ({ id: pet.id, name: pet.name })),
  }));
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/** getSchedule(date | range) — the day/range view the Schedule screen shows. */
const getSchedule: AgentReadTool = {
  name: "get_schedule",
  description:
    "Look up booked appointments for a single day or a date range. Pass `date` " +
    "for one day, or `start_date`+`end_date` for a range (max 31 days). Dates " +
    "must be concrete ISO dates (YYYY-MM-DD); resolve relative words like " +
    "'today', 'tomorrow', or 'Friday' to an ISO date yourself using the " +
    "current date in context, and ask the operator if a relative date is " +
    "genuinely ambiguous (e.g. which Friday). Defaults to today when no date " +
    "is given. Returns each appointment's time, owner, pet, service, fee, " +
    "status, and location.",
  input_schema: {
    type: "object",
    properties: {
      date: { type: "string", description: "Single day, ISO YYYY-MM-DD." },
      start_date: { type: "string", description: "Range start, ISO YYYY-MM-DD." },
      end_date: { type: "string", description: "Range end, ISO YYYY-MM-DD." },
    },
    additionalProperties: false,
  },
  run: async (input) => {
    const single = optionalIsoDate(input.date, "date");
    const start = optionalIsoDate(input.start_date, "start_date");
    const end = optionalIsoDate(input.end_date, "end_date");

    let dates: string[];
    if (single) {
      dates = [single];
    } else if (start && end) {
      dates = datesInRange(start, end);
    } else if (start || end) {
      throw new AgentToolError(
        "Provide both `start_date` and `end_date` for a range, or a single `date`.",
      );
    } else {
      dates = [todayISO()];
    }

    const { clients, pets, appointments } = await loadDataset();
    const days = dates.map((date) => ({
      date,
      appointments: appointmentsForDay({ appointments, clients, pets, date }).map(
        (row) => ({
          time: row.appointment.time_slot ?? null,
          owner: ownerName(row.client),
          pet: row.pet?.name ?? null,
          service: row.appointment.service ?? null,
          fee: row.appointment.price ?? null,
          status: row.appointment.status ?? "booked",
          location: row.appointment.location ?? null,
          stage: row.workflowLabel,
        }),
      ),
    }));

    const totalAppointments = days.reduce((sum, d) => sum + d.appointments.length, 0);
    return { range: { from: dates[0], to: dates[dates.length - 1] }, totalAppointments, days };
  },
};

/** findHousehold(query) — the same ranked search the home screen runs. */
const findHousehold: AgentReadTool = {
  name: "find_household",
  description:
    "Search the operator's households by owner name, phone number, or pet " +
    "name. Returns ranked matches with each household's id, owner name, phone, " +
    "and pets. When more than one household plausibly matches (e.g. two dogs " +
    "named 'Coco'), DO NOT guess — present the options and ask the operator " +
    "which one. Use the returned household/pet ids for follow-up lookups.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Owner name, phone, or pet name." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  run: async (input) => {
    const query = input.query;
    if (typeof query !== "string" || query.trim() === "") {
      throw new AgentToolError("`query` must be a non-empty search string.");
    }
    const dataset = await loadDataset();
    const results = searchHouseholds(query, toSearchHouseholds(dataset)).slice(0, 8);
    return {
      query,
      matchCount: results.length,
      households: results.map((result) => ({
        householdId: result.household.id,
        owner: fullName(result.household.firstName, result.household.lastName),
        phone: formatPhone(result.household.phone),
        matchedOn: result.matchedFields,
        pets: result.household.pets.map((pet) => ({ id: pet.id, name: pet.name })),
      })),
    };
  },
};

/**
 * The visits for one pet, newest first, using the same dedup grouping the pet
 * screen uses so split duplicate rows (Coco/Coco) read as one animal with one
 * combined history. Shared by get_pet_history and get_groom_detail.
 */
export function petVisits(petId: string, pets: Pet[], appointments: Appointment[]): Appointment[] {
  const group = groupPetsForDisplay(pets, appointments).find((candidate) =>
    candidate.pets.some((member) => member.id === petId),
  );
  return (group?.appointments ?? appointments.filter((a) => a.pet_id === petId))
    .slice()
    .sort((a: Appointment, b: Appointment) => b.date.localeCompare(a.date));
}

/** The operator's standing notes on a pet — her own data (grooming notes, allergies). */
function petProfile(pet: Pet) {
  return {
    id: pet.id,
    name: pet.name,
    breed: pet.breed,
    size: pet.size,
    // Operator-authored standing notes — where clipper/coat/behavior detail
    // usually lives. Never customer-authored.
    groomingNotes: pet.grooming_notes,
    allergies: pet.allergies,
    allergiesDetail: pet.allergies_detail,
  };
}

/** getPetHistory(petId) — a pet's profile + combined visit history. */
const getPetHistory: AgentReadTool = {
  name: "get_pet_history",
  description:
    "Get one pet's profile and visit history by pet id (from find_household). " +
    "Returns the pet's name, breed, size, the operator's standing grooming notes " +
    "and allergy info, the owner, and a list of past and upcoming visits (date, " +
    "service, fee, status, and the operator's own per-visit groom notes), most " +
    "recent first. For a single groom's full notes use get_groom_detail.",
  input_schema: {
    type: "object",
    properties: {
      pet_id: { type: "string", description: "Pet id from find_household." },
    },
    required: ["pet_id"],
    additionalProperties: false,
  },
  run: async (input) => {
    const petId = input.pet_id;
    if (typeof petId !== "string" || petId.trim() === "") {
      throw new AgentToolError("`pet_id` must be a non-empty pet id.");
    }
    const { clients, pets, appointments } = await loadDataset();
    const pet = pets.find((candidate) => candidate.id === petId);
    if (!pet) {
      throw new AgentToolError(
        `No pet with id ${JSON.stringify(petId)} in this account. Use find_household to look one up.`,
      );
    }
    const owner = clients.find((candidate) => candidate.id === pet.client_id) ?? null;
    const visits = petVisits(petId, pets, appointments).map((appointment) => ({
      date: appointment.date,
      service: appointment.service ?? null,
      fee: appointment.price ?? null,
      status: appointment.status ?? "booked",
      // Operator-authored per-visit groom note (clipper number, coat, behavior,
      // products). This is Sam's own note, not customer text.
      notes: appointment.notes ?? null,
    }));

    return {
      pet: petProfile(pet),
      owner: owner
        ? { id: owner.id, name: ownerName(owner), phone: formatPhone(owner.phone) }
        : null,
      visitCount: visits.length,
      visits,
    };
  },
};

/** getGroomDetail(petId, date?) — one groom's full operator-authored detail. */
const getGroomDetail: AgentReadTool = {
  name: "get_groom_detail",
  description:
    "Get the operator's own detailed notes for a single groom — the free-text " +
    "note she recorded (e.g. clipper number, coat condition, behavior, products " +
    "used), plus the pet's standing grooming notes and allergy info. Pass " +
    "`pet_id` (from find_household); optionally pass a concrete ISO `date` " +
    "(YYYY-MM-DD) to target a specific visit, otherwise the most recent completed " +
    "groom is used. Answers questions like 'what clipper did I use on Coco last " +
    "time'. Returns ONLY the operator's own notes — never a customer's messages.",
  input_schema: {
    type: "object",
    properties: {
      pet_id: { type: "string", description: "Pet id from find_household." },
      date: {
        type: "string",
        description: "Optional specific visit date, ISO YYYY-MM-DD.",
      },
    },
    required: ["pet_id"],
    additionalProperties: false,
  },
  run: async (input) => {
    const petId = input.pet_id;
    if (typeof petId !== "string" || petId.trim() === "") {
      throw new AgentToolError("`pet_id` must be a non-empty pet id.");
    }
    const date = optionalIsoDate(input.date, "date");
    const { pets, appointments } = await loadDataset();
    const pet = pets.find((candidate) => candidate.id === petId);
    if (!pet) {
      throw new AgentToolError(
        `No pet with id ${JSON.stringify(petId)} in this account. Use find_household to look one up.`,
      );
    }

    const visits = petVisits(petId, pets, appointments);
    let target: Appointment | undefined;
    if (date) {
      target = visits.find((visit) => visit.date === date);
      if (!target) {
        throw new AgentToolError(
          `No visit for that pet on ${date}. Use get_pet_history to see the visit dates.`,
        );
      }
    } else {
      // Most recent completed groom (the "last time" answer); fall back to the
      // most recent visit if none are marked completed.
      target = visits.find((visit) => visit.status === "completed") ?? visits[0];
    }

    return {
      pet: petProfile(pet),
      groom: target
        ? {
            date: target.date,
            service: target.service ?? null,
            fee: target.price ?? null,
            tip: target.tip ?? null,
            status: target.status ?? "booked",
            // The operator's own groom note, verbatim. Operator-authored.
            notes: target.notes ?? null,
          }
        : null,
    };
  },
};

/** getDayIncome(date) — the closeout money the Schedule/Reports surfaces show. */
const getDayIncome: AgentReadTool = {
  name: "get_day_income",
  description:
    "Get the money totals for a single day: gross collected, salon payout, and " +
    "the operator's net, plus a per-location breakdown. Pass a concrete ISO " +
    "date (YYYY-MM-DD); resolve relative words like 'Friday' yourself and ask " +
    "if ambiguous. Defaults to today.",
  input_schema: {
    type: "object",
    properties: {
      date: { type: "string", description: "Day to total, ISO YYYY-MM-DD." },
    },
    additionalProperties: false,
  },
  run: async (input) => {
    const date = optionalIsoDate(input.date, "date") ?? todayISO();
    const [settings, { appointments }, overrides] = await Promise.all([
      readOperatorSettings(),
      loadDataset(),
      loadDayCloseoutOverrides(),
    ]);
    const total = calculateDayMoney(
      appointments,
      date,
      settings.locationSettings,
      overrides,
    );
    const perLocation = calculateDayLocationMoney(
      appointments,
      date,
      settings.locationSettings,
      overrides,
    ).map((row) => ({
      location:
        locationLabelFromSettings(row.location, settings.locationSettings) ??
        row.location,
      gross: row.gross,
      salonPayout: row.salonPayout,
      operatorNet: row.samNet,
      isOverride: row.override != null,
    }));

    return {
      date,
      gross: total.gross,
      salonPayout: total.salonPayout,
      operatorNet: total.samNet,
      perLocation,
    };
  },
};

/** listLapsedClients() — the rebooking follow-up list from Reports. */
const listLapsedClients: AgentReadTool = {
  name: "list_lapsed_clients",
  description:
    "List clients who have not visited within a threshold number of days — the " +
    "rebooking follow-up list. `threshold_days` is optional and defaults to the " +
    "operator's configured threshold. Returns each client with their pets, days " +
    "since last visit, and phone, most overdue first. Clients with no visit " +
    "history are included with a null `daysSince`.",
  input_schema: {
    type: "object",
    properties: {
      threshold_days: {
        type: "integer",
        description: "Days without a visit to count as lapsed (e.g. 60, 90).",
      },
    },
    additionalProperties: false,
  },
  run: async (input) => {
    const settings = await readOperatorSettings();
    let threshold: number = settings.lapsedThresholdDays;
    if (input.threshold_days != null) {
      const value = Number(input.threshold_days);
      if (!Number.isFinite(value) || value <= 0) {
        throw new AgentToolError("`threshold_days` must be a positive number of days.");
      }
      threshold = Math.round(value);
    }
    const { clients, pets, appointments } = await loadDataset();
    const rows = lapsedClients(clients, appointments, pets, threshold).slice(0, 50);
    return {
      thresholdDays: threshold,
      count: rows.length,
      clients: rows.map((row) => ({
        householdId: row.client.id,
        owner: ownerName(row.client),
        phone: formatPhone(row.client.phone),
        pets: row.pets.map((pet: Pet) => pet.name),
        daysSince: row.daysSince,
        lastVisit: row.lastVisit ? row.lastVisit.date : null,
      })),
    };
  },
};

/**
 * The complete read-only tool registry.
 *
 * INVARIANT: every entry is a read. There is no write/send/log/delete tool here
 * and there must not be one until a later, separately-reviewed phase. The
 * safety test asserts this list against an allowlist and against write-verb
 * name patterns.
 */
export const AGENT_READ_TOOLS: readonly AgentReadTool[] = [
  getSchedule,
  findHousehold,
  getPetHistory,
  getGroomDetail,
  getDayIncome,
  listLapsedClients,
] as const;

/** The exact set of registered read-tool names. */
export const AGENT_READ_TOOL_NAMES: readonly string[] = AGENT_READ_TOOLS.map(
  (tool) => tool.name,
);

/** Tool definitions in the shape the model providers expect. */
export function agentToolDefinitions() {
  return AGENT_READ_TOOLS.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}

/** Dispatch a tool call by name. Unknown names throw (the runner reports it). */
export async function runAgentTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const tool = AGENT_READ_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new AgentToolError(`Unknown tool ${JSON.stringify(name)}.`);
  }
  return tool.run(input ?? {});
}
