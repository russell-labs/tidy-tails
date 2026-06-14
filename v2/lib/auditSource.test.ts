import { describe, expect, it } from "vitest";
import { agentOriginMetadata } from "./auditSource";

// Agent-initiated writes are audited as agent-originated by threading an
// `audit_source=agent` form field into the existing gated actions. The guarantee
// that matters for Sam: when that field is ABSENT (every normal app submission),
// the helper contributes NOTHING — her audit metadata is byte-identical.

describe("agentOriginMetadata", () => {
  it("marks the write agent-originated when the form says so", () => {
    const form = new FormData();
    form.set("audit_source", "agent");
    expect(agentOriginMetadata(form)).toEqual({ source: "agent" });
  });

  it("contributes nothing when the field is absent (Sam's normal submission)", () => {
    expect(agentOriginMetadata(new FormData())).toEqual({});
  });

  it("contributes nothing for any other value", () => {
    const form = new FormData();
    form.set("audit_source", "manual");
    expect(agentOriginMetadata(form)).toEqual({});
  });
});
