import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ setTag: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { tagSentryOrg } from "./sentryTenant";

const setTagMock = vi.mocked(Sentry.setTag);

afterEach(() => {
  vi.clearAllMocks();
});

describe("tagSentryOrg", () => {
  it("tags the Sentry scope with org_id when an org is present", () => {
    tagSentryOrg("org-123");
    expect(setTagMock).toHaveBeenCalledExactlyOnceWith("org_id", "org-123");
  });

  it("does nothing when there is no org (null / undefined / empty)", () => {
    tagSentryOrg(null);
    tagSentryOrg(undefined);
    tagSentryOrg("");
    expect(setTagMock).not.toHaveBeenCalled();
  });

  it("never throws, even if Sentry tagging itself fails", () => {
    setTagMock.mockImplementationOnce(() => {
      throw new Error("sentry transport down");
    });
    expect(() => tagSentryOrg("org-123")).not.toThrow();
  });
});
