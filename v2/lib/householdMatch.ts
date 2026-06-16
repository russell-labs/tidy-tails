// Loose, org-scoped resolution of a household + a pet from the NATURAL
// attributes the agent carries (a household name + optional phone/email, a pet
// name) — never a raw id. The model never supplies or round-trips an id; the
// propose tool resolves these to build the card and the confirm action
// re-resolves them authoritatively from the same attributes before any write.
//
// Pure (no I/O): the caller feeds the ORG-SCOPED clients/pets (loaded under RLS),
// so resolution can only ever land inside the operator's own org. It RESOLVES or
// it ASKS — never guesses: a tie at the top match-quality tier is `ambiguous`
// (the caller lists the options), nothing plausible is `none`.
//
// Households reuse searchHouseholds (the SAME matcher find_household uses) so a
// name that reads as one household resolves as that same household on write.
// Decisions key off each result's match-QUALITY tier, never its score, so a
// score bonus (e.g. an active pet) can't silently pick one same-name household.

import type { Appointment, Client, Pet } from "./data/types";
import {
  MATCH_QUALITY,
  searchHouseholds,
  textQuality,
  type SearchHousehold,
} from "./search";
import { groupPetsForDisplay } from "./derive";
import { fullName } from "./format";

export type HouseholdAttrs = {
  name: string;
  phone?: string | null;
};

export type HouseholdMatchResult =
  | { kind: "matched"; clientId: string }
  | { kind: "none" }
  | { kind: "ambiguous"; options: { clientId: string; label: string }[] };

export type PetMatchResult =
  | { kind: "matched"; petId: string; groupPetIds: string[] }
  | { kind: "none" }
  | { kind: "ambiguous"; options: { petId: string; name: string }[] };

function toSearchHousehold(client: Client, pets: Pet[]): SearchHousehold {
  return {
    id: client.id,
    firstName: client.first_name,
    lastName: client.last_name,
    phone: client.phone,
    pets: pets
      .filter((pet) => pet.client_id === client.id)
      .map((pet) => ({ id: pet.id, name: pet.name })),
  };
}

/**
 * Resolve a household from a name (+ optional phone) against the org's clients.
 * Phone is folded into the search query (searchHouseholds matches phone digits),
 * which both narrows and disambiguates two same-name households. (Email-based
 * disambiguation is a trivial follow-up once a propose tool exposes it; phone is
 * the disambiguator Sam actually uses.)
 */
export function resolveHouseholdLoosely(
  attrs: HouseholdAttrs,
  clients: Client[],
  pets: Pet[],
): HouseholdMatchResult {
  const name = (attrs.name ?? "").trim();
  if (!name) return { kind: "none" };

  const phone = (attrs.phone ?? "").trim();
  const query = [name, phone].filter(Boolean).join(" ");
  const households = clients.map((client) => toSearchHousehold(client, pets));
  const results = searchHouseholds(query, households);

  if (results.length === 0) return { kind: "none" };

  // Decide off the binding match-quality tier, never the (bonus-carrying) score:
  // the single strongest-tier result wins; a tie at the top tier is ambiguous.
  const topQuality = Math.max(...results.map((result) => result.quality));
  const top = results.filter((result) => result.quality === topQuality);
  if (top.length === 1) return { kind: "matched", clientId: top[0].household.id };
  return {
    kind: "ambiguous",
    options: top.map((result) => ({
      clientId: result.household.id,
      label: fullName(result.household.firstName, result.household.lastName),
    })),
  };
}

/**
 * Resolve a pet within an already-resolved household from its name. Split-
 * duplicate rows (Chloe/Chloe under one household) are collapsed via
 * groupPetsForDisplay — the SAME grouping the read screens use — so one animal
 * reads as one match, and the whole group's pet ids are returned so an
 * appointment filed under either row can still be found downstream.
 */
export function resolvePetWithinHousehold(
  petName: string,
  householdPets: Pet[],
  householdAppointments: Appointment[],
): PetMatchResult {
  const query = (petName ?? "").trim().toLowerCase();
  if (!query) return { kind: "none" };

  const groups = groupPetsForDisplay(householdPets, householdAppointments);
  const scored = groups
    .map((group) => ({
      group,
      // Best quality across the group's member rows (split duplicates share a name).
      quality: Math.max(
        ...group.pets.map((pet) => textQuality(query, pet.name.trim().toLowerCase())),
      ),
    }))
    .filter((candidate) => candidate.quality > MATCH_QUALITY.NO_MATCH);

  if (scored.length === 0) return { kind: "none" };

  const topQuality = Math.max(...scored.map((candidate) => candidate.quality));
  const top = scored.filter((candidate) => candidate.quality === topQuality);
  if (top.length === 1) {
    const group = top[0].group;
    return {
      kind: "matched",
      petId: group.pet.id,
      groupPetIds: group.pets.map((pet) => pet.id),
    };
  }
  return {
    kind: "ambiguous",
    options: top.map((candidate) => ({
      petId: candidate.group.pet.id,
      name: candidate.group.pet.name,
    })),
  };
}
