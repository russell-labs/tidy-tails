// Agentic layer — the confirm card (Phase 3). THE safety mechanism for writes.
//
// The model never executes a write; it produces a proposal, which this card
// shows as the EXACT resolved action ("Book Kiwi — Full groom · Jul 11, 2026 ·
// 10:00am · $50.00"). Only a Confirm tap calls the deterministic confirm action
// that performs the real (gated) write. Cancel writes nothing. Once the card is
// confirming, saved, gated, errored, or cancelled it shows no action buttons, so
// a write can never be re-triggered and a cancelled proposal stays unwritten.
//
// This is ONE card that mutates in place through its lifecycle (pending →
// confirming → saved / gated / error / cancelled) — never a second card. The
// header band names the action, the body shows the verbatim resolved action and
// the live result, and a lock line reassures Sam nothing is saved until she taps
// Confirm. Destructive actions (a permanent delete, a cancellation) read as red
// throughout, with "can't be undone" called out — that safety styling is never
// softened.
//
// Purely presentational + prop-driven: the parent (AssistantChat, and the inbox
// reply trigger) owns the proposal state and wires Confirm to confirmAgentProposal
// and Cancel to a no-write dismissal. describeProposal() is the single source of
// the action text, shared with the confirm action's fields, so the card always
// matches the write.

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

/** The short uppercase band label that categorises the action at a glance. */
function bandLabel(proposal: AgentProposal): string {
  switch (proposal.kind) {
    case "book_appointment":
      return "Confirm booking";
    case "add_tip":
      return "Confirm tip";
    case "log_groom":
      return "Confirm groom";
    case "add_household":
      return "New household";
    case "add_pet":
      return "New pet";
    case "edit_household":
      return "Update household";
    case "edit_pet":
      return "Update pet";
    case "edit_appointment":
      return proposal.mode === "cancel"
        ? "Cancel appointment"
        : proposal.mode === "no_show"
          ? "Mark no-show"
          : "Update appointment";
    case "delete_household":
      return "Delete household";
    case "log_daily_income":
      return "Log income";
    case "send_text":
      return "Confirm message";
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
  // The band + outer border read red for anything destructive or failed, brand
  // otherwise — the body stays a calm white surface so the resolved action and
  // its result are always legible.
  const danger = destructive || status === "error";
  const border = danger
    ? "border-danger"
    : status === "gated" || status === "cancelled"
      ? "border-line"
      : "border-brand";

  return (
    <div
      className={`flex w-full max-w-[90%] flex-col overflow-hidden rounded-2xl border bg-surface shadow-soft ${border}`}
    >
      {/* Header band — names the action; red for destructive/failed. */}
      <div
        className={`flex items-center gap-2 border-b px-3.5 py-2.5 ${
          danger
            ? "border-danger/40 bg-danger-soft text-danger-ink"
            : "border-brand-line bg-brand-soft text-brand-ink"
        }`}
      >
        <BandIcon danger={danger} />
        <span className="text-[11px] font-bold uppercase tracking-[0.06em]">
          {bandLabel(proposal)}
        </span>
      </div>

      <div className="px-3.5 pt-3">
        <p className="text-[15px] font-semibold text-ink">{headingFor(proposal)}</p>

        {/* The exact resolved action — what Sam is approving, verbatim. */}
        <p className="mt-1.5 whitespace-pre-wrap text-sm font-medium leading-relaxed text-ink-soft">
          {describeProposal(proposal)}
        </p>

        {status === "confirming" ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-brand" />
            Saving…
          </p>
        ) : null}

        {status === "saved" ? (
          <p className="mt-2 text-sm font-semibold text-ink">✓ {message ?? "Saved."}</p>
        ) : null}

        {status === "gated" || status === "error" ? (
          <p className="mt-2 text-sm text-ink-soft">{message ?? "Nothing was saved."}</p>
        ) : null}

        {status === "cancelled" ? (
          <p className="mt-2 text-sm text-ink-soft">Cancelled — nothing was saved.</p>
        ) : null}
      </div>

      {showActions ? (
        <>
          {/* Reassurance line — nothing happens until Sam taps; red + permanence
              for a destructive action (the safety pattern, never softened). */}
          <div
            className={`flex items-center gap-1.5 px-3.5 pb-2 pt-2.5 text-xs ${
              destructive ? "text-danger-ink" : "text-ink-faint"
            }`}
          >
            {destructive ? <AlertIcon /> : <LockIcon />}
            <span>
              {destructive
                ? "This can't be undone."
                : "Nothing changes until you tap Confirm."}
            </span>
          </div>

          <div className="flex gap-2 px-3.5 pb-3.5">
            {/* Safe dismissal on the left; the committing action on the right. */}
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink-soft active:bg-canvas"
            >
              {destructive ? "Keep" : "Cancel"}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`min-h-11 flex-[1.3] rounded-xl px-4 text-sm font-semibold text-white ${
                destructive
                  ? "bg-danger shadow-[0_2px_6px_rgba(190,18,60,0.25)] active:bg-danger-ink"
                  : "bg-brand shadow-[0_2px_6px_rgba(76,29,149,0.28)] active:bg-brand-ink"
              }`}
            >
              {confirmLabel(proposal)}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// --- Icons (inline, no dependency) -------------------------------------------

function BandIcon({ danger }: { danger: boolean }) {
  if (danger) return <AlertIcon />;
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}
