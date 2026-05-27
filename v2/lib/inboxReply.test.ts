import { describe, expect, it } from "vitest";
import {
  buildSmsHandledUpdate,
  validateClientSmsInput,
  validateInboxReplyInput,
} from "./inboxReply";

describe("validateInboxReplyInput", () => {
  it("requires an sms id", () => {
    expect(validateInboxReplyInput({ smsId: "", message: "See you soon" })).toEqual({
      ok: false,
      error: "Choose a customer reply first.",
    });
  });

  it("requires a non-empty message", () => {
    expect(validateInboxReplyInput({ smsId: "sms-1", message: "   " })).toEqual({
      ok: false,
      error: "Write a reply before sending.",
    });
  });

  it("rejects messages that are too long for a careful manual SMS", () => {
    expect(validateInboxReplyInput({ smsId: "sms-1", message: "x".repeat(481) })).toEqual({
      ok: false,
      error: "Keep replies under 480 characters.",
    });
  });

  it("normalizes a valid reply", () => {
    expect(validateInboxReplyInput({ smsId: " sms-1 ", message: "  Yes, 10:30 works.  " })).toEqual({
      ok: true,
      value: { smsId: "sms-1", message: "Yes, 10:30 works." },
    });
  });
});

describe("buildSmsHandledUpdate", () => {
  it("uses the handled status with a fresh handled timestamp", () => {
    const update = buildSmsHandledUpdate("2026-05-21T12:00:00.000Z");

    expect(update).toEqual({
      status: "handled",
      handled_at: "2026-05-21T12:00:00.000Z",
    });
  });
});

describe("validateClientSmsInput", () => {
  it("requires a client id", () => {
    expect(validateClientSmsInput({ clientId: "", message: "See you soon" })).toEqual({
      ok: false,
      error: "Choose a household first.",
    });
  });

  it("requires a non-empty message", () => {
    expect(validateClientSmsInput({ clientId: "client-1", message: "   " })).toEqual({
      ok: false,
      error: "Write a text before sending.",
    });
  });

  it("rejects long freeform customer texts", () => {
    expect(validateClientSmsInput({ clientId: "client-1", message: "x".repeat(481) })).toEqual({
      ok: false,
      error: "Keep customer texts under 480 characters.",
    });
  });

  it("normalizes a valid customer text", () => {
    expect(validateClientSmsInput({ clientId: " client-1 ", message: "  Hi Sam here.  " })).toEqual({
      ok: true,
      value: { clientId: "client-1", message: "Hi Sam here." },
    });
  });
});
