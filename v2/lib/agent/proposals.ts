// Agentic layer — write PROPOSALS (Phase 3).
//
// A proposal is the agent's resolved, validated intent to perform ONE write. It
// is NOT a write: the model produces it, the UI renders it as a confirm card,
// and only Sam's tap drives the separate, deterministic confirm action that
// calls the existing gated server action. Cancel discards the proposal and
// nothing is written.
//
// `describeProposal` is the SINGLE source of the card text. The confirm card
// renders it verbatim and the confirm action consumes the SAME fields, so "the
// card matches the resolved action exactly" holds by construction. Pure and
// dependency-light (formatting only) so it is safe to import from client code.

import { formatDate, formatMoney } from "@/lib/format";
import type { ServiceType } from "@/lib/booking";
import type { PaymentMethod, PaymentStatus } from "@/lib/payments";

/** Propose a new booking (works for both the batched and 1:1 surfaces). */
export type BookAppointmentProposal = {
  kind: "book_appointment";
  clientId: string;
  ownerName: string;
  petIds: string[];
  petNames: string; // display label, already formatted ("Kiwi" / "Kiwi and Coco")
  date: string; // ISO YYYY-MM-DD
  timeSlot: string; // free-text drop-off / start time, e.g. "10:00am"
  serviceType: ServiceType;
  service: string; // user-facing service label
  fee: number | null;
  location: string | null; // resolved location code/id, when one was given
  locationLabel: string | null; // display label for the location
  durationMinutes: number | null; // 1:1 block length; null for batched
};

/**
 * Propose adding/adjusting a tip on a COMPLETED groom. Backed by the existing
 * markAppointmentPaid path, which sets tip = paidAmount - fee and marks the
 * groom paid — both effects are disclosed on the card.
 */
export type AddTipProposal = {
  kind: "add_tip";
  clientId: string;
  petId: string;
  petName: string;
  ownerName: string;
  appointmentDate: string; // ISO date of the resolved groom
  service: string | null;
  fee: number; // the groom's current fee (price)
  currentTip: number; // tip already on the groom
  addedTip: number; // amount being added
  newTip: number; // currentTip + addedTip (== paidAmount - fee)
  paidAmount: number; // fee + newTip — the absolute total sent to the action
  paymentMethod: PaymentMethod;
};

/** Propose logging a completed groom. Backed by the existing logGroom action. */
export type LogGroomProposal = {
  kind: "log_groom";
  clientId: string;
  petId: string;
  petName: string;
  ownerName: string;
  date: string; // ISO YYYY-MM-DD
  serviceType: ServiceType;
  service: string; // user-facing service label
  fee: number | null;
  tip: number | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  notes: string | null; // the operator's own groom notes, when dictated
};

// --- Phase 4: complete write surface ---------------------------------------
// Each proposal below resolves to ONE existing gated action. The model only
// produces these; the confirm action performs the write on Sam's tap.

/** One pet on a new-household proposal (the intake form always carries ≥1 pet). */
export type ProposedPet = {
  name: string;
  breed: string | null;
  size: string | null;
  allergies: boolean | null; // yes → true, no → false, unknown → null
  allergiesDetail: string | null;
  vaccinationState: string; // yes / no / unknown
  vaccinationDetail: string | null;
  dateOfBirth: string | null;
  groomingNotes: string | null;
  typicalFee: number | null;
};

/** Propose adding a brand-new household + its first pet. Backed by saveIntake. */
export type AddHouseholdProposal = {
  kind: "add_household";
  ownerName: string;
  firstName: string;
  lastName: string;
  phone: string;
  secondaryContactName: string | null;
  secondaryCell: string | null;
  landline: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  smsConsent: boolean;
  pet: ProposedPet;
};

/** Propose adding a pet to an EXISTING household. Backed by addPet. */
export type AddPetProposal = {
  kind: "add_pet";
  clientId: string;
  ownerName: string;
  name: string;
  breed: string | null;
  size: string | null;
  allergies: boolean | null; // yes → true, no → false, unknown → null
  allergiesDetail: string | null;
  groomingNotes: string | null;
  typicalFee: number | null;
};

/**
 * Propose editing a household's contact details. Backed by editClient, which
 * REPLACES the whole contact record — so the proposal carries the full resolved
 * new state (current values merged with the requested changes, the unchanged
 * secondary contact preserved). `changes` is the human diff shown on the card.
 */
export type EditHouseholdProposal = {
  kind: "edit_household";
  clientId: string;
  ownerName: string;
  firstName: string;
  lastName: string;
  phone: string;
  secondaryContactName: string | null;
  secondaryCell: string | null;
  landline: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  changes: string[];
};

/** Propose editing a pet's profile. Backed by editPet (full-replace; merged). */
export type EditPetProposal = {
  kind: "edit_pet";
  clientId: string;
  petId: string;
  petName: string;
  name: string;
  breed: string | null;
  size: string | null;
  color: string | null;
  dateOfBirth: string | null;
  allergies: boolean | null; // yes → true, no → false, unknown → null
  allergiesDetail: string | null;
  groomingNotes: string | null;
  typicalFee: number | null;
  changes: string[];
};

/**
 * Propose editing an appointment. `reschedule_change` is backed by
 * editAppointment (full-replace, merged); `cancel` is backed by deleteAppointment;
 * `no_show` is backed by markAppointmentNoShow (a status transition that KEEPS the
 * record — never a delete). All three are behind EDIT_APPOINTMENT_WRITE. Universal:
 * serves BOTH the batched (gina/annette) and 1:1 (org-location) schedules.
 *
 * TARGET, NOT ID: the visit is identified by the re-resolution tuple
 * (`petId` + `targetDate` + `targetTimeSlot`), NOT a raw appointment id — the read
 * tools never expose ids, so the model can't supply one. The confirm action
 * re-resolves the authoritative appointment id server-side from this tuple against
 * org-scoped data (mirroring confirmAddTip), so a client-tampered proposal can't
 * redirect the write outside the org. For `reschedule_change`, `targetDate` is the
 * visit's CURRENT date (the identifier) while `date` is the NEW date being written.
 */
export type EditAppointmentProposal =
  | {
      kind: "edit_appointment";
      mode: "reschedule_change";
      clientId: string;
      petId: string;
      targetDate: string; // the visit's CURRENT date — used to re-resolve the id
      targetTimeSlot: string | null; // the visit's CURRENT time — disambiguates a same-day duplicate
      ownerName: string;
      petName: string;
      date: string; // the NEW date being written
      timeSlot: string;
      serviceType: ServiceType;
      service: string;
      location: string;
      locationLabel: string;
      fee: number | null;
      tip: number | null;
      paymentMethod: PaymentMethod;
      paymentStatus: PaymentStatus;
      notes: string | null;
      salonPayoutOverride: number | null; // preserved from the existing visit
      changes: string[];
    }
  | {
      kind: "edit_appointment";
      mode: "cancel";
      clientId: string;
      petId: string;
      targetDate: string;
      targetTimeSlot: string | null;
      ownerName: string;
      petName: string;
      date: string;
      service: string | null;
    }
  | {
      kind: "edit_appointment";
      mode: "no_show";
      clientId: string;
      petId: string;
      targetDate: string;
      targetTimeSlot: string | null;
      ownerName: string;
      petName: string;
      date: string;
      service: string | null;
    };

/**
 * Propose deleting (permanently) a household. Backed by deleteClient, whose
 * history guard still blocks a household that has any appointment record — the
 * card discloses the count so Sam sees what's at stake before the destructive tap.
 */
export type DeleteHouseholdProposal = {
  kind: "delete_household";
  clientId: string;
  ownerName: string;
  petNames: string;
  petCount: number;
  appointmentCount: number;
  hasHistory: boolean;
};

/**
 * Propose logging a day's income as a payout override (incl. "paid by salon,
 * keep 100%"). Backed by saveDayCloseoutOverride: finalPayout is Sam's stated
 * take-home for the day; calculatedPayout is the reference figure. The agent
 * records the override Sam dictates — it does not recompute the salon split.
 */
export type LogDailyIncomeProposal = {
  kind: "log_daily_income";
  date: string;
  location: string;
  locationLabel: string;
  finalPayout: number;
  calculatedPayout: number;
  note: string | null;
  paidBySalon: boolean;
};

/**
 * Propose sending a customer text. `reminder` is backed by prepareReminder
 * (operator/template content — no customer free-text in model context);
 * `reply` is backed by sendInboxSmsReply (a reply to a specific inbound message).
 * BOTH always draft → confirm → send: nothing is sent until Sam taps Confirm, and
 * the FULL drafted message is shown verbatim on the card. The reply path is the
 * agent's only customer-text injection surface — see the messaging reply seam.
 *
 * REMINDER — TARGET, NOT ID: the read tools never expose an appointment id, so the
 * model can't supply one. The reminder's visit is identified by the re-resolution
 * tuple (`petId` + `targetDate` + `targetTimeSlot`) — the visit's CURRENT date (and
 * its time, to break a same-day tie) — exactly like edit_appointment. The confirm
 * action re-resolves the authoritative appointment id server-side from this tuple
 * against org-scoped (RLS) data, so a client-tampered proposal can't redirect or
 * fabricate the target; a non-match fails safe (no send).
 */
export type SendTextProposal =
  | {
      kind: "send_text";
      mode: "reminder";
      clientId: string;
      petId: string;
      targetDate: string; // the visit's CURRENT date — used to re-resolve the id
      targetTimeSlot: string | null; // the visit's CURRENT time — disambiguates a same-day duplicate
      recipientLabel: string;
      toNumber: string;
      context: string;
      message: string;
    }
  | {
      kind: "send_text";
      mode: "reply";
      smsId: string;
      recipientLabel: string;
      message: string;
    };

export type AgentProposal =
  | BookAppointmentProposal
  | AddTipProposal
  | LogGroomProposal
  | AddHouseholdProposal
  | AddPetProposal
  | EditHouseholdProposal
  | EditPetProposal
  | EditAppointmentProposal
  | DeleteHouseholdProposal
  | LogDailyIncomeProposal
  | SendTextProposal;

/** The set of proposal kinds, for validation at the trust boundary. */
export const PROPOSAL_KINDS = [
  "book_appointment",
  "add_tip",
  "log_groom",
  "add_household",
  "add_pet",
  "edit_household",
  "edit_pet",
  "edit_appointment",
  "delete_household",
  "log_daily_income",
  "send_text",
] as const;

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "cash",
  interac: "Interac",
  other: "other",
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "paid",
  waiting: "waiting on payment",
};

/**
 * The exact human-readable action shown on the confirm card. The confirm action
 * acts on the same proposal fields, so what Sam approves is what is performed.
 */
export function describeProposal(proposal: AgentProposal): string {
  switch (proposal.kind) {
    case "book_appointment": {
      const parts = [
        proposal.service,
        formatDate(proposal.date),
        proposal.timeSlot,
      ];
      if (proposal.locationLabel) parts.push(proposal.locationLabel);
      if (proposal.fee != null) parts.push(formatMoney(proposal.fee));
      return `Book ${proposal.petNames} — ${parts.join(" · ")}`;
    }
    case "add_tip": {
      const method = METHOD_LABEL[proposal.paymentMethod] ?? proposal.paymentMethod;
      return (
        `Add ${formatMoney(proposal.addedTip)} tip to ${proposal.petName}'s groom ` +
        `on ${formatDate(proposal.appointmentDate)} — marks it paid (${method}), ` +
        `new total ${formatMoney(proposal.paidAmount)} (tip ${formatMoney(proposal.newTip)})`
      );
    }
    case "log_groom": {
      const method = METHOD_LABEL[proposal.paymentMethod] ?? proposal.paymentMethod;
      const status = STATUS_LABEL[proposal.paymentStatus] ?? proposal.paymentStatus;
      const parts = [
        proposal.service,
        formatDate(proposal.date),
      ];
      if (proposal.fee != null) parts.push(`fee ${formatMoney(proposal.fee)}`);
      if (proposal.tip != null && proposal.tip > 0)
        parts.push(`tip ${formatMoney(proposal.tip)}`);
      parts.push(`${status} (${method})`);
      if (proposal.notes) parts.push(`note: ${proposal.notes}`);
      return `Log groom for ${proposal.petName} — ${parts.join(" · ")}`;
    }
    case "add_household": {
      const contact = [proposal.phone];
      if (proposal.email) contact.push(proposal.email);
      const petBits = [proposal.pet.name];
      const details = [proposal.pet.breed, proposal.pet.size].filter(Boolean);
      if (details.length) petBits.push(`(${details.join(", ")})`);
      if (proposal.pet.typicalFee != null)
        petBits.push(formatMoney(proposal.pet.typicalFee));
      return (
        `Add household ${proposal.ownerName} — ${contact.join(" · ")} · ` +
        `with pet ${petBits.join(" ")}`
      );
    }
    case "add_pet": {
      const bits = [proposal.breed, proposal.size].filter(Boolean);
      if (proposal.typicalFee != null) bits.push(formatMoney(proposal.typicalFee));
      if (proposal.allergies && proposal.allergiesDetail)
        bits.push(`allergies: ${proposal.allergiesDetail}`);
      return (
        `Add pet ${proposal.name} to ${proposal.ownerName}` +
        (bits.length ? ` — ${bits.join(" · ")}` : "")
      );
    }
    case "edit_household": {
      const changes = proposal.changes.length
        ? proposal.changes.join(" · ")
        : "no changes";
      return `Update ${proposal.ownerName} — ${changes}`;
    }
    case "edit_pet": {
      const changes = proposal.changes.length
        ? proposal.changes.join(" · ")
        : "no changes";
      return `Update ${proposal.petName} — ${changes}`;
    }
    case "edit_appointment": {
      if (proposal.mode === "cancel") {
        const tail = proposal.service ? ` (${proposal.service})` : "";
        return (
          `Cancel ${proposal.petName}'s visit${tail} on ` +
          `${formatDate(proposal.date)} — this removes the booking.`
        );
      }
      if (proposal.mode === "no_show") {
        const tail = proposal.service ? ` (${proposal.service})` : "";
        return (
          `Mark ${proposal.petName}'s visit${tail} on ` +
          `${formatDate(proposal.date)} as a no-show — keeps the record, no charge.`
        );
      }
      const parts = [
        proposal.service,
        formatDate(proposal.date),
        proposal.timeSlot,
        proposal.locationLabel,
      ];
      if (proposal.fee != null) parts.push(formatMoney(proposal.fee));
      return `Update ${proposal.petName}'s visit — ${parts.filter(Boolean).join(" · ")}`;
    }
    case "delete_household": {
      const scope =
        proposal.petCount > 0
          ? ` (${proposal.petCount} pet${proposal.petCount === 1 ? "" : "s"})`
          : "";
      return (
        `DELETE household ${proposal.ownerName}${scope} — this permanently ` +
        `removes the household and its pets. This cannot be undone.`
      );
    }
    case "log_daily_income": {
      const bits = [
        proposal.locationLabel,
        formatDate(proposal.date),
        `keep ${formatMoney(proposal.finalPayout)}`,
      ];
      if (proposal.paidBySalon) bits.push("paid by salon — keep 100%");
      if (proposal.note) bits.push(`note: ${proposal.note}`);
      return `Log day income — ${bits.join(" · ")}`;
    }
    case "send_text": {
      if (proposal.mode === "reply") {
        return (
          `Reply to ${proposal.recipientLabel}:\n` +
          `“${proposal.message}”`
        );
      }
      return (
        `Text ${proposal.recipientLabel} (${proposal.toNumber}) — ` +
        `${proposal.context}:\n“${proposal.message}”`
      );
    }
  }
}
