import { describe, expect, it } from "vitest";
import { buildSmsConversationView } from "./smsConversationView";
import type { SmsMessage } from "./inboundSms";

function message(id: string): SmsMessage {
  return {
    id,
    groomer_id: "operator",
    client_id: "client",
    direction: "inbound",
    from_phone: "+16478247898",
    to_phone: "+16414664592",
    body: id,
    twilio_message_sid: `SM${id}`,
    status: "received",
    match_status: "matched",
    received_at: null,
    sent_at: null,
    created_at: "2026-05-24T18:00:00Z",
  };
}

describe("buildSmsConversationView", () => {
  it("shows the latest four messages first while keeping the expand control available", () => {
    const view = buildSmsConversationView({
      messages: ["oldest", "older", "middle", "newer", "newest"].map(message),
      showAll: false,
    });

    expect(view.visibleMessages.map((entry) => entry.id)).toEqual([
      "older",
      "middle",
      "newer",
      "newest",
    ]);
    expect(view.canToggleHistory).toBe(true);
    expect(view.toggleLabel).toBe("Show 1 older text");
  });

  it("shows every message when expanded and keeps the collapse control available", () => {
    const view = buildSmsConversationView({
      messages: ["oldest", "older", "middle", "newer", "newest"].map(message),
      showAll: true,
    });

    expect(view.visibleMessages.map((entry) => entry.id)).toEqual([
      "oldest",
      "older",
      "middle",
      "newer",
      "newest",
    ]);
    expect(view.canToggleHistory).toBe(true);
    expect(view.toggleLabel).toBe("Show recent texts");
  });

  it("does not show a history toggle for short conversations", () => {
    const view = buildSmsConversationView({
      messages: ["one", "two", "three", "four"].map(message),
      showAll: false,
    });

    expect(view.visibleMessages.map((entry) => entry.id)).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
    expect(view.canToggleHistory).toBe(false);
    expect(view.toggleLabel).toBeNull();
  });
});
