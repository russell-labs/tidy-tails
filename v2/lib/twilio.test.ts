import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTwilioMessageRequest,
  getTwilioConfig,
  sendTwilioSms,
  toTwilioPhone,
} from "./twilio";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getTwilioConfig", () => {
  it("returns missing when any required server-only env var is absent", () => {
    vi.stubEnv("TIDYTAILS_TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TIDYTAILS_TWILIO_AUTH_TOKEN", "secret");

    expect(getTwilioConfig()).toEqual({
      ok: false,
      missing: ["TIDYTAILS_TWILIO_FROM_NUMBER"],
    });
  });

  it("returns the Twilio config when all required env vars are present", () => {
    vi.stubEnv("TIDYTAILS_TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TIDYTAILS_TWILIO_AUTH_TOKEN", "secret");
    vi.stubEnv("TIDYTAILS_TWILIO_FROM_NUMBER", "+17055550123");

    expect(getTwilioConfig()).toEqual({
      ok: true,
      value: {
        accountSid: "AC123",
        authUsername: "AC123",
        authPassword: "secret",
        fromNumber: "+17055550123",
      },
    });
  });

  it("prefers API key credentials when they are present", () => {
    vi.stubEnv("TIDYTAILS_TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TIDYTAILS_TWILIO_AUTH_TOKEN", "account-secret");
    vi.stubEnv("TIDYTAILS_TWILIO_API_KEY_SID", "SK123");
    vi.stubEnv("TIDYTAILS_TWILIO_API_KEY_SECRET", "key-secret");
    vi.stubEnv("TIDYTAILS_TWILIO_FROM_NUMBER", "+17055550123");

    expect(getTwilioConfig()).toEqual({
      ok: true,
      value: {
        accountSid: "AC123",
        authUsername: "SK123",
        authPassword: "key-secret",
        fromNumber: "+17055550123",
      },
    });
  });

  it("does not require the account auth token when an API key pair is present", () => {
    vi.stubEnv("TIDYTAILS_TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TIDYTAILS_TWILIO_API_KEY_SID", "SK123");
    vi.stubEnv("TIDYTAILS_TWILIO_API_KEY_SECRET", "key-secret");
    vi.stubEnv("TIDYTAILS_TWILIO_FROM_NUMBER", "+17055550123");

    expect(getTwilioConfig()).toMatchObject({ ok: true });
  });
});

describe("toTwilioPhone", () => {
  it("normalizes a 10-digit North American number to E.164", () => {
    expect(toTwilioPhone("705-555-0106")).toBe("+17055550106");
  });

  it("normalizes an 11-digit North American number with leading 1", () => {
    expect(toTwilioPhone("1 (705) 555-0106")).toBe("+17055550106");
  });

  it("keeps an already E.164-looking number usable", () => {
    expect(toTwilioPhone("+1 705 555 0106")).toBe("+17055550106");
  });

  it("returns null for a phone number Twilio should not receive", () => {
    expect(toTwilioPhone("555-0106")).toBeNull();
  });
});

describe("buildTwilioMessageRequest", () => {
  it("builds the Twilio REST endpoint, auth header, and form body", () => {
    const request = buildTwilioMessageRequest(
      {
        accountSid: "AC123",
        authUsername: "SK123",
        authPassword: "secret",
        fromNumber: "+17055550123",
      },
      { to: "+17055550106", body: "Hi there" },
    );

    expect(request.url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
    );
    expect(request.headers.Authorization).toBe(
      `Basic ${Buffer.from("SK123:secret").toString("base64")}`,
    );
    expect(request.body.get("To")).toBe("+17055550106");
    expect(request.body.get("From")).toBe("+17055550123");
    expect(request.body.get("Body")).toBe("Hi there");
  });
});

describe("sendTwilioSms", () => {
  it("posts one SMS request and returns the Twilio message SID", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sid: "SM123" }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTwilioSms(
      {
        accountSid: "AC123",
        authUsername: "AC123",
        authPassword: "secret",
        fromNumber: "+17055550123",
      },
      { to: "+17055550106", body: "Hi there" },
    );

    expect(result).toEqual({ ok: true, sid: "SM123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("explains the Twilio trial verified-recipient restriction", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ code: 21608 }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTwilioSms(
      {
        accountSid: "AC123",
        authUsername: "AC123",
        authPassword: "secret",
        fromNumber: "+17055550123",
      },
      { to: "+17055550106", body: "Hi there" },
    );

    expect(result).toEqual({
      ok: false,
      message:
        "Twilio trial accounts can only text verified recipient numbers. Upgrade Twilio or verify this number, then try again.",
    });
  });

  it("returns a friendly failure with Twilio's safe message when available", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ code: 21211, message: "The 'To' number is invalid." }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTwilioSms(
      {
        accountSid: "AC123",
        authUsername: "AC123",
        authPassword: "secret",
        fromNumber: "+17055550123",
      },
      { to: "+17055550106", body: "Hi there" },
    );

    expect(result).toEqual({
      ok: false,
      message: "Twilio could not send the SMS: The 'To' number is invalid.",
    });
  });
});
