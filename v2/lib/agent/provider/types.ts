// Agentic layer — model-provider seam (the KoyaOS portability boundary).
//
// The agent runner talks to ONE normalized `ModelProvider` interface; concrete
// adapters (Gemini, Anthropic) translate this neutral shape to/from each
// vendor's wire format. Nothing above this seam imports a vendor SDK, so a
// venture can switch models — or KoyaOS can drop the whole module into another
// app — without touching the runner, the tools, or the UI.
//
// The types here are deliberately venture-agnostic: a system prompt, a set of
// tool definitions, a running transcript (user / assistant-with-tool-calls /
// tool-results), and a single round-trip that returns the assistant's next turn
// (text plus any tool calls). Multi-turn tool use is driven by the runner
// calling `createMessage` repeatedly, appending results between calls.

/** A model's request to call one tool. `id` is normalized; some providers (Gemini) don't supply one, so the adapter synthesizes it. */
export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

/** The result of running one tool, fed back to the model on the next turn. `content` is a string (JSON for success, a message for errors). */
export type ToolResult = {
  id: string;
  name: string;
  content: string;
  isError?: boolean;
};

/** One entry in the normalized transcript. */
export type ProviderMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool"; results: ToolResult[] };

/** A tool offered to the model. Mirrors a JSON-schema function declaration. */
export type ProviderToolDef = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
};

/** One round-trip request: prompt + tools + transcript + decoding limits. */
export type ProviderRequest = {
  system: string;
  tools: ProviderToolDef[];
  messages: ProviderMessage[];
  model: string;
  maxTokens: number;
};

/** The assistant's next turn. `stopReason` tells the runner whether to run tools and loop, or stop. */
export type ProviderResponse = {
  text: string;
  toolCalls: ToolCall[];
  stopReason: "tool_use" | "end";
};

/** The portable model interface. Each adapter is one implementation. */
export interface ModelProvider {
  /** Stable id for logging/transparency, e.g. "gemini" or "anthropic". */
  readonly id: string;
  /** One assistant turn: transcript in, next turn out. */
  createMessage(req: ProviderRequest): Promise<ProviderResponse>;
}

/** No API key configured for the selected provider — surfaced as a friendly "not set up yet" message. */
export class ProviderNotConfiguredError extends Error {}

/** The provider was reached but returned an error or unusable response (non-200, blocked, empty) — surfaced as a generic failure. */
export class ProviderRequestError extends Error {}
