import { describe, expect, it } from "vitest";
import type { SmsMessage } from "./inboundSms";
import { smsDeliveryLabel, smsDeliveryTone } from "./smsStatus";

function sms(overrides: Partial<SmsMessage>): SmsMessage {
  return {
    id: "sms1",
    groomer_id: "operator",
    client_id: "c1",
    direction: "outbound",
    from_phone: "+16414664592",
    to_phone: "+17053301807",
    body: "See you soon",
    twilio_message_sid: "SM123",
    status: "sent",
    match_status: "matched",
    received_at: null,
    sent_at: "2026-05-27T17:43:00Z",
    created_at: "2026-05-27T17:43:00Z",
    ...overrides,
  };
}

describe("smsDeliveryLabel", () => {
  it("labels inbound customer texts as received", () => {
    expect(smsDeliveryLabel(sms({ direction: "inbound", status: "received" }))).toBe(
      "Received",
    );
  });

  it.each([
    ["sent", "Sent"],
    ["delivered", "Delivered"],
    ["failed", "Failed"],
    ["undelivered", "Failed"],
  ])("labels outbound %s as %s", (status, label) => {
    expect(smsDeliveryLabel(sms({ status }))).toBe(label);
  });
});

describe("smsDeliveryTone", () => {
  it("marks failed states as warning", () => {
    expect(smsDeliveryTone(sms({ status: "failed" }))).toContain("text-warn");
  });
});
