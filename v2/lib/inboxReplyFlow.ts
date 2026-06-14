// Agentic layer — the inbox reply-draft FLOW (pure client-side state machine).
//
// "Ask the assistant to draft a reply to this inbound text" is a draft → confirm
// → send flow, and the safety property the injection review cares about lives
// HERE, in pure transitions: a customer reply is NEVER auto-sent. The model only
// ever yields a reply PROPOSAL (server-side, in draftAgentReply — the one
// customer-text injection surface); this machine surfaces it as a pending confirm
// card, and the ONLY transition that can lead to a send is `beginConfirm`, which
// requires a pending proposal in hand. Cancel settles without sending.
//
// Keeping the flow pure (no DOM) means the no-auto-send backstop is unit-tested
// without a browser; the component (InboxAssistantReply) is a thin shell over it.

import type { AgentChatState } from "@/lib/actions/agent";
import type { AgentProposal } from "@/lib/agent/proposals";

/** The only proposal this flow accepts: a reply to one inbound customer text. */
export type ReplyProposal = Extract<AgentProposal, { kind: "send_text"; mode: "reply" }>;

/** Terminal confirm-card statuses once the proposal is resolved (send done, or cancelled). */
export type SettledStatus = "saved" | "gated" | "error" | "cancelled";

export type InboxReplyState =
  | { phase: "idle" } // only the "draft with assistant" affordance is shown
  | { phase: "composing" } // the instruction input is shown
  | { phase: "drafting" } // draftAgentReply is in flight
  | { phase: "proposed"; proposal: ReplyProposal } // pending confirm card
  | { phase: "confirming"; proposal: ReplyProposal } // confirmAgentProposal in flight (send started)
  | { phase: "settled"; proposal: ReplyProposal; status: SettledStatus; message?: string }
  | { phase: "failed"; message: string }; // the draft itself failed (no proposal)

export const initialReplyState: InboxReplyState = { phase: "idle" };

/** Result of the gated confirm action (mirrors AgentConfirmResult: saved/gated/error). */
export type ConfirmResult = { status: "saved" | "gated" | "error"; message: string };

function isReplyProposal(proposal: AgentProposal | undefined): proposal is ReplyProposal {
  return !!proposal && proposal.kind === "send_text" && proposal.mode === "reply";
}

/** Reveal the instruction composer. Allowed from any phase (idle / failed / settled re-draft). */
export function openComposer(): InboxReplyState {
  return { phase: "composing" };
}

/** The operator submitted her instruction — the draft call is in flight. */
export function beginDraft(state: InboxReplyState): InboxReplyState {
  return state.phase === "composing" ? { phase: "drafting" } : state;
}

/**
 * Apply the draftAgentReply result. A reply proposal → a PENDING confirm card
 * (never a sent state); anything else (error, or no/!reply proposal) → failed.
 */
export function draftResolved(state: InboxReplyState, result: AgentChatState): InboxReplyState {
  if (state.phase !== "drafting") return state;
  if (result.status === "answered" && isReplyProposal(result.proposal)) {
    return { phase: "proposed", proposal: result.proposal };
  }
  return {
    phase: "failed",
    message:
      result.message ?? "I couldn't draft a reply here. Try rephrasing what you'd like to say.",
  };
}

/**
 * Begin the confirm-and-send. THE single transition that can lead to a send — and
 * it requires a pending proposal, so a send can never start on its own.
 */
export function beginConfirm(state: InboxReplyState): InboxReplyState {
  return state.phase === "proposed" ? { phase: "confirming", proposal: state.proposal } : state;
}

/** Settle the card with the gated confirm action's result. */
export function confirmSettled(state: InboxReplyState, result: ConfirmResult): InboxReplyState {
  if (state.phase !== "confirming") return state;
  return { phase: "settled", proposal: state.proposal, status: result.status, message: result.message };
}

/** Cancel a pending proposal — settles as cancelled, sends nothing. */
export function cancelProposal(state: InboxReplyState): InboxReplyState {
  return state.phase === "proposed"
    ? { phase: "settled", proposal: state.proposal, status: "cancelled" }
    : state;
}

/** Collapse a settled/failed flow back to idle so the operator can start over. */
export function dismiss(): InboxReplyState {
  return { phase: "idle" };
}

/** Confirm-card status for the phases that render a card, else null (no card shown). */
export type CardStatus = "pending" | "confirming" | SettledStatus;

export function cardStatusForPhase(state: InboxReplyState): CardStatus | null {
  switch (state.phase) {
    case "proposed":
      return "pending";
    case "confirming":
      return "confirming";
    case "settled":
      return state.status;
    default:
      return null;
  }
}
