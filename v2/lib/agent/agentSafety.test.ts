import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_READ_TOOLS,
  AGENT_READ_TOOL_NAMES,
  agentToolDefinitions,
} from "./tools";

const AGENT_DIR = dirname(fileURLToPath(import.meta.url));

// The exact, intended read-only tool surface for Phase 1. If a future change
// adds a tool, this list must change deliberately — and a write/send tool must
// never appear here.
const EXPECTED_TOOLS = [
  "find_household",
  "get_day_income",
  "get_pet_history",
  "get_schedule",
  "list_lapsed_clients",
] as const;

// Verbs that denote a side effect. No Phase-1 tool name may contain one — the
// agent physically cannot book, send, log, or delete because there is no such
// tool to call.
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

describe("Phase 1 is read-only — no write/send tools registered", () => {
  it("registers exactly the five intended read tools", () => {
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
// staging (CI has no ANTHROPIC_API_KEY, so the model is not called here).
const GOLDEN: { ask: string; tool: (typeof EXPECTED_TOOLS)[number] }[] = [
  { ask: "what's my day look like", tool: "get_schedule" },
  { ask: "what's on the calendar tomorrow", tool: "get_schedule" },
  { ask: "how busy am I this week", tool: "get_schedule" },
  { ask: "look up the Adams household", tool: "find_household" },
  { ask: "what's Rosanne's number", tool: "find_household" },
  { ask: "show Coco's history", tool: "get_pet_history" },
  { ask: "when did Kiwi last come in", tool: "get_pet_history" },
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
// structurally: no file in the agent path may reach for the admin client.
describe("cross-tenant isolation — agent path never bypasses RLS", () => {
  const agentSourceFiles = readdirSync(AGENT_DIR).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );

  it("has source files to check", () => {
    expect(agentSourceFiles.length).toBeGreaterThan(0);
  });

  it.each(["@/lib/supabase/service", "createServiceSupabase", "SERVICE_ROLE_KEY"])(
    "no agent source imports/uses the service-role escape hatch (%s)",
    (forbidden) => {
      for (const file of agentSourceFiles) {
        const contents = readFileSync(join(AGENT_DIR, file), "utf8");
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
