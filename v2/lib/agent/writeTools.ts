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
import { serviceCodeFromLabel, serviceLabel } from "@/lib/data/live";
import { formatDate, fullName } from "@/lib/format";
import {
  isPaymentMethod,
  isPaymentStatus,
  parsePaymentInfo,
  stripPaymentInfo,
} from "@/lib/payments";
import { parseSalonPayoutOverride, stripSalonPayoutOverride } from "@/lib/payoutOverride";
import { validateGroomLog } from "@/lib/groom";
import { validateIntake } from "@/lib/intake";
import { validateAddPet } from "@/lib/addPet";
import { parseAltContact } from "@/lib/altContact";
import { validateEditClient } from "@/lib/editClient";
import { validateEditPet } from "@/lib/editPet";
import {
  canMarkAppointmentNoShow,
  findAppointmentByPetDate,
  validateEditAppointment,
} from "@/lib/editAppointment";
import { canDeleteHousehold } from "@/lib/householdLifecycle";
import { validateDayCloseoutInput } from "@/lib/dayCloseout";
import { buildReminderTarget, validateReminderInput } from "@/lib/reminders";
import { AgentToolError, petVisits } from "./tools";
import type {
  AddHouseholdProposal,
  AddPetProposal,
  AddTipProposal,
  AgentProposal,
  BookAppointmentProposal,
  DeleteHouseholdProposal,
  EditAppointmentProposal,
  EditHouseholdProposal,
  EditPetProposal,
  LogDailyIncomeProposal,
  LogGroomProposal,
  SendTextProposal,
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

// --- shared helpers for the Phase 4 tools ----------------------------------

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const s = optionalString(value);
  return s === "" ? null : s;
}

/** A boolean|null allergy flag → the form's yes/no/unknown choice. */
function allergyChoice(allergies: boolean | null): string {
  return allergies === true ? "yes" : allergies === false ? "no" : "unknown";
}

function firstValidationError(
  errors: Record<string, string | undefined>,
  fallback: string,
): string {
  return Object.values(errors).find((v) => typeof v === "string") ?? fallback;
}

/** True when the input names at least one of the given editable fields. */
function namesAField(input: Record<string, unknown>, fields: string[]): boolean {
  return fields.some((field) => optionalString(input[field]) !== "" || field in input);
}

// ---------------------------------------------------------------------------
// propose_add_household — a new household + its first pet (via saveIntake).
// ---------------------------------------------------------------------------

const proposeAddHousehold: AgentWriteTool = {
  name: "propose_add_household",
  description:
    "Propose creating a NEW household and its first pet (does NOT save it — the operator " +
    "confirms a card first). Use only for a household not already on file (check with " +
    "find_household first). Pass owner `first_name`, `last_name`, `phone`, and the first " +
    "pet's `pet_name`; optional `email`, `address`, `notes`, `secondary_contact_name`, " +
    "`secondary_cell`, `landline`, `sms_consent` (true only if the owner agreed to texts), " +
    "and pet `breed`, `size` (small/medium/large), `allergy_state` (yes/no/unknown), " +
    "`allergies_detail`, `vaccination_state` (yes/no/unknown), `vaccination_detail`, " +
    "`date_of_birth` (YYYY-MM-DD), `grooming_notes`, `typical_fee`.",
  input_schema: {
    type: "object",
    properties: {
      first_name: { type: "string" },
      last_name: { type: "string" },
      phone: { type: "string" },
      email: { type: "string" },
      address: { type: "string" },
      notes: { type: "string" },
      secondary_contact_name: { type: "string" },
      secondary_cell: { type: "string" },
      landline: { type: "string" },
      sms_consent: { type: "boolean" },
      pet_name: { type: "string" },
      breed: { type: "string" },
      size: { type: "string", enum: ["small", "medium", "large"] },
      allergy_state: { type: "string", enum: ["yes", "no", "unknown"] },
      allergies_detail: { type: "string" },
      vaccination_state: { type: "string", enum: ["yes", "no", "unknown"] },
      vaccination_detail: { type: "string" },
      date_of_birth: { type: "string" },
      grooming_notes: { type: "string" },
      typical_fee: { type: "number" },
    },
    required: ["first_name", "last_name", "phone", "pet_name"],
    additionalProperties: false,
  },
  propose: async (input): Promise<AddHouseholdProposal> => {
    const smsConsent = input.sms_consent === true;
    const validation = validateIntake({
      first_name: optionalString(input.first_name),
      last_name: optionalString(input.last_name),
      phone: optionalString(input.phone),
      secondary_contact_name: optionalString(input.secondary_contact_name),
      secondary_cell: optionalString(input.secondary_cell),
      landline: optionalString(input.landline),
      email: optionalString(input.email),
      address: optionalString(input.address),
      notes: optionalString(input.notes),
      sms_consent: smsConsent ? "on" : "",
      pet_name: optionalString(input.pet_name),
      breed: optionalString(input.breed),
      size: optionalString(input.size),
      allergy_state: optionalString(input.allergy_state) || "unknown",
      allergies_detail: optionalString(input.allergies_detail),
      vaccination_state: optionalString(input.vaccination_state) || "unknown",
      vaccination_detail: optionalString(input.vaccination_detail),
      age: "",
      date_of_birth: optionalString(input.date_of_birth),
      grooming_notes: optionalString(input.grooming_notes),
      typical_fee: input.typical_fee == null ? "" : String(input.typical_fee),
    });
    if (!validation.ok) {
      throw new AgentToolError(
        firstValidationError(validation.errors, "That household isn't valid."),
      );
    }
    const v = validation.value;
    const pet = v.pets[0];
    if (!pet) throw new AgentToolError("A new household needs at least one pet.");

    return {
      kind: "add_household",
      ownerName: fullName(v.client.first_name, v.client.last_name ?? ""),
      firstName: v.client.first_name,
      lastName: v.client.last_name ?? "",
      phone: v.client.phone,
      secondaryContactName: nullableString(input.secondary_contact_name),
      secondaryCell: nullableString(input.secondary_cell),
      landline: nullableString(input.landline),
      email: v.client.email,
      address: v.client.address,
      notes: v.client.notes,
      smsConsent: v.client.sms_consent,
      pet: {
        name: pet.name,
        breed: pet.breed,
        size: pet.size,
        allergies: pet.allergies,
        allergiesDetail: pet.allergies_detail,
        vaccinationState: pet.vaccination_state,
        vaccinationDetail: pet.vaccination_detail,
        dateOfBirth: pet.date_of_birth,
        groomingNotes: pet.grooming_notes,
        typicalFee: pet.typical_fee,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// propose_add_pet — a pet on an EXISTING household (via addPet).
// ---------------------------------------------------------------------------

const proposeAddPet: AgentWriteTool = {
  name: "propose_add_pet",
  description:
    "Propose adding a pet to an EXISTING household (does NOT save it — the operator confirms " +
    "a card first). Pass `client_id` (from find_household) and `name`; optional `breed`, " +
    "`size` (small/medium/large), `allergy_state` (yes/no/unknown), `allergies_detail`, " +
    "`grooming_notes`, `typical_fee`. Resolve the household first; never guess the id.",
  input_schema: {
    type: "object",
    properties: {
      client_id: { type: "string" },
      name: { type: "string" },
      breed: { type: "string" },
      size: { type: "string", enum: ["small", "medium", "large"] },
      allergy_state: { type: "string", enum: ["yes", "no", "unknown"] },
      allergies_detail: { type: "string" },
      grooming_notes: { type: "string" },
      typical_fee: { type: "number" },
    },
    required: ["client_id", "name"],
    additionalProperties: false,
  },
  propose: async (input): Promise<AddPetProposal> => {
    const clientId = requireString(input.client_id, "client_id");
    const dataset = await loadDataset();
    const client = dataset.clients.find((c) => c.id === clientId);
    if (!client) {
      throw new AgentToolError(
        `No client with id ${JSON.stringify(clientId)}. Use find_household to look one up.`,
      );
    }
    const validation = validateAddPet({
      client_id: clientId,
      name: optionalString(input.name),
      breed: optionalString(input.breed),
      size: optionalString(input.size),
      allergy_state: optionalString(input.allergy_state) || "unknown",
      allergies_detail: optionalString(input.allergies_detail),
      grooming_notes: optionalString(input.grooming_notes),
      typical_fee: input.typical_fee == null ? "" : String(input.typical_fee),
    });
    if (!validation.ok) {
      throw new AgentToolError(
        firstValidationError(validation.errors, "That pet isn't valid."),
      );
    }
    const v = validation.value;
    return {
      kind: "add_pet",
      clientId,
      ownerName: fullName(client.first_name, client.last_name),
      name: v.name,
      breed: v.breed,
      size: v.size,
      allergies: v.allergies,
      allergiesDetail: v.allergies_detail,
      groomingNotes: v.grooming_notes,
      typicalFee: v.typical_fee,
    };
  },
};

// ---------------------------------------------------------------------------
// propose_edit_household — change contact details (via editClient).
// Full-replace action: merge the requested change onto the CURRENT record so an
// untouched field (incl. the secondary contact, parsed back from alt_contact)
// is preserved, never wiped.
// ---------------------------------------------------------------------------

const EDIT_HOUSEHOLD_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "secondary_contact_name",
  "secondary_cell",
  "landline",
  "email",
  "address",
  "notes",
];

const proposeEditHousehold: AgentWriteTool = {
  name: "propose_edit_household",
  description:
    "Propose editing a household's contact details (does NOT save it — the operator confirms " +
    "a card first). Pass `client_id` (from find_household) and ONLY the fields to change: " +
    "`first_name`, `last_name`, `phone`, `email`, `address`, `notes`, `secondary_contact_name`, " +
    "`secondary_cell`, `landline`. Untouched fields are kept as-is. Resolve the household first.",
  input_schema: {
    type: "object",
    properties: {
      client_id: { type: "string" },
      first_name: { type: "string" },
      last_name: { type: "string" },
      phone: { type: "string" },
      email: { type: "string" },
      address: { type: "string" },
      notes: { type: "string" },
      secondary_contact_name: { type: "string" },
      secondary_cell: { type: "string" },
      landline: { type: "string" },
    },
    required: ["client_id"],
    additionalProperties: false,
  },
  propose: async (input): Promise<EditHouseholdProposal> => {
    const clientId = requireString(input.client_id, "client_id");
    if (!namesAField(input, EDIT_HOUSEHOLD_FIELDS)) {
      throw new AgentToolError(
        "Tell me which detail to change (phone, email, address, name, notes, or secondary contact).",
      );
    }
    const dataset = await loadDataset();
    const client = dataset.clients.find((c) => c.id === clientId);
    if (!client) {
      throw new AgentToolError(
        `No client with id ${JSON.stringify(clientId)}. Use find_household to look one up.`,
      );
    }
    const altParsed = parseAltContact(client.alt_contact);
    const current = {
      first_name: client.first_name,
      last_name: client.last_name ?? "",
      phone: client.phone,
      secondary_contact_name: altParsed.secondaryName ?? "",
      secondary_cell: altParsed.secondaryCell ?? "",
      landline: altParsed.landline ?? "",
      email: client.email ?? "",
      address: client.address ?? "",
      notes: client.notes ?? "",
    };
    const changes: string[] = [];
    const merged = { ...current };
    for (const field of EDIT_HOUSEHOLD_FIELDS) {
      if (field in input) {
        const next = optionalString(input[field]);
        if (next !== (current as Record<string, string>)[field]) {
          (merged as Record<string, string>)[field] = next;
          changes.push(`${field.replace(/_/g, " ")} → ${next || "(cleared)"}`);
        }
      }
    }
    if (changes.length === 0) {
      throw new AgentToolError("Those details already match — nothing to change.");
    }

    const validation = validateEditClient({ client_id: clientId, ...merged });
    if (!validation.ok) {
      throw new AgentToolError(
        firstValidationError(validation.errors, "That edit isn't valid."),
      );
    }

    return {
      kind: "edit_household",
      clientId,
      ownerName: fullName(client.first_name, client.last_name),
      firstName: merged.first_name,
      lastName: merged.last_name,
      phone: merged.phone,
      secondaryContactName: merged.secondary_contact_name || null,
      secondaryCell: merged.secondary_cell || null,
      landline: merged.landline || null,
      email: merged.email || null,
      address: merged.address || null,
      notes: merged.notes || null,
      changes,
    };
  },
};

// ---------------------------------------------------------------------------
// propose_edit_pet — change a pet's profile (via editPet). Full-replace; merged.
// ---------------------------------------------------------------------------

const EDIT_PET_FIELDS = [
  "name",
  "breed",
  "size",
  "color",
  "date_of_birth",
  "allergy_state",
  "allergies_detail",
  "grooming_notes",
  "typical_fee",
];

const proposeEditPet: AgentWriteTool = {
  name: "propose_edit_pet",
  description:
    "Propose editing a pet's profile (does NOT save it — the operator confirms a card first). " +
    "Pass `client_id` and `pet_id` (from find_household) and ONLY the fields to change: " +
    "`name`, `breed`, `size` (small/medium/large), `color`, `date_of_birth` (YYYY-MM-DD), " +
    "`allergy_state` (yes/no/unknown), `allergies_detail`, `grooming_notes`, `typical_fee`. " +
    "Untouched fields are kept. Resolve the pet first.",
  input_schema: {
    type: "object",
    properties: {
      client_id: { type: "string" },
      pet_id: { type: "string" },
      name: { type: "string" },
      breed: { type: "string" },
      size: { type: "string", enum: ["small", "medium", "large"] },
      color: { type: "string" },
      date_of_birth: { type: "string" },
      allergy_state: { type: "string", enum: ["yes", "no", "unknown"] },
      allergies_detail: { type: "string" },
      grooming_notes: { type: "string" },
      typical_fee: { type: "number" },
    },
    required: ["client_id", "pet_id"],
    additionalProperties: false,
  },
  propose: async (input): Promise<EditPetProposal> => {
    const clientId = requireString(input.client_id, "client_id");
    const petId = requireString(input.pet_id, "pet_id");
    if (!namesAField(input, EDIT_PET_FIELDS)) {
      throw new AgentToolError(
        "Tell me what to change on the pet (breed, size, allergies, notes, fee, etc.).",
      );
    }
    const dataset = await loadDataset();
    const pet = findOwnedPet(dataset.pets, petId, clientId);
    if (!pet) {
      throw new AgentToolError(
        "That pet isn't on this client's file. Re-check with find_household.",
      );
    }
    const current = {
      name: pet.name,
      breed: pet.breed ?? "",
      size: pet.size ?? "",
      color: pet.color ?? "",
      date_of_birth: pet.date_of_birth ?? "",
      allergy_state: allergyChoice(pet.allergies),
      allergies_detail: pet.allergies_detail ?? "",
      grooming_notes: pet.grooming_notes ?? "",
      typical_fee: pet.typical_fee != null ? String(pet.typical_fee) : "",
    };
    const changes: string[] = [];
    const merged = { ...current };
    for (const field of EDIT_PET_FIELDS) {
      if (field in input) {
        const next =
          field === "typical_fee"
            ? input.typical_fee == null
              ? ""
              : String(input.typical_fee)
            : optionalString(input[field]);
        if (next !== (current as Record<string, string>)[field]) {
          (merged as Record<string, string>)[field] = next;
          changes.push(`${field.replace(/_/g, " ")} → ${next || "(cleared)"}`);
        }
      }
    }
    if (changes.length === 0) {
      throw new AgentToolError("That already matches — nothing to change.");
    }

    const validation = validateEditPet({ client_id: clientId, pet_id: petId, ...merged });
    if (!validation.ok) {
      throw new AgentToolError(
        firstValidationError(validation.errors, "That edit isn't valid."),
      );
    }
    const v = validation.value;
    return {
      kind: "edit_pet",
      clientId,
      petId,
      petName: pet.name,
      name: v.name,
      breed: v.breed,
      size: v.size,
      color: v.color,
      dateOfBirth: v.date_of_birth,
      allergies: v.allergies,
      allergiesDetail: v.allergies_detail,
      groomingNotes: v.grooming_notes,
      typicalFee: v.typical_fee,
      changes,
    };
  },
};

// ---------------------------------------------------------------------------
// propose_edit_appointment — reschedule/change (editAppointment), cancel
// (deleteAppointment), or no-show (markAppointmentNoShow), all behind
// EDIT_APPOINTMENT_WRITE. Universal: works for BOTH the batched (gina/annette)
// and 1:1 (org-location) schedules — the gated edit action validates the location
// and reschedule conflict by the org's model. A no-show is a status transition
// that KEEPS the record (only a still-booked visit qualifies) — never a delete.
//
// TARGET BY pet + date (+ time), NOT an id. The read tools never expose
// appointment ids, so the model can't pass one. We identify the visit by its
// CURRENT date for the pet (a `time_slot` breaks a same-day tie) via the shared
// findAppointmentByPetDate resolver — the SAME resolver the confirm action uses
// to re-resolve the authoritative id server-side. A same-day duplicate that a
// time can't disambiguate is REFUSED here (we ask which time), never guessed.
// ---------------------------------------------------------------------------

const proposeEditAppointment: AgentWriteTool = {
  name: "propose_edit_appointment",
  description:
    "Propose changing, cancelling, or marking an existing appointment as a no-show (does NOT " +
    "save it — the operator confirms a card first). Identify the visit by `client_id` and " +
    "`pet_id` (from find_household) plus `date` (YYYY-MM-DD) — the visit's CURRENT date, used to " +
    "FIND it (NOT a new date). If the pet has more than one visit that day, also pass `time_slot` " +
    "(the visit's current time) to say which; if you don't know it, ask the operator — never guess. " +
    "Then `mode`: 'change' to reschedule or edit it — pass `new_date` (YYYY-MM-DD) and/or " +
    "`new_time_slot` to move it, and/or `service_type`, `location`, `fee`, `tip`, `payment_method`, " +
    "`payment_status`, `notes` to change those (untouched fields are kept); 'cancel' to remove the " +
    "booking; or 'no_show' to mark a still-booked visit as a no-show (keeps the record, never " +
    "deletes). `location` is gina/annette for a batched business or one of the operator's own " +
    "locations for a 1:1 business; leave it out to keep the current one.",
  input_schema: {
    type: "object",
    properties: {
      client_id: { type: "string", description: "Client id from find_household." },
      pet_id: { type: "string", description: "Pet id from find_household." },
      date: {
        type: "string",
        description: "The visit's CURRENT date (ISO YYYY-MM-DD), used to find it — not a new date.",
      },
      time_slot: {
        type: "string",
        description: "The visit's CURRENT time, to pick which visit when the pet has two that day.",
      },
      mode: { type: "string", enum: ["change", "cancel", "no_show"] },
      new_date: { type: "string", description: "Reschedule target date (ISO YYYY-MM-DD)." },
      new_time_slot: { type: "string", description: "Reschedule target time, e.g. '2:00pm'." },
      service_type: { type: "string", enum: [...SERVICE_TYPES] },
      location: { type: "string", description: "gina/annette (batched) or an org location name (1:1)." },
      fee: { type: "number" },
      tip: { type: "number" },
      payment_method: { type: "string", enum: ["cash", "interac", "other"] },
      payment_status: { type: "string", enum: ["paid", "waiting"] },
      notes: { type: "string" },
    },
    required: ["client_id", "pet_id", "date", "mode"],
    additionalProperties: false,
  },
  propose: async (input): Promise<EditAppointmentProposal> => {
    const clientId = requireString(input.client_id, "client_id");
    const petId = requireString(input.pet_id, "pet_id");
    const targetDate = requireIsoDate(input.date, "date");
    const targetTimeInput = optionalString(input.time_slot) || null;
    const mode = optionalString(input.mode);

    const org = await loadOrgSettings();
    const isOneToOne = org.schedulingStyle === "one_to_one";
    const orgLocationNames = org.locations.map((entry) => entry.name);

    const dataset = await loadDataset();
    const client = dataset.clients.find((c) => c.id === clientId);
    if (!client) {
      throw new AgentToolError(
        `No client with id ${JSON.stringify(clientId)}. Use find_household to look one up.`,
      );
    }
    const ownerName = fullName(client.first_name, client.last_name);
    const petName =
      dataset.pets.find((p) => p.id === petId && p.client_id === clientId)?.name ?? null;
    if (!petName) {
      throw new AgentToolError(
        "That pet isn't on this client's file. Re-check with find_household.",
      );
    }

    // Resolve the exact visit by pet + date (+ time) — the same resolver the
    // confirm action re-runs server-side. A same-day duplicate disambiguates by
    // time or is refused; it is never resolved to a guess.
    const match = findAppointmentByPetDate(dataset.appointments, {
      clientId,
      petId,
      date: targetDate,
      timeSlot: targetTimeInput,
    });
    if (match.kind === "none") {
      throw new AgentToolError(
        `No appointment for ${petName} on ${targetDate}. Check get_schedule or get_pet_history for the date.`,
      );
    }
    if (match.kind === "ambiguous") {
      throw new AgentToolError(
        `${petName} has more than one visit on ${targetDate} (${match.times.join(", ")}). ` +
          "Ask the operator which time, then pass it as `time_slot`.",
      );
    }
    const existing = match.appointment;
    // Preserve the resolved visit's own date/time as the re-resolution tuple, so
    // the confirm action finds the SAME visit even after a reschedule moves it.
    const resolvedTargetDate = existing.date;
    const resolvedTargetTime = existing.time_slot ?? null;

    if (mode === "cancel") {
      return {
        kind: "edit_appointment",
        mode: "cancel",
        clientId,
        petId,
        targetDate: resolvedTargetDate,
        targetTimeSlot: resolvedTargetTime,
        ownerName,
        petName,
        date: existing.date,
        service: existing.service,
      };
    }

    if (mode === "no_show") {
      // Mirror the gated action's guard: only a still-booked visit can become a
      // no-show, so refuse here rather than show a card for a write that bounces.
      if (!canMarkAppointmentNoShow(existing.status)) {
        throw new AgentToolError(
          "Only a booked appointment can be marked a no-show. A completed or cancelled visit can't.",
        );
      }
      return {
        kind: "edit_appointment",
        mode: "no_show",
        clientId,
        petId,
        targetDate: resolvedTargetDate,
        targetTimeSlot: resolvedTargetTime,
        ownerName,
        petName,
        date: existing.date,
        service: existing.service,
      };
    }

    // mode === "change": merge the requested fields onto the existing visit,
    // mirroring how the edit screen pre-fills from a saved appointment so an
    // untouched field is preserved exactly. `new_date`/`new_time_slot` move it;
    // omitting them keeps the current date/time.
    const payment = parsePaymentInfo(existing.notes);
    const cleanNotes = stripSalonPayoutOverride(stripPaymentInfo(existing.notes)) ?? "";
    const currentLocation = isOneToOne
      ? existing.location ?? ""
      : existing.location === "gina" || existing.location === "annette"
        ? existing.location
        : "";
    const merged = {
      date: optionalString(input.new_date) || existing.date,
      time_slot: optionalString(input.new_time_slot) || (existing.time_slot ?? ""),
      service_type:
        optionalString(input.service_type) || (serviceCodeFromLabel(existing.service) ?? ""),
      location: optionalString(input.location) || currentLocation,
      fee:
        input.fee != null
          ? String(input.fee)
          : existing.price != null
            ? String(existing.price)
            : "",
      tip:
        input.tip != null
          ? String(input.tip)
          : existing.tip != null
            ? String(existing.tip)
            : "",
      payment_method: optionalString(input.payment_method) || (payment.method ?? "cash"),
      payment_status: optionalString(input.payment_status) || (payment.status ?? "paid"),
      notes: "notes" in input ? optionalString(input.notes) : cleanNotes,
    };
    if (optionalString(input.new_date)) requireIsoDate(input.new_date, "new_date");
    const salonOverride = parseSalonPayoutOverride(existing.notes);

    const validation = validateEditAppointment({
      client_id: clientId,
      // The gated action's validator only needs a non-empty id to pass; the real
      // authoritative id is re-resolved in the confirm action, never carried here.
      appointment_id: existing.id,
      date: merged.date,
      time_slot: merged.time_slot,
      service_type: merged.service_type,
      location: merged.location,
      fee: merged.fee,
      tip: merged.tip,
      payment_method: merged.payment_method,
      payment_status: merged.payment_status,
      notes: merged.notes,
      salon_payout_override: salonOverride != null ? String(salonOverride) : "",
      send_booking_update_text: "",
      booking_update_message: "",
    }, new Date(), {
      schedulingStyle: org.schedulingStyle,
      orgLocations: orgLocationNames,
    });
    if (!validation.ok) {
      throw new AgentToolError(
        firstValidationError(validation.errors, "That change isn't valid."),
      );
    }
    const v = validation.value;
    if (!v.service_type || !v.location) {
      throw new AgentToolError(
        isOneToOne
          ? "That visit needs a service and one of your locations."
          : "That visit needs a service and a Gina/Annette location.",
      );
    }
    const resolvedLocationLabel = isOneToOne
      ? orgLocationAddress(org, v.location) ?? v.location
      : bookingLocationLabel(v.location) ?? v.location;

    const changes: string[] = [];
    if (optionalString(input.new_date) && merged.date !== existing.date)
      changes.push(`date → ${merged.date}`);
    if (optionalString(input.new_time_slot) && merged.time_slot !== (existing.time_slot ?? ""))
      changes.push(`time → ${merged.time_slot}`);
    if (optionalString(input.service_type)) changes.push(`service → ${serviceLabel(v.service_type) ?? v.service_type}`);
    if (optionalString(input.location)) changes.push(`location → ${resolvedLocationLabel}`);
    if (input.fee != null) changes.push(`fee → ${v.fee}`);
    if (input.tip != null) changes.push(`tip → ${v.tip}`);
    if ("notes" in input) changes.push("notes updated");
    if (changes.length === 0) changes.push("no change");

    return {
      kind: "edit_appointment",
      mode: "reschedule_change",
      clientId,
      petId,
      targetDate: resolvedTargetDate,
      targetTimeSlot: resolvedTargetTime,
      ownerName,
      petName,
      date: v.date,
      timeSlot: v.time_slot ?? merged.time_slot,
      serviceType: v.service_type,
      service: serviceLabel(v.service_type) ?? v.service_type,
      location: v.location,
      locationLabel: resolvedLocationLabel,
      fee: v.fee,
      tip: v.tip,
      paymentMethod: v.payment_method,
      paymentStatus: v.payment_status,
      notes: v.notes,
      salonPayoutOverride: salonOverride ?? null,
      changes,
    };
  },
};

// ---------------------------------------------------------------------------
// propose_delete_household — permanent delete (via deleteClient). Mirrors the
// action's history guard: a household with any appointment record can't be
// deleted, so we refuse here rather than show a destructive card that will fail.
// ---------------------------------------------------------------------------

const proposeDeleteHousehold: AgentWriteTool = {
  name: "propose_delete_household",
  description:
    "Propose permanently DELETING a household (does NOT delete it — the operator confirms a " +
    "destructive card first). Pass `client_id` (from find_household). A household that has " +
    "ANY appointment history can't be deleted (business records) — say so instead of proposing. " +
    "This is destructive and cannot be undone; only do it when the operator clearly asked to delete.",
  input_schema: {
    type: "object",
    properties: { client_id: { type: "string" } },
    required: ["client_id"],
    additionalProperties: false,
  },
  propose: async (input): Promise<DeleteHouseholdProposal> => {
    const clientId = requireString(input.client_id, "client_id");
    const dataset = await loadDataset();
    const client = dataset.clients.find((c) => c.id === clientId);
    if (!client) {
      throw new AgentToolError(
        `No client with id ${JSON.stringify(clientId)}. Use find_household to look one up.`,
      );
    }
    const pets = dataset.pets.filter((p) => p.client_id === clientId);
    const appointments = dataset.appointments.filter((a) => a.client_id === clientId);
    if (!canDeleteHousehold({ appointments })) {
      throw new AgentToolError(
        `${fullName(client.first_name, client.last_name)} has ${appointments.length} groom record${
          appointments.length === 1 ? "" : "s"
        } on file and can't be deleted. Tell the operator that household keeps its history.`,
      );
    }
    return {
      kind: "delete_household",
      clientId,
      ownerName: fullName(client.first_name, client.last_name),
      petNames: pets.length > 0 ? formatPetNames(pets.map((p) => p.name)) : "no pets",
      petCount: pets.length,
      appointmentCount: appointments.length,
      hasHistory: false,
    };
  },
};

// ---------------------------------------------------------------------------
// propose_log_daily_income — a payout override for a day (via
// saveDayCloseoutOverride), incl. "paid by salon, keep 100%". finalPayout is the
// amount the operator states she kept; the agent records that, it does not
// recompute the salon split.
// ---------------------------------------------------------------------------

const proposeLogDailyIncome: AgentWriteTool = {
  name: "propose_log_daily_income",
  description:
    "Propose logging a day's take-home as a payout override (does NOT save it — the operator " +
    "confirms a card first). Pass a concrete ISO `date` (YYYY-MM-DD), a `location` " +
    "(gina or annette), and `final_payout` (the dollar amount the operator kept that day). " +
    "Set `paid_by_salon` true for 'paid by the salon, kept 100%'. Optional `note` and " +
    "`calculated_payout` (the app's computed figure, for reference).",
  input_schema: {
    type: "object",
    properties: {
      date: { type: "string" },
      location: { type: "string", enum: [...BOOKING_LOCATIONS] },
      final_payout: { type: "number" },
      calculated_payout: { type: "number" },
      paid_by_salon: { type: "boolean" },
      note: { type: "string" },
    },
    required: ["date", "location", "final_payout"],
    additionalProperties: false,
  },
  propose: async (input): Promise<LogDailyIncomeProposal> => {
    const date = requireIsoDate(input.date, "date");
    const location = optionalString(input.location);
    if (!(BOOKING_LOCATIONS as readonly string[]).includes(location)) {
      throw new AgentToolError("Location must be 'gina' or 'annette'.");
    }
    const paidBySalon = input.paid_by_salon === true;
    const note =
      optionalString(input.note) ||
      (paidBySalon ? "Paid by salon — kept 100%." : "Daily income override.");

    const validation = validateDayCloseoutInput({
      date,
      location,
      final_payout: input.final_payout == null ? "" : String(input.final_payout),
      calculated_payout: input.calculated_payout == null ? "" : String(input.calculated_payout),
      note,
    });
    if (!validation.ok) {
      throw new AgentToolError(
        firstValidationError(validation.errors, "That day's income isn't valid."),
      );
    }
    const v = validation.value;
    return {
      kind: "log_daily_income",
      date: v.date,
      location: v.location,
      locationLabel: bookingLocationLabel(v.location) ?? v.location,
      finalPayout: v.final_payout,
      calculatedPayout: v.calculated_payout ?? v.final_payout,
      note: v.note,
      paidBySalon,
    };
  },
};

// ---------------------------------------------------------------------------
// propose_send_text — draft a customer text (NEVER auto-sent; confirm-to-send).
//   reminder: operator/template content (prepareReminder) — no customer free-text.
//   reply:    a reply to a specific inbound message (sendInboxSmsReply). The
//             customer's text reaches the MODEL only via the dedicated reply seam
//             (lib/actions/agentReply.ts), NOT here — this tool never loads it.
// THE injection surface for the agent is the reply seam; flagged for security review.
// ---------------------------------------------------------------------------

const proposeSendText: AgentWriteTool = {
  name: "propose_send_text",
  description:
    "Propose sending a customer text (does NOT send it — the operator confirms the exact " +
    "wording first, and nothing is ever auto-sent). For `mode` 'reminder', pass `client_id` " +
    "and `appointment_id` (from find_household / get_schedule) and the `message` you drafted " +
    "from the operator's instruction (do not invent appointment facts). For `mode` 'reply' " +
    "(replying to a customer's inbound text), pass the `sms_id` being replied to, the drafted " +
    "`message`, and `recipient_label` (the customer's name). Always show the operator the full " +
    "wording to confirm before anything is sent.",
  input_schema: {
    type: "object",
    properties: {
      mode: { type: "string", enum: ["reminder", "reply"] },
      message: { type: "string" },
      client_id: { type: "string" },
      appointment_id: { type: "string" },
      sms_id: { type: "string" },
      recipient_label: { type: "string" },
    },
    required: ["mode", "message"],
    additionalProperties: false,
  },
  propose: async (input): Promise<SendTextProposal> => {
    const mode = optionalString(input.mode);
    const message = requireString(input.message, "message");

    if (mode === "reply") {
      const smsId = requireString(input.sms_id, "sms_id");
      return {
        kind: "send_text",
        mode: "reply",
        smsId,
        recipientLabel: optionalString(input.recipient_label) || "the customer",
        message,
      };
    }

    if (mode !== "reminder") {
      throw new AgentToolError("`mode` must be 'reminder' or 'reply'.");
    }

    const clientId = requireString(input.client_id, "client_id");
    const appointmentId = requireString(input.appointment_id, "appointment_id");
    const dataset = await loadDataset();
    const client = dataset.clients.find((c) => c.id === clientId);
    if (!client) {
      throw new AgentToolError(
        `No client with id ${JSON.stringify(clientId)}. Use find_household to look one up.`,
      );
    }
    const target = buildReminderTarget(dataset.appointments, dataset.pets, {
      appointmentId,
    });
    if (!target) {
      throw new AgentToolError(
        "I couldn't find that appointment to remind about. Re-check with get_schedule.",
      );
    }
    const validation = validateReminderInput({ phone: client.phone, message });
    if (!validation.ok) {
      throw new AgentToolError(
        firstValidationError(validation.errors, "That reminder can't be sent."),
      );
    }
    const contextBits = [
      target.petName,
      formatDate(target.appointmentDate),
      target.appointmentTime,
    ].filter((bit): bit is string => Boolean(bit));

    return {
      kind: "send_text",
      mode: "reminder",
      clientId,
      appointmentId,
      recipientLabel: fullName(client.first_name, client.last_name),
      toNumber: client.phone,
      context: contextBits.join(" · "),
      message: validation.value.message,
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
  proposeAddHousehold,
  proposeAddPet,
  proposeEditHousehold,
  proposeEditPet,
  proposeEditAppointment,
  proposeDeleteHousehold,
  proposeLogDailyIncome,
  proposeSendText,
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
