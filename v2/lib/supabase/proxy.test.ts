import { describe, expect, it } from "vitest";
import { isPublicRoute } from "./proxy";

describe("isPublicRoute", () => {
  it("keeps the login page public", () => {
    expect(isPublicRoute("/login")).toBe(true);
  });

  it("keeps the Twilio inbound webhook public so Twilio is not redirected to login", () => {
    expect(isPublicRoute("/api/twilio/inbound-sms")).toBe(true);
  });

  it("keeps the Twilio message status webhook public so delivery callbacks are not redirected to login", () => {
    expect(isPublicRoute("/api/twilio/message-status")).toBe(true);
  });

  it("keeps application pages private by default", () => {
    expect(isPublicRoute("/")).toBe(false);
    expect(isPublicRoute("/clients/c01")).toBe(false);
    expect(isPublicRoute("/settings")).toBe(false);
  });
});
