import { describe, expect, it } from "vitest";
import { resolveLocationLoosely } from "./locationMatch";

// A loose matcher resolves the operator's SPOKEN location ("Gina's", "the salon",
// an address fragment) to one of the org's CONFIGURED locations — so the agent
// never demands exact text. It must disambiguate (list, never guess) when more
// than one location plausibly fits, and report "none" when nothing matches so the
// caller can show the options and ask.

const LOCATIONS = [
  { name: "Gina's Salon", address: "12 King Street, Barrie" },
  { name: "Home Studio", address: "5 Maple Avenue, Orillia" },
];

describe("resolveLocationLoosely", () => {
  it("matches an exact configured name (case-insensitive)", () => {
    expect(resolveLocationLoosely("home studio", LOCATIONS)).toEqual({
      kind: "matched",
      name: "Home Studio",
    });
  });

  it("matches a possessive shorthand to the configured name ('Gina's' → Gina's Salon)", () => {
    expect(resolveLocationLoosely("Gina's", LOCATIONS)).toEqual({
      kind: "matched",
      name: "Gina's Salon",
    });
  });

  it("matches a generic word ('the salon') when only one location fits", () => {
    expect(resolveLocationLoosely("the salon", LOCATIONS)).toEqual({
      kind: "matched",
      name: "Gina's Salon",
    });
  });

  it("matches on an address fragment", () => {
    expect(resolveLocationLoosely("the King Street place", LOCATIONS)).toEqual({
      kind: "matched",
      name: "Gina's Salon",
    });
  });

  it("is ambiguous (lists the options) when a generic word fits more than one", () => {
    const twoSalons = [
      { name: "North Salon", address: "1 A St" },
      { name: "South Salon", address: "2 B St" },
    ];
    const result = resolveLocationLoosely("the salon", twoSalons);
    expect(result.kind).toBe("ambiguous");
    if (result.kind !== "ambiguous") throw new Error("expected ambiguous");
    expect(result.names.sort()).toEqual(["North Salon", "South Salon"]);
  });

  it("returns none when nothing plausibly matches (caller lists options and asks)", () => {
    expect(resolveLocationLoosely("the airport", LOCATIONS)).toEqual({ kind: "none" });
  });

  it("does not match when a distinguishing word rules the location out ('Old Studio' ≠ 'Home Studio')", () => {
    // A shared generic word ('studio') is not enough — 'old' contradicts 'home',
    // so the matcher asks rather than silently redirecting to the wrong place.
    expect(
      resolveLocationLoosely("Old Studio", [{ name: "Home Studio", address: "1 Bay St" }]),
    ).toEqual({ kind: "none" });
  });

  it("returns none for empty input", () => {
    expect(resolveLocationLoosely("   ", LOCATIONS)).toEqual({ kind: "none" });
  });

  it("returns none when the org has no configured locations", () => {
    expect(resolveLocationLoosely("Gina's", [])).toEqual({ kind: "none" });
  });
});
