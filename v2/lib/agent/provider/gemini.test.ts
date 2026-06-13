import { describe, expect, it, vi } from "vitest";
import {
  buildGeminiRequestBody,
  createGeminiProvider,
  parseGeminiResponse,
} from "./gemini";
import {
  ProviderNotConfiguredError,
  ProviderRequestError,
  type ProviderRequest,
} from "./types";

const baseRequest: ProviderRequest = {
  system: "You are the assistant.",
  model: "gemini-2.5-flash",
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

type GeminiBody = {
  systemInstruction: { parts: { text: string }[] };
  contents: {
    role: string;
    parts: Array<{
      text?: string;
      functionCall?: { name: string; args: Record<string, unknown> };
      functionResponse?: { name: string; response: Record<string, unknown> };
    }>;
  }[];
  tools: {
    functionDeclarations: {
      name: string;
      description: string;
      parameters: {
        type: string;
        properties: Record<string, { type: string; description?: string }>;
        required?: string[];
      };
    }[];
  }[];
  generationConfig: { maxOutputTokens: number; thinkingConfig: { thinkingBudget: number } };
};

describe("buildGeminiRequestBody", () => {
  it("maps system, tools, and a user turn to the Gemini wire shape", () => {
    const body = buildGeminiRequestBody(baseRequest) as GeminiBody;
    expect(body.systemInstruction.parts[0].text).toBe("You are the assistant.");
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "what's my day look like" }] },
    ]);
    expect(body.tools[0].functionDeclarations[0].name).toBe("get_schedule");
  });

  it("strips the unsupported additionalProperties key from tool parameters", () => {
    const body = buildGeminiRequestBody(baseRequest) as GeminiBody;
    const params = body.tools[0].functionDeclarations[0].parameters;
    expect(params).not.toHaveProperty("additionalProperties");
    expect(params.type).toBe("object");
    expect(params.properties.date.type).toBe("string");
  });

  it("disables thinking and sets the token cap (Flash thinks by default)", () => {
    const body = buildGeminiRequestBody(baseRequest) as GeminiBody;
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });

  it("maps an assistant tool call to a model functionCall part", () => {
    const body = buildGeminiRequestBody({
      ...baseRequest,
      messages: [
        { role: "user", text: "what's my day look like" },
        {
          role: "assistant",
          text: "",
          toolCalls: [
            { id: "get_schedule-0", name: "get_schedule", input: { date: "2026-06-13" } },
          ],
        },
      ],
    }) as GeminiBody;
    expect(body.contents[1]).toEqual({
      role: "model",
      parts: [{ functionCall: { name: "get_schedule", args: { date: "2026-06-13" } } }],
    });
  });

  it("maps a tool result to a user functionResponse part keyed by name", () => {
    const body = buildGeminiRequestBody({
      ...baseRequest,
      messages: [
        {
          role: "tool",
          results: [
            { id: "get_schedule-0", name: "get_schedule", content: '{"totalAppointments":3}' },
          ],
        },
      ],
    }) as GeminiBody;
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[0].parts[0]).toEqual({
      functionResponse: { name: "get_schedule", response: { totalAppointments: 3 } },
    });
  });

  it("wraps a tool error result as an error response object", () => {
    const body = buildGeminiRequestBody({
      ...baseRequest,
      messages: [
        {
          role: "tool",
          results: [
            { id: "x", name: "get_pet_history", content: "No pet with that id.", isError: true },
          ],
        },
      ],
    }) as GeminiBody;
    expect(body.contents[0].parts[0]).toEqual({
      functionResponse: { name: "get_pet_history", response: { error: "No pet with that id." } },
    });
  });
});

describe("parseGeminiResponse", () => {
  it("extracts plain text as an end turn", () => {
    const result = parseGeminiResponse({
      candidates: [
        { content: { parts: [{ text: "You have 3 appointments today." }] }, finishReason: "STOP" },
      ],
    });
    expect(result).toEqual({
      text: "You have 3 appointments today.",
      toolCalls: [],
      stopReason: "end",
    });
  });

  it("extracts a function call as a tool_use turn with a synthesized id", () => {
    const result = parseGeminiResponse({
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: "get_schedule", args: { date: "2026-06-13" } } }],
          },
          finishReason: "STOP",
        },
      ],
    });
    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: "get_schedule",
      input: { date: "2026-06-13" },
    });
    expect(result.toolCalls[0].id).toBeTruthy();
  });

  it("throws when the response was blocked for safety", () => {
    expect(() =>
      parseGeminiResponse({ candidates: [{ finishReason: "SAFETY" }] }),
    ).toThrow(ProviderRequestError);
  });

  it("throws when there are no candidates at all", () => {
    expect(() => parseGeminiResponse({ promptFeedback: { blockReason: "OTHER" } })).toThrow(
      ProviderRequestError,
    );
  });
});

describe("createGeminiProvider", () => {
  it("throws ProviderNotConfiguredError when no API key is present", async () => {
    const provider = createGeminiProvider({ apiKey: "", fetchImpl: vi.fn() });
    await expect(provider.createMessage(baseRequest)).rejects.toBeInstanceOf(
      ProviderNotConfiguredError,
    );
  });

  it("posts to the model endpoint with the key in a header (not the URL)", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
      }),
    }));

    const provider = createGeminiProvider({
      apiKey: "secret-key",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.createMessage(baseRequest);

    expect(result.text).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("gemini-2.5-flash:generateContent");
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
  });

  it("maps a non-200 response to a ProviderRequestError", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => "billing not enabled",
    })) as unknown as typeof fetch;

    const provider = createGeminiProvider({ apiKey: "k", fetchImpl });
    await expect(provider.createMessage(baseRequest)).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
  });

  it("reports its id as gemini", () => {
    expect(createGeminiProvider({ apiKey: "k" }).id).toBe("gemini");
  });
});
