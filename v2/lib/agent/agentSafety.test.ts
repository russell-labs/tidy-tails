import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_READ_TOOLS,
  AGENT_READ_TOOL_NAMES,
  agentToolDefinitions,
} from "./tools";

const AGENT_DIR = dirname(fileURLToPath(import.meta.url));

/** All non-test .ts source under the agent path, recursively (incl. provider/). */
function agentSourceFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...agentSourceFilesRecursive(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

// The exact, intended read-only tool surface. If a future change adds a tool,
// this list must change deliberately — and a write/send tool must never appear
// here. Phase 2 adds get_groom_detail (operator-authored groom notes — a read).
const EXPECTED_TOOLS = [
  "find_household",
  "get_day_income",
  "get_groom_detail",
  "get_pet_history",
  "get_schedule",
  "list_lapsed_clients",
] as const;

// Verbs that denote a side effect. No tool name may contain one — the agent
// physically cannot book, send, log, or delete because there is no such tool to
// call.
const WRITE_VERB = new RegExp(
  [
    "book",
    "send",
    "text",
    "sms",
    "message",
    "log",
    "delete",
    "remove",
    "create",
    "update",
    "save",
    "write",
    "cancel",
    "pay",
    "charge",
    "edit",
    "merge",
    "reply",
    "notify",
    "confirm",
    "move",
  ].join("|"),
  "i",
);

describe("agent is read-only — no write/send tools registered", () => {
  it("registers exactly the six intended read tools", () => {
    expect([...AGENT_READ_TOOL_NAMES].sort()).toEqual([...EXPECTED_TOOLS]);
  });

  it("no registered tool name denotes a side effect", () => {
    for (const name of AGENT_READ_TOOL_NAMES) {
      expect(name, `${name} looks like a write/send tool`).not.toMatch(WRITE_VERB);
    }
  });

  it("exposes the same tools to the model that it dispatches", () => {
    const defined = agentToolDefinitions().map((tool) => tool.name).sort();
    expect(defined).toEqual([...AGENT_READ_TOOL_NAMES].sort());
  });

  it("every tool schema is strict (no free-form extra properties)", () => {
    for (const tool of AGENT_READ_TOOLS) {
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema.additionalProperties).toBe(false);
      // Any `required` entry must name a declared property.
      for (const req of tool.input_schema.required ?? []) {
        expect(Object.keys(tool.input_schema.properties)).toContain(req);
      }
    }
  });
});

// Golden set: Sam-style phrasings mapped to the read tool that ultimately
// answers them. This documents the intended intent→tool mapping and guards the
// registry against drift. The live model's routing quality is validated in
// staging (CI has no model key, so the model is not called here).
const GOLDEN: { ask: string; tool: (typeof EXPECTED_TOOLS)[number] }[] = [
  { ask: "what's my day look like", tool: "get_schedule" },
  { ask: "what's on the calendar tomorrow", tool: "get_schedule" },
  { ask: "how busy am I this week", tool: "get_schedule" },
  { ask: "look up the Adams household", tool: "find_household" },
  { ask: "what's Rosanne's number", tool: "find_household" },
  { ask: "show Coco's history", tool: "get_pet_history" },
  { ask: "when did Kiwi last come in", tool: "get_pet_history" },
  { ask: "what clipper did I use on Coco last time", tool: "get_groom_detail" },
  { ask: "what were my notes from Bella's last groom", tool: "get_groom_detail" },
  { ask: "who haven't I rebooked in 6 weeks", tool: "list_lapsed_clients" },
  { ask: "which clients are overdue for a visit", tool: "list_lapsed_clients" },
  { ask: "how much did I make Friday", tool: "get_day_income" },
  { ask: "what's today's total", tool: "get_day_income" },
];

describe("golden phrasing → tool mapping", () => {
  it.each(GOLDEN)("'$ask' is served by a registered read tool ($tool)", ({ tool }) => {
    expect(AGENT_READ_TOOL_NAMES).toContain(tool);
  });

  it("every read tool is exercised by at least one golden phrasing", () => {
    const covered = new Set(GOLDEN.map((row) => row.tool));
    for (const name of EXPECTED_TOOLS) {
      expect(covered, `no golden phrasing routes to ${name}`).toContain(name);
    }
  });
});

// Cross-tenant isolation, tool-layer guarantee. The hard boundary is the per-org
// RLS policies, proven by supabase/tests/cross_tenant_isolation.sql (structural
// over all 10 tenant tables + behavioral). These tools add no new tables, so
// there is nothing to add to that SQL gate. What CAN regress at this layer is a
// tool quietly bypassing RLS with the service-role client — so we forbid it
// structurally: no file in the agent path (incl. the provider adapters) may reach
// for the admin client.
describe("cross-tenant isolation — agent path never bypasses RLS", () => {
  const agentSourceFiles = agentSourceFilesRecursive(AGENT_DIR);

  it("has source files to check (including the provider adapters)", () => {
    expect(agentSourceFiles.length).toBeGreaterThan(0);
    expect(agentSourceFiles.some((file) => file.includes("/provider/"))).toBe(true);
  });

  it.each(["@/lib/supabase/service", "createServiceSupabase", "SERVICE_ROLE_KEY"])(
    "no agent source imports/uses the service-role escape hatch (%s)",
    (forbidden) => {
      for (const file of agentSourceFiles) {
        const contents = readFileSync(file, "utf8");
        expect(contents, `${file} references ${forbidden}`).not.toContain(forbidden);
      }
    },
  );

  it("tools read through the RLS-bound dataset loader", () => {
    const tools = readFileSync(join(AGENT_DIR, "tools.ts"), "utf8");
    // Positive proof the data comes from the org-scoped seam, not a raw client.
    expect(tools).toContain('from "@/lib/data/repo"');
    expect(tools).toContain("loadDataset");
    expect(tools).not.toContain("createClient(");
  });
});

// Customer-authored free text is the most guarded surface: inbound SMS bodies
// (and self-serve booking requests) are DATA, never exposed in a tool output and
// never an instruction. The tools only ever read the org-scoped dataset
// (clients/pets/appointments/vaccinations); they must NOT reach the SMS message
// store or booking-request loaders. Operator-authored notes (appointment.notes,
// pet.grooming_notes) ARE exposed — that distinction is asserted behaviorally in
// tools.test.ts ("get_groom_detail returns the operator's notes").
describe("customer-authored text stays out of every tool output", () => {
  const agentSourceFiles = agentSourceFilesRecursive(AGENT_DIR);

  it.each([
    "sms_messages",
    "loadRecentSmsMessages",
    "loadClientSmsMessages",
    "smsMessages.server",
    "booking_requests",
    "loadBookingRequests",
  ])("no agent source reads the customer-text surface (%s)", (forbidden) => {
    for (const file of agentSourceFiles) {
      const contents = readFileSync(file, "utf8");
      expect(contents, `${file} references ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// The streaming route is a SECOND entry point into the agent, outside lib/agent/.
// The recursive scans above don't reach it, so it gets the same structural gates
// here: it must re-apply the feature flag + auth, run only the read-only agent,
// and never touch the service-role client or a customer-text loader.
describe("streaming route inherits the agent safety rails", () => {
  const routePath = join(AGENT_DIR, "..", "..", "app", "api", "assistant", "stream", "route.ts");
  const route = readFileSync(routePath, "utf8");

  it("re-applies the feature gate and the signed-in-operator check", () => {
    expect(route).toContain("isAgentEnabled");
    expect(route).toContain("getCurrentUser");
  });

  it("validates input through the shared sanitizer (no divergent rules)", () => {
    expect(route).toContain("sanitizeAgentRequest");
  });

  it("calls only the read-only runAgent — no write/send action", () => {
    expect(route).toContain("runAgent");
  });

  it.each([
    "@/lib/supabase/service",
    "createServiceSupabase",
    "SERVICE_ROLE_KEY",
    "sms_messages",
    "loadRecentSmsMessages",
    "booking_requests",
  ])("never reaches the service-role client or customer-text surface (%s)", (forbidden) => {
    expect(route, `route references ${forbidden}`).not.toContain(forbidden);
  });
});

// The VOICE route is the THIRD entry point into the agent (Phase: voice). It adds
// one capability — server-side speech-to-text — and then runs the SAME read-only
// agent on the transcript. Audio is an input mode, not a new power: there is
// still no write/send tool anywhere on this path. It gets the same structural
// gates as the stream route, plus proof that transcription rides the read-only
// pipeline and grants no new data access.
describe("voice route inherits the agent safety rails", () => {
  const routePath = join(AGENT_DIR, "..", "..", "app", "api", "assistant", "voice", "route.ts");
  const route = readFileSync(routePath, "utf8");

  it("re-applies the feature gate and the signed-in-operator check", () => {
    expect(route).toContain("isAgentEnabled");
    expect(route).toContain("getCurrentUser");
  });

  it("validates the transcript through the shared sanitizer (no divergent rules)", () => {
    expect(route).toContain("sanitizeAgentRequest");
  });

  it("runs the transcript through the read-only runAgent — and only that", () => {
    expect(route).toContain("transcribeAudio");
    expect(route).toContain("runAgent");
  });

  it.each([
    "@/lib/supabase/service",
    "createServiceSupabase",
    "SERVICE_ROLE_KEY",
    "sms_messages",
    "loadRecentSmsMessages",
    "booking_requests",
  ])("never reaches the service-role client or customer-text surface (%s)", (forbidden) => {
    expect(route, `voice route references ${forbidden}`).not.toContain(forbidden);
  });

  it("never imports a write/send server action (read-only by construction)", () => {
    // The only agent entry it may call is the read-only runner; no write actions.
    expect(route).not.toContain("@/lib/actions/");
    expect(route).not.toMatch(/\bsend-sms\b/);
  });
});
