import { afterEach, describe, expect, it, vi } from "vitest";

import { todayISO, weekdayForISODate } from "./dates";

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

describe("weekdayForISODate", () => {
  it("maps known dates to JS getDay() indices (0=Sun..6=Sat)", () => {
    expect(weekdayForISODate("2026-06-14")).toBe(0); // Sunday
    expect(weekdayForISODate("2026-06-15")).toBe(1); // Monday
    expect(weekdayForISODate("2026-06-16")).toBe(2); // Tuesday
    expect(weekdayForISODate("2026-06-17")).toBe(3); // Wednesday
    expect(weekdayForISODate("2026-06-18")).toBe(4); // Thursday
    expect(weekdayForISODate("2026-06-19")).toBe(5); // Friday
    expect(weekdayForISODate("2026-06-20")).toBe(6); // Saturday
  });

  it("parses at local noon so the weekday never slips at a tz boundary", () => {
    // A bare new Date('2026-06-15') is UTC midnight, which is the prior evening
    // (Sunday) in a negative-offset zone. The noon-anchored parse stays Monday.
    expect(weekdayForISODate("2026-06-15")).toBe(1);
  });

  it("falls back to today for a non-ISO string", () => {
    const today = new Date(2026, 5, 17, 9, 0, 0); // Wednesday
    expect(weekdayForISODate("not-a-date", today)).toBe(3);
  });
});
