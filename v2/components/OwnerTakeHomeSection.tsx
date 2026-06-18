// WS4b — the reports "Your take-home" section for an owner-operator (own-facility)
// org. Replaces "Salon payouts" when the org has an owned location. Owner framing
// only: Collected (fees + tips), Costs, Your take-home — no "salon keeps", no
// payout, no split percentage. Pure presentation; the math lives in
// lib/ownerEconomics.ts.

import { formatMoney } from "@/lib/format";
import type { OwnerTakeHome, OwnerTakeHomeView } from "@/lib/ownerEconomics";

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

function LocationCard({
  location,
  isWholeMonth,
}: {
  location: OwnerTakeHome;
  isWholeMonth: boolean;
}) {
  return (
    <li className="rounded-xl border border-line bg-surface px-4 py-3 shadow-soft">
      <p className="font-semibold text-ink">{location.locationName}</p>
      <div className="mt-2">
        <Row label="Fees" value={formatMoney(location.fees)} />
        <Row label="Tips" value={formatMoney(location.tips)} />
        <Row label="Collected" value={formatMoney(location.collected)} strong />

        {!isWholeMonth ? (
          <p className="mt-2 text-xs text-ink-faint">
            Pick a single month to see take-home.
          </p>
        ) : location.hasExpensesOnFile ? (
          <>
            <div className="mt-2 border-t border-line pt-2">
              {location.expenseLines.map((line) => (
                <Row
                  key={line.key}
                  label={line.label}
                  value={`− ${formatMoney(line.amount)}`}
                  muted
                />
              ))}
              <Row
                label="Total costs"
                value={`− ${formatMoney(location.totalExpenses)}`}
              />
            </div>
            <div className="mt-2 border-t border-line pt-2">
              <Row
                label="Your take-home"
                value={formatMoney(location.takeHome ?? 0)}
                strong
              />
            </div>
          </>
        ) : (
          <p className="mt-2 text-xs text-ink-faint">
            Add your monthly costs in Settings to see take-home.
          </p>
        )}
      </div>
    </li>
  );
}

export function OwnerTakeHomeSection({ view }: { view: OwnerTakeHomeView }) {
  return (
    <section className="mt-7">
      <h2 className="tt-eyebrow">
        Your take-home
      </h2>
      {view.locations.length === 0 ? (
        <p className="mt-2 text-sm text-ink-faint">
          No owned-location economics on file yet.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {view.locations.map((location) => (
            <LocationCard
              key={location.locationName}
              location={location}
              isWholeMonth={view.isWholeMonth}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
