// Agentic layer — WRITE tools (Phase 3), which only ever PROPOSE.
//
// A "write" tool here does NOT write. It validates and resolves the entities for
// one action (which client, which pet, which completed groom) through the same
// org-scoped read loaders the read tools use, and returns a structured
// AgentProposal. runAgent surfaces that proposal to the UI as a confirm card;
// only Sam's tap drives the separate, deterministic confirm action
// (lib/actions/agentConfirm.ts), which calls the EXISTING gated server action.
// Cancel writes nothing.
//
// SAFETY INVARIANT (asserted by agentSafety.test.ts): nothing on the lib/agent
// path — including this file — imports a write/send server action,
// recordAuditEvent, or any Supabase mutation. The model can therefore only
// propose; it physically cannot execute a write. Resolution reads only the
// org-scoped dataset + settings, so RLS + the org_id guard still bound it, and
// customer-authored free text is never loaded here.

import { loadDataset } from "@/lib/data/repo";
import { loadOrgSettings } from "@/lib/orgSettings.server";
import {
  BOOKING_LOCATIONS,
  SERVICE_TYPES,
  bookingLocationLabel,
  findOwnedPet,
  findOwnedPets,
  formatPetNames,
  type ServiceType,
} from "@/lib/booking";
import { isOrgLocation, orgLocationAddress } from "@/lib/orgSettings";
import { serviceLabel } from "@/lib/data/live";
import { fullName } from "@/lib/format";
import {
  isPaymentMethod,
  isPaymentStatus,
  parsePaymentInfo,
} from "@/lib/payments";
import { validateGroomLog } from "@/lib/groom";
import { AgentToolError, petVisits } from "./tools";
import type {
  AddTipProposal,
  AgentProposal,
  BookAppointmentProposal,
  LogGroomProposal,
} from "./proposals";

// Re-export so the runner and tests share one error type / dispatch surface.
export { AgentToolError } from "./tools";

/**
 * A write tool the agent may call. Unlike a read tool it returns an
 * AgentProposal (the resolved action awaiting Sam's confirm), never a write.
 */
export type AgentWriteTool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
  /** Resolve + validate the action and return a proposal. Throws AgentToolError on bad/ambiguous input. */
  propose: (input: Record<string, unknown>) => Promise<AgentProposal>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AgentToolError(`\`${field}\` is required.`);
  }
  return value.trim();
}

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

function requireServiceType(value: unknown): ServiceType {
  const code = typeof value === "string" ? value.trim() : "";
  if (!(SERVICE_TYPES as readonly string[]).includes(code)) {
    throw new AgentToolError(
      `\`service_type\` must be one of: ${SERVICE_TYPES.join(", ")}.`,
    );
  }
  return code as ServiceType;
}

function optionalMoney(value: unknown, field: string): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new AgentToolError(`\`${field}\` must be a number that isn't negative.`);
  }
  return n;
}

function petIdsFrom(input: Record<string, unknown>): string[] {
  const raw = input.pet_ids ?? input.pet_id;
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const ids = list
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);
  if (ids.length === 0) {
    throw new AgentToolError("`pet_ids` must name at least one pet.");
  }
  return Array.from(new Set(ids));
}

// ---------------------------------------------------------------------------
// propose_book_appointment — resolves a booking for either surface.
// ---------------------------------------------------------------------------

const proposeBookAppointment: AgentWriteTool = {
  name: "propose_book_appointment",
  description:
    "Propose booking a new appointment (does NOT book it — the operator confirms a card " +
    "first). Pass `client_id` and `pet_ids` (both from find_household), a concrete " +
    "ISO `date` (YYYY-MM-DD), a `time_slot` (e.g. '10:00am'), and a `service_type` " +
    "(one of full_groom, puppy_groom, bath_only, nail_trim, other). Optional `fee`. " +
    "`location` is REQUIRED: gina or annette for a batched business (it sets the " +
    "payout split), or one of the operator's locations for a 1:1 business, which " +
    "ALSO needs `duration_minutes`. Ask the operator which location (and how long, " +
    "for 1:1) if you don't have it. Resolve the client and pets first; never propose on a guess.",
  input_schema: {
    type: "object",
    properties: {
      client_id: { type: "string", description: "Client id from find_household." },
      pet_ids: {
        type: "array",
        items: { type: "string" },
        description: "Pet ids from find_household (one or more for a multi-pet booking).",
      },
      date: { type: "string", description: "ISO YYYY-MM-DD." },
      time_slot: { type: "string", description: "Drop-off / start time, e.g. '10:00am'." },
      service_type: {
        type: "string",
        enum: [...SERVICE_TYPES],
        description: "The grooming service code.",
      },
      fee: { type: "number", description: "Optional fee for the appointment." },
      location: { type: "string", description: "Location (gina/annette for batched; an org location name for 1:1)." },
      duration_minutes: { type: "integer", description: "1:1 block length in minutes (required for 1:1)." },
    },
    required: ["client_id", "pet_ids", "date", "time_slot", "service_type"],
    additionalProperties: false,
  },
  propose: async (input): Promise<BookAppointmentProposal> => {
    const clientId = requireString(input.client_id, "client_id");
    const petIds = petIdsFrom(input);
    const date = requireIsoDate(input.date, "date");
    const timeSlot = requireString(input.time_slot, "time_slot");
    const serviceType = requireServiceType(input.service_type);
    const fee = optionalMoney(input.fee, "fee");
    const locationInput =
      typeof input.location === "string" ? input.location.trim() : "";

    const dataset = await loadDataset();
    const client = dataset.clients.find((c) => c.id === clientId);
    if (!client) {
      throw new AgentToolError(
        `No client with id ${JSON.stringify(clientId)}. Use find_household to look one up.`,
      );
    }
    const pets = findOwnedPets(dataset.pets, petIds, clientId);
    if (!pets) {
      throw new AgentToolError(
        "One of those pets isn't on this client's file. Re-check with find_household.",
      );
    }

    const org = await loadOrgSettings();
    let location: string | null = null;
    let locationLabel: string | null = null;
    let durationMinutes: number | null = null;

    if (org.schedulingStyle === "one_to_one") {
      if (!locationInput) {
        throw new AgentToolError(
          "This is a one-at-a-time schedule. Ask the operator which of their locations, then pass `location`.",
        );
      }
      if (!isOrgLocation(org, locationInput)) {
        throw new AgentToolError(
          `${JSON.stringify(locationInput)} isn't one of the operator's locations.`,
        );
      }
      const duration = Number(input.duration_minutes);
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new AgentToolError(
          "Ask the operator how long the appointment is, then pass `duration_minutes`.",
        );
      }
      location = locationInput;
      locationLabel = orgLocationAddress(org, locationInput) ?? locationInput;
      durationMinutes = Math.round(duration);
    } else {
      // Batched: a location is REQUIRED — it drives the salon-payout split, so a
      // null-location booking would mis-state Sam's take-home. Ask, never guess.
      if (!locationInput) {
        throw new AgentToolError(
          "Which location is this booking at — Gina's or Annette's? It sets the payout split.",
        );
      }
      if (!(BOOKING_LOCATIONS as readonly string[]).includes(locationInput)) {
        throw new AgentToolError("Location must be 'gina' or 'annette' for this business.");
      }
      location = locationInput;
      locationLabel = bookingLocationLabel(locationInput);
    }

    return {
      kind: "book_appointment",
      clientId,
      ownerName: fullName(client.first_name, client.last_name),
      petIds,
      petNames: formatPetNames(pets.map((pet) => pet.name)),
      date,
      timeSlot,
      serviceType,
      service: serviceLabel(serviceType) ?? serviceType,
      fee,
      location,
      locationLabel,
      durationMinutes,
    };
  },
};

// ---------------------------------------------------------------------------
// propose_add_tip — resolves a completed groom and the new total tip.
// ---------------------------------------------------------------------------

const proposeAddTip: AgentWriteTool = {
  name: "propose_add_tip",
  description:
    "Propose adding a tip to a COMPLETED groom (does NOT save it — the operator confirms a " +
    "card first). Pass `pet_id` (from find_household) and `added_tip` (the dollar " +
    "amount to add). Optionally pass a concrete ISO `date` to target a specific " +
    "groom; otherwise the most recent completed groom is used. This marks the groom " +
    "paid and sets its tip — the confirm card discloses both. If there is no " +
    "completed groom, the operator is told to give a date.",
  input_schema: {
    type: "object",
    properties: {
      pet_id: { type: "string", description: "Pet id from find_household." },
      added_tip: { type: "number", description: "Dollar amount of tip to add." },
      date: { type: "string", description: "Optional ISO date of the groom to tip." },
    },
    required: ["pet_id", "added_tip"],
    additionalProperties: false,
  },
  propose: async (input): Promise<AddTipProposal> => {
    const petId = requireString(input.pet_id, "pet_id");
    const addedTip = Number(input.added_tip);
    if (!Number.isFinite(addedTip) || addedTip <= 0) {
      throw new AgentToolError("`added_tip` must be a positive dollar amount.");
    }
    const date = optionalIsoDate(input.date, "date");

    const dataset = await loadDataset();
    const pet = dataset.pets.find((p) => p.id === petId);
    if (!pet) {
      throw new AgentToolError(
        `No pet with id ${JSON.stringify(petId)}. Use find_household to look one up.`,
      );
    }
    const owner = dataset.clients.find((c) => c.id === pet.client_id) ?? null;
    const visits = petVisits(petId, dataset.pets, dataset.appointments);

    let target;
    if (date) {
      target = visits.find((v) => v.date === date && v.status === "completed");
      if (!target) {
        throw new AgentToolError(
          `No completed groom for that pet on ${date}. Use get_pet_history to see the dates.`,
        );
      }
    } else {
      target = visits.find((v) => v.status === "completed");
      if (!target) {
        throw new AgentToolError(
          "I don't see a completed groom to tip. Tell the operator to give the groom's date.",
        );
      }
    }

    const fee = target.price ?? 0;
    const currentTip = target.tip ?? 0;
    const newTip = round2(currentTip + addedTip);
    const paidAmount = round2(fee + newTip);
    const paymentMethod = parsePaymentInfo(target.notes).method ?? "cash";

    return {
      kind: "add_tip",
      clientId: pet.client_id,
      petId,
      petName: pet.name,
      ownerName: owner ? fullName(owner.first_name, owner.last_name) : "Unknown owner",
      appointmentDate: target.date,
      service: target.service ?? null,
      fee,
      currentTip,
      addedTip: round2(addedTip),
      newTip,
      paidAmount,
      paymentMethod,
    };
  },
};

// ---------------------------------------------------------------------------
// propose_log_groom — resolves a completed-groom log via the groom validator.
// ---------------------------------------------------------------------------

const proposeLogGroom: AgentWriteTool = {
  name: "propose_log_groom",
  description:
    "Propose logging a completed groom (does NOT save it — the operator confirms a card " +
    "first). Pass `client_id` and `pet_id` (from find_household), a concrete ISO " +
    "`date` (not in the future), and a `service_type` (full_groom, puppy_groom, " +
    "bath_only, nail_trim, other). Optional `fee`, `tip`, `payment_method` " +
    "(cash/interac/other, default cash), `payment_status` (paid/waiting, default " +
    "paid), and `notes` (the operator's own groom notes).",
  input_schema: {
    type: "object",
    properties: {
      client_id: { type: "string", description: "Client id from find_household." },
      pet_id: { type: "string", description: "Pet id from find_household." },
      date: { type: "string", description: "ISO YYYY-MM-DD; not in the future." },
      service_type: {
        type: "string",
        enum: [...SERVICE_TYPES],
        description: "The grooming service code.",
      },
      fee: { type: "number", description: "Optional groom fee." },
      tip: { type: "number", description: "Optional tip." },
      payment_method: { type: "string", enum: ["cash", "interac", "other"] },
      payment_status: { type: "string", enum: ["paid", "waiting"] },
      notes: { type: "string", description: "Optional operator groom notes." },
    },
    required: ["client_id", "pet_id", "date", "service_type"],
    additionalProperties: false,
  },
  propose: async (input): Promise<LogGroomProposal> => {
    const clientId = requireString(input.client_id, "client_id");
    const petId = requireString(input.pet_id, "pet_id");

    const dataset = await loadDataset();
    const client = dataset.clients.find((c) => c.id === clientId);
    if (!client) {
      throw new AgentToolError(
        `No client with id ${JSON.stringify(clientId)}. Use find_household to look one up.`,
      );
    }
    const pet = findOwnedPet(dataset.pets, petId, clientId);
    if (!pet) {
      throw new AgentToolError(
        "That pet isn't on this client's file. Re-check with find_household.",
      );
    }

    // Reuse the exact validator the gated logGroom action uses, so the card
    // only appears for input that will actually pass the write.
    const validation = validateGroomLog({
      client_id: clientId,
      pet_id: petId,
      date: typeof input.date === "string" ? input.date : "",
      service_type: typeof input.service_type === "string" ? input.service_type : "",
      fee: input.fee == null ? "" : String(input.fee),
      tip: input.tip == null ? "" : String(input.tip),
      payment_method:
        typeof input.payment_method === "string" && input.payment_method
          ? input.payment_method
          : "cash",
      payment_status:
        typeof input.payment_status === "string" && input.payment_status
          ? input.payment_status
          : "paid",
      notes: typeof input.notes === "string" ? input.notes : "",
    });
    if (!validation.ok) {
      const firstError = Object.values(validation.errors)[0] ?? "That groom log isn't valid.";
      throw new AgentToolError(firstError);
    }
    const value = validation.value;
    if (!value.service_type) {
      throw new AgentToolError("Pick a service for the groom.");
    }
    if (!isPaymentMethod(value.payment_method) || !isPaymentStatus(value.payment_status)) {
      throw new AgentToolError("Choose a valid payment method and status.");
    }

    return {
      kind: "log_groom",
      clientId,
      petId,
      petName: pet.name,
      ownerName: fullName(client.first_name, client.last_name),
      date: value.date,
      serviceType: value.service_type,
      service: serviceLabel(value.service_type) ?? value.service_type,
      fee: value.fee,
      tip: value.tip,
      paymentMethod: value.payment_method,
      paymentStatus: value.payment_status,
      notes: value.notes,
    };
  },
};

/**
 * The complete write-tool registry. INVARIANT: every entry only PROPOSES — it
 * resolves + validates and returns an AgentProposal, and performs no write. The
 * real write happens later, in the confirm action, on Sam's tap.
 */
export const AGENT_WRITE_TOOLS: readonly AgentWriteTool[] = [
  proposeBookAppointment,
  proposeAddTip,
  proposeLogGroom,
] as const;

export const AGENT_WRITE_TOOL_NAMES: readonly string[] = AGENT_WRITE_TOOLS.map(
  (tool) => tool.name,
);

/** Write-tool definitions in the shape the model providers expect. */
export function agentWriteToolDefinitions() {
  return AGENT_WRITE_TOOLS.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}

/** Dispatch a write (propose) tool by name. Returns a proposal; never writes. */
export async function runAgentWriteTool(
  name: string,
  input: Record<string, unknown>,
): Promise<AgentProposal> {
  const tool = AGENT_WRITE_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new AgentToolError(`Unknown write tool ${JSON.stringify(name)}.`);
  }
  return tool.propose(input ?? {});
}
