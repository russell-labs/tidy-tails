// Agentic layer — streaming assistant endpoint.
//
// The chat UI calls this to get LIVE status while the read-only agent works: it
// streams NDJSON events — {thinking} before each model turn, {tool,name} before
// each read tool runs, then a final {done,answer,toolsUsed} or {error,message}.
//
// SAFETY: this is the second entry point to the agent, so it re-applies the SAME
// gate and request scope as the askAgent server action — never diverging:
//   - TIDYTAILS_ENABLE_AGENT must be on, or the route 404s (the feature is dark).
//   - A signed-in operator is required (401 otherwise); the run executes inside
//     this request, so the read tools inherit that operator's RLS + org_id scope.
//   - Input is validated by the shared sanitizeAgentRequest.
// It only ever calls the read-only runAgent — there is no write/send path here.
// It must not import the service-role client (asserted by the agent safety test).

import { isAgentEnabled } from "@/lib/writeGate";
import { getCurrentUser } from "@/lib/supabase/server";
import { sanitizeAgentRequest } from "@/lib/agent/agentRequest";
import { runAgent, AgentNotConfiguredError } from "@/lib/agent/runAgent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NDJSON_HEADERS = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store",
} as const;

/** One NDJSON line. */
function line(event: Record<string, unknown>): string {
  return `${JSON.stringify(event)}\n`;
}

export async function POST(request: Request): Promise<Response> {
  // Gate: dark unless the flag is explicitly on — same as the route's page guard.
  if (!isAgentEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  // Request scope: a real session is what makes the tools org-scoped.
  const user = await getCurrentUser();
  if (!user) {
    return new Response(
      line({ type: "error", message: "Your session ended. Sign in again to use the assistant." }),
      { status: 401, headers: NDJSON_HEADERS },
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const payload = (body ?? {}) as { message?: unknown; history?: unknown };
  const sanitized = sanitizeAgentRequest(payload.message, payload.history);
  if (!sanitized.ok) {
    return new Response(line({ type: "error", message: sanitized.message }), {
      status: 400,
      headers: NDJSON_HEADERS,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(line(event)));
      try {
        const result = await runAgent(sanitized.message, sanitized.history, {
          onEvent: (event) =>
            write(
              event.type === "tool"
                ? { type: "tool", name: event.name }
                : { type: "thinking" },
            ),
        });
        write({
          type: "done",
          answer: result.text,
          toolsUsed: Array.from(new Set(result.toolCalls.map((call) => call.name))),
        });
      } catch (error) {
        const message =
          error instanceof AgentNotConfiguredError
            ? "The assistant isn't set up yet. Ask Russell to finish configuring it."
            : "Something went wrong answering that. Please try again.";
        write({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
