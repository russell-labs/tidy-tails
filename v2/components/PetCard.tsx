import Link from "next/link";
import type { Appointment, Pet, Vaccination } from "@/lib/data/types";
import { petVaccinationState } from "@/lib/derive";
import { formatMoney, relativeDate } from "@/lib/format";
import { isPetPassedAway } from "@/lib/petLifecycle";
import { AllergyAlert } from "./AllergyAlert";
import { StatusPill } from "./StatusPill";

function describe(pet: Pet): string {
  const parts = [pet.breed, pet.sex === "M" ? "Male" : pet.sex === "F" ? "Female" : null, pet.color];
  return parts.filter(Boolean).join(" · ") || "Details not recorded";
}

export function PetCard({
  pet,
  clientId,
  vaccinations,
  lastVisit,
  recordCount = 1,
}: {
  pet: Pet;
  clientId: string;
  vaccinations: Vaccination[];
  lastVisit: Appointment | null;
  recordCount?: number;
}) {
  const vaxState = petVaccinationState(vaccinations);
  const displayFee = pet.typical_fee ?? lastVisit?.price ?? null;
  const passedAway = isPetPassedAway(pet);

  return (
    <Link
      href={`/clients/${clientId}/pets/${pet.id}`}
      className="block rounded-2xl border border-line bg-surface p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-ink">{pet.name}</h3>
          <p className="text-sm text-ink-soft">{describe(pet)}</p>
        </div>
        <span className="mt-1 shrink-0 text-ink-faint" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </div>

      {pet.allergies ? (
        <div className="mt-3">
          <AllergyAlert detail={pet.allergies_detail} />
        </div>
      ) : null}

      {pet.grooming_notes ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Grooming notes
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink">
            {pet.grooming_notes}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {passedAway ? (
          <StatusPill tone="neutral">Passed away</StatusPill>
        ) : vaxState === "expired" ? (
          <StatusPill tone="danger">Vaccine expired</StatusPill>
        ) : vaxState === "expiring" ? (
          <StatusPill tone="warn">Vaccine expiring</StatusPill>
        ) : vaxState === "current" ? (
          <StatusPill tone="ok">Vaccines current</StatusPill>
        ) : (
          <StatusPill tone="neutral">No vaccine records</StatusPill>
        )}
        {displayFee != null ? (
          <span className="text-xs text-ink-soft">
            Typical fee{" "}
            <span className="font-semibold text-ink">
              {formatMoney(displayFee)}
            </span>
            {pet.typical_fee == null ? " from history" : ""}
          </span>
        ) : null}
        {lastVisit ? (
          <span className="text-xs text-ink-soft">
            Last groom {relativeDate(lastVisit.date)}
          </span>
        ) : null}
        {recordCount > 1 ? (
          <span className="text-xs font-semibold text-warn">
            {recordCount} records combined
          </span>
        ) : null}
      </div>
    </Link>
  );
}
