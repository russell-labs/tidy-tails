import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createAnthropicProvider,
  parseAnthropicResponse,
  toAnthropicMessages,
  type AnthropicProviderOptions,
} from "./anthropic";
import {
  ProviderNotConfiguredError,
  type ProviderMessage,
  type ProviderRequest,
} from "./types";

const baseRequest: ProviderRequest = {
  system: "You are the assistant.",
  model: "claude-sonnet-4-6",
  maxTokens: 1024,
  tools: [
    {
      name: "get_schedule",
      description: "Look up the day's appointments.",
      inputSchema: {
        type: "object",
        properties: { date: { type: "string", description: "ISO date." } },
        additionalProperties: false,
      },
    },
  ],
  messages: [{ role: "user", text: "what's my day look like" }],
};

describe("toAnthropicMessages", () => {
  it("maps a user turn to a plain string content message", () => {
    const out = toAnthropicMessages([{ role: "user", text: "hi" }]);
    expect(out).toEqual([{ role: "user", content: "hi" }]);
  });

  it("maps an assistant tool call to a tool_use content block", () => {
    const messages: ProviderMessage[] = [
      {
        role: "assistant",
        text: "looking",
        toolCalls: [{ id: "tu_1", name: "get_schedule", input: { date: "2026-06-13" } }],
      },
    ];
    expect(toAnthropicMessages(messages)).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "looking" },
          { type: "tool_use", id: "tu_1", name: "get_schedule", input: { date: "2026-06-13" } },
        ],
      },
    ]);
  });

  it("maps tool results to tool_result blocks keyed by id", () => {
    const messages: ProviderMessage[] = [
      {
        role: "tool",
        results: [
          { id: "tu_1", name: "get_schedule", content: '{"totalAppointments":3}' },
          { id: "tu_2", name: "get_pet_history", content: "bad id", isError: true },
        ],
      },
    ];
    expect(toAnthropicMessages(messages)).toEqual([
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tu_1", content: '{"totalAppointments":3}' },
          { type: "tool_result", tool_use_id: "tu_2", content: "bad id", is_error: true },
        ],
      },
    ]);
  });
});

describe("parseAnthropicResponse", () => {
  it("returns text and an end stop reason", () => {
    const result = parseAnthropicResponse({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "You have 3 today." }],
    } as unknown as Anthropic.Message);
    expect(result).toEqual({ text: "You have 3 today.", toolCalls: [], stopReason: "end" });
  });

  it("returns tool calls and a tool_use stop reason", () => {
    const result = parseAnthropicResponse({
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "" },
        { type: "tool_use", id: "tu_9", name: "get_schedule", input: { date: "2026-06-13" } },
      ],
    } as unknown as Anthropic.Message);
    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toEqual([
      { id: "tu_9", name: "get_schedule", input: { date: "2026-06-13" } },
    ]);
  });
});

describe("createAnthropicProvider", () => {
  it("throws ProviderNotConfiguredError when no API key is present", async () => {
    const provider = createAnthropicProvider({ apiKey: "" });
    await expect(provider.createMessage(baseRequest)).rejects.toBeInstanceOf(
      ProviderNotConfiguredError,
    );
  });

  it("drives an injected client and disables thinking", async () => {
    const create = vi.fn();
    create.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
    });
    const provider = createAnthropicProvider({
      client: { messages: { create } } as unknown as AnthropicProviderOptions["client"],
    });

    const result = await provider.createMessage(baseRequest);

    expect(result.text).toBe("ok");
    const params = create.mock.calls[0][0] as {
      model: string;
      thinking: unknown;
      tools: { name: string; input_schema: { additionalProperties: boolean } }[];
    };
    expect(params.model).toBe("claude-sonnet-4-6");
    expect(params.thinking).toEqual({ type: "disabled" });
    expect(params.tools[0].name).toBe("get_schedule");
    expect(params.tools[0].input_schema.additionalProperties).toBe(false);
  });

  it("reports its id as anthropic", () => {
    expect(createAnthropicProvider({ apiKey: "k" }).id).toBe("anthropic");
  });
});
