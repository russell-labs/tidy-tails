// Pure household search for the Call/Text → Identify → Book wedge (PRD §1.1, M3).
//
// Given a free-text clue — a phone number, an owner's first or last name, a pet
// name, or a partial/typo'd fragment of any of them — rank the households that
// match. A "household" is one client and all their pets. No data access, no
// React: this module is unit-tested in isolation (search.test.ts).

import { digitsOnly } from "./format";

export type SearchPet = {
  id: string;
  name: string;
  passedAway?: boolean;
};

export type SearchHousehold = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  pets: SearchPet[];
};

/** Which kind of field a query hit — drives result labelling in the UI. */
export type MatchField = "owner" | "phone" | "pet";

export type SearchResult = {
  household: SearchHousehold;
  /** Higher is a stronger match. Opaque ordering value — not for display. */
  score: number;
  matchedFields: MatchField[];
  /** Pets whose name matched the query — the data the UI needs to point at
   *  *which* "Bella" when a pet name is shared across households. */
  matchedPetIds: string[];
};

// Match-quality weights. Exact beats prefix beats substring beats fuzzy, so an
// exact "Bella" always outranks a fuzzy hit on a near-name like "Bela".
const EXACT = 100;
const PREFIX = 60;
const SUBSTRING = 40;
const FUZZY = 20;
const NO_MATCH = 0;
const ACTIVE_PET_BONUS = 5;

/** Levenshtein edit distance between `a` and `b`, abandoned once it exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const d = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr.push(d);
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1; // whole row past the cap — abandon
    prev = curr;
  }
  return prev[b.length];
}

// Typo tolerance scales with token length: short tokens are never fuzzed, since
// every 3-letter word sits one edit from many others.
function fuzzyBudget(tokenLength: number): number {
  if (tokenLength <= 3) return 0;
  if (tokenLength <= 7) return 1;
  return 2;
}

/** Best match quality of `token` against one (already lower-cased) field value. */
function textQuality(token: string, field: string): number {
  if (!field) return NO_MATCH;
  if (field === token) return EXACT;
  if (field.startsWith(token)) return PREFIX;
  if (field.includes(token)) return SUBSTRING;
  const budget = fuzzyBudget(token.length);
  if (budget > 0) {
    for (const word of field.split(/\s+/)) {
      if (word && editDistance(token, word, budget) <= budget) return FUZZY;
    }
  }
  return NO_MATCH;
}

/** Phone quality: an exact full-number match, or a digit-substring hit. */
function phoneQuality(tokenDigits: string, phoneDigits: string): number {
  if (tokenDigits.length < 2 || !phoneDigits) return NO_MATCH;
  if (phoneDigits === tokenDigits) return EXACT;
  if (phoneDigits.includes(tokenDigits)) return SUBSTRING;
  return NO_MATCH;
}

const FIELD_ORDER: MatchField[] = ["owner", "phone", "pet"];

/**
 * Rank `households` against a free-text `query`.
 *
 * An empty query returns every household, alphabetical by owner last name. A
 * non-empty query is split into tokens; a household is a result only when
 * *every* token matches one of its fields. Results are ordered by match
 * strength, ties broken alphabetically.
 */
export function searchHouseholds(
  query: string,
  households: SearchHousehold[],
): SearchResult[] {
  const byName = (a: SearchHousehold, b: SearchHousehold) =>
    a.lastName.localeCompare(b.lastName) ||
    a.firstName.localeCompare(b.firstName) ||
    a.id.localeCompare(b.id);

  const q = query.trim().toLowerCase();

  if (q === "") {
    return [...households].sort(byName).map((household) => ({
      household,
      score: 0,
      matchedFields: [],
      matchedPetIds: [],
    }));
  }

  const tokens = q.split(/\s+/);
  const results: SearchResult[] = [];

  for (const household of households) {
    const firstName = household.firstName.toLowerCase();
    const lastName = household.lastName.toLowerCase();
    const phoneDigits = digitsOnly(household.phone);
    const pets = household.pets.map((p) => ({
      id: p.id,
      name: p.name.toLowerCase(),
    }));

    let total = 0;
    let everyTokenMatched = true;
    const fields = new Set<MatchField>();
    const petIds = new Set<string>();

    for (const token of tokens) {
      let best = NO_MATCH;
      let bestField: MatchField | null = null;

      const owner = Math.max(
        textQuality(token, firstName),
        textQuality(token, lastName),
      );
      if (owner > best) {
        best = owner;
        bestField = "owner";
      }

      const phone = phoneQuality(digitsOnly(token), phoneDigits);
      if (phone > best) {
        best = phone;
        bestField = "phone";
      }

      let petBest = NO_MATCH;
      const tokenPetIds: string[] = [];
      for (const pet of pets) {
        const quality = textQuality(token, pet.name);
        if (quality > NO_MATCH) tokenPetIds.push(pet.id);
        if (quality > petBest) petBest = quality;
      }
      if (petBest > best) {
        best = petBest;
        bestField = "pet";
      }

      if (best === NO_MATCH) {
        everyTokenMatched = false;
        break;
      }

      total += best;
      if (bestField) fields.add(bestField);
      // Record pet hits whenever this token matched a pet, even if another
      // field scored higher — the UI still wants to point at the matched pet.
      if (petBest > NO_MATCH) {
        fields.add("pet");
        for (const id of tokenPetIds) petIds.add(id);
      }
    }

    if (!everyTokenMatched) continue;

    results.push({
      household,
      score:
        total +
        (household.pets.some((p) => petIds.has(p.id) && !p.passedAway)
          ? ACTIVE_PET_BONUS
          : 0),
      matchedFields: FIELD_ORDER.filter((f) => fields.has(f)),
      // Keep the household's own pet order.
      matchedPetIds: household.pets
        .filter((p) => petIds.has(p.id))
        .map((p) => p.id),
    });
  }

  return results.sort(
    (a, b) => b.score - a.score || byName(a.household, b.household),
  );
}
