// Agentic layer — model-facing conversation history (TT-027).
//
// The chat surface holds the transcript as display entries (user bubbles,
// assistant bubbles, confirm cards). Before each turn it must hand the model a
// light transcript of PRIOR turns. The naive version (keep only user/assistant
// text) dropped the confirm cards entirely — and a silent propose turn left no
// assistant text at all. So a prepared action left NO trace in the transcript:
// the prior user request looked UNANSWERED, and on a later turn the model
// re-emitted that stale proposal instead of building the right one (the observed
// multi-turn context bleed: book → confirm → add-pet → cancel → "change phone"
// re-showed the add-pet card).
//
// buildAgentHistory closes that: EVERY prepared action becomes a resolved
// assistant turn (confirmed / cancelled / awaiting / nothing-saved), so no
// request is left looking unanswered. It also COALESCES adjacent same-role turns
// so the result strictly alternates user/assistant — the Anthropic adapter maps
// the transcript 1:1 and rejects two assistant turns in a row, which a "chatty"
// propose turn (assistant text + a card) would otherwise produce.
//
// Pure and dependency-light (describeProposal is formatting-only), so it is safe
// to import from the client chat component. It performs no I/O and reaches no
// write/send/mutation — it only reshapes already-resolved display state.

import { describeProposal, type AgentProposal } from "./proposals";
import type { AgentTurn } from "./runAgent";

/**
 * The chat transcript entries, reduced to just the fields the model history
 * needs. `status` is the confirm-card status string ("saved", "cancelled",
 * "pending", "confirming", "gated", "error"); an unknown value falls through to
 * "awaiting confirm". Typed structurally (not as the card's union) to keep this
 * module decoupled from the client component.
 */
export type ConversationEntry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "error"; text: string }
  | { kind: "proposal"; proposal: AgentProposal; status: string };

/**
 * The assistant's own record of a prepared action and what the operator did with
 * it. Phrased as past/handled ("Already prepared … confirmed/cancelled") so the
 * model treats it as settled history and does not re-emit the proposal. Reuses
 * describeProposal — the SAME text shown on the confirm card — so the record
 * matches exactly what the operator saw.
 */
function proposalHistoryText(proposal: AgentProposal, status: string): string {
  const action = describeProposal(proposal);
  switch (status) {
    case "saved":
      return `[Already prepared — the operator confirmed it, so it is done: ${action}]`;
    case "cancelled":
      return `[Already prepared — the operator cancelled it, so nothing was done: ${action}]`;
    case "gated":
      return `[Already prepared — nothing was saved because a setting is off: ${action}]`;
    case "error":
      return `[Already prepared — it could not be completed: ${action}]`;
    default: // "pending" | "confirming" | any other in-flight state
      return `[Already prepared — awaiting the operator's confirm: ${action}]`;
  }
}

/**
 * Build the model-facing history from the chat transcript. Every prepared action
 * is recorded as a resolved assistant turn so no prior request looks unanswered
 * (TT-027), and adjacent same-role turns are coalesced so the transcript strictly
 * alternates roles (Anthropic-safe). Error bubbles and empty text contribute no
 * turn.
 */
export function buildAgentHistory(entries: readonly ConversationEntry[]): AgentTurn[] {
  const turns: AgentTurn[] = [];

  const append = (role: AgentTurn["role"], text: string) => {
    if (!text) return;
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      // Coalesce: a chatty propose turn (assistant text + card) — or two user
      // turns split by a dropped error bubble — must not become two same-role
      // turns in a row.
      last.text = `${last.text}\n${text}`;
    } else {
      turns.push({ role, text });
    }
  };

  for (const entry of entries) {
    if (entry.kind === "user") {
      append("user", entry.text.trim());
    } else if (entry.kind === "assistant") {
      append("assistant", entry.text.trim());
    } else if (entry.kind === "proposal") {
      append("assistant", proposalHistoryText(entry.proposal, entry.status));
    }
    // "error" entries are display-only — never part of the model transcript.
  }

  return turns;
}
