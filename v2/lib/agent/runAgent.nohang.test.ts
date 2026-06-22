// No-hang robustness for the agent loop. PR #80 was reverted because a real
// booking turn HUNG: it never settled, so the streaming route could neither send
// a {done}/{error} event nor write an audit row — the UI showed a perpetual
// "Thinking…" until the serverless function timed out. The fix lives in runAgent:
//   1. ANY unexpected (non-AgentToolError) tool throw PROPAGATES out of runAgent
//      so the caller's catch surfaces a clear error and ends the stream — it is
//      NOT fed back to the model to churn on. (AgentToolError stays fed back.)
//   2. A wall-clock deadline + per-await timeout guarantees runAgent ALWAYS
//      settles (resolves or rejects) — a hung model or tool call can never make
//      the whole turn hang until the platform kills it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointment, client, pet } from "@/lib/actions/actionTestSupport";
import { DEFAULT_OPERATOR_SETTINGS } from "@/lib/operatorSettings";
import { DEFAULT_ORG_SETTINGS } from "@/lib/orgSettings";
import type { ModelProvider, ProviderResponse } from "./provider/types";

const { loadDatasetMock, loadOrgSettingsMock } = vi.hoisted(() => ({
  loadDatasetMock: vi.fn(),
  loadOrgSettingsMock: vi.fn(),
}));

vi.mock("@/lib/data/repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/repo")>(
    "@/lib/data/repo",
  );
  return {
    ...actual,
    loadDataset: loadDatasetMock,
    loadDayCloseoutOverrides: vi.fn(async () => []),
  };
});
vi.mock("@/lib/operatorSettings.server", () => ({
  readOperatorSettings: vi.fn(async () => DEFAULT_OPERATOR_SETTINGS),
}));
vi.mock("@/lib/orgSettings.server", () => ({
  loadOrgSettings: loadOrgSettingsMock,
}));

import { runAgent } from "./runAgent";

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
function scriptedProvider(turns: ProviderResponse[]): ModelProvider {
  let index = 0;
  return {
    id: "fake",
    async createMessage() {
      const turn = turns[Math.min(index, turns.length - 1)];
      index += 1;
      return turn;
    },
  };
}

/** A provider whose model call never resolves — stands in for a wedged API call. */
const hangingProvider: ModelProvider = {
  id: "hang",
  createMessage: () => new Promise<ProviderResponse>(() => {}),
};

beforeEach(() => {
  vi.clearAllMocks();
  loadDatasetMock.mockResolvedValue({
    clients: [client()],
    pets: [pet()],
    appointments: [appointment({ date: "2026-06-13", time_slot: "10:30am" })],
    vaccinations: [],
  });
  loadOrgSettingsMock.mockResolvedValue(DEFAULT_ORG_SETTINGS);
});

describe("runAgent — unexpected tool errors end the turn (no churn, no hang)", () => {
  it("propagates an unexpected READ-tool error instead of feeding it back to the model", async () => {
    loadDatasetMock.mockRejectedValue(new Error("db connection lost"));
    const provider = scriptedProvider([
      toolTurn("get_schedule", { date: "2026-06-13" }),
      endTurn("the model should never get a chance to answer here"),
    ]);

    await expect(runAgent("what's my day look like", [], { provider })).rejects.toThrow(
      "db connection lost",
    );
  });

  it("propagates an unexpected WRITE-tool (propose) error instead of feeding it back", async () => {
    loadOrgSettingsMock.mockRejectedValue(new Error("settings store down"));
    const provider = scriptedProvider([
      toolTurn("propose_book_appointment", {
        household: "Mary Jones",
        pets: ["Kiwi"],
        date: "2026-07-11",
        time_slot: "10:00am",
        service_type: "full_groom",
        location: "gina",
      }),
      endTurn("the model should never get a chance to answer here"),
    ]);

    await expect(runAgent("book Kiwi Friday at 10", [], { provider })).rejects.toThrow(
      "settings store down",
    );
  });

  it("still feeds an AgentToolError back so the model can ask/adjust (not propagated)", async () => {
    const provider = scriptedProvider([
      toolTurn("propose_add_tip", { household: "Ghosts", pet: "Nobody", added_tip: 5 }),
      endTurn("Which dog did you mean?"),
    ]);
    const result = await runAgent("add a tip", [], { provider });
    expect(result.proposal).toBeUndefined();
    expect(result.text).toContain("Which dog");
  });
});

describe("runAgent — a stalled turn settles within the deadline (never hangs)", () => {
  it("returns a graceful message when the MODEL call hangs past the deadline", async () => {
    const result = await runAgent("hello", [], {
      provider: hangingProvider,
      deadlineMs: 60,
    });
    expect(result.text).toMatch(/try again|longer|wasn't able/i);
    expect(result.proposal).toBeUndefined();
  }, 2000);

  it("returns a graceful message when a TOOL call hangs past the deadline", async () => {
    loadDatasetMock.mockImplementation(() => new Promise(() => {}));
    const provider = scriptedProvider([
      toolTurn("get_schedule", { date: "2026-06-13" }),
      endTurn("never reached"),
    ]);
    const result = await runAgent("what's my day look like", [], {
      provider,
      deadlineMs: 60,
    });
    expect(result.text).toMatch(/try again|longer|wasn't able/i);
  }, 2000);
});
