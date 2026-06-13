import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointment, client, pet } from "@/lib/actions/actionTestSupport";
import { DEFAULT_OPERATOR_SETTINGS } from "@/lib/operatorSettings";

// Mock the Anthropic SDK so the manual tool-use loop can be driven without the
// network or an API key. `create` is the scripted Messages endpoint.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

// Real read tools run against mocked org-scoped loaders.
vi.mock("@/lib/data/repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/repo")>(
    "@/lib/data/repo",
  );
  return {
    ...actual,
    loadDataset: vi.fn(async () => ({
      clients: [client()],
      pets: [pet()],
      appointments: [appointment({ date: "2026-06-13", time_slot: "10:30am" })],
      vaccinations: [],
    })),
    loadDayCloseoutOverrides: vi.fn(async () => []),
  };
});
vi.mock("@/lib/operatorSettings.server", () => ({
  readOperatorSettings: vi.fn(async () => DEFAULT_OPERATOR_SETTINGS),
}));

import { runAgent, AgentNotConfiguredError } from "./runAgent";

const textTurn = (text: string) => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text }],
});

const toolTurn = (id: string, name: string, input: Record<string, unknown>) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id, name, input }],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

describe("runAgent — manual read-only tool loop", () => {
  it("throws AgentNotConfiguredError when the API key is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(runAgent("hi")).rejects.toBeInstanceOf(AgentNotConfiguredError);
    expect(create).not.toHaveBeenCalled();
  });

  it("offers ONLY the read tools to the model — no write/send tool", async () => {
    create.mockResolvedValueOnce(textTurn("Hello!"));
    await runAgent("hi");
    const toolNames = (create.mock.calls[0][0].tools as { name: string }[]).map(
      (tool) => tool.name,
    );
    expect(toolNames.sort()).toEqual([
      "find_household",
      "get_day_income",
      "get_pet_history",
      "get_schedule",
      "list_lapsed_clients",
    ]);
  });

  it("returns the model's text directly when no tool is needed", async () => {
    create.mockResolvedValueOnce(textTurn("Your day is light."));
    const result = await runAgent("what's my day look like");
    expect(result.text).toBe("Your day is light.");
    expect(result.toolCalls).toEqual([]);
  });

  it("executes a tool call, feeds the result back, and returns the final answer", async () => {
    create
      .mockResolvedValueOnce(toolTurn("tu_1", "get_schedule", { date: "2026-06-13" }))
      .mockResolvedValueOnce(textTurn("You have one appointment at 10:30am."));

    const result = await runAgent("what's my day look like");

    expect(result.toolCalls).toEqual([
      { name: "get_schedule", input: { date: "2026-06-13" } },
    ]);
    expect(result.text).toBe("You have one appointment at 10:30am.");

    // The second model call carries the tool result back as a non-error result.
    const followupMessages = create.mock.calls[1][0].messages;
    const toolResult = followupMessages
      .flatMap((m: { content: unknown }) => (Array.isArray(m.content) ? m.content : []))
      .find((block: { type?: string }) => block.type === "tool_result");
    expect(toolResult).toBeTruthy();
    expect(toolResult.is_error).toBeFalsy();
    expect(String(toolResult.content)).toContain("10:30am");
  });

  it("returns a tool error to the model (never fabricates) on bad input", async () => {
    create
      .mockResolvedValueOnce(toolTurn("tu_1", "get_pet_history", { pet_id: "nope" }))
      .mockResolvedValueOnce(textTurn("I couldn't find that pet — which dog did you mean?"));

    const result = await runAgent("show that dog's history");

    const followupMessages = create.mock.calls[1][0].messages;
    const toolResult = followupMessages
      .flatMap((m: { content: unknown }) => (Array.isArray(m.content) ? m.content : []))
      .find((block: { type?: string }) => block.type === "tool_result");
    expect(toolResult.is_error).toBe(true);
    expect(result.text).toContain("which dog");
  });

  it("stops at the loop cap if the model never finishes", async () => {
    // Model keeps asking for tools forever — the backstop must end the loop.
    create.mockResolvedValue(toolTurn("tu_x", "get_schedule", { date: "2026-06-13" }));
    const result = await runAgent("loop please");
    expect(create.mock.calls.length).toBeLessThanOrEqual(8);
    expect(result.text.toLowerCase()).toContain("rephrase");
  });
});
