"use client";

import { useActionState } from "react";
import {
  saveDayCloseoutOverride,
  type DayCloseoutState,
} from "@/lib/actions/dayCloseout";
import {
  PAID_BY_SALON_NOTE,
  paidBySalonCloseoutInput,
} from "@/lib/dayCloseout";
import { formatMoney } from "@/lib/format";
import type { DayLocationMoney } from "@/lib/locationFinance";

export function DayCloseoutControls({
  rows,
  locationLabels,
}: {
  rows: DayLocationMoney[];
  locationLabels: Record<string, string>;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="mb-2">
        <h3 className="tt-eyebrow">
          Day closeout
        </h3>
        <p className="mt-1 text-xs text-ink-soft">
          Override the salon payout after you do the end-of-day math.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <DayCloseoutForm
            key={`${row.date}-${row.location}`}
            row={row}
            locationLabel={locationLabels[row.location] ?? row.location}
          />
        ))}
      </div>
    </div>
  );
}

function DayCloseoutForm({
  row,
  locationLabel,
}: {
  row: DayLocationMoney;
  locationLabel: string;
}) {
  const [state, formAction, pending] = useActionState<
    DayCloseoutState,
    FormData
  >(saveDayCloseoutOverride, { status: "idle" });
  const hasOverride = Boolean(row.override);

  // TT-021: one-tap "paid by salon, I keep 100%". Submits a final_payout-0
  // override through the same action, so the salon cut is 0 without Sam
  // hand-entering a 0% override every rented-chair day.
  const [paidState, paidAction, paidPending] = useActionState<
    DayCloseoutState,
    FormData
  >(saveDayCloseoutOverride, { status: "idle" });
  const paid = paidBySalonCloseoutInput({
    date: row.date,
    location: row.location,
    calculatedPayout: row.calculatedSalonPayout,
  });
  const isPaidBySalon =
    row.override?.final_payout === 0 && row.override?.note === PAID_BY_SALON_NOTE;

  return (
    <div className="rounded-lg border border-line px-3 py-3">
      <form action={formAction}>
      <input type="hidden" name="date" value={row.date} />
      <input type="hidden" name="location" value={row.location} />
      <input
        type="hidden"
        name="calculated_payout"
        value={row.calculatedSalonPayout.toFixed(2)}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{locationLabel}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Calculated {formatMoney(row.calculatedSalonPayout)}
            {hasOverride ? ` · final ${formatMoney(row.salonPayout)}` : ""}
          </p>
        </div>
        {hasOverride ? (
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-ink">
            Overridden
          </span>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-faint">Final payout</span>
          <input
            name="final_payout"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            defaultValue={(row.override?.final_payout ?? row.calculatedSalonPayout).toFixed(2)}
            disabled={pending}
            className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base font-semibold text-ink disabled:opacity-55"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-faint">Note</span>
          <input
            name="note"
            type="text"
            defaultValue={row.override?.note ?? "Rounded at end of day"}
            disabled={pending}
            className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm text-ink disabled:opacity-55"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-2 min-h-11 w-full rounded-xl bg-brand px-3 text-sm font-semibold text-white active:bg-brand-ink disabled:opacity-55"
      >
        {hasOverride ? "Update closeout" : "Save closeout"}
      </button>
      {state.status === "error" ? (
        <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {state.formError ??
            Object.values(state.errors)[0] ??
            "Closeout could not be saved."}
        </p>
      ) : null}
      {state.status === "saved" || state.status === "demo" || state.status === "gated" ? (
        <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-ink">
          {state.message}
        </p>
      ) : null}
      </form>

      <form action={paidAction} className="mt-3 border-t border-line pt-3">
        <input type="hidden" name="date" value={paid.date} />
        <input type="hidden" name="location" value={paid.location} />
        <input type="hidden" name="calculated_payout" value={paid.calculated_payout} />
        <input type="hidden" name="final_payout" value={paid.final_payout} />
        <input type="hidden" name="note" value={paid.note} />
        <button
          type="submit"
          disabled={pending || paidPending || isPaidBySalon}
          className="min-h-11 w-full rounded-xl border border-brand bg-brand-soft px-3 text-sm font-semibold text-brand-ink active:bg-brand-soft/70 disabled:opacity-55"
        >
          {isPaidBySalon
            ? "Paid by salon — keeping 100% ✓"
            : paidPending
              ? "Saving..."
              : "Paid by salon — I keep 100%"}
        </button>
        <p className="mt-1 text-xs text-ink-soft">
          No salon cut today — the salon is paying you directly.
        </p>
        {paidState.status === "error" ? (
          <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {paidState.formError ??
              Object.values(paidState.errors)[0] ??
              "Closeout could not be saved."}
          </p>
        ) : null}
        {paidState.status === "saved" || paidState.status === "demo" || paidState.status === "gated" ? (
          <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-ink">
            {paidState.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
