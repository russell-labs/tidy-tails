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

export type AgentProposal =
  | BookAppointmentProposal
  | AddTipProposal
  | LogGroomProposal;

/** The set of proposal kinds, for validation at the trust boundary. */
export const PROPOSAL_KINDS = [
  "book_appointment",
  "add_tip",
  "log_groom",
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
  }
}
