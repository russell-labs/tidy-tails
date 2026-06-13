import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveModel, selectProvider } from "./index";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("selectProvider", () => {
  it("defaults to Gemini 2.5 Flash when nothing is configured", () => {
    vi.stubEnv("TIDYTAILS_AGENT_PROVIDER", "");
    vi.stubEnv("TIDYTAILS_AGENT_MODEL", "");
    const { provider, model } = selectProvider();
    expect(provider.id).toBe("gemini");
    expect(model).toBe("gemini-2.5-flash");
  });

  it("selects Anthropic when TIDYTAILS_AGENT_PROVIDER=anthropic", () => {
    vi.stubEnv("TIDYTAILS_AGENT_PROVIDER", "anthropic");
    vi.stubEnv("TIDYTAILS_AGENT_MODEL", "");
    const { provider, model } = selectProvider();
    expect(provider.id).toBe("anthropic");
    expect(model).toBe("claude-sonnet-4-6");
  });

  it("falls back to Gemini for an unknown provider value", () => {
    vi.stubEnv("TIDYTAILS_AGENT_PROVIDER", "mistral");
    const { provider } = selectProvider();
    expect(provider.id).toBe("gemini");
  });
});

describe("resolveModel", () => {
  it("honors a same-family explicit model override", () => {
    vi.stubEnv("TIDYTAILS_AGENT_MODEL", "gemini-2.5-pro");
    expect(resolveModel("gemini")).toBe("gemini-2.5-pro");
  });

  it("honors an explicit Anthropic model for the Anthropic provider", () => {
    vi.stubEnv("TIDYTAILS_AGENT_MODEL", "claude-opus-4-8");
    expect(resolveModel("anthropic")).toBe("claude-opus-4-8");
  });

  it("ignores a stale cross-provider model (a Claude id left set while on Gemini)", () => {
    vi.stubEnv("TIDYTAILS_AGENT_MODEL", "claude-sonnet-4-6");
    expect(resolveModel("gemini")).toBe("gemini-2.5-flash");
  });

  it("ignores a stale Gemini id left set while on Anthropic", () => {
    vi.stubEnv("TIDYTAILS_AGENT_MODEL", "gemini-2.5-flash");
    expect(resolveModel("anthropic")).toBe("claude-sonnet-4-6");
  });
});
