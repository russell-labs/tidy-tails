import { beforeEach, describe, expect, it, vi } from "vitest";
import { form } from "./actionTestSupport";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/orgSettings.server", () => ({
  writeWeekdayLocations: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { saveWeekdayLocationsWithState } from "./settings";
import { writeWeekdayLocations } from "@/lib/orgSettings.server";
import { getCurrentUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const writeWeekdayLocationsMock = vi.mocked(writeWeekdayLocations);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const revalidatePathMock = vi.mocked(revalidatePath);

const USER = { id: "00000000-0000-4000-8000-0000000000ab" } as Awaited<
  ReturnType<typeof getCurrentUser>
>;

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  writeWeekdayLocationsMock.mockResolvedValue(true);
});

describe("saveWeekdayLocationsWithState", () => {
  it("parses the 7 weekday selects into a map and persists it", async () => {
    const fd = form({
      "weekday.1": "Annette",
      "weekday.2": "Gina",
      "weekday.3": "Annette",
      "weekday.4": "", // Thursday off
      "weekday.5": "Gina",
      "weekday.6": "", // Saturday off
      "weekday.0": "", // Sunday off
    });

    const result = await saveWeekdayLocationsWithState({ status: "idle" }, fd);

    expect(writeWeekdayLocationsMock).toHaveBeenCalledTimes(1);
    // Off days (blank) are omitted; working days carry their location.
    expect(writeWeekdayLocationsMock).toHaveBeenCalledWith({
      1: "Annette",
      2: "Gina",
      3: "Annette",
      5: "Gina",
    });
    expect(result).toEqual({
      status: "saved",
      savedAt: expect.any(String),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/settings");
    expect(revalidatePathMock).toHaveBeenCalledWith("/schedule");
  });

  it("trims whitespace and treats a blank-only value as off", async () => {
    const fd = form({
      "weekday.1": "  Annette  ",
      "weekday.2": "   ", // whitespace only -> off
    });

    await saveWeekdayLocationsWithState({ status: "idle" }, fd);

    expect(writeWeekdayLocationsMock).toHaveBeenCalledWith({ 1: "Annette" });
  });

  it("does not write when there is no signed-in operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const result = await saveWeekdayLocationsWithState(
      { status: "idle" },
      form({ "weekday.1": "Annette" }),
    );
    expect(writeWeekdayLocationsMock).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "idle" });
  });
});
