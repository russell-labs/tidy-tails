import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseHarness, form } from "./actionTestSupport";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/lib/data/repo", () => ({
  currentOrgId: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { createOrganization } from "./onboarding";
import { currentOrgId } from "@/lib/data/repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

const supabase = createSupabaseHarness();
const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const currentOrgIdMock = vi.mocked(currentOrgId);

const USER = { id: "00000000-0000-4000-8000-0000000000ab" } as Awaited<
  ReturnType<typeof getCurrentUser>
>;

function payloadForm(overrides: Record<string, unknown> = {}): FormData {
  const payload = {
    businessName: "Cheryl's Mobile Grooming",
    schedulingStyle: "one_to_one",
    locations: [
      {
        name: "Downtown van",
        address: "100 King St W, Toronto",
        payoutType: "percent",
        salonKeepsPercent: 40,
      },
    ],
    ...overrides,
  };
  return form({ payload: JSON.stringify(payload) });
}

beforeEach(() => {
  supabase.reset();
  createServerSupabaseMock.mockResolvedValue(
    supabase.client as unknown as Awaited<ReturnType<typeof createServerSupabase>>,
  );
  getCurrentUserMock.mockResolvedValue(USER);
  currentOrgIdMock.mockResolvedValue(null);
});

describe("createOrganization", () => {
  it("creates exactly one org, one owner membership, and one settings row", async () => {
    await expect(createOrganization(null, payloadForm())).rejects.toThrow(
      "redirect:/",
    );

    const inserts = supabase.operations.filter((o) => o.action === "insert");
    expect(inserts.map((o) => o.table)).toEqual([
      "organizations",
      "organization_memberships",
      "org_settings",
    ]);

    const org = inserts[0].payload as Record<string, unknown>;
    expect(org).toMatchObject({
      name: "Cheryl's Mobile Grooming",
      created_by: USER!.id,
    });
    const orgId = org.id as string;
    expect(orgId).toMatch(/^[0-9a-f-]{36}$/);

    expect(inserts[1].payload).toMatchObject({
      org_id: orgId,
      user_id: USER!.id,
      role: "owner",
    });

    expect(inserts[2].payload).toMatchObject({
      org_id: orgId,
      scheduling_style: "one_to_one",
      settings: {
        locations: [
          expect.objectContaining({ name: "Downtown van", payoutType: "percent" }),
        ],
      },
    });
  });

  it("refuses a second org for an already-onboarded user (idempotent)", async () => {
    currentOrgIdMock.mockResolvedValue("existing-org-id");

    await expect(createOrganization(null, payloadForm())).rejects.toThrow(
      "redirect:/",
    );
    expect(supabase.operations).toHaveLength(0);
  });

  it("redirects an unauthenticated caller to /login and writes nothing", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    await expect(createOrganization(null, payloadForm())).rejects.toThrow(
      "redirect:/login",
    );
    expect(supabase.operations).toHaveLength(0);
  });

  it("returns a validation error and writes nothing for a bad payload", async () => {
    const result = await createOrganization(null, payloadForm({ businessName: "" }));
    expect(result).toEqual({ error: "Enter your business name." });
    expect(supabase.operations).toHaveLength(0);
  });

  it("surfaces an error and does not seed settings when the membership insert fails", async () => {
    supabase.queueResult({ error: null }); // org insert ok
    supabase.queueResult({ error: { message: "duplicate key" } }); // membership fails

    const result = await createOrganization(null, payloadForm());
    expect(result).toEqual({
      error: "Couldn't finish setting up your business. Please try again in a moment.",
    });

    const inserts = supabase.operations.filter((o) => o.action === "insert");
    expect(inserts.map((o) => o.table)).toEqual([
      "organizations",
      "organization_memberships",
    ]);
  });

  it("still completes (lands the user in the app) when only settings insert fails", async () => {
    supabase.queueResult({ error: null }); // org insert ok
    supabase.queueResult({ error: null }); // membership ok
    supabase.queueResult({ error: { message: "settings boom" } }); // settings fails

    await expect(createOrganization(null, payloadForm())).rejects.toThrow(
      "redirect:/",
    );
    expect(
      supabase.operations.filter((o) => o.action === "insert"),
    ).toHaveLength(3);
  });
});
