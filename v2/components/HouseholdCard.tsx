import Link from "next/link";
import { formatMoney, formatPhone, relativeDate } from "@/lib/format";

// View-model for a search result card. A "household" is one client and all
// their pets (PRD §1.1). Built server-side in app/(app)/page.tsx; the per-pet
// "usual" facts are derived from appointment history, never stored.

export type PetCardData = {
  id: string;
  name: string;
  breed: string | null;
  allergies: boolean;
  lastVisit: string | null; // ISO date
  usualService: string | null;
  usualPrice: number | null;
  passedAway?: boolean;
};

export type HouseholdCardData = {
  id: string;
  firstName: string;
  lastName: string;
  name: string; // full name
  phone: string;
  lastVisit: string | null; // most recent visit across all pets, ISO date
  pets: PetCardData[];
};

function PetRow({ pet, matched }: { pet: PetCardData; matched: boolean }) {
  // Booking context — show only what is known ("usual price/duration, if
  // known" — PRD §1.1). Duration is not in the data model, so it is omitted.
  const facts = [
    pet.usualService,
    pet.usualPrice != null ? `~${formatMoney(pet.usualPrice)}` : null,
    pet.lastVisit ? `Last ${relativeDate(pet.lastVisit)}` : null,
  ].filter(Boolean);

  return (
    <li className={matched ? "rounded-lg bg-brand-soft px-3 py-2" : "px-3 py-2"}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-ink">
          {pet.name}
          {pet.breed ? (
            <span className="font-normal text-ink-soft"> · {pet.breed}</span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {matched ? (
            <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">
              Match
            </span>
          ) : null}
          {pet.allergies ? (
            <span className="flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger-ink">
              <span
                className="h-1.5 w-1.5 rounded-full bg-danger"
                aria-hidden="true"
              />
              Allergy
            </span>
          ) : null}
        </div>
      </div>
      {facts.length > 0 ? (
        <p className="mt-0.5 truncate text-xs text-ink-soft">
          {facts.join(" · ")}
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-ink-faint">No visits recorded yet</p>
      )}
    </li>
  );
}

export function HouseholdCard({
  household,
  matchedPetIds,
}: {
  household: HouseholdCardData;
  matchedPetIds: string[];
}) {
  const matched = new Set(matchedPetIds);
  // The pet Sam searched for leads the card; the rest of the household follows.
  const pets = [...household.pets].sort(
    (a, b) => Number(matched.has(b.id)) - Number(matched.has(a.id)),
  );
  const petCount = household.pets.length;

  return (
    <Link
      href={`/clients/${household.id}`}
      className="block rounded-2xl border border-line bg-surface p-4 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-base font-bold text-ink">
          {household.name}
        </span>
        <span className="shrink-0 text-sm font-medium text-brand">
          {formatPhone(household.phone)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink-faint">
        {petCount === 0
          ? "No pets on file"
          : `${petCount} ${petCount === 1 ? "pet" : "pets"}`}
        {household.lastVisit
          ? ` · Last groom ${relativeDate(household.lastVisit)}`
          : ""}
      </p>

      {pets.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          {pets.map((pet) => (
            <PetRow key={pet.id} pet={pet} matched={matched.has(pet.id)} />
          ))}
        </ul>
      ) : null}
    </Link>
  );
}
