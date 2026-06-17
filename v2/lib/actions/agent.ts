"use server";

// Agentic layer — Phase 1 server action.
//
// The single entry point the chat surface calls. It is the gate and the request
// scope: it checks the TIDYTAILS_ENABLE_AGENT feature flag, confirms a signed-in
// operator, then runs the read-only agent loop. Because the whole loop runs here
// inside the request, the tools resolve the operator's Supabase session — RLS
// and the org_id guard apply, so the agent can only ever read this operator's
// own org. No write/send path exists in this phase.

import { isAgentEnabled } from "@/lib/writeGate";
import { getCurrentUser } from "@/lib/supabase/server";
import { sanitizeAgentRequest } from "@/lib/agent/agentRequest";
import {
  runAgent,
  AgentNotConfiguredError,
  type AgentTurn,
} from "@/lib/agent/runAgent";
import type { AgentProposal } from "@/lib/agent/proposals";
import { recordAgentTurn } from "@/lib/agentTurnLog.server";

export type AgentChatState = {
  status: "answered" | "error";
  /** Assistant reply text, when answered. */
  answer?: string;
  /** Names of the read tools the agent used this turn (transparency only). */
  toolsUsed?: string[];
  /**
   * A prepared write awaiting the operator's confirm, when this turn proposed
   * one. The agent never executes it — the UI renders a confirm card and the
   * separate confirm action performs the (gated) write on her tap.
   */
  proposal?: AgentProposal;
  /** User-facing error text, when status is "error". */
  message?: string;
};

/**
 * Answer one operator message. `history` is the recent transcript the chat
 * surface holds client-side; it is light context only and is trimmed here.
 */
export async function askAgent(
  message: string,
  history: AgentTurn[] = [],
): Promise<AgentChatState> {
  // Gate: the whole feature is dark unless the flag is explicitly "on".
  if (!isAgentEnabled()) {
    return { status: "error", message: "The assistant isn't available." };
  }

  // Request scope: a real session is what makes the tools org-scoped. No
  // session → no answer (and loaders would fail closed anyway).
  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      message: "Your session ended. Sign in again to use the assistant.",
    };
  }

  const sanitized = sanitizeAgentRequest(message, history);
  if (!sanitized.ok) {
    return { status: "error", message: sanitized.message };
  }

  try {
    const result = await runAgent(sanitized.message, sanitized.history);
    const toolsUsed = Array.from(new Set(result.toolCalls.map((call) => call.name)));
    // TT-038: capture the turn on the audit rails (fire-and-forget, never throws).
    await recordAgentTurn({
      question: sanitized.message,
      toolsUsed,
      outcome: result.proposal ? "proposed" : "answered",
    });
    return {
      status: "answered",
      answer: result.text,
      toolsUsed,
      proposal: result.proposal,
    };
  } catch (error) {
    await recordAgentTurn({
      question: sanitized.message,
      toolsUsed: [],
      outcome: "error",
    });
    if (error instanceof AgentNotConfiguredError) {
      return {
        status: "error",
        message: "The assistant isn't set up yet. Ask Russell to finish configuring it.",
      };
    }
    return {
      status: "error",
      message: "Something went wrong answering that. Please try again.",
    };
  }
}
