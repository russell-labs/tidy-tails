// Agentic layer — Anthropic adapter (the ALTERNATE provider).
//
// Implements ModelProvider over the Anthropic Messages API. It is the same path
// Phase 1 shipped, now behind the portable seam so staging can A/B it against
// Gemini on real Sam phrasings and keep the winner. The API key comes from
// ANTHROPIC_API_KEY (env) — never hardcoded or committed; no key needed at all
// when Gemini is the active provider.
//
// The pure mapping functions (toAnthropicMessages / parseAnthropicResponse) are
// exported and unit-tested; the provider wires them to the SDK client.

import Anthropic from "@anthropic-ai/sdk";
import {
  ProviderNotConfiguredError,
  type ModelProvider,
  type ProviderMessage,
  type ProviderRequest,
  type ProviderResponse,
} from "./types";

/** Minimal slice of the SDK the provider uses — lets tests inject a fake client. */
type AnthropicLike = {
  messages: {
    create: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  };
};

/** Normalized transcript → Anthropic MessageParam[]. */
export function toAnthropicMessages(messages: ProviderMessage[]): Anthropic.MessageParam[] {
  return messages.map((message): Anthropic.MessageParam => {
    if (message.role === "user") {
      return { role: "user", content: message.text };
    }
    if (message.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      if (message.text) content.push({ type: "text", text: message.text });
      for (const call of message.toolCalls) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
      }
      return { role: "assistant", content };
    }
    return {
      role: "user",
      content: message.results.map((result): Anthropic.ToolResultBlockParam => ({
        type: "tool_result",
        tool_use_id: result.id,
        content: result.content,
        ...(result.isError ? { is_error: true } : {}),
      })),
    };
  });
}

/** Anthropic Message → the normalized turn. */
export function parseAnthropicResponse(response: Anthropic.Message): ProviderResponse {
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  const toolCalls = response.content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
    .map((block) => ({
      id: block.id,
      name: block.name,
      input: (block.input ?? {}) as Record<string, unknown>,
    }));

  return {
    text,
    toolCalls,
    stopReason: response.stop_reason === "tool_use" ? "tool_use" : "end",
  };
}

export type AnthropicProviderOptions = {
  /** Defaults to ANTHROPIC_API_KEY from the environment. */
  apiKey?: string;
  /** Injectable for tests; defaults to a real SDK client built from the key. */
  client?: AnthropicLike;
};

/** Construct the Anthropic provider. */
export function createAnthropicProvider(options: AnthropicProviderOptions = {}): ModelProvider {
  return {
    id: "anthropic",
    async createMessage(req: ProviderRequest): Promise<ProviderResponse> {
      let client = options.client;
      if (!client) {
        const apiKey =
          options.apiKey !== undefined ? options.apiKey : process.env.ANTHROPIC_API_KEY?.trim();
        if (!apiKey) {
          throw new ProviderNotConfiguredError(
            "The assistant is not configured: ANTHROPIC_API_KEY is not set.",
          );
        }
        client = new Anthropic({ apiKey });
      }

      const response = await client.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        thinking: { type: "disabled" },
        system: req.system,
        tools: req.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        })),
        messages: toAnthropicMessages(req.messages),
      });

      return parseAnthropicResponse(response);
    },
  };
}
