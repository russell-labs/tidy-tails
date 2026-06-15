// Loose location matching — resolve the operator's SPOKEN location to one of the
// org's CONFIGURED locations, so the assistant never demands exact wording.
//
// Pure (no I/O), deterministic, and dependency-free so it is trivially testable
// and safe to import on the agent path. The agent's propose tools use it to turn
// "Gina's" / "the salon" / a street fragment into a real configured location
// NAME; the gated write action still re-validates that name against the org's
// locations (isOrgLocation), so loose matching never widens what can be written.
//
// Contract: it RESOLVES or it ASKS — it never guesses. More than one plausible
// fit returns `ambiguous` (the caller lists them); nothing plausible returns
// `none` (the caller lists all options and asks).

export type LocationOption = { name: string; address?: string | null };

export type LocationMatchResult =
  | { kind: "matched"; name: string }
  | { kind: "none" }
  | { kind: "ambiguous"; names: string[] };

// Words that carry no identifying signal — dropped before token comparison so
// "the salon" compares on "salon", and an address fragment compares on its
// street words, not on "the"/"at"/"place".
const STOPWORDS = new Set([
  "the", "a", "an", "at", "in", "on", "to", "of", "my", "our", "his", "her",
  "place", "location", "spot", "shop", "store", "and", "for",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "") // drop apostrophes so "gina's" → "ginas"
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fold a singular/possessive trailing "s" so the stem the model often passes
 * matches the configured name: "gina" / "gina's" (→ "ginas") / "ginas" all compare
 * equal to "Gina's". Only on tokens long enough that the trailing "s" is a
 * possessive/plural, not part of a short word (so "st", "is" are left alone).
 */
function stem(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function contentTokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 0 && !STOPWORDS.has(token))
    .map(stem);
}

/**
 * Resolve a free-text location against the org's configured locations.
 *
 * Token-set containment (NOT mere word overlap — a single shared generic word
 * like "studio" is not enough). A location is a candidate when:
 *   - every content word the operator said names this location — it appears in
 *     the location's name OR address ("the salon" → "Gina's Salon"; "the King
 *     Street place" → the location at 12 King Street); OR
 *   - the spoken phrase contains the full configured name (a more specific ask).
 * A distinguishing word that fits no location rules it out ("Old Studio" does not
 * resolve to "Home Studio"), so the caller asks instead of silently redirecting.
 *
 * Exactly one candidate → matched; more than one → ambiguous (caller lists them);
 * none → none (caller lists all options and asks). It resolves or it asks — never
 * a guess.
 */
export function resolveLocationLoosely(
  input: string,
  locations: readonly LocationOption[],
): LocationMatchResult {
  const query = normalize(input);
  if (!query || locations.length === 0) return { kind: "none" };

  // Exact normalized name wins outright — even when that name is also a token of
  // a longer sibling location's name.
  const exact = locations.filter((location) => normalize(location.name) === query);
  if (exact.length === 1) return { kind: "matched", name: exact[0].name };

  const queryTokens = contentTokens(input);
  if (queryTokens.length === 0) return { kind: "none" };

  const candidates = locations.filter((location) => {
    const nameTokens = contentTokens(location.name);
    const locationTokens = new Set([
      ...nameTokens,
      ...contentTokens(location.address ?? ""),
    ]);
    const everySpokenWordNamesThis = queryTokens.every((token) =>
      locationTokens.has(token),
    );
    const spokenPhraseContainsTheName =
      nameTokens.length > 0 && nameTokens.every((token) => queryTokens.includes(token));
    return everySpokenWordNamesThis || spokenPhraseContainsTheName;
  });

  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length === 1) return { kind: "matched", name: candidates[0].name };
  return { kind: "ambiguous", names: candidates.map((location) => location.name) };
}
