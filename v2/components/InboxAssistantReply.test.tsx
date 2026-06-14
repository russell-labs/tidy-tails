import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReplyProposal } from "@/lib/inboxReplyFlow";

// The server actions pull in the supabase server client at import; stub them so
// this stays a pure render test. Their behaviour is covered by agentReply.test.ts
// and agentConfirm — here we only assert the trigger wires the SAME confirm card.
vi.mock("@/lib/actions/agentReply", () => ({ draftAgentReply: vi.fn() }));
vi.mock("@/lib/actions/agentConfirm", () => ({ confirmAgentProposal: vi.fn() }));

const { InboxAssistantReply } = await import("./InboxAssistantReply");

const PROPOSAL: ReplyProposal = {
  kind: "send_text",
  mode: "reply",
  smsId: "sms-1",
  recipientLabel: "Mary Jones",
  message: "Yes — 2pm Saturday works, see you then!",
};

describe("InboxAssistantReply", () => {
  it("idle: shows only the draft trigger — no confirm card / no Send button until asked", () => {
    const html = renderToStaticMarkup(<InboxAssistantReply smsId="sms-1" />);
    expect(html).toContain("Draft a reply with the assistant");
    expect(html).not.toContain("Confirm");
    expect(html).not.toContain("Send this text?");
  });

  it("proposed: surfaces the proposal through the SAME confirm card with the exact drafted text and a Confirm action", () => {
    const html = renderToStaticMarkup(
      <InboxAssistantReply smsId="sms-1" initialState={{ phase: "proposed", proposal: PROPOSAL }} />,
    );
    // The confirm card heading + the verbatim drafted reply Sam is approving.
    expect(html).toContain("Send this text?");
    expect(html).toContain("Yes — 2pm Saturday works, see you then!");
    expect(html).toContain("Mary Jones");
    // Confirm is the only send path — present while pending.
    expect(html).toContain("Confirm");
  });

  it("settled (saved): shows the sent confirmation and exposes no action buttons (can't re-fire a send)", () => {
    const html = renderToStaticMarkup(
      <InboxAssistantReply
        smsId="sms-1"
        initialState={{ phase: "settled", proposal: PROPOSAL, status: "saved", message: "Replied to Mary Jones." }}
      />,
    );
    expect(html).toContain("Replied to Mary Jones.");
    // A settled card shows no Confirm/Cancel actions — nothing to re-trigger.
    expect(html).not.toContain(">Confirm<");
  });
});
