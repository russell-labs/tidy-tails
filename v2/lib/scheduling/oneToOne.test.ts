import { describe, expect, it } from "vitest";
import {
  availableBlocks,
  hasOverlapConflict,
  hasUnplaceableBlock,
  oneToOneDaySummary,
  oneToOneHeavinessNote,
  oneToOneLoadStripText,
  oneToOneLoadSummaryText,
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
      workingDayMinutes: 600, // default 8am–6pm window
      softTarget: 7,
      overTarget: false,
      largeDogs: 0,
      gettingHeavy: false,
    });
  });

  it("carries the working-day window length for the booking-flow strip", () => {
    const summary = oneToOneDaySummary({
      date: "d",
      blocks: [{ durationMinutes: 60 }],
      softTarget: 7,
      workingDay: { startMinutes: 9 * 60, endMinutes: 17 * 60 }, // 8h
    });
    expect(summary.workingDayMinutes).toBe(480);
  });

  it("marks overTarget when dogs exceed the soft target", () => {
    const blocks = Array.from({ length: 8 }, () => ({ durationMinutes: 45 }));
    expect(oneToOneDaySummary({ date: "d", blocks, softTarget: 7 }).overTarget).toBe(
      true,
    );
  });
});

describe("oneToOneDaySummary — heaviness (TT-010)", () => {
  // An 8am–6pm working day = 600 minutes; ~80% = 480 minutes.
  const workingDay = { startMinutes: 8 * 60, endMinutes: 18 * 60 };

  it("counts large and xl dogs only", () => {
    const summary = oneToOneDaySummary({
      date: "d",
      softTarget: 7,
      workingDay,
      blocks: [
        { durationMinutes: 30, size: "small" },
        { durationMinutes: 60, size: "medium" },
        { durationMinutes: 90, size: "large" },
        { durationMinutes: 120, size: "xl" },
        { durationMinutes: 30, size: "unknown" },
      ],
    });
    expect(summary.largeDogs).toBe(2);
  });

  it("gets heavy at >= 2 large dogs even when booked minutes are low", () => {
    const summary = oneToOneDaySummary({
      date: "d",
      softTarget: 7,
      workingDay,
      blocks: [
        { durationMinutes: 90, size: "large" },
        { durationMinutes: 90, size: "large" },
      ],
    });
    expect(summary.bookedMinutes).toBe(180); // well under the 480-min threshold
    expect(summary.largeDogs).toBe(2);
    expect(summary.gettingHeavy).toBe(true);
  });

  it("gets heavy at the minutes threshold (>= 80% of the working day) with no large dogs", () => {
    const summary = oneToOneDaySummary({
      date: "d",
      softTarget: 7,
      workingDay,
      blocks: [
        { durationMinutes: 240, size: "medium" },
        { durationMinutes: 240, size: "small" }, // 480 total = exactly 80% of 600
      ],
    });
    expect(summary.bookedMinutes).toBe(480);
    expect(summary.largeDogs).toBe(0);
    expect(summary.gettingHeavy).toBe(true);
  });

  it("does not get heavy on a light day (one large dog, minutes well under)", () => {
    const summary = oneToOneDaySummary({
      date: "d",
      softTarget: 7,
      workingDay,
      blocks: [
        { durationMinutes: 90, size: "large" },
        { durationMinutes: 30, size: "small" },
      ],
    });
    expect(summary.largeDogs).toBe(1);
    expect(summary.gettingHeavy).toBe(false);
  });

  it("defaults to the standard 8am–6pm window when none is passed", () => {
    const summary = oneToOneDaySummary({
      date: "d",
      softTarget: 7,
      blocks: [{ durationMinutes: 480, size: "medium" }],
    });
    expect(summary.gettingHeavy).toBe(true);
  });
});

describe("oneToOneHeavinessNote (TT-010)", () => {
  it("returns null on a light day", () => {
    expect(
      oneToOneHeavinessNote({ largeDogs: 1, bookedMinutes: 120, gettingHeavy: false }),
    ).toBeNull();
  });

  it("names the large dogs and booked time, and prompts a coat-type check", () => {
    const note = oneToOneHeavinessNote({
      largeDogs: 2,
      bookedMinutes: 270,
      gettingHeavy: true,
    });
    expect(note).toBe(
      "2 large dogs and 4h 30m booked — your day's getting full. Check coat types before adding another large dog.",
    );
  });

  it("omits the coat-type sentence when no large dogs are booked", () => {
    const note = oneToOneHeavinessNote({
      largeDogs: 0,
      bookedMinutes: 480,
      gettingHeavy: true,
    });
    expect(note).toBe("8h booked — your day's getting full.");
  });
});

describe("oneToOneLoadSummaryText (TT-013 booking-flow strip)", () => {
  const base = {
    date: "d",
    totalDogs: 3,
    softTarget: 7,
    overTarget: false,
    bookedMinutes: 225,
    workingDayMinutes: 600,
    largeDogs: 2,
    gettingHeavy: false,
  };

  it("states booked time against the working-day window and the large-dog count", () => {
    expect(oneToOneLoadSummaryText(base)).toBe("3h 45m of ~10h booked · 2 large");
  });

  it("reads naturally with no large dogs on a light day", () => {
    expect(
      oneToOneLoadSummaryText({ ...base, bookedMinutes: 90, largeDogs: 0 }),
    ).toBe("1h 30m of ~10h booked · 0 large");
  });
});

describe("oneToOneLoadStripText (TT-013 booking-flow strip)", () => {
  const base = {
    date: "d",
    totalDogs: 3,
    softTarget: 7,
    overTarget: false,
    bookedMinutes: 225,
    workingDayMinutes: 600,
    largeDogs: 2,
    gettingHeavy: false,
  };

  it("is just the load summary on a light day (no caution tail)", () => {
    expect(oneToOneLoadStripText(base)).toBe("3h 45m of ~10h booked · 2 large");
  });

  it("appends the shared heaviness caution when the day is getting heavy", () => {
    expect(oneToOneLoadStripText({ ...base, gettingHeavy: true })).toBe(
      "3h 45m of ~10h booked · 2 large — your day's getting full. Check coat types before adding another large dog.",
    );
  });

  it("omits the coat-type sentence on a heavy day with no large dogs", () => {
    expect(
      oneToOneLoadStripText({
        ...base,
        largeDogs: 0,
        bookedMinutes: 480,
        gettingHeavy: true,
      }),
    ).toBe("8h of ~10h booked · 0 large — your day's getting full.");
  });
});
