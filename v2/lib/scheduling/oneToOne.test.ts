import { describe, expect, it } from "vitest";
import {
  availableBlocks,
  hasOverlapConflict,
  hasUnplaceableBlock,
  oneToOneDaySummary,
  resolveExistingBlock,
  suggestedDurationMinutes,
  type ExistingBlock,
} from "./oneToOne";

describe("suggestedDurationMinutes", () => {
  it("scales with size for a full groom", () => {
    expect(suggestedDurationMinutes("full_groom", "small")).toBe(30);
    expect(suggestedDurationMinutes("full_groom", "medium")).toBe(60);
    expect(suggestedDurationMinutes("full_groom", "large")).toBe(90);
    expect(suggestedDurationMinutes("full_groom", "xl")).toBe(120);
    expect(suggestedDurationMinutes("full_groom", "unknown")).toBe(60);
  });

  it("treats a nail trim as quick regardless of size", () => {
    expect(suggestedDurationMinutes("nail_trim", "large")).toBe(15);
    expect(suggestedDurationMinutes("nail_trim", "small")).toBe(15);
  });

  it("makes a bath shorter than a full groom", () => {
    expect(suggestedDurationMinutes("bath_only", "large")).toBeLessThan(
      suggestedDurationMinutes("full_groom", "large"),
    );
  });

  it("honors per-org overrides", () => {
    expect(suggestedDurationMinutes("full_groom", "large", { large: 150 })).toBe(150);
  });
});

describe("resolveExistingBlock", () => {
  it("parses a slot and keeps a positive duration", () => {
    expect(resolveExistingBlock("10:00am", 45, 60)).toEqual({
      startMinutes: 600,
      durationMinutes: 45,
    });
  });

  it("falls back when duration is null or zero (fail toward conflict)", () => {
    expect(resolveExistingBlock("10:00am", null, 90)).toEqual({
      startMinutes: 600,
      durationMinutes: 90,
    });
    expect(resolveExistingBlock("10:00am", 0, 90).durationMinutes).toBe(90);
  });

  it("marks an unparseable time as unplaceable (null start)", () => {
    expect(resolveExistingBlock("whenever", 30, 60).startMinutes).toBeNull();
  });
});

describe("hasOverlapConflict", () => {
  const at = (startMinutes: number, durationMinutes: number): ExistingBlock => ({
    startMinutes,
    durationMinutes,
  });

  it("rejects an overlapping candidate and allows an adjacent one (buffer 0)", () => {
    const existing = [at(600, 60)]; // 10:00-11:00
    expect(
      hasOverlapConflict({
        candidateStartMinutes: 630,
        candidateDurationMinutes: 30,
        existing,
      }),
    ).toBe(true);
    expect(
      hasOverlapConflict({
        candidateStartMinutes: 660,
        candidateDurationMinutes: 30,
        existing,
      }),
    ).toBe(false);
  });

  it("enforces the buffer when set", () => {
    const existing = [at(600, 60)];
    expect(
      hasOverlapConflict({
        candidateStartMinutes: 660,
        candidateDurationMinutes: 30,
        existing,
        bufferMinutes: 15,
      }),
    ).toBe(true);
    expect(
      hasOverlapConflict({
        candidateStartMinutes: 675,
        candidateDurationMinutes: 30,
        existing,
        bufferMinutes: 15,
      }),
    ).toBe(false);
  });

  it("fails toward conflict when any existing block is unplaceable", () => {
    const existing = [{ startMinutes: null, durationMinutes: 60 }];
    expect(hasUnplaceableBlock(existing)).toBe(true);
    expect(
      hasOverlapConflict({
        candidateStartMinutes: 900,
        candidateDurationMinutes: 30,
        existing,
      }),
    ).toBe(true);
  });
});

describe("availableBlocks", () => {
  it("offers non-overlapping blocks of the requested length", () => {
    const existing: ExistingBlock[] = [{ startMinutes: 600, durationMinutes: 60 }];
    const slots = availableBlocks({
      durationMinutes: 60,
      existing,
      workingDay: { startMinutes: 540, endMinutes: 720 }, // 9:00-12:00
    });
    // 9:00 (540-600) ok; 9:15..9:45 would overlap the 10:00-11:00 block; 11:00 ok
    expect(slots).toContain("9:00am");
    expect(slots).toContain("11:00am");
    expect(slots).not.toContain("9:30am");
    expect(slots).not.toContain("10:00am");
  });

  it("returns nothing when an existing block is unplaceable", () => {
    expect(
      availableBlocks({
        durationMinutes: 30,
        existing: [{ startMinutes: null, durationMinutes: 60 }],
      }),
    ).toEqual([]);
  });

  it("respects the buffer", () => {
    const existing: ExistingBlock[] = [{ startMinutes: 600, durationMinutes: 60 }];
    const noBuffer = availableBlocks({
      durationMinutes: 30,
      existing,
      workingDay: { startMinutes: 660, endMinutes: 720 },
    });
    expect(noBuffer).toContain("11:00am"); // touches the 11:00 end, allowed
    const withBuffer = availableBlocks({
      durationMinutes: 30,
      existing,
      bufferMinutes: 15,
      workingDay: { startMinutes: 660, endMinutes: 720 },
    });
    expect(withBuffer).not.toContain("11:00am"); // needs a 15-min gap
    expect(withBuffer).toContain("11:15am");
  });
});

describe("oneToOneDaySummary", () => {
  it("totals dogs and minutes and flags over the soft target", () => {
    const summary = oneToOneDaySummary({
      date: "2026-06-20",
      blocks: [{ durationMinutes: 60 }, { durationMinutes: 30 }],
      softTarget: 7,
    });
    expect(summary).toEqual({
      date: "2026-06-20",
      totalDogs: 2,
      bookedMinutes: 90,
      softTarget: 7,
      overTarget: false,
    });
  });

  it("marks overTarget when dogs exceed the soft target", () => {
    const blocks = Array.from({ length: 8 }, () => ({ durationMinutes: 45 }));
    expect(oneToOneDaySummary({ date: "d", blocks, softTarget: 7 }).overTarget).toBe(
      true,
    );
  });
});
