// Agentic layer — per-turn capture (TT-038).
//
// Lives in lib/ (NOT lib/actions/) on purpose: it is an audit-logging primitive,
// a thin wrapper over recordAuditEvent — not a client-callable write/send action.
// The read-only assistant routes (stream/voice) are contractually barred from
// importing any "@/lib/actions/" module (agentSafety.test.ts, "read-only by
// construction"); keeping this beside audit.server.ts lets them capture turns
// without breaching that reviewed boundary, since it touches no customer data and
// uses only the operator's RLS-scoped session.
//
// Records ONE "agent.turn" audit event for each assistant turn through the SAME
// shared audit pipeline as agent.feedback — no new table, no schema change. It
// captures only operator-authored signal + tool/outcome metadata:
//   - the operator's OWN question (bounded to 200 chars, the cap the safe-metadata
//     filter enforces — past that the value is silently dropped);
//   - which read/propose tools fired this turn;
//   - the outcome (answered / proposed / error on the ask path; confirmed / gated
//     on the confirm path).
//
// PRIVACY: callers must pass the operator's own input as `question` and never
// customer-authored free text (inbound SMS bodies, booking-request text). The
// inbox-reply seam (lib/actions/agentReply.ts) is the agent's one customer-text
// surface and is contractually write-free — it does NOT call this; its turns are
// captured later at the confirm seam, which logs the proposal KIND only (e.g.
// "send_text"), never the message body.
//
// Like every agent entry point it re-checks the master TIDYTAILS_ENABLE_AGENT
// gate and a signed-in operator, so it is inert when the feature is dark, and the
// row is org-scoped (recordAuditEvent stamps org_id + groomer_id under RLS).
//
// FIRE-AND-FORGET: this returns void and must NEVER throw. recordAuditEvent
// already swallows its own failures, but the gate/auth reads here run on the
// assistant's hot path — the whole body is wrapped so a logging fault can never
// slow or fail the turn it is recording.

import { isAgentEnabled } from "@/lib/writeGate";
import { getCurrentUser } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit.server";

/** Outcomes detectable server-side today. couldn't-do / disambiguate / cancelled
 *  need a model marker / client ping and are deferred (see the TT-038 PR). */
export type AgentTurnOutcome =
  | "answered" // ask path: a read-only answer
  | "proposed" // ask path: a write was prepared (awaiting the operator's confirm)
  | "error" // ask or confirm path: the turn failed
  | "confirmed" // confirm path: the gated write executed
  | "gated"; // confirm path: blocked by a write kill-switch (nothing saved)

export type AgentTurnInput = {
  /** The operator's OWN input this turn. NEVER customer-authored text. */
  question: string;
  /** The read/propose tools the agent used (or the proposal kind, on confirm). */
  toolsUsed: string[];
  outcome: AgentTurnOutcome;
};

const MAX_QUESTION_LEN = 200;

const SUMMARIES: Record<AgentTurnOutcome, string> = {
  answered: "Assistant answered a question.",
  proposed: "Assistant prepared a change to confirm.",
  error: "Assistant couldn't complete a turn.",
  confirmed: "Assistant change confirmed.",
  gated: "Assistant change blocked (writes off).",
};

export async function recordAgentTurn(input: AgentTurnInput): Promise<void> {
  try {
    if (!isAgentEnabled()) return;

    const user = await getCurrentUser();
    if (!user) return;

    const question = String(input.question ?? "").trim().slice(0, MAX_QUESTION_LEN);
    const toolsUsed = Array.isArray(input.toolsUsed)
      ? input.toolsUsed.filter((name) => typeof name === "string" && name.length > 0)
      : [];

    await recordAuditEvent({
      eventType: "agent.turn",
      summary: SUMMARIES[input.outcome] ?? "Assistant turn.",
      metadata: {
        question,
        toolsUsed,
        outcome: input.outcome,
        source: "agent",
      },
    });
  } catch {
    // Fire-and-forget: capturing a turn must never slow or fail the assistant.
  }
}
