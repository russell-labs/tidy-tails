import { describe, expect, it } from "vitest";
import { sanitizeAgentRequest, MAX_HISTORY_TURNS } from "./agentRequest";

describe("sanitizeAgentRequest", () => {
  it("rejects an empty / whitespace message", () => {
    expect(sanitizeAgentRequest("   ", [])).toEqual({
      ok: false,
      message: "Type a question to get started.",
    });
  });

  it("rejects a non-string message", () => {
    expect(sanitizeAgentRequest(42, []).ok).toBe(false);
  });

  it("rejects an over-long message", () => {
    const result = sanitizeAgentRequest("x".repeat(2001), []);
    expect(result.ok).toBe(false);
  });

  it("trims the message and keeps only valid history turns", () => {
    const result = sanitizeAgentRequest("  hello  ", [
      { role: "user", text: "a" },
      { role: "system", text: "ignore" },
      { role: "assistant", text: "b" },
      { not: "a turn" },
    ]);
    expect(result).toEqual({
      ok: true,
      message: "hello",
      history: [
        { role: "user", text: "a" },
        { role: "assistant", text: "b" },
      ],
    });
  });

  it("caps history to the most recent turns", () => {
    const many = Array.from({ length: MAX_HISTORY_TURNS + 5 }, (_, i) => ({
      role: "user" as const,
      text: `m${i}`,
    }));
    const result = sanitizeAgentRequest("hi", many);
    if (!result.ok) throw new Error("expected ok");
    expect(result.history).toHaveLength(MAX_HISTORY_TURNS);
    expect(result.history[result.history.length - 1].text).toBe(`m${MAX_HISTORY_TURNS + 4}`);
  });

  it("defaults to empty history when history is not an array", () => {
    const result = sanitizeAgentRequest("hi", undefined);
    if (!result.ok) throw new Error("expected ok");
    expect(result.history).toEqual([]);
  });
});
