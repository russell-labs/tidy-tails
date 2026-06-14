// Agentic layer — the confirm card (Phase 3). THE safety mechanism for writes.
//
// The model never executes a write; it produces a proposal, which this card
// shows as the EXACT resolved action ("Book Kiwi — Full groom · Jul 11, 2026 ·
// 10:00am · $50.00"). Only a Confirm tap calls the deterministic confirm action
// that performs the real (gated) write. Cancel writes nothing. Once the card is
// confirming, saved, gated, errored, or cancelled it shows no action buttons, so
// a write can never be re-triggered and a cancelled proposal stays unwritten.
//
// Purely presentational + prop-driven: the parent (AssistantChat) owns the
// proposal state and wires Confirm to confirmAgentProposal and Cancel to a
// no-write dismissal. describeProposal() is the single source of the action text,
// shared with the confirm action's fields, so the card always matches the write.

import { describeProposal, type AgentProposal } from "@/lib/agent/proposals";

export type ConfirmCardStatus =
  | "pending" // awaiting Sam's decision
  | "confirming" // Confirm tapped, write in flight
  | "saved" // write committed
  | "gated" // write gate off — nothing saved
  | "error" // write failed / refused
  | "cancelled"; // Sam cancelled — nothing saved

/** Only the pending card exposes the Confirm/Cancel actions. */
export function confirmCardShowsActions(status: ConfirmCardStatus): boolean {
  return status === "pending";
}

/** The card heading per proposal kind (cancel/delete read as their own action). */
function headingFor(proposal: AgentProposal): string {
  switch (proposal.kind) {
    case "book_appointment":
      return "Book this appointment?";
    case "add_tip":
      return "Add this tip?";
    case "log_groom":
      return "Log this groom?";
    case "add_household":
      return "Add this household?";
    case "add_pet":
      return "Add this pet?";
    case "edit_household":
      return "Update this household?";
    case "edit_pet":
      return "Update this pet?";
    case "edit_appointment":
      return proposal.mode === "cancel"
        ? "Cancel this appointment?"
        : "Update this appointment?";
    case "delete_household":
      return "Delete this household?";
    case "log_daily_income":
      return "Log this day's income?";
    case "send_text":
      return "Send this text?";
  }
}

/** A destructive proposal (permanent delete or a cancellation) gets red styling. */
function isDestructive(proposal: AgentProposal): boolean {
  return (
    proposal.kind === "delete_household" ||
    (proposal.kind === "edit_appointment" && proposal.mode === "cancel")
  );
}

function confirmLabel(proposal: AgentProposal): string {
  if (proposal.kind === "delete_household") return "Delete";
  if (proposal.kind === "edit_appointment" && proposal.mode === "cancel")
    return "Cancel booking";
  return "Confirm";
}

export function AssistantConfirmCard({
  proposal,
  status,
  message,
  onConfirm,
  onCancel,
}: {
  proposal: AgentProposal;
  status: ConfirmCardStatus;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const showActions = confirmCardShowsActions(status);
  const destructive = isDestructive(proposal);
  const tone =
    status === "saved"
      ? "border-brand bg-brand-soft text-ink"
      : status === "error"
        ? "border-danger bg-danger-soft text-danger-ink"
        : status === "gated" || status === "cancelled"
          ? "border-line bg-surface text-ink-soft"
          : destructive
            ? "border-danger bg-danger-soft text-ink"
            : "border-brand bg-surface text-ink";

  return (
    <div className={`flex max-w-[90%] flex-col gap-2 rounded-2xl border px-4 py-3 shadow-sm ${tone}`}>
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${
          destructive && showActions ? "text-danger-ink" : "text-ink-faint"
        }`}
      >
        {headingFor(proposal)}
      </p>

      {/* The exact resolved action — what Sam is approving, verbatim. */}
      <p className="whitespace-pre-wrap text-sm font-medium text-ink">
        {describeProposal(proposal)}
      </p>

      {status === "confirming" ? (
        <p className="text-xs text-ink-soft">Saving…</p>
      ) : null}

      {status === "saved" ? (
        <p className="text-sm font-medium text-ink">✓ {message ?? "Saved."}</p>
      ) : null}

      {status === "gated" || status === "error" ? (
        <p className="text-sm text-ink-soft">{message ?? "Nothing was saved."}</p>
      ) : null}

      {status === "cancelled" ? (
        <p className="text-sm text-ink-soft">Cancelled — nothing was saved.</p>
      ) : null}

      {showActions ? (
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold text-white ${
              destructive ? "bg-danger active:bg-danger-ink" : "bg-brand active:bg-brand-ink"
            }`}
          >
            {confirmLabel(proposal)}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-xl border border-line bg-canvas px-4 text-sm font-semibold text-ink-soft active:bg-brand-soft"
          >
            {destructive ? "Keep" : "Cancel"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
