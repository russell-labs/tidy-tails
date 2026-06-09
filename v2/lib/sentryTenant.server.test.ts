import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ setTag: vi.fn() }));
vi.mock("./data/repo", () => ({ currentOrgId: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { currentOrgId } from "./data/repo";
import { applyServerOrgTag } from "./sentryTenant.server";

const setTagMock = vi.mocked(Sentry.setTag);
const currentOrgIdMock = vi.mocked(currentOrgId);

afterEach(() => {
  vi.clearAllMocks();
});

describe("applyServerOrgTag", () => {
  it("resolves the org and tags the scope with org_id", async () => {
    currentOrgIdMock.mockResolvedValue("org-abc");
    const result = await applyServerOrgTag();
    expect(result).toBe("org-abc");
    expect(setTagMock).toHaveBeenCalledExactlyOnceWith("org_id", "org-abc");
  });

  it("tags nothing and returns null when there is no org (logged-out / bootstrap / fixtures)", async () => {
    currentOrgIdMock.mockResolvedValue(null);
    const result = await applyServerOrgTag();
    expect(result).toBeNull();
    expect(setTagMock).not.toHaveBeenCalled();
  });

  it("never throws and tags nothing when the resolver fails", async () => {
    currentOrgIdMock.mockRejectedValue(new Error("supabase unreachable"));
    await expect(applyServerOrgTag()).resolves.toBeNull();
    expect(setTagMock).not.toHaveBeenCalled();
  });
});
