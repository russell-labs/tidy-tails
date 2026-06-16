import { describe, it, expect } from "vitest";
import {
  MATCH_QUALITY,
  searchHouseholds,
  type SearchHousehold,
  type SearchResult,
} from "./search";

// Controlled fixtures — deliberately include two households with a pet named
// "Bella" and one with the near-name "Bela" so disambiguation and fuzzy
// ranking can be asserted precisely.

const albright: SearchHousehold = {
  id: "h-albright",
  firstName: "Maya",
  lastName: "Albright",
  phone: "705-555-0118",
  pets: [{ id: "pt-biscuit", name: "Biscuit" }],
};
const brandt: SearchHousehold = {
  id: "h-brandt",
  firstName: "Theo",
  lastName: "Brandt",
  phone: "705-555-0147",
  pets: [
    { id: "pt-bella-brandt", name: "Bella" },
    { id: "pt-pepper", name: "Pepper" },
  ],
};
const reyes: SearchHousehold = {
  id: "h-reyes",
  firstName: "Camila",
  lastName: "Reyes",
  phone: "705-555-0179",
  pets: [{ id: "pt-bella-reyes", name: "Bella" }],
};
const coleman: SearchHousehold = {
  id: "h-coleman",
  firstName: "Sam",
  lastName: "Coleman",
  phone: "705-555-0200",
  pets: [{ id: "pt-marco", name: "Marco" }],
};
const campbell: SearchHousehold = {
  id: "h-campbell",
  firstName: "Joan",
  lastName: "Campbell",
  phone: "705-555-0222",
  pets: [],
};
const darlow: SearchHousehold = {
  id: "h-darlow",
  firstName: "Ed",
  lastName: "Darlow",
  phone: "705-555-0233",
  pets: [{ id: "pt-bela", name: "Bela" }],
};
const zane: SearchHousehold = {
  id: "h-zane",
  firstName: "Mira",
  lastName: "Zane",
  phone: "705-555-0244",
  pets: [{ id: "pt-bella-zane", name: "Bella", passedAway: true }],
};

const ALL = [albright, brandt, reyes, coleman, campbell, darlow, zane];
const ids = (rs: SearchResult[]) => rs.map((r) => r.household.id);

describe("searchHouseholds — match quality tier", () => {
  // The write-side resolver decides matched/ambiguous off the binding match
  // QUALITY of each result (so a score bonus like an active pet can't silently
  // pick one same-name household over another). Each result reports the weakest
  // token's best quality — the strength that actually bound the match.
  it("reports EXACT for an exact owner-name match and FUZZY for a one-char typo", () => {
    const exact = searchHouseholds("Reyes", ALL).find((r) => r.household.id === "h-reyes");
    const fuzzy = searchHouseholds("Reyez", ALL).find((r) => r.household.id === "h-reyes");
    expect(exact?.quality).toBe(MATCH_QUALITY.EXACT);
    expect(fuzzy?.quality).toBe(MATCH_QUALITY.FUZZY);
  });
});

describe("searchHouseholds — empty and short queries", () => {
  it("returns every household, alphabetical by last name, for an empty query", () => {
    expect(ids(searchHouseholds("", ALL))).toEqual([
      "h-albright",
      "h-brandt",
      "h-campbell",
      "h-coleman",
      "h-darlow",
      "h-reyes",
      "h-zane",
    ]);
  });

  it("treats a whitespace-only query as empty", () => {
    expect(ids(searchHouseholds("   ", ALL))).toEqual(ids(searchHouseholds("", ALL)));
  });

  it("filters on a single-character query — there is no minimum length", () => {
    const out = ids(searchHouseholds("b", ALL));
    expect(out).toContain("h-brandt");
    expect(out).not.toContain("h-coleman"); // no 'b' in Coleman / Sam / Marco
  });
});

describe("searchHouseholds — owner name", () => {
  it("matches an owner first name", () => {
    expect(ids(searchHouseholds("Maya", ALL))).toEqual(["h-albright"]);
  });

  it("matches an owner last name, case-insensitively", () => {
    expect(ids(searchHouseholds("brandt", ALL))).toEqual(["h-brandt"]);
  });

  it("matches when every token hits the household (AND semantics)", () => {
    expect(ids(searchHouseholds("maya albright", ALL))).toEqual(["h-albright"]);
  });

  it("returns nothing when one token of a multi-token query does not match", () => {
    expect(searchHouseholds("maya brandt", ALL)).toEqual([]);
  });

  it("flags the matched field as owner", () => {
    expect(searchHouseholds("Maya", ALL)[0].matchedFields).toContain("owner");
  });
});

describe("searchHouseholds — phone", () => {
  it("matches a phone-number fragment", () => {
    expect(ids(searchHouseholds("0118", ALL))).toEqual(["h-albright"]);
  });

  it("matches a fully formatted phone number", () => {
    expect(ids(searchHouseholds("705-555-0179", ALL))).toEqual(["h-reyes"]);
  });

  it("flags the matched field as phone", () => {
    expect(searchHouseholds("0179", ALL)[0].matchedFields).toContain("phone");
  });
});

describe("searchHouseholds — pet name", () => {
  it("matches a pet name", () => {
    expect(ids(searchHouseholds("Biscuit", ALL))).toEqual(["h-albright"]);
  });

  it("reports which pet matched", () => {
    const r = searchHouseholds("Biscuit", ALL)[0];
    expect(r.matchedPetIds).toEqual(["pt-biscuit"]);
    expect(r.matchedFields).toContain("pet");
  });

  it("matches a pet name on any pet in the household", () => {
    expect(searchHouseholds("Pepper", ALL)[0].matchedPetIds).toEqual(["pt-pepper"]);
  });

  it("matches an owner token and a pet token together", () => {
    const r = searchHouseholds("theo bella", ALL);
    expect(ids(r)).toEqual(["h-brandt"]);
    expect(r[0].matchedPetIds).toEqual(["pt-bella-brandt"]);
  });
});

describe("searchHouseholds — partial and fuzzy", () => {
  it("matches an owner-name prefix", () => {
    expect(ids(searchHouseholds("alb", ALL))).toEqual(["h-albright"]);
  });

  it("matches a substring inside a pet name", () => {
    expect(ids(searchHouseholds("epp", ALL))).toEqual(["h-brandt"]);
  });

  it("tolerates a one-character typo in an owner name", () => {
    expect(ids(searchHouseholds("brandr", ALL))).toEqual(["h-brandt"]);
  });

  it("tolerates a dropped letter in a pet name", () => {
    expect(ids(searchHouseholds("biscut", ALL))).toEqual(["h-albright"]);
  });

  it("does not fuzzy-match very short tokens", () => {
    // "cat" is 3 chars — too short to fuzzy onto any name; no false positive
    expect(searchHouseholds("cat", ALL)).toEqual([]);
  });
});

describe("searchHouseholds — common pet-name disambiguation", () => {
  it("returns each household that holds a pet with the shared name", () => {
    const out = ids(searchHouseholds("Bella", ALL));
    expect(out).toContain("h-brandt");
    expect(out).toContain("h-reyes");
  });

  it("ranks the exact-name households ahead of a fuzzy neighbour", () => {
    // Darlow's "Bela" is a fuzzy hit; the two exact "Bella" households lead.
    const out = ids(searchHouseholds("Bella", ALL));
    expect(out.slice(0, 2)).toEqual(["h-brandt", "h-reyes"]);
  });

  it("identifies the specific matched pet in each household", () => {
    const out = searchHouseholds("Bella", ALL);
    const brandtResult = out.find((r) => r.household.id === "h-brandt")!;
    const reyesResult = out.find((r) => r.household.id === "h-reyes")!;
    expect(brandtResult.matchedPetIds).toEqual(["pt-bella-brandt"]);
    expect(reyesResult.matchedPetIds).toEqual(["pt-bella-reyes"]);
  });

  it("ranks living pets ahead of passed-away pets when names are identical", () => {
    const out = ids(searchHouseholds("Bella", ALL));
    expect(out.indexOf("h-brandt")).toBeLessThan(out.indexOf("h-zane"));
    expect(out.indexOf("h-reyes")).toBeLessThan(out.indexOf("h-zane"));
  });
});

describe("searchHouseholds — ranking", () => {
  it("ranks a prefix match above a substring match", () => {
    // "bell" prefixes pet "Bella" (Brandt) but is only a substring of "Campbell"
    const out = ids(searchHouseholds("bell", ALL));
    expect(out.indexOf("h-brandt")).toBeLessThan(out.indexOf("h-campbell"));
  });

  it("ranks an exact match above a fuzzy match", () => {
    // "bella" is the exact pet name in Brandt/Reyes; a fuzzy hit on "Bela" in Darlow
    const out = ids(searchHouseholds("bella", ALL));
    expect(out.indexOf("h-brandt")).toBeLessThan(out.indexOf("h-darlow"));
    expect(out.indexOf("h-reyes")).toBeLessThan(out.indexOf("h-darlow"));
  });

  it("breaks score ties alphabetically by last name", () => {
    // Brandt and Reyes both hold an exact pet "Bella"
    const out = ids(searchHouseholds("bella", ALL));
    expect(out.indexOf("h-brandt")).toBeLessThan(out.indexOf("h-reyes"));
  });
});

describe("searchHouseholds — no match", () => {
  it("returns an empty array when nothing matches", () => {
    expect(searchHouseholds("zzzzzz", ALL)).toEqual([]);
  });
});
