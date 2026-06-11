import { describe, expect, it } from "vitest";
import {
  buildDailyIncomeUpsert,
  sumDailyIncomeInRange,
  validateDailyIncomeInput,
} from "./dailyIncome";
import type { DailyIncome } from "./data/types";

function income(overrides: Partial<DailyIncome>): DailyIncome {
  return {
    id: overrides.id ?? "i1",
    date: overrides.date ?? "2026-06-12",
    location: overrides.location ?? "gina",
    amount: overrides.amount ?? 200,
    note: overrides.note ?? null,
    created_at: "2026-06-12T20:00:00.000Z",
    updated_at: "2026-06-12T20:00:00.000Z",
  };
}

describe("validateDailyIncomeInput", () => {
  const valid = {
    date: "2026-06-12",
    location: "gina",
    amount: "240.50",
    note: "Rented chair day",
  };

  it("accepts a well-formed lump-sum entry and rounds the amount to cents", () => {
    const result = validateDailyIncomeInput({ ...valid, amount: "240.505" });
    expect(result).toEqual({
      ok: true,
      value: {
        date: "2026-06-12",
        location: "gina",
        amount: 240.51,
        note: "Rented chair day",
      },
    });
  });

  it("treats a blank note as null", () => {
    const result = validateDailyIncomeInput({ ...valid, note: "   " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.note).toBeNull();
  });

  it("rejects a non-booking location", () => {
    const result = validateDailyIncomeInput({ ...valid, location: "home" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.location).toBeDefined();
  });

  it("rejects a malformed date", () => {
    const result = validateDailyIncomeInput({ ...valid, date: "June 12" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.date).toBeDefined();
  });

  it("rejects a zero, negative, or non-numeric amount", () => {
    for (const amount of ["0", "-5", "abc", ""]) {
      const result = validateDailyIncomeInput({ ...valid, amount });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.amount).toBeDefined();
    }
  });

  it("rejects an over-long note", () => {
    const result = validateDailyIncomeInput({ ...valid, note: "x".repeat(501) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.note).toBeDefined();
  });
});

describe("sumDailyIncomeInRange", () => {
  it("sums gross amounts whose date falls within [from, to] inclusive", () => {
    const rows = [
      income({ id: "a", date: "2026-06-01", amount: 100 }),
      income({ id: "b", date: "2026-06-15", amount: 240.5 }),
      income({ id: "c", date: "2026-06-30", amount: 60 }),
      income({ id: "d", date: "2026-07-01", amount: 999 }), // out of range
    ];
    expect(sumDailyIncomeInRange(rows, "2026-06-01", "2026-06-30")).toBe(400.5);
  });

  it("returns 0 for an empty set", () => {
    expect(sumDailyIncomeInRange([], "2026-06-01", "2026-06-30")).toBe(0);
  });
});

describe("buildDailyIncomeUpsert", () => {
  it("shapes the row with a stamped updated_at", () => {
    const upsert = buildDailyIncomeUpsert(
      { date: "2026-06-12", location: "gina", amount: 240.5, note: null },
      "2026-06-12T18:00:00.000Z",
    );
    expect(upsert).toEqual({
      date: "2026-06-12",
      location: "gina",
      amount: 240.5,
      note: null,
      updated_at: "2026-06-12T18:00:00.000Z",
    });
  });
});
