import { describe, expect, it } from "vitest";
import { formatPetAge, parseStoredPetBirthDate } from "./petAge";

describe("parseStoredPetBirthDate", () => {
  it("accepts ISO dates and a DOB marker from the live age field", () => {
    expect(parseStoredPetBirthDate("2021-06-15")).toBe("2021-06-15");
    expect(parseStoredPetBirthDate("DOB:2021-06-15")).toBe("2021-06-15");
  });

  it("ignores stale free-text ages", () => {
    expect(parseStoredPetBirthDate("4 years old")).toBeNull();
    expect(parseStoredPetBirthDate("")).toBeNull();
  });
});

describe("formatPetAge", () => {
  it("ages pets over time from their birth date", () => {
    expect(formatPetAge("2021-06-15", new Date("2026-06-14T12:00:00"))).toBe(
      "4 years old",
    );
    expect(formatPetAge("2021-06-15", new Date("2026-06-15T12:00:00"))).toBe(
      "5 years old",
    );
  });

  it("uses months for puppies under one year", () => {
    expect(formatPetAge("2026-01-01", new Date("2026-05-22T12:00:00"))).toBe(
      "4 months old",
    );
  });
});
