// Agentic layer — Gemini adapter (the DEFAULT provider).
//
// Implements ModelProvider over Google's Generative Language REST API
// (generateContent with function calling). REST, not an SDK, so the module
// adds no dependency and is not tied to a vendor SDK's version churn — it stays
// a clean, portable seam.
//
// The API key comes from GOOGLE_API_KEY (env), passed in the `x-goog-api-key`
// header so it never lands in a URL or log line — never hardcoded or committed.
// PAID, no-training tier is a deployment/ToS requirement (see the PRD); the code
// only needs the key + the model id.
//
// The pure mapping functions (buildGeminiRequestBody / parseGeminiResponse) are
// exported and unit-tested without the network; the provider wires them to fetch.

import {
  ProviderNotConfiguredError,
  ProviderRequestError,
  type ModelProvider,
  type ProviderMessage,
  type ProviderRequest,
  type ProviderResponse,
  type ProviderToolDef,
} from "./types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Gemini's function `parameters` follow an OpenAPI subset that rejects `additionalProperties`; strip it. */
function toFunctionParameters(schema: ProviderToolDef["inputSchema"]) {
  return {
    type: schema.type,
    properties: schema.properties,
    ...(schema.required ? { required: schema.required } : {}),
  };
}

/** A tool result `content` string → the object Gemini's functionResponse expects. */
function toFunctionResponse(content: string, isError?: boolean): Record<string, unknown> {
  if (isError) return { error: content };
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { result: parsed };
  } catch {
    return { result: content };
  }
}

/** Normalized transcript → Gemini `contents`. functionResponse parts ride in a user-role turn, matched by name (Gemini has no tool-call ids). */
function toContents(messages: ProviderMessage[]) {
  return messages.map((message) => {
    if (message.role === "user") {
      return { role: "user", parts: [{ text: message.text }] };
    }
    if (message.role === "assistant") {
      const parts: Record<string, unknown>[] = [];
      if (message.text) parts.push({ text: message.text });
      for (const call of message.toolCalls) {
        parts.push({ functionCall: { name: call.name, args: call.input } });
      }
      return { role: "model", parts };
    }
    return {
      role: "user",
      parts: message.results.map((result) => ({
        functionResponse: {
          name: result.name,
          response: toFunctionResponse(result.content, result.isError),
        },
      })),
    };
  });
}

/** Build the JSON body for a generateContent call. Pure — no network, no key. */
export function buildGeminiRequestBody(req: ProviderRequest): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: toContents(req.messages),
    tools: [
      {
        functionDeclarations: req.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: toFunctionParameters(tool.inputSchema),
        })),
      },
    ],
    generationConfig: {
      maxOutputTokens: req.maxTokens,
      // Flash "thinks" by default; disable it for a snappy, low-cost assistant
      // (matches the Anthropic path's thinking:{type:"disabled"}).
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
}

type GeminiPart = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } };
type GeminiResponseJson = {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

/** Parse a generateContent response into the normalized turn. Pure. */
export function parseGeminiResponse(json: GeminiResponseJson): ProviderResponse {
  const candidate = json?.candidates?.[0];
  if (!candidate) {
    const reason = json?.promptFeedback?.blockReason;
    throw new ProviderRequestError(
      reason
        ? `Gemini returned no answer (blocked: ${reason}).`
        : "Gemini returned no answer.",
    );
  }

  const parts = candidate.content?.parts ?? [];
  let text = "";
  const toolCalls: ProviderResponse["toolCalls"] = [];
  parts.forEach((part, index) => {
    if (typeof part.text === "string") text += part.text;
    if (part.functionCall) {
      toolCalls.push({
        id: `${part.functionCall.name}-${index}`,
        name: part.functionCall.name,
        input: part.functionCall.args ?? {},
      });
    }
  });

  // A blocked/empty finish with nothing usable is a dead end — fail to a
  // friendly error rather than returning a blank turn the runner can't use.
  if (toolCalls.length === 0 && text.trim() === "") {
    throw new ProviderRequestError(
      `Gemini returned an empty answer (finishReason: ${candidate.finishReason ?? "unknown"}).`,
    );
  }

  return {
    text: text.trim(),
    toolCalls,
    stopReason: toolCalls.length > 0 ? "tool_use" : "end",
  };
}

export type GeminiProviderOptions = {
  /** Defaults to GOOGLE_API_KEY from the environment. */
  apiKey?: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
};

/** Construct the Gemini provider. The key is resolved here (or per call) from env. */
export function createGeminiProvider(options: GeminiProviderOptions = {}): ModelProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    id: "gemini",
    async createMessage(req: ProviderRequest): Promise<ProviderResponse> {
      const apiKey =
        options.apiKey !== undefined ? options.apiKey : process.env.GOOGLE_API_KEY?.trim();
      if (!apiKey) {
        throw new ProviderNotConfiguredError(
          "The assistant is not configured: GOOGLE_API_KEY is not set.",
        );
      }

      const url = `${BASE_URL}/models/${encodeURIComponent(req.model)}:generateContent`;
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(buildGeminiRequestBody(req)),
        });
      } catch (error) {
        throw new ProviderRequestError(
          `Could not reach Gemini: ${error instanceof Error ? error.message : "network error"}`,
        );
      }

      if (!response.ok) {
        // A 403 here usually means billing isn't enabled or the Gemini API is
        // off for the project — common on first key setup.
        throw new ProviderRequestError(`Gemini request failed (HTTP ${response.status}).`);
      }

      const json = (await response.json()) as GeminiResponseJson;
      return parseGeminiResponse(json);
    },
  };
}
