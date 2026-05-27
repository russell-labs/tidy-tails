import { afterEach, describe, expect, it, vi } from "vitest";
import { readSmsReadiness } from "./smsReadiness";

describe("readSmsReadiness", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports every missing piece before two-way SMS is ready", () => {
    expect(readSmsReadiness()).toMatchObject({
      outboundConfigured: false,
      inboundSignatureConfigured: false,
      inboundPersistenceConfigured: false,
      ready: false,
    });
  });

  it("accepts API-key outbound auth plus a dedicated webhook secret", () => {
    vi.stubEnv("TIDYTAILS_TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TIDYTAILS_TWILIO_API_KEY_SID", "SK123");
    vi.stubEnv("TIDYTAILS_TWILIO_API_KEY_SECRET", "secret");
    vi.stubEnv("TIDYTAILS_TWILIO_FROM_NUMBER", "+17055550123");
    vi.stubEnv("TIDYTAILS_TWILIO_WEBHOOK_SECRET", "auth-token");
    vi.stubEnv("TIDYTAILS_SUPABASE_SERVICE_ROLE_KEY", "service-role");

    expect(readSmsReadiness()).toMatchObject({
      outboundConfigured: true,
      inboundSignatureConfigured: true,
      inboundPersistenceConfigured: true,
      ready: true,
    });
  });

  it("falls back to the Twilio auth token for inbound signature validation", () => {
    vi.stubEnv("TIDYTAILS_TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TIDYTAILS_TWILIO_AUTH_TOKEN", "auth-token");
    vi.stubEnv("TIDYTAILS_TWILIO_FROM_NUMBER", "+17055550123");
    vi.stubEnv("TIDYTAILS_SUPABASE_SERVICE_ROLE_KEY", "service-role");

    expect(readSmsReadiness()).toMatchObject({
      outboundConfigured: true,
      inboundSignatureConfigured: true,
      inboundPersistenceConfigured: true,
      ready: true,
    });
  });
});
