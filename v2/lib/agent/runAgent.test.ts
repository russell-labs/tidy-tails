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
vi.mock("@/lib/orgSettings.server", () => ({
  loadOrgSettings: vi.fn(async () => DEFAULT_ORG_SETTINGS),
}));

import { DEFAULT_ORG_SETTINGS } from "@/lib/orgSettings";
import { runAgent, AgentNotConfiguredError } from "./runAgent";
import { AGENT_READ_TOOL_NAMES } from "./tools";
import { AGENT_WRITE_TOOL_NAMES } from "./writeTools";
import { buildAgentHistory } from "./conversationHistory";
import type { AgentProposal } from "./proposals";
import type { AgentTurn } from "./runAgent";

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

  it("offers the read tools AND the propose (write) tools to the model", async () => {
    const { provider, calls } = fakeProvider([endTurn("Hello!")]);
    await runAgent("hi", [], { provider });
    const toolNames = calls[0].tools.map((tool) => tool.name).sort();
    expect(toolNames).toEqual(
      [...AGENT_READ_TOOL_NAMES, ...AGENT_WRITE_TOOL_NAMES].sort(),
    );
  });

  it("read-only turns carry no proposal", async () => {
    const { provider } = fakeProvider([endTurn("Your day is light.")]);
    const result = await runAgent("what's my day look like", [], { provider });
    expect(result.proposal).toBeUndefined();
  });

  it("a propose tool short-circuits the loop and returns the proposal (no write)", async () => {
    const { provider, calls } = fakeProvider([
      toolTurn("propose_book_appointment", {
        household: "Mary Jones",
        pets: ["Kiwi"],
        date: "2026-07-11",
        time_slot: "10:00am",
        service_type: "full_groom",
        fee: 50,
        location: "gina",
      }),
      endTurn("This should never be reached — the proposal ended the turn."),
    ]);

    const result = await runAgent("book Kiwi Friday at 10", [], { provider });

    // The proposal is surfaced to the UI; the model is NOT called again to keep going.
    expect(calls.length).toBe(1);
    expect(result.proposal?.kind).toBe("book_appointment");
    expect(result.toolCalls.map((call) => call.name)).toContain(
      "propose_book_appointment",
    );
  });

  it("feeds a propose tool error back so the model disambiguates (no proposal)", async () => {
    const { provider, calls } = fakeProvider([
      toolTurn("propose_add_tip", { household: "Ghosts", pet: "Nobody", added_tip: 5 }),
      endTurn("I couldn't find that dog — which one did you mean?"),
    ]);

    const result = await runAgent("add a 5 dollar tip", [], { provider });

    expect(result.proposal).toBeUndefined();
    const toolMessage = calls[1].messages.find((m) => m.role === "tool");
    const toolResult = toolMessage?.role === "tool" ? toolMessage.results[0] : undefined;
    expect(toolResult?.isError).toBe(true);
    expect(result.text).toContain("which one");
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

// TT-027 — multi-turn context bleed. In a session with prior proposals (e.g. a
// confirmed booking then a cancelled add-pet), a NEW request used to misroute and
// re-emit a PREVIOUS proposal. Root cause: the transcript sent to the model OMITTED
// the prepared actions, so prior user requests looked UNANSWERED and the model
// re-addressed one of them. The fix (buildAgentHistory) records every prepared
// action as a resolved assistant turn, so no request is left unanswered.
describe("runAgent — multi-turn proposals do not bleed into a new request (TT-027)", () => {
  const BOOK: AgentProposal = {
    kind: "book_appointment",
    householdName: "Maple Greenwood",
    householdPhone: null,
    ownerName: "Maple Greenwood",
    petQueries: ["Biscuit"],
    petNames: "Biscuit",
    date: "2026-07-11",
    timeSlot: "10:00am",
    serviceType: "full_groom",
    service: "Full groom",
    fee: 50,
    location: "gina",
    locationLabel: "Tidy Tails (Gina)",
    durationMinutes: null,
    scheduleNote: null,
  };
  const ADD_PET: AgentProposal = {
    kind: "add_pet",
    householdName: "Maple Greenwood",
    householdPhone: null,
    ownerName: "Maple Greenwood",
    name: "RehearsalPup",
    breed: null,
    size: null,
    allergies: null,
    allergiesDetail: null,
    groomingNotes: null,
    typicalFee: null,
  };

  // A model that models the OBSERVED failure: if any earlier user request is left
  // unanswered (a user turn immediately followed by another user turn), it
  // re-addresses that stale request (re-emitting an add_pet card); otherwise it
  // handles the latest request — here a phone change → edit_household.
  function intentProvider(): ModelProvider {
    return {
      id: "intent",
      async createMessage(req) {
        const orphaned = req.messages.some(
          (m, i) => m.role === "user" && req.messages[i + 1]?.role === "user",
        );
        return orphaned
          ? toolTurn("propose_add_pet", { household: "Mary Jones", name: "RehearsalPup" })
          : toolTurn("propose_edit_household", { household: "Mary Jones", phone: "705-555-0199" });
      },
    };
  }

  it("REPRODUCTION: a transcript that omits the prepared actions makes the model re-emit a stale proposal", async () => {
    // The OLD (buggy) history shape: proposals dropped → two consecutive user turns.
    const orphanedHistory: AgentTurn[] = [
      { role: "user", text: "Book Maple Greenwood's Biscuit at Gina's" },
      { role: "user", text: "Add a dog named RehearsalPup to Maple Greenwood" },
    ];
    const result = await runAgent(
      "Change Maple Greenwood's phone to 705-555-0199",
      orphanedHistory,
      { provider: intentProvider() },
    );
    expect(result.proposal?.kind).toBe("add_pet"); // the bleed
  });

  it("FIX: buildAgentHistory records each prepared action, so the new request yields edit_household", async () => {
    const history = buildAgentHistory([
      { kind: "user", text: "Book Maple Greenwood's Biscuit at Gina's" },
      { kind: "proposal", proposal: BOOK, status: "saved" },
      { kind: "user", text: "Add a dog named RehearsalPup to Maple Greenwood" },
      { kind: "proposal", proposal: ADD_PET, status: "cancelled" },
    ]);
    const { provider, calls } = (() => {
      const p = intentProvider();
      const captured: Parameters<ModelProvider["createMessage"]>[0][] = [];
      return {
        provider: {
          id: p.id,
          async createMessage(req) {
            captured.push(req);
            return p.createMessage(req);
          },
        } as ModelProvider,
        calls: captured,
      };
    })();

    const result = await runAgent(
      "Change Maple Greenwood's phone to 705-555-0199",
      history,
      { provider },
    );

    // The new request is handled freshly — NOT a repeat of the book or add-pet.
    expect(result.proposal?.kind).toBe("edit_household");
    // The model received the prior prepared actions as resolved assistant turns.
    const roles = calls[0].messages.map((m) => m.role);
    for (let i = 1; i < roles.length; i += 1) {
      expect(roles[i], "the transcript must strictly alternate roles").not.toBe(roles[i - 1]);
    }
  });
});
