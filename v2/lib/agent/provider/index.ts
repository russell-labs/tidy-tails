// Agentic layer — provider selection (the one place env chooses a model).
//
// Reads two env knobs and returns the active provider plus the model id to use:
//   - TIDYTAILS_AGENT_PROVIDER — "gemini" (default) or "anthropic".
//   - TIDYTAILS_AGENT_MODEL    — optional explicit model id; defaults per provider.
//
// Model choice is NOT a safety lever (writes confirm, reads are org-scoped), so
// this is purely a cost/quality knob. A stale cross-provider model id (e.g. a
// Claude id left set from Phase 1 while the provider is now Gemini) is ignored
// rather than sent to the wrong API — the per-provider default wins instead.

import { createAnthropicProvider } from "./anthropic";
import { createGeminiProvider } from "./gemini";
import type { ModelProvider } from "./types";

export type ProviderId = "gemini" | "anthropic";

const DEFAULT_MODEL: Record<ProviderId, string> = {
  gemini: "gemini-2.5-flash",
  anthropic: "claude-sonnet-4-6",
};

/** Which provider an explicit model id plausibly belongs to (by id prefix). */
function modelMatchesProvider(model: string, providerId: ProviderId): boolean {
  const lower = model.toLowerCase();
  return providerId === "gemini" ? lower.startsWith("gemini") : lower.startsWith("claude");
}

/** Resolve the model id: a same-family explicit override wins, else the per-provider default. */
export function resolveModel(providerId: ProviderId): string {
  const explicit = process.env.TIDYTAILS_AGENT_MODEL?.trim();
  if (explicit && modelMatchesProvider(explicit, providerId)) return explicit;
  return DEFAULT_MODEL[providerId];
}

function resolveProviderId(): ProviderId {
  const raw = process.env.TIDYTAILS_AGENT_PROVIDER?.trim().toLowerCase();
  return raw === "anthropic" ? "anthropic" : "gemini";
}

/** The active provider plus its resolved model. Gemini is the default. */
export function selectProvider(): { provider: ModelProvider; model: string } {
  const id = resolveProviderId();
  const provider = id === "anthropic" ? createAnthropicProvider() : createGeminiProvider();
  return { provider, model: resolveModel(id) };
}
