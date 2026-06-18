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
// row is tagged source=agent. The question (and, on a thumbs-down, Sam's optional
// note) are bounded to 200 chars because the audit safe-metadata filter drops
// longer strings — truncating here keeps the feedback legible instead of silently
// empty.
//
// TT-039: a thumbs-down may carry one optional operator-authored note ("what went
// wrong"), recorded on the SAME agent.feedback event, and — once per down — fires
// a best-effort heads-up SMS to Russell (sendFeedbackAlert) so the negative signal
// reaches a human. The audit row is written FIRST; the alert is fired after and
// swallows every failure, so a send that can't go through loses nothing.

import { isAgentEnabled } from "@/lib/writeGate";
import { getCurrentUser } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit.server";
import { sendFeedbackAlert } from "@/lib/feedbackAlert";

export type AgentFeedbackRating = "up" | "down";

export type AgentFeedbackInput = {
  rating: AgentFeedbackRating;
  /** The operator's own question this answer responded to. */
  question: string;
  /** The read/propose tools the agent used answering (transparency only). */
  toolsUsed: string[];
  /** Optional operator-authored note on a thumbs-down ("what went wrong"). */
  note?: string;
};

const MAX_QUESTION_LEN = 200;
const MAX_NOTE_LEN = 200;

export async function recordAgentFeedback(
  input: AgentFeedbackInput,
): Promise<{ ok: boolean }> {
  if (!isAgentEnabled()) return { ok: false };

  const user = await getCurrentUser();
  if (!user) return { ok: false };

  if (input.rating !== "up" && input.rating !== "down") return { ok: false };

  const question = String(input.question ?? "").trim().slice(0, MAX_QUESTION_LEN);
  const note = String(input.note ?? "").trim().slice(0, MAX_NOTE_LEN);
  const toolsUsed = Array.isArray(input.toolsUsed)
    ? input.toolsUsed.filter((name) => typeof name === "string" && name.length > 0)
    : [];

  // Log the feedback FIRST — this is the durable record, and it must land before
  // any best-effort alert. The note key is only included when Sam typed one, so a
  // skipped note leaves no empty value in the row.
  await recordAuditEvent({
    eventType: "agent.feedback",
    summary: `Gave the assistant a thumbs ${input.rating}.`,
    metadata: {
      rating: input.rating,
      question,
      toolsUsed,
      source: "agent",
      ...(note ? { note } : {}),
    },
  });

  // A thumbs-down is the signal worth escalating: text Russell so it doesn't sit
  // unseen in the audit table. Best-effort and fully defensive — sendFeedbackAlert
  // already swallows its own failures, and this catch is belt-and-suspenders so a
  // surprise rejection can never undo the feedback write above.
  if (input.rating === "down") {
    try {
      await sendFeedbackAlert({
        question,
        note: note || undefined,
        at: new Date().toISOString(),
      });
    } catch {
      // Alert is best-effort telemetry; the feedback row is already written.
    }
  }

  return { ok: true };
}
