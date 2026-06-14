// Agent-origin audit tagging.
//
// The agentic layer's confirm action calls the SAME gated write actions Sam's
// screens call, adding one field — `audit_source=agent`. Each gated action
// spreads this helper's result into its recordAuditEvent metadata, so an
// agent-initiated write is recorded as agent-originated. `source` is in the
// audit allow-list, so it survives. When the field is absent (every normal app
// submission), this returns {} and the audit metadata is byte-identical — Sam's
// behavior is unchanged.

/** `{ source: "agent" }` when the form marks an agent-initiated write, else `{}`. */
export function agentOriginMetadata(formData: FormData): { source?: "agent" } {
  return String(formData.get("audit_source") ?? "").trim() === "agent"
    ? { source: "agent" }
    : {};
}
