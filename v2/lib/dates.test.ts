import { afterEach, describe, expect, it, vi } from "vitest";

import { todayISO } from "./dates";

describe("todayISO", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats the local date as YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 5, 14, 30, 0)); // 2026-06-05, local time
    expect(todayISO()).toBe("2026-06-05");
  });

  it("zero-pads single-digit months and days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 9, 0, 0, 0)); // 2026-01-09
    expect(todayISO()).toBe("2026-01-09");
  });

  it("uses local time, not UTC (no off-by-one at end of day)", () => {
    vi.useFakeTimers();
    // Late on the last day of the month, local time. A UTC-based formatter in a
    // negative-offset zone could roll to the next day; this must not.
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 0)); // 2026-12-31
    expect(todayISO()).toBe("2026-12-31");
  });

  it("always returns an 8-3-2 ISO date shape", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
