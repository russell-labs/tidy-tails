import { describe, expect, it } from "vitest";
import { toolStatusLabel } from "./toolStatus";
import { AGENT_READ_TOOL_NAMES } from "./tools";

describe("toolStatusLabel", () => {
  it("gives a friendly, specific phrase for the schedule lookup", () => {
    expect(toolStatusLabel("get_schedule")).toBe("Looking up your schedule…");
  });

  it("gives a friendly phrase for the groom-detail lookup", () => {
    expect(toolStatusLabel("get_groom_detail")).toBe("Checking your groom notes…");
  });

  it("falls back to a generic phrase for an unknown tool", () => {
    expect(toolStatusLabel("something_new")).toBe("Looking that up…");
  });

  it("has a non-empty label for every registered read tool", () => {
    for (const name of AGENT_READ_TOOL_NAMES) {
      const label = toolStatusLabel(name);
      expect(label.length, `${name} has no status label`).toBeGreaterThan(0);
      // Each known tool gets a specific phrase, not the generic fallback.
      expect(label, `${name} fell through to the generic label`).not.toBe("Looking that up…");
    }
  });
});
