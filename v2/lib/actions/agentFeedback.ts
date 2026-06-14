"use server";

// Agentic layer — answer feedback (thumbs up/down).
//
// The chat surface shows a thumbs up / thumbs down under each assistant answer.
// A tap records ONE audit event ("agent.feedback") through the SAME shared audit
// pipeline as every other write — no new table, no schema change. It is a write
// of operator-authored signal only (a rating + the operator's own question + the
// tool names used); it never sends anything and never touches customer data.
//
// Like every agent entry point it re-checks the master TIDYTAILS_ENABLE_AGENT
// gate and a signed-in operator, so it is inert when the feature is dark, and the
// row is tagged source=agent. The question is bounded to 200 chars because the
// audit safe-metadata filter drops longer strings — truncating here keeps the
// feedback legible instead of silently empty.

import { isAgentEnabled } from "@/lib/writeGate";
import { getCurrentUser } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit.server";

export type AgentFeedbackRating = "up" | "down";

export type AgentFeedbackInput = {
  rating: AgentFeedbackRating;
  /** The operator's own question this answer responded to. */
  question: string;
  /** The read/propose tools the agent used answering (transparency only). */
  toolsUsed: string[];
};

const MAX_QUESTION_LEN = 200;

export async function recordAgentFeedback(
  input: AgentFeedbackInput,
): Promise<{ ok: boolean }> {
  if (!isAgentEnabled()) return { ok: false };

  const user = await getCurrentUser();
  if (!user) return { ok: false };

  if (input.rating !== "up" && input.rating !== "down") return { ok: false };

  const question = String(input.question ?? "").trim().slice(0, MAX_QUESTION_LEN);
  const toolsUsed = Array.isArray(input.toolsUsed)
    ? input.toolsUsed.filter((name) => typeof name === "string" && name.length > 0)
    : [];

  await recordAuditEvent({
    eventType: "agent.feedback",
    summary: `Gave the assistant a thumbs ${input.rating}.`,
    metadata: {
      rating: input.rating,
      question,
      toolsUsed,
      source: "agent",
    },
  });

  return { ok: true };
}
