import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// The owner feedback-alert SMS (TT-039 Part B). When Sam gives the assistant a
// thumbs-down, Russell gets a short heads-up text so the signal isn't left
// sitting silently in the audit table. It is the ONE new outbound in the
// feedback path: gated behind TIDYTAILS_ENABLE_FEEDBACK_ALERT (default OFF),
// addressed to TIDYTAILS_OWNER_ALERT_PHONE, carrying only operator-authored
// text (Sam's own question + her optional note), and best-effort — a send
// failure must never bubble up to the feedback write that already happened.

vi.mock("@/lib/writeGate", () => ({ isFeedbackAlertEnabled: vi.fn(() => true) }));
vi.mock("@/lib/twilio", async () => {
  const actual = await vi.importActual<typeof import("@/lib/twilio")>("@/lib/twilio");
  return {
    // toTwilioPhone is a pure formatter — keep the real one so the tests exercise
    // the real "+1" normalization the production path uses.
    toTwilioPhone: actual.toTwilioPhone,
    getTwilioConfig: vi.fn(() => ({
      ok: true,
      value: {
        accountSid: "AC_test",
        authUsername: "AC_test",
        authPassword: "secret",
        fromNumber: "+15005550006",
      },
    })),
    sendTwilioSms: vi.fn(async () => ({ ok: true, sid: "SM_test" })),
  };
});

const { isFeedbackAlertEnabled } = await import("@/lib/writeGate");
const { getTwilioConfig, sendTwilioSms } = await import("@/lib/twilio");
const { buildFeedbackAlertBody, sendFeedbackAlert } = await import("./feedbackAlert");

const isFeedbackAlertEnabledMock = vi.mocked(isFeedbackAlertEnabled);
const getTwilioConfigMock = vi.mocked(getTwilioConfig);
const sendTwilioSmsMock = vi.mocked(sendTwilioSms);

const AT = "2026-06-18T14:30:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  isFeedbackAlertEnabledMock.mockReturnValue(true);
  getTwilioConfigMock.mockReturnValue({
    ok: true,
    value: {
      accountSid: "AC_test",
      authUsername: "AC_test",
      authPassword: "secret",
      fromNumber: "+15005550006",
    },
  });
  sendTwilioSmsMock.mockResolvedValue({ ok: true, sid: "SM_test" });
  vi.stubEnv("TIDYTAILS_OWNER_ALERT_PHONE", "5195551234");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildFeedbackAlertBody", () => {
  it("names a thumbs-down, carries Sam's question and note, and a timestamp", () => {
    const body = buildFeedbackAlertBody({
      question: "how much did I make Friday",
      note: "it gave me last Friday, not this one",
      at: AT,
    });
    expect(body.toLowerCase()).toContain("thumbs-down");
    expect(body).toContain("how much did I make Friday");
    expect(body).toContain("it gave me last Friday, not this one");
    expect(body).toContain(AT);
  });

  it("omits the note line entirely when there is no note", () => {
    const body = buildFeedbackAlertBody({ question: "what's my day look like", at: AT });
    expect(body).toContain("what's my day look like");
    expect(body.toLowerCase()).not.toContain("note");
  });

  it("bounds the question and note to 200 chars (defense-in-depth)", () => {
    const body = buildFeedbackAlertBody({
      question: "q".repeat(500),
      note: "n".repeat(500),
      at: AT,
    });
    expect(body).not.toContain("q".repeat(201));
    expect(body).not.toContain("n".repeat(201));
  });
});

describe("sendFeedbackAlert", () => {
  it("sends one SMS to the owner number with the alert body when fully configured", async () => {
    await sendFeedbackAlert({ question: "how much did I make", note: "wrong day", at: AT });
    expect(sendTwilioSmsMock).toHaveBeenCalledTimes(1);
    const [config, message] = sendTwilioSmsMock.mock.calls[0];
    expect(config.fromNumber).toBe("+15005550006");
    expect(message.to).toBe("+15195551234"); // real toTwilioPhone normalization
    expect(message.body).toContain("how much did I make");
    expect(message.body).toContain("wrong day");
  });

  it("does NOT send when the feedback-alert gate is off", async () => {
    isFeedbackAlertEnabledMock.mockReturnValue(false);
    await sendFeedbackAlert({ question: "anything", at: AT });
    expect(sendTwilioSmsMock).not.toHaveBeenCalled();
  });

  it("does NOT send when no owner alert phone is configured", async () => {
    vi.stubEnv("TIDYTAILS_OWNER_ALERT_PHONE", "");
    await sendFeedbackAlert({ question: "anything", at: AT });
    expect(sendTwilioSmsMock).not.toHaveBeenCalled();
  });

  it("does NOT send when the owner phone is not textable", async () => {
    vi.stubEnv("TIDYTAILS_OWNER_ALERT_PHONE", "12"); // too short for toTwilioPhone
    await sendFeedbackAlert({ question: "anything", at: AT });
    expect(sendTwilioSmsMock).not.toHaveBeenCalled();
  });

  it("does NOT send when Twilio is not configured", async () => {
    getTwilioConfigMock.mockReturnValue({ ok: false, missing: ["TIDYTAILS_TWILIO_ACCOUNT_SID"] });
    await sendFeedbackAlert({ question: "anything", at: AT });
    expect(sendTwilioSmsMock).not.toHaveBeenCalled();
  });

  it("never throws when the Twilio send rejects (best-effort)", async () => {
    sendTwilioSmsMock.mockRejectedValue(new Error("network down"));
    await expect(
      sendFeedbackAlert({ question: "anything", at: AT }),
    ).resolves.toBeUndefined();
  });
});
