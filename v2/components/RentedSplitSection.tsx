// WS4c B1 — the reports "Rented-chair split" section for a one_to_one / hybrid
// org. Shows alongside (not instead of) the WS4b "Your take-home" section, so a
// hybrid groomer sees BOTH their owned-facility take-home AND the rented chair's
// salon cut. Fee-side only: nail trims are kept 100% (B3) and tips are not split
// here (B2 deferred). Pure presentation; the math lives in lib/rentedEconomics.ts.

import { formatMoney } from "@/lib/format";
import type { RentedSplit, RentedSplitView } from "@/lib/rentedEconomics";

function Row({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className={`text-sm ${muted ? "text-ink-faint" : "text-ink-soft"}`}>
        {label}
      </span>
      <span
        className={`tabular-nums ${
          strong ? "text-base font-bold text-ink" : "text-sm text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function cutLabel(location: RentedSplit): string {
  if (location.payoutType === "daily_rate") {
    return location.dailyRate != null
      ? `Salon daily rate ($${location.dailyRate}/day)`
      : "Salon daily rate";
  }
  const base = `Salon keeps ${location.salonKeepsPercent}%`;
  return location.nailTrimFees > 0 ? `${base} (ex. nail trims)` : base;
}

function LocationCard({ location }: { location: RentedSplit }) {
  return (
    <li className="rounded-xl border border-line bg-surface px-4 py-3 shadow-soft">
      <p className="font-semibold text-ink">{location.locationName}</p>
      <div className="mt-2">
        <Row label="Fees" value={formatMoney(location.fees)} />
        <Row label={cutLabel(location)} value={`− ${formatMoney(location.salonCut)}`} />
        <div className="mt-2 border-t border-line pt-2">
          <Row label="You keep (fees)" value={formatMoney(location.feesKept)} strong />
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        Fee split only — tips aren&apos;t split here
        {location.nailTrimFees > 0 ? ", and nail trims are kept 100%" : ""}.
      </p>
    </li>
  );
}

export function RentedSplitSection({ view }: { view: RentedSplitView }) {
  if (view.locations.length === 0) return null;
  return (
    <section className="mt-7">
      <h2 className="tt-eyebrow">
        Rented-chair split
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {view.locations.map((location) => (
          <LocationCard key={location.locationName} location={location} />
        ))}
      </ul>
    </section>
  );
}
