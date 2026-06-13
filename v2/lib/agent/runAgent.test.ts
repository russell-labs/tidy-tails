import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointment, client, pet } from "@/lib/actions/actionTestSupport";
import { DEFAULT_OPERATOR_SETTINGS } from "@/lib/operatorSettings";
import type {
  ModelProvider,
  ProviderRequest,
  ProviderResponse,
} from "./provider/types";

// The runner is provider-agnostic: it drives any ModelProvider. We inject a
// scripted fake provider so the loop is tested without any vendor SDK or network.
// The read tools still run against mocked org-scoped loaders.
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
import { AGENT_READ_TOOL_NAMES } from "./tools";

const endTurn = (text: string): ProviderResponse => ({
  text,
  toolCalls: [],
  stopReason: "end",
});

const toolTurn = (name: string, input: Record<string, unknown>): ProviderResponse => ({
  text: "",
  toolCalls: [{ id: `${name}-0`, name, input }],
  stopReason: "tool_use",
});

/** A scripted provider that returns the given turns in order (repeating the last). */
function fakeProvider(turns: ProviderResponse[]): {
  provider: ModelProvider;
  calls: ProviderRequest[];
} {
  const calls: ProviderRequest[] = [];
  let index = 0;
  return {
    calls,
    provider: {
      id: "fake",
      async createMessage(req) {
        calls.push(req);
        const turn = turns[Math.min(index, turns.length - 1)];
        index += 1;
        return turn;
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runAgent — provider-agnostic read-only tool loop", () => {
  it("throws AgentNotConfiguredError when the default provider has no key", async () => {
    vi.stubEnv("TIDYTAILS_AGENT_PROVIDER", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    await expect(runAgent("hi")).rejects.toBeInstanceOf(AgentNotConfiguredError);
    vi.unstubAllEnvs();
  });

  it("offers ONLY the read tools to the model — no write/send tool", async () => {
    const { provider, calls } = fakeProvider([endTurn("Hello!")]);
    await runAgent("hi", [], { provider });
    const toolNames = calls[0].tools.map((tool) => tool.name).sort();
    expect(toolNames).toEqual([...AGENT_READ_TOOL_NAMES].sort());
  });

  it("returns the model's text directly when no tool is needed", async () => {
    const { provider } = fakeProvider([endTurn("Your day is light.")]);
    const result = await runAgent("what's my day look like", [], { provider });
    expect(result.text).toBe("Your day is light.");
    expect(result.toolCalls).toEqual([]);
  });

  it("executes a tool call, feeds the result back, and returns the final answer", async () => {
    const { provider, calls } = fakeProvider([
      toolTurn("get_schedule", { date: "2026-06-13" }),
      endTurn("You have one appointment at 10:30am."),
    ]);

    const result = await runAgent("what's my day look like", [], { provider });

    expect(result.toolCalls).toEqual([
      { name: "get_schedule", input: { date: "2026-06-13" } },
    ]);
    expect(result.text).toBe("You have one appointment at 10:30am.");

    // The second model call carries the tool result back as a non-error result.
    const toolMessage = calls[1].messages.find((m) => m.role === "tool");
    expect(toolMessage).toBeTruthy();
    const toolResult = toolMessage?.role === "tool" ? toolMessage.results[0] : undefined;
    expect(toolResult?.isError).toBeFalsy();
    expect(String(toolResult?.content)).toContain("10:30am");
  });

  it("returns a tool error to the model (never fabricates) on bad input", async () => {
    const { provider, calls } = fakeProvider([
      toolTurn("get_pet_history", { pet_id: "nope" }),
      endTurn("I couldn't find that pet — which dog did you mean?"),
    ]);

    const result = await runAgent("show that dog's history", [], { provider });

    const toolMessage = calls[1].messages.find((m) => m.role === "tool");
    const toolResult = toolMessage?.role === "tool" ? toolMessage.results[0] : undefined;
    expect(toolResult?.isError).toBe(true);
    expect(result.text).toContain("which dog");
  });

  it("stops at the loop cap if the model never finishes", async () => {
    const { provider, calls } = fakeProvider([toolTurn("get_schedule", { date: "2026-06-13" })]);
    const result = await runAgent("loop please", [], { provider });
    expect(calls.length).toBeLessThanOrEqual(8);
    expect(result.text.toLowerCase()).toContain("rephrase");
  });

  it("emits live status events: thinking before each turn, tool before each tool runs", async () => {
    const { provider } = fakeProvider([
      toolTurn("get_schedule", { date: "2026-06-13" }),
      endTurn("You have one appointment at 10:30am."),
    ]);
    const events: string[] = [];

    await runAgent("what's my day look like", [], {
      provider,
      onEvent: (event) => events.push(event.type === "tool" ? `tool:${event.name}` : event.type),
    });

    expect(events).toEqual(["thinking", "tool:get_schedule", "thinking"]);
  });
});
