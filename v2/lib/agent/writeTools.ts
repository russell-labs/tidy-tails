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

import { loadDataset, type Dataset } from "@/lib/data/repo";
import { loadOrgSettings } from "@/lib/orgSettings.server";
import {
  resolveHouseholdLoosely,
  resolvePetWithinHousehold,
} from "@/lib/householdMatch";
import type { Client, Pet } from "@/lib/data/types";
import {
  BOOKING_LOCATIONS,
  SERVICE_TYPES,
  bookingLocationLabel,
  findOwnedPet,
  formatPetNames,
  type ServiceType,
} from "@/lib/booking";
import {
  orgLocationAddress,
  resolveLocationForDate,
  WEEKDAY_ORDER,
  type OrgLocation,
} from "@/lib/orgSettings";
import { resolveLocationLoosely } from "@/lib/locationMatch";
import { inferSizeClass } from "@/lib/dayCapacity";
import { suggestedDurationMinutes } from "@/lib/scheduling/oneToOne";
import { weekdayForISODate } from "@/lib/dates";
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

/** The dog name(s) the model named for a booking (one or more). */
function petQueriesFrom(input: Record<string, unknown>): string[] {
  const raw = input.pets ?? input.pet;
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const names = list
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter(Boolean);
  if (names.length === 0) {
    throw new AgentToolError("`pets` must name at least one dog.");
  }
  return Array.from(new Set(names));
}

/** Human list of the org's locations for an "ask which one" error. */
function listOrgLocations(locations: readonly OrgLocation[]): string {
  if (locations.length === 0) return "the operator hasn't set up any locations yet";
  return locations
    .map((location) => (location.address ? `${location.name} (${location.address})` : location.name))
    .join(", ");
}

/**
 * Resolve a spoken 1:1 location to one of the org's CONFIGURED location names by
 * loose match — so the agent never demands exact wording. Returns the configured
 * NAME (which the gated action re-validates with isOrgLocation). Ambiguous or
 * no-match THROWS an AgentToolError that lists the options and asks — never a guess.
 */
function resolveOrgLocationOrAsk(locations: readonly OrgLocation[], input: string): string {
  const match = resolveLocationLoosely(input, locations);
  if (match.kind === "matched") return match.name;
  if (match.kind === "ambiguous") {
    throw new AgentToolError(
      `Which location do you mean — ${match.names.join(" or ")}? Ask the operator which one.`,
    );
  }
  throw new AgentToolError(
    `I couldn't match "${input}" to one of the operator's locations (${listOrgLocations(locations)}). Ask which one.`,
  );
}

// The full weekday name ("Saturday") for an ISO date, for the schedule note. Uses
// the same noon-anchored weekday index the resolver uses, so it never tz-slips.
function weekdayLongName(date: string): string {
  const weekday = weekdayForISODate(date);
  return WEEKDAY_ORDER.find((d) => d.key === weekday)?.long ?? "day";
}

// Map a weekday-schedule-resolved org location NAME to a batched payout code
// (gina/annette). The "Where I work" schedule stores an org location name; the
// batched booking path keys off the gina/annette code. Reuse the SAME loose
// matcher the spoken-location path uses, with the two payout shops as the
// options, so a schedule entry named "Gina" / "Gina's" maps to "gina". Returns
// null on no clean single match, so the caller falls back to ASKING (never a
// guess) rather than booking the wrong payout location. The gated booking action
// still re-validates the code.
function batchedCodeFromScheduleName(name: string): string | null {
  const match = resolveLocationLoosely(
    name,
    BOOKING_LOCATIONS.map((code) => ({
      name: code,
      address: bookingLocationLabel(code),
    })),
  );
  return match.kind === "matched" ? match.name : null;
}

// A short, human note the proposal carries when the booking's location came from
// the recurring weekly schedule (not something the operator typed this turn) —
// e.g. "Jun 29 is a Saturday — that's your Gina day". Surfaced verbatim on the
// confirm card (via describeProposal) so the operator just approves the inferred
// location instead of being asked for it. Pure formatting.
function scheduleLocationNote(date: string, label: string): string {
  return `${formatDate(date)} is a ${weekdayLongName(date)} — that's your ${label} day, booking there.`;
}

/** Attributes the model passes to identify a household — a name + optional phone. */
type HouseholdInput = { name: string; phone: string | null };

function householdInputFrom(input: Record<string, unknown>): HouseholdInput {
  const name = requireString(input.household, "household");
  const phoneRaw = typeof input.phone === "string" ? input.phone.trim() : "";
  return { name, phone: phoneRaw || null };
}

/**
 * Resolve the household the model named to an authoritative client, org-scoped,
 * via the SAME matcher find_household uses. Ambiguous / no-match THROWS an
 * AgentToolError that asks — never a guess. The model passes a NAME, never an id,
 * so it can't fabricate one; the confirm action re-resolves the same way.
 */
function resolveHouseholdOrAsk(dataset: Dataset, attrs: HouseholdInput): { clientId: string; client: Client } {
  const result = resolveHouseholdLoosely(attrs, dataset.clients, dataset.pets);
  if (result.kind === "matched") {
    const client = dataset.clients.find((c) => c.id === result.clientId);
    if (client) return { clientId: result.clientId, client };
    return { clientId: result.clientId, client: dataset.clients[0] };
  }
  if (result.kind === "ambiguous") {
    throw new AgentToolError(
      `More than one household matches "${attrs.name}" (${result.options.map((o) => o.label).join(", ")}). ` +
        "Ask the operator which one — by the owner's full name or a phone number.",
    );
  }
  throw new AgentToolError(
    `I couldn't find a household for "${attrs.name}". Check find_household, or ask the operator for the owner's name or phone.`,
  );
}

/**
 * Resolve a pet the model named within an already-resolved household. Collapses
 * split-duplicate rows to one animal and returns the whole group's pet ids so an
 * existing appointment filed under any row can still be re-resolved. Ambiguous /
 * no-match asks.
 */
function resolvePetOrAsk(
  dataset: Dataset,
  clientId: string,
  ownerName: string,
  petQuery: string,
): { petId: string; groupPetIds: string[]; petName: string; pet: Pet | null } {
  const householdPets = dataset.pets.filter((p) => p.client_id === clientId);
  const householdAppointments = dataset.appointments.filter((a) => a.client_id === clientId);
  const result = resolvePetWithinHousehold(petQuery, householdPets, householdAppointments);
  if (result.kind === "matched") {
    const pet = householdPets.find((p) => p.id === result.petId) ?? null;
    const petName = pet?.name ?? petQuery;
    return { petId: result.petId, groupPetIds: result.groupPetIds, petName, pet };
  }
  if (result.kind === "ambiguous") {
    throw new AgentToolError(
      `${ownerName} has more than one pet matching "${petQuery}" (${result.options.map((o) => o.name).join(", ")}). ` +
        "Ask the operator which one.",
    );
  }
  throw new AgentToolError(
    `I couldn't find a pet named "${petQuery}" on ${ownerName}'s file. Check find_household.`,
  );
}

// ---------------------------------------------------------------------------
// propose_book_appointment — resolves a booking for either surface.
// ---------------------------------------------------------------------------

const proposeBookAppointment: AgentWriteTool = {
  name: "propose_book_appointment",
  description:
    "Propose booking a new appointment for an existing dog (does NOT book it — the " +
    "operator confirms a card first). This is the tool for ANY booking/scheduling " +
    "request for a dog already on file — never create the household or pet again. " +
    "Identify the household by `household` (the owner's name as the operator said it — " +
    "a NAME, never an id; you may confirm it with find_household but pass the name here), " +
    "optionally `phone` to disambiguate same-name households, and the dog(s) by `pets` " +
    "(their names). Also pass a concrete ISO `date` (YYYY-MM-DD), a `time_slot` " +
    "(the DROP-OFF time, e.g. '10:00am') and a `service_type` " +
    "(one of full_groom, puppy_groom, bath_only, nail_trim, other). Optional `fee`. " +
    "The `time_slot` is a drop-off-time block, not a groom duration: NEVER ask the " +
    "operator how long the appointment is or for a length in minutes — there is no " +
    "duration to ask. `location` is OPTIONAL: when you omit it, the booking's location " +
    "is taken from the operator's recurring weekly 'where I work' schedule for that " +
    "date and confirmed on the card — so do NOT ask which location when the day's " +
    "schedule already answers it. Only pass `location` when the operator herself names " +
    "one this turn, or when the schedule has that weekday off / unset and you've been " +
    "asked to supply it; then pass it in her OWN words (e.g. 'Gina's', 'the salon', a " +
    "street) — it is matched to a configured location for you, so don't demand exact " +
    "wording; read get_locations to see the configured ones. If it can't be resolved " +
    "you'll get the list to ask from. " +
    "If the household or a dog is ambiguous, you'll be told to ask which — never propose on a guess.",
  input_schema: {
    type: "object",
    properties: {
      household: { type: "string", description: "The owner's name (NOT an id), e.g. 'Maple Greenwood'." },
      phone: { type: "string", description: "Optional phone to disambiguate two same-name households." },
      pets: {
        type: "array",
        items: { type: "string" },
        description: "The dog name(s) to book, e.g. ['Biscuit'] or ['Coco','Kiwi'].",
      },
      date: { type: "string", description: "ISO YYYY-MM-DD." },
      time_slot: {
        type: "string",
        description: "Drop-off time block, e.g. '10:00am' (NOT a groom duration — don't ask how long).",
      },
      service_type: {
        type: "string",
        enum: [...SERVICE_TYPES],
        description: "The grooming service code.",
      },
      fee: { type: "number", description: "Optional fee for the appointment." },
      location: {
        type: "string",
        description:
          "OPTIONAL. Omit to take the location from the weekly 'where I work' schedule for the date " +
          "(confirmed on the card). Only set it when the operator names one, or the day is off/unset: " +
          "gina/annette for batched, an org location name (or spoken words) for 1:1.",
      },
    },
    required: ["household", "pets", "date", "time_slot", "service_type"],
    additionalProperties: false,
  },
  propose: async (input): Promise<BookAppointmentProposal> => {
    const household = householdInputFrom(input);
    const petQueries = petQueriesFrom(input);
    const date = requireIsoDate(input.date, "date");
    // The drop-off time is required. If it's missing, ASK for it (one short
    // question) — a clear, caller-correctable error the model relays. Never
    // propose a booking without a drop-off time, and never guess one.
    const timeSlotInput =
      typeof input.time_slot === "string" ? input.time_slot.trim() : "";
    if (!timeSlotInput) {
      throw new AgentToolError(
        "What time is the drop-off? Ask the operator for it, then pass it as `time_slot` — don't guess one.",
      );
    }
    const timeSlot = timeSlotInput;
    const serviceType = requireServiceType(input.service_type);
    const fee = optionalMoney(input.fee, "fee");
    const locationInput =
      typeof input.location === "string" ? input.location.trim() : "";

    const dataset = await loadDataset();
    const { clientId, client } = resolveHouseholdOrAsk(dataset, household);
    const ownerName = fullName(client.first_name, client.last_name);
    // Resolve each named dog to a real pet on this household (collapsing split
    // duplicates); the model never supplies a pet id.
    const resolvedPets = petQueries.map((query) =>
      resolvePetOrAsk(dataset, clientId, ownerName, query),
    );

    const org = await loadOrgSettings();
    // A booking's time is a DROP-OFF block, never an asked-for groom length. We
    // NEVER solicit a duration from the operator; the 1:1 surface still persists a
    // duration_minutes, so default it from the service + this dog's size using the
    // SAME per-size suggestion the 1:1 engine uses (operator-adjustable later).
    // The batched surface ignores it (stays null).
    let location: string | null = null;
    let locationLabel: string | null = null;
    let durationMinutes: number | null = null;
    // Set when the location was inferred from the weekly schedule (not typed this
    // turn) — surfaced on the confirm card so she just approves the inferred place.
    let scheduleNote: string | null = null;

    if (org.schedulingStyle === "one_to_one") {
      if (locationInput) {
        // She named a location this turn — honor it. Loose-match the spoken words
        // ("the studio", "Gina's", a street) to a configured org location;
        // ambiguous / no-match asks. The gated action re-validates with isOrgLocation.
        location = resolveOrgLocationOrAsk(org.locations, locationInput);
      } else {
        // No location given: resolve it from the recurring weekly schedule for the
        // date and CONFIRM it, instead of asking. Only ask when that weekday is
        // off / unset (no schedule answer) — then note it's her day off.
        const scheduled = resolveLocationForDate(org, date);
        if (scheduled.off || !scheduled.location) {
          throw new AgentToolError(
            `${weekdayLongName(date)} (${formatDate(date)}) isn't set in the weekly schedule (looks like a day off). ` +
              `Which location is it at — ${listOrgLocations(org.locations)}? Pass it as \`location\`.`,
          );
        }
        location = scheduled.location;
        scheduleNote = scheduleLocationNote(date, scheduled.location);
      }
      locationLabel = orgLocationAddress(org, location) ?? location;
      // Default the persisted block length from the service + dog size — never asked.
      // A pet we couldn't size (no record) falls through to the medium default.
      const firstPet = resolvedPets[0]?.pet ?? null;
      const size = firstPet ? inferSizeClass(firstPet) : "medium";
      durationMinutes = suggestedDurationMinutes(
        serviceType,
        size,
        org.durationDefaults ?? undefined,
      );
    } else if (locationInput) {
      // Batched, location named this turn — it drives the salon-payout split.
      if (!(BOOKING_LOCATIONS as readonly string[]).includes(locationInput)) {
        throw new AgentToolError("Location must be 'gina' or 'annette' for this business.");
      }
      location = locationInput;
      locationLabel = bookingLocationLabel(locationInput);
    } else {
      // Batched, no location given: take it from the weekly schedule for the date
      // and CONFIRM it (the schedule stores an org location name; map it to the
      // gina/annette payout code). Only ask when the weekday is off / unset, OR
      // the scheduled place doesn't map to a payout shop — never guess the split.
      const scheduled = resolveLocationForDate(org, date);
      const code = scheduled.location ? batchedCodeFromScheduleName(scheduled.location) : null;
      if (scheduled.off || !scheduled.location || !code) {
        throw new AgentToolError(
          "Which location is this booking at — Gina's or Annette's? It sets the payout split.",
        );
      }
      location = code;
      locationLabel = bookingLocationLabel(code);
      scheduleNote = scheduleLocationNote(date, bookingLocationLabel(code) ?? scheduled.location);
    }

    return {
      kind: "book_appointment",
      householdName: household.name,
      householdPhone: household.phone,
      ownerName,
      petQueries: resolvedPets.map((p) => p.petName),
      petNames: formatPetNames(resolvedPets.map((p) => p.petName)),
      date,
      timeSlot,
      serviceType,
      service: serviceLabel(serviceType) ?? serviceType,
      fee,
      location,
      locationLabel,
      durationMinutes,
      scheduleNote,
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
    "card first). Identify the dog by `household` (the owner's NAME, never an id; optionally " +
    "`phone` to disambiguate) and `pet` (the dog's name), and pass `added_tip` (the dollar " +
    "amount to add). Optionally pass a concrete ISO `date` to target a specific " +
    "groom; otherwise the most recent completed groom is used. This marks the groom " +
    "paid and sets its tip — the confirm card discloses both. If there is no " +
    "completed groom, the operator is told to give a date.",
  input_schema: {
    type: "object",
    properties: {
      household: { type: "string", description: "The owner's name (NOT an id)." },
      phone: { type: "string", description: "Optional phone to disambiguate same-name households." },
      pet: { type: "string", description: "The dog's name." },
      added_tip: { type: "number", description: "Dollar amount of tip to add." },
      date: { type: "string", description: "Optional ISO date of the groom to tip." },
    },
    required: ["household", "pet", "added_tip"],
    additionalProperties: false,
  },
  propose: async (input): Promise<AddTipProposal> => {
    const household = householdInputFrom(input);
    const petInput = requireString(input.pet, "pet");
    const addedTip = Number(input.added_tip);
    if (!Number.isFinite(addedTip) || addedTip <= 0) {
      throw new AgentToolError("`added_tip` must be a positive dollar amount.");
    }
    const date = optionalIsoDate(input.date, "date");

    const dataset = await loadDataset();
    const { clientId, client } = resolveHouseholdOrAsk(dataset, household);
    const ownerName = fullName(client.first_name, client.last_name);
    const { petId, petName } = resolvePetOrAsk(dataset, clientId, ownerName, petInput);
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
      householdName: household.name,
      householdPhone: household.phone,
      petQuery: petName,
      petName,
      ownerName,
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
    "first). Identify the dog by `household` (the owner's NAME, never an id; optionally " +
    "`phone` to disambiguate) and `pet` (the dog's name), a concrete ISO " +
    "`date` (not in the future), and a `service_type` (full_groom, puppy_groom, " +
    "bath_only, nail_trim, other). Optional `fee`, `tip`, `payment_method` " +
    "(cash/interac/other, default cash), `payment_status` (paid/waiting, default " +
    "paid), and `notes` (the operator's own groom notes).",
  input_schema: {
    type: "object",
    properties: {
      household: { type: "string", description: "The owner's name (NOT an id)." },
      phone: { type: "string", description: "Optional phone to disambiguate same-name households." },
      pet: { type: "string", description: "The dog's name." },
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
    required: ["household", "pet", "date", "service_type"],
    additionalProperties: false,
  },
  propose: async (input): Promise<LogGroomProposal> => {
    const household = householdInputFrom(input);
    const petInput = requireString(input.pet, "pet");

    const dataset = await loadDataset();
    const { clientId, client } = resolveHouseholdOrAsk(dataset, household);
    const ownerName = fullName(client.first_name, client.last_name);
    const { petId, petName } = resolvePetOrAsk(dataset, clientId, ownerName, petInput);

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
      householdName: household.name,
      householdPhone: household.phone,
      petQuery: petName,
      petName,
      ownerName,
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
    "find_household first). This is NOT for booking an existing dog — if find_household " +
    "returns the pet, it already exists, so use propose_book_appointment instead. " +
    "Pass owner `first_name`, `last_name`, `phone`, and the first " +
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
    "a card first). Identify the household by `household` (the owner's NAME as the operator " +
    "said it — a NAME, never an id; optionally `phone` to disambiguate same-name households), " +
    "and pass `name`; optional `breed`, `size` (small/medium/large), `allergy_state` " +
    "(yes/no/unknown), `allergies_detail`, `grooming_notes`, `typical_fee`. If the household " +
    "is ambiguous, you'll be told to ask which — never propose on a guess.",
  input_schema: {
    type: "object",
    properties: {
      household: { type: "string", description: "The owner's name (NOT an id), e.g. 'Maple Greenwood'." },
      phone: { type: "string", description: "Optional phone to disambiguate two same-name households." },
      name: { type: "string" },
      breed: { type: "string" },
      size: { type: "string", enum: ["small", "medium", "large"] },
      allergy_state: { type: "string", enum: ["yes", "no", "unknown"] },
      allergies_detail: { type: "string" },
      grooming_notes: { type: "string" },
      typical_fee: { type: "number" },
    },
    required: ["household", "name"],
    additionalProperties: false,
  },
  propose: async (input): Promise<AddPetProposal> => {
    const household = householdInputFrom(input);
    const dataset = await loadDataset();
    // Resolve the household BY NAME (no id); the confirm action re-resolves the same way.
    const { clientId, client } = resolveHouseholdOrAsk(dataset, household);
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
      householdName: household.name,
      householdPhone: household.phone,
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
    "a card first). Identify the household by `household` (the owner's CURRENT name — a NAME, " +
    "never an id) and pass ONLY the fields to change: `first_name`, `last_name`, `phone`, " +
    "`email`, `address`, `notes`, `secondary_contact_name`, `secondary_cell`, `landline`. " +
    "(`phone` here is the NEW number to set, not a way to identify the household.) Untouched " +
    "fields are kept as-is. If two households share the name, you'll be told to ask which.",
  input_schema: {
    type: "object",
    properties: {
      household: { type: "string", description: "The owner's CURRENT name (NOT an id), to find the household." },
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
    required: ["household"],
    additionalProperties: false,
  },
  propose: async (input): Promise<EditHouseholdProposal> => {
    const householdName = requireString(input.household, "household");
    if (!namesAField(input, EDIT_HOUSEHOLD_FIELDS)) {
      throw new AgentToolError(
        "Tell me which detail to change (phone, email, address, name, notes, or secondary contact).",
      );
    }
    const dataset = await loadDataset();
    // Resolve the household BY its CURRENT name (no id, and `phone` is an editable
    // field here so it can't double as a disambiguator). The confirm action
    // re-resolves the same way before the edit.
    const { clientId, client } = resolveHouseholdOrAsk(dataset, { name: householdName, phone: null });
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
      householdName,
      householdPhone: null,
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
    "Identify the dog by `household` (the owner's NAME, never an id; optionally `phone` to " +
    "disambiguate same-name households) and `pet` (the dog's CURRENT name). Pass ONLY the " +
    "fields to change: `name` (a NEW name), `breed`, `size` (small/medium/large), `color`, " +
    "`date_of_birth` (YYYY-MM-DD), `allergy_state` (yes/no/unknown), `allergies_detail`, " +
    "`grooming_notes`, `typical_fee`. Untouched fields are kept. If the household or dog is " +
    "ambiguous, you'll be told to ask which — never propose on a guess.",
  input_schema: {
    type: "object",
    properties: {
      household: { type: "string", description: "The owner's name (NOT an id)." },
      phone: { type: "string", description: "Optional phone to disambiguate two same-name households." },
      pet: { type: "string", description: "The dog's CURRENT name, used to find it." },
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
    required: ["household", "pet"],
    additionalProperties: false,
  },
  propose: async (input): Promise<EditPetProposal> => {
    const household = householdInputFrom(input);
    const petInput = requireString(input.pet, "pet");
    if (!namesAField(input, EDIT_PET_FIELDS)) {
      throw new AgentToolError(
        "Tell me what to change on the pet (breed, size, allergies, notes, fee, etc.).",
      );
    }
    const dataset = await loadDataset();
    // Resolve the household + dog BY NAME (no ids), group-aware for split-duplicate
    // rows; the confirm action re-resolves the same way. We edit the canonical row.
    const { clientId, client } = resolveHouseholdOrAsk(dataset, household);
    const ownerName = fullName(client.first_name, client.last_name);
    const { petId } = resolvePetOrAsk(dataset, clientId, ownerName, petInput);
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
      householdName: household.name,
      householdPhone: household.phone,
      petQuery: pet.name, // the dog's CURRENT name — confirm re-resolves the pet from it
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
    "save it — the operator confirms a card first). Identify the visit by `household` (the owner's " +
    "name — a NAME, never an id; optionally `phone` to disambiguate) and `pet` (the dog's name) " +
    "plus `date` (YYYY-MM-DD) — the visit's CURRENT date, used to " +
    "FIND it (NOT a new date). If the pet has more than one visit that day, also pass `time_slot` " +
    "(the visit's current time) to say which; if you don't know it, ask the operator — never guess. " +
    "Then `mode`: 'change' to reschedule or edit it — pass `new_date` (YYYY-MM-DD) and/or " +
    "`new_time_slot` to move it, and/or `service_type`, `location`, `fee`, `tip`, `payment_method`, " +
    "`payment_status`, `notes` to change those (untouched fields are kept); 'cancel' to remove the " +
    "booking; or 'no_show' to mark a still-booked visit as a no-show (keeps the record, never " +
    "deletes). `location` is gina/annette for a batched business or one of the operator's own " +
    "locations for a 1:1 business — for 1:1 you can name it loosely ('Gina's', 'the salon'); " +
    "it's matched to a configured location for you (read get_locations). Leave it out to keep " +
    "the current one.",
  input_schema: {
    type: "object",
    properties: {
      household: { type: "string", description: "The owner's name (NOT an id), e.g. 'Maple Greenwood'." },
      phone: { type: "string", description: "Optional phone to disambiguate two same-name households." },
      pet: { type: "string", description: "The dog's name, e.g. 'Biscuit'." },
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
    required: ["household", "pet", "date", "mode"],
    additionalProperties: false,
  },
  propose: async (input): Promise<EditAppointmentProposal> => {
    const household = householdInputFrom(input);
    const petInput = requireString(input.pet, "pet");
    const targetDate = requireIsoDate(input.date, "date");
    const targetTimeInput = optionalString(input.time_slot) || null;
    const mode = optionalString(input.mode);

    const org = await loadOrgSettings();
    const isOneToOne = org.schedulingStyle === "one_to_one";
    const orgLocationNames = org.locations.map((entry) => entry.name);

    const dataset = await loadDataset();
    // Resolve the household + dog BY NAME (no ids); the confirm action re-resolves
    // the same way. petId is the canonical row used to find the visit below.
    const { clientId, client } = resolveHouseholdOrAsk(dataset, household);
    const ownerName = fullName(client.first_name, client.last_name);
    const { petName, groupPetIds } = resolvePetOrAsk(dataset, clientId, ownerName, petInput);

    // Resolve the exact visit by pet + date (+ time) — the same resolver the
    // confirm action re-runs server-side. The pet's full group of ids is used so a
    // split-duplicate visit filed under either row resolves. A same-day duplicate
    // disambiguates by time or is refused; it is never resolved to a guess.
    const match = findAppointmentByPetDate(dataset.appointments, {
      clientId,
      petId: groupPetIds,
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
          "Check get_schedule for the times or ask the operator which one, then pass it as `time_slot`.",
      );
    }
    const existing = match.appointment;
    // Preserve the resolved visit's OWN date/time as the re-resolution tuple, so
    // the confirm action finds the same visit by its current (pre-move) date/time
    // before the write then moves it.
    const resolvedTargetDate = existing.date;
    const resolvedTargetTime = existing.time_slot ?? null;

    if (mode === "cancel") {
      return {
        kind: "edit_appointment",
        mode: "cancel",
        householdName: household.name,
        householdPhone: household.phone,
        petQuery: petName,
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
        householdName: household.name,
        householdPhone: household.phone,
        petQuery: petName,
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
    // Loose-match a spoken 1:1 location to a configured org location before merge
    // (ambiguous / no-match asks); batched keeps the gina/annette enum unchanged,
    // validated downstream by validateEditAppointment.
    const spokenLocation = optionalString(input.location);
    const requestedLocation =
      spokenLocation && isOneToOne
        ? resolveOrgLocationOrAsk(org.locations, spokenLocation)
        : spokenLocation;
    const merged = {
      date: optionalString(input.new_date) || existing.date,
      time_slot: optionalString(input.new_time_slot) || (existing.time_slot ?? ""),
      service_type:
        optionalString(input.service_type) || (serviceCodeFromLabel(existing.service) ?? ""),
      location: requestedLocation || currentLocation,
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
      householdName: household.name,
      householdPhone: household.phone,
      petQuery: petName,
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
    "destructive card first). Identify the household by `household` (the owner's NAME, never an " +
    "id; optionally `phone` to disambiguate same-name households). A household that has ANY " +
    "appointment history can't be deleted (business records) — say so instead of proposing. " +
    "This is destructive and cannot be undone; only do it when the operator clearly asked to " +
    "delete. If the household is ambiguous, you'll be told to ask which — never delete on a guess.",
  input_schema: {
    type: "object",
    properties: {
      household: { type: "string", description: "The owner's name (NOT an id)." },
      phone: { type: "string", description: "Optional phone to disambiguate two same-name households." },
    },
    required: ["household"],
    additionalProperties: false,
  },
  propose: async (input): Promise<DeleteHouseholdProposal> => {
    const household = householdInputFrom(input);
    const dataset = await loadDataset();
    // Resolve the household BY NAME (no id); the confirm action re-resolves the same
    // way and REFUSES on an ambiguous/no-match result (no destructive guess).
    const { clientId, client } = resolveHouseholdOrAsk(dataset, household);
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
      householdName: household.name,
      householdPhone: household.phone,
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
    "wording first, and nothing is ever auto-sent). For `mode` 'reminder', identify the visit " +
    "by `household` (the owner's NAME — never an id; optionally `phone` to disambiguate same-name " +
    "households) and `pet` (the dog's name), plus `date` (YYYY-MM-DD) — the visit's CURRENT date " +
    "from get_schedule, used to FIND it (you do NOT handle appointment ids). If the pet has more " +
    "than one visit that day, also pass `time_slot` (the visit's current time) to say which; if " +
    "you don't know it, ask the operator — never guess. Also pass the `message` you drafted from " +
    "the operator's instruction (do not invent appointment facts). For `mode` 'reply' (replying " +
    "to a customer's inbound text), pass the `sms_id` being replied to, the drafted `message`, " +
    "and `recipient_label` (the customer's name). Always show the operator the full wording to " +
    "confirm before anything is sent.",
  input_schema: {
    type: "object",
    properties: {
      mode: { type: "string", enum: ["reminder", "reply"] },
      message: { type: "string" },
      household: { type: "string", description: "The owner's name (NOT an id) (reminder mode)." },
      phone: { type: "string", description: "Optional phone to disambiguate same-name households (reminder mode)." },
      pet: { type: "string", description: "The dog's name (reminder mode)." },
      date: {
        type: "string",
        description: "The visit's CURRENT date (ISO YYYY-MM-DD), used to find it (reminder mode).",
      },
      time_slot: {
        type: "string",
        description: "The visit's CURRENT time, to pick which visit when the pet has two that day.",
      },
      sms_id: { type: "string", description: "Inbound message id being replied to (reply mode)." },
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

    const household = householdInputFrom(input);
    const petInput = requireString(input.pet, "pet");
    const targetDate = requireIsoDate(input.date, "date");
    const targetTimeInput = optionalString(input.time_slot) || null;

    const dataset = await loadDataset();
    // Resolve the household + dog BY NAME (no ids); the confirm action re-resolves
    // the same way. groupPetIds is split-duplicate safe for the visit lookup below.
    const { clientId, client } = resolveHouseholdOrAsk(dataset, household);
    const ownerName = fullName(client.first_name, client.last_name);
    const { petName, groupPetIds } = resolvePetOrAsk(dataset, clientId, ownerName, petInput);

    // Identify the exact visit by pet + date (+ time) — the SAME resolver the
    // confirm action re-runs server-side to re-resolve the authoritative id. A
    // same-day duplicate disambiguates by time or is refused; never a guess.
    const match = findAppointmentByPetDate(dataset.appointments, {
      clientId,
      petId: groupPetIds,
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
          "Check get_schedule for the times or ask the operator which one, then pass it as `time_slot`.",
      );
    }
    const existing = match.appointment;

    // A reminder is only for a still-BOOKED visit. Resolving by an explicit date
    // can land on a completed or cancelled visit on that day; refuse rather than
    // draft a reminder for one (mirrors the no-show guard's booked-only rule).
    if ((existing.status ?? "booked") !== "booked") {
      throw new AgentToolError(
        `${petName}'s visit on ${targetDate} is ${existing.status} — there's no booked appointment to remind about.`,
      );
    }

    // Build the reminder context (pet · date · time) from the resolved visit. The
    // id is resolved internally — never supplied by the model — so a grouped
    // same-slot context is safe to derive here.
    const target = buildReminderTarget(dataset.appointments, dataset.pets, {
      appointmentId: existing.id,
    });
    if (!target) {
      throw new AgentToolError(
        "I couldn't build that reminder. Re-check with get_schedule.",
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
      householdName: household.name,
      householdPhone: household.phone,
      petQuery: petName,
      // Preserve the resolved visit's OWN date/time as the re-resolution tuple so
      // the confirm action finds the same visit server-side before sending.
      targetDate: existing.date,
      targetTimeSlot: existing.time_slot ?? null,
      recipientLabel: ownerName,
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
