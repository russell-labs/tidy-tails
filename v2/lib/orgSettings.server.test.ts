import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseHarness } from "./actions/actionTestSupport";

// Drive the live write path with a resolvable org; override only what the writer
// reads from data/repo.
vi.mock("@/lib/data/repo", () => ({
  dataMode: vi.fn(() => "live"),
  currentOrgId: vi.fn(async () => "org-1"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
}));

import { writeWeekdayLocations } from "./orgSettings.server";
import { currentOrgId, dataMode } from "@/lib/data/repo";
import { createServerSupabase } from "@/lib/supabase/server";

const supabase = createSupabaseHarness();
const createServerSupabaseMock = vi.mocked(createServerSupabase);
const dataModeMock = vi.mocked(dataMode);
const currentOrgIdMock = vi.mocked(currentOrgId);

beforeEach(() => {
  supabase.reset();
  createServerSupabaseMock.mockResolvedValue(
    supabase.client as unknown as Awaited<ReturnType<typeof createServerSupabase>>,
  );
  dataModeMock.mockReturnValue("live");
  currentOrgIdMock.mockResolvedValue("org-1");
});

describe("writeWeekdayLocations", () => {
  it("upserts only the weekday_locations column, scoped to the caller's org", async () => {
    const ok = await writeWeekdayLocations({ 1: "Annette", 3: "Gina" });
    expect(ok).toBe(true);

    const upserts = supabase.operations.filter((o) => o.action === "upsert");
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe("org_settings");
    expect(upserts[0].options).toEqual({ onConflict: "org_id" });

    const payload = upserts[0].payload as Record<string, unknown>;
    // org_id is always carried (RLS requires the row be the caller's own org).
    expect(payload.org_id).toBe("org-1");
    expect(payload.weekday_locations).toEqual({ 1: "Annette", 3: "Gina" });
    // It must NOT touch scheduling_style / settings — only the new column.
    expect(payload).not.toHaveProperty("scheduling_style");
    expect(payload).not.toHaveProperty("settings");
    expect(typeof payload.updated_at).toBe("string");
  });

  it("normalizes the map before writing (drops blanks and out-of-range days)", async () => {
    await writeWeekdayLocations({
      0: "Sunday Spot",
      1: "  ", // blank -> dropped (off)
      9: "Nope", // out of range -> dropped
    } as unknown as Record<number, string>);

    const upsert = supabase.operations.find((o) => o.action === "upsert");
    const payload = upsert?.payload as Record<string, unknown>;
    expect(payload.weekday_locations).toEqual({ 0: "Sunday Spot" });
  });

  it("is a no-op (returns false, writes nothing) when not in live data mode", async () => {
    dataModeMock.mockReturnValue("fixtures");
    const ok = await writeWeekdayLocations({ 1: "Annette" });
    expect(ok).toBe(false);
    expect(supabase.operations).toHaveLength(0);
  });

  it("is a no-op when there is no resolvable org", async () => {
    currentOrgIdMock.mockResolvedValue(null);
    const ok = await writeWeekdayLocations({ 1: "Annette" });
    expect(ok).toBe(false);
    expect(supabase.operations).toHaveLength(0);
  });

  it("returns false when the upsert errors", async () => {
    supabase.queueResult({ data: null, error: { message: "denied" } });
    const ok = await writeWeekdayLocations({ 1: "Annette" });
    expect(ok).toBe(false);
  });
});
