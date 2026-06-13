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
import {
  runAgent,
  AgentNotConfiguredError,
  type AgentTurn,
} from "@/lib/agent/runAgent";

export type AgentChatState = {
  status: "answered" | "error";
  /** Assistant reply text, when answered. */
  answer?: string;
  /** Names of the read tools the agent used this turn (transparency only). */
  toolsUsed?: string[];
  /** User-facing error text, when status is "error". */
  message?: string;
};

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_TURNS = 12;

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

  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) {
    return { status: "error", message: "Type a question to get started." };
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      status: "error",
      message: "That message is too long. Try a shorter question.",
    };
  }

  const safeHistory: AgentTurn[] = Array.isArray(history)
    ? history
        .filter(
          (turn): turn is AgentTurn =>
            !!turn &&
            (turn.role === "user" || turn.role === "assistant") &&
            typeof turn.text === "string",
        )
        .slice(-MAX_HISTORY_TURNS)
    : [];

  try {
    const result = await runAgent(trimmed, safeHistory);
    return {
      status: "answered",
      answer: result.text,
      toolsUsed: Array.from(new Set(result.toolCalls.map((call) => call.name))),
    };
  } catch (error) {
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
