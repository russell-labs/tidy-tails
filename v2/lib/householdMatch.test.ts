import { describe, expect, it } from "vitest";
import { appointment, client, pet } from "@/lib/actions/actionTestSupport";
import {
  resolveHouseholdLoosely,
  resolvePetWithinHousehold,
} from "./householdMatch";

// The write-side resolvers turn the natural attributes the model carries (a
// household NAME + optional phone, a pet NAME) into authoritative ids, sharing
// the same matcher find_household uses so reads and writes never disagree. They
// resolve or they ask — never guess: a tie at the top match-quality tier is
// ambiguous, not silently auto-picked (so an active-pet score bonus can't choose
// one same-name household over another).

describe("resolveHouseholdLoosely", () => {
  it("matches an exact full name to its client id", () => {
    const clients = [
      client({ id: "c1", first_name: "Maple", last_name: "Greenwood" }),
      client({ id: "c2", first_name: "Joan", last_name: "Campbell" }),
    ];
    expect(resolveHouseholdLoosely({ name: "Maple Greenwood" }, clients, [])).toEqual({
      kind: "matched",
      clientId: "c1",
    });
  });

  it("tolerates a one-character typo in the household name (single fuzzy hit)", () => {
    const clients = [
      client({ id: "c1", first_name: "Maple", last_name: "Greenwood" }),
      client({ id: "c2", first_name: "Joan", last_name: "Campbell" }),
    ];
    expect(resolveHouseholdLoosely({ name: "Greenwod" }, clients, [])).toEqual({
      kind: "matched",
      clientId: "c1",
    });
  });

  it("asks (ambiguous) for two same-name households — never auto-picks the one with an active pet", () => {
    const clients = [
      client({ id: "c1", first_name: "Al", last_name: "Smith" }),
      client({ id: "c2", first_name: "Bea", last_name: "Smith" }),
    ];
    // c1 has an active pet with history (higher score via the active-pet bonus);
    // c2 has none. Ruling off quality tier, both are EXACT on last name → ask.
    const pets = [pet({ id: "p1", client_id: "c1", name: "Rex" })];
    const appts = [appointment({ id: "a1", client_id: "c1", pet_id: "p1" })];
    const result = resolveHouseholdLoosely({ name: "Smith" }, clients, pets);
    void appts;
    expect(result.kind).toBe("ambiguous");
    if (result.kind !== "ambiguous") throw new Error("expected ambiguous");
    expect(result.options.map((o) => o.clientId).sort()).toEqual(["c1", "c2"]);
  });

  it("resolves the exact name over a prefix sibling ('Smith' beats 'Smithson')", () => {
    const clients = [
      client({ id: "c1", first_name: "Al", last_name: "Smith" }),
      client({ id: "c2", first_name: "Bea", last_name: "Smithson" }),
    ];
    expect(resolveHouseholdLoosely({ name: "Smith" }, clients, [])).toEqual({
      kind: "matched",
      clientId: "c1",
    });
  });

  it("uses a phone to disambiguate two same-name households", () => {
    const clients = [
      client({ id: "c1", first_name: "Al", last_name: "Smith", phone: "7055550111" }),
      client({ id: "c2", first_name: "Bea", last_name: "Smith", phone: "7055550222" }),
    ];
    expect(
      resolveHouseholdLoosely({ name: "Smith", phone: "705-555-0222" }, clients, []),
    ).toEqual({ kind: "matched", clientId: "c2" });
  });

  it("resolves the household from a pet name", () => {
    const clients = [
      client({ id: "c1", first_name: "Al", last_name: "Smith" }),
      client({ id: "c2", first_name: "Bea", last_name: "Jones" }),
    ];
    const pets = [pet({ id: "p1", client_id: "c2", name: "Biscuit" })];
    expect(resolveHouseholdLoosely({ name: "Biscuit" }, clients, pets)).toEqual({
      kind: "matched",
      clientId: "c2",
    });
  });

  it("returns none when no household plausibly matches", () => {
    const clients = [client({ id: "c1", first_name: "Al", last_name: "Smith" })];
    expect(resolveHouseholdLoosely({ name: "Nobody Here" }, clients, [])).toEqual({
      kind: "none",
    });
  });

  it("returns none for an empty name", () => {
    const clients = [client({ id: "c1" })];
    expect(resolveHouseholdLoosely({ name: "   " }, clients, [])).toEqual({ kind: "none" });
  });
});

describe("resolvePetWithinHousehold", () => {
  it("matches a single pet by name to its id", () => {
    const pets = [pet({ id: "p1", client_id: "c1", name: "Kiwi" })];
    const result = resolvePetWithinHousehold("Kiwi", pets, []);
    expect(result.kind).toBe("matched");
    if (result.kind !== "matched") throw new Error("expected matched");
    expect(result.petId).toBe("p1");
    expect(result.groupPetIds).toEqual(["p1"]);
  });

  it("collapses split-duplicate rows (Coco/Coco) to one match carrying both ids", () => {
    const pets = [
      pet({ id: "p1", client_id: "c1", name: "Coco", breed: "Poodle" }),
      pet({ id: "p2", client_id: "c1", name: "Coco", breed: "Poodle" }),
    ];
    const appts = [appointment({ id: "a2", client_id: "c1", pet_id: "p2", date: "2026-07-01" })];
    const result = resolvePetWithinHousehold("Coco", pets, appts);
    expect(result.kind).toBe("matched"); // one animal, not "ambiguous"
    if (result.kind !== "matched") throw new Error("expected matched");
    expect(result.groupPetIds.sort()).toEqual(["p1", "p2"]); // both rows carried for appt lookup
  });

  it("asks when two distinct pets share the spoken name (different breeds)", () => {
    const pets = [
      pet({ id: "p1", client_id: "c1", name: "Bella", breed: "Lab" }),
      pet({ id: "p2", client_id: "c1", name: "Bella", breed: "Beagle" }),
    ];
    const result = resolvePetWithinHousehold("Bella", pets, []);
    expect(result.kind).toBe("ambiguous");
  });

  it("returns none when no pet matches", () => {
    const pets = [pet({ id: "p1", client_id: "c1", name: "Kiwi" })];
    expect(resolvePetWithinHousehold("Rex", pets, [])).toEqual({ kind: "none" });
  });

  // TT — single-dog auto-resolve. A household with exactly ONE dog should not be
  // asked "which dog?" when the operator refers to it generically ("the dog").
  it("auto-resolves the household's only dog for a generic 'the dog' reference", () => {
    const pets = [pet({ id: "p1", client_id: "c1", name: "Test" })];
    const result = resolvePetWithinHousehold("the dog", pets, []);
    expect(result.kind).toBe("matched");
    if (result.kind !== "matched") throw new Error("expected matched");
    expect(result.petId).toBe("p1");
    expect(result.groupPetIds).toEqual(["p1"]);
  });

  it("auto-resolves the only dog for other generic references", () => {
    const pets = [pet({ id: "p1", client_id: "c1", name: "Test" })];
    for (const query of ["the household's dog", "their dog", "the puppy", "dog", "the only dog"]) {
      const result = resolvePetWithinHousehold(query, pets, []);
      expect(result.kind, `query=${JSON.stringify(query)}`).toBe("matched");
      if (result.kind !== "matched") throw new Error("expected matched");
      expect(result.petId).toBe("p1");
    }
  });

  // An empty/unspecified name is NOT a generic reference — it must ask, not
  // silently resolve to the lone dog (every caller passes a required name).
  it("returns none for an empty name even when the household has one dog", () => {
    const pets = [pet({ id: "p1", client_id: "c1", name: "Test" })];
    expect(resolvePetWithinHousehold("", pets, [])).toEqual({ kind: "none" });
    expect(resolvePetWithinHousehold("   ", pets, [])).toEqual({ kind: "none" });
  });

  // The guardrail: a SPECIFIC name that doesn't match must NOT silently resolve to
  // the lone dog — that would book the wrong (or a brand-new) dog. Still none.
  it("does NOT auto-resolve a specific non-matching name even with one dog on file", () => {
    const pets = [pet({ id: "p1", client_id: "c1", name: "Test" })];
    expect(resolvePetWithinHousehold("Bandit", pets, [])).toEqual({ kind: "none" });
  });

  // A generic reference is only unambiguous when there is exactly one dog. With two
  // distinct dogs, "the dog" must not auto-pick one.
  it("does NOT auto-resolve 'the dog' when the household has two distinct dogs", () => {
    const pets = [
      pet({ id: "p1", client_id: "c1", name: "Coco" }),
      pet({ id: "p2", client_id: "c1", name: "Kiwi" }),
    ];
    expect(resolvePetWithinHousehold("the dog", pets, []).kind).not.toBe("matched");
  });
});
