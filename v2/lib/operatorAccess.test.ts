import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedOperatorEmails, isAllowedOperatorEmail } from "./operatorAccess";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("operator access allowlist", () => {
  it("allows Sam by default when no env override is set", () => {
    expect(isAllowedOperatorEmail("sammclennan143@gmail.com")).toBe(true);
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(isAllowedOperatorEmail("  SAMMCLENNAN143@GMAIL.COM  ")).toBe(true);
  });

  it("rejects missing and unknown emails by default", () => {
    expect(isAllowedOperatorEmail(null)).toBe(false);
    expect(isAllowedOperatorEmail("someone@example.com")).toBe(false);
  });

  it("supports a private comma-separated override for additional operators", () => {
    vi.stubEnv(
      "TIDYTAILS_ALLOWED_EMAILS",
      "sam@example.com, backup@example.com",
    );

    expect(allowedOperatorEmails()).toEqual([
      "sam@example.com",
      "backup@example.com",
    ]);
    expect(isAllowedOperatorEmail("backup@example.com")).toBe(true);
    expect(isAllowedOperatorEmail("sammclennan143@gmail.com")).toBe(false);
  });

  it("falls back to Sam if the env value is accidentally blank", () => {
    vi.stubEnv("TIDYTAILS_ALLOWED_EMAILS", "   ");
    expect(isAllowedOperatorEmail("sammclennan143@gmail.com")).toBe(true);
  });
});
