import type { Vaccination } from "@/lib/data/types";
import { vaccinationState } from "@/lib/derive";
import { formatDate, relativeDate } from "@/lib/format";
import { StatusPill } from "./StatusPill";

export function VaccinationList({
  vaccinations,
}: {
  vaccinations: Vaccination[];
}) {
  if (vaccinations.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        No vaccination records on file for this pet.
      </p>
    );
  }

  const sorted = [...vaccinations].sort((a, b) =>
    a.expires_at.localeCompare(b.expires_at),
  );

  // One calm card with hairline-divided rows — mirrors the Details list on the
  // pet profile and the approved redesign mockup. Each row keeps its safety
  // status pill (amber expiring / red expired / green current).
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {sorted.map((v) => {
        const state = vaccinationState(v);
        return (
          <li
            key={v.id}
            className="flex items-center justify-between gap-3 px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <p className="font-semibold text-ink">{v.vaccine_type}</p>
              <p className="text-xs text-ink-soft">
                {state === "expired" ? "Expired" : "Expires"} {formatDate(v.expires_at)}
                {" · "}
                {relativeDate(v.expires_at)}
              </p>
            </div>
            {state === "expired" ? (
              <StatusPill tone="danger">Expired</StatusPill>
            ) : state === "expiring" ? (
              <StatusPill tone="warn">Expiring soon</StatusPill>
            ) : (
              <StatusPill tone="ok">Current</StatusPill>
            )}
          </li>
        );
      })}
    </ul>
  );
}
