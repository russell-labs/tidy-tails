import { describe, expect, it } from "vitest";
import {
  buildInboundSmsInsert,
  buildOutboundSmsInsert,
  buildTwilioWebhookResponse,
  matchClientByPhone,
  parseTwilioInboundForm,
} from "./inboundSms";
import type { Client } from "./data/types";

const clients: Client[] = [
  {
    id: "c1",
    first_name: "Mary",
    last_name: "Anca",
    phone: "705-330-1807",
    alt_contact: null,
    email: null,
    address: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "c2",
    first_name: "Russell",
    last_name: "Cole",
    phone: "+1 (647) 824-7898",
    alt_contact: null,
    email: null,
    address: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("parseTwilioInboundForm", () => {
  it("parses the required Twilio webhook fields", () => {
    const form = new URLSearchParams({
      From: "+17053301807",
      To: "+16414664592",
      Body: "Yes, see you then!",
      MessageSid: "SM123",
    });

    expect(parseTwilioInboundForm(form)).toEqual({
      ok: true,
      value: {
        from: "+17053301807",
        to: "+16414664592",
        body: "Yes, see you then!",
        messageSid: "SM123",
      },
    });
  });

  it("rejects missing sender, recipient, or body", () => {
    expect(parseTwilioInboundForm(new URLSearchParams())).toEqual({
      ok: false,
      message: "Twilio reply was missing From, To, or Body.",
    });
  });

  it("trims a reply body but preserves internal whitespace", () => {
    const parsed = parseTwilioInboundForm(
      new URLSearchParams({
        From: "+17053301807",
        To: "+16414664592",
        Body: "  Thank you!\nSee you Friday.  ",
      }),
    );

    expect(parsed.ok && parsed.value.body).toBe("Thank you!\nSee you Friday.");
  });
});

describe("matchClientByPhone", () => {
  it("matches a Twilio E.164 sender to the household phone", () => {
    expect(matchClientByPhone(clients, "+1 705 330 1807")).toEqual({
      status: "matched",
      client: clients[0],
    });
  });

  it("returns unmatched when no household has that phone number", () => {
    expect(matchClientByPhone(clients, "+1 705 555 0000")).toEqual({
      status: "unmatched",
      client: null,
    });
  });

  it("returns ambiguous when more than one household shares the phone", () => {
    expect(
      matchClientByPhone([...clients, { ...clients[0], id: "c3" }], "+17053301807"),
    ).toEqual({
      status: "ambiguous",
      client: null,
    });
  });
});

describe("buildInboundSmsInsert", () => {
  it("builds a service-role insert scoped to Sam's groomer id", () => {
    expect(
      buildInboundSmsInsert({
        message: {
          from: "+17053301807",
          to: "+16414664592",
          body: "Confirmed",
          messageSid: "SM123",
        },
        groomerId: "88413167-0799-49a7-ba4c-c1c29403e038",
        match: { status: "matched", client: clients[0] },
      }),
    ).toEqual({
      groomer_id: "88413167-0799-49a7-ba4c-c1c29403e038",
      client_id: "c1",
      direction: "inbound",
      from_phone: "+17053301807",
      to_phone: "+16414664592",
      body: "Confirmed",
      twilio_message_sid: "SM123",
      status: "received",
      match_status: "matched",
    });
  });

  it("stores unmatched replies without inventing a client link", () => {
    const insert = buildInboundSmsInsert({
      message: {
        from: "+17055550000",
        to: "+16414664592",
        body: "Who is this?",
        messageSid: null,
      },
      groomerId: "operator",
      match: { status: "unmatched", client: null },
    });

    expect(insert.client_id).toBeNull();
    expect(insert.match_status).toBe("unmatched");
    expect(insert.twilio_message_sid).toBeNull();
  });
});

describe("buildOutboundSmsInsert", () => {
  it("builds an outbound message row after Twilio sends", () => {
    expect(
      buildOutboundSmsInsert({
        clientId: "c1",
        groomerId: "operator",
        from: "+16414664592",
        to: "+17053301807",
        body: "See you Friday",
        messageSid: "SM456",
      }),
    ).toEqual({
      groomer_id: "operator",
      client_id: "c1",
      direction: "outbound",
      from_phone: "+16414664592",
      to_phone: "+17053301807",
      body: "See you Friday",
      twilio_message_sid: "SM456",
      status: "sent",
      match_status: "matched",
      sent_at: expect.any(String),
    });
  });
});

describe("buildTwilioWebhookResponse", () => {
  it("returns an empty TwiML response so Twilio does not auto-reply", () => {
    expect(buildTwilioWebhookResponse()).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    );
  });
});
