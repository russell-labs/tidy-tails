import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_noStore: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/data/repo", () => ({
  dataMode: vi.fn(() => "live"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { recordAuditEvent } from "./audit.server";
import * as Sentry from "@sentry/nextjs";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const captureExceptionMock = vi.mocked(Sentry.captureException);

function mockAuditInsertFailure(error: Error): void {
  createServerSupabaseMock.mockResolvedValue({
    from: vi.fn(() => ({
      insert: vi.fn().mockRejectedValue(error),
    })),
  } as unknown as Awaited<ReturnType<typeof createServerSupabase>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  getCurrentUserMock.mockResolvedValue({
    id: "operator-1",
  } as Awaited<ReturnType<typeof getCurrentUser>>);
});

describe("recordAuditEvent", () => {
  it("keeps the primary action alive and captures audit write failures when Sentry is configured", async () => {
    const writeError = new Error("audit insert failed");
    mockAuditInsertFailure(writeError);
    vi.stubEnv("SENTRY_DSN", "https://public@example.com/1");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordAuditEvent({
        eventType: "client.updated",
        summary: "Updated Mary Jones.",
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to record audit event",
      writeError,
    );
    expect(captureExceptionMock).toHaveBeenCalledWith(writeError);

    consoleError.mockRestore();
  });

  it("still logs and no-ops Sentry capture when no DSN is configured", async () => {
    const writeError = new Error("audit insert failed");
    mockAuditInsertFailure(writeError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordAuditEvent({
        eventType: "client.updated",
        summary: "Updated Mary Jones.",
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to record audit event",
      writeError,
    );
    expect(captureExceptionMock).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
