// Agentic layer — shared request validation.
//
// One place that validates and trims an incoming assistant request, used by BOTH
// entry points (the askAgent server action and the streaming route) so the input
// rules never diverge. Pure and dependency-free (type-only import), so it is safe
// to import from a server action ("use server", async-only exports) via a
// separate module and from the route handler alike.

import type { AgentTurn } from "./runAgent";

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_HISTORY_TURNS = 12;

export type SanitizedAgentRequest =
  | { ok: true; message: string; history: AgentTurn[] }
  | { ok: false; message: string };

/** Validate + trim a message and keep only recent, well-formed history turns. */
export function sanitizeAgentRequest(
  message: unknown,
  history: unknown,
): SanitizedAgentRequest {
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) {
    return { ok: false, message: "Type a question to get started." };
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, message: "That message is too long. Try a shorter question." };
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

  return { ok: true, message: trimmed, history: safeHistory };
}
