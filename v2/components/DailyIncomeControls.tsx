"use client";

import { useActionState } from "react";
import {
  saveDailyIncome,
  type DailyIncomeState,
} from "@/lib/actions/dailyIncome";

// TT-014: log a lump-sum cash total for a rented-chair day Sam grooms with
// someone and doesn't book individual dogs. The amount is GROSS; the location
// cut derives take-home and it rolls into the reports "Total collected".
export function DailyIncomeControls({
  date,
  locationLabels,
}: {
  date: string;
  locationLabels: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<DailyIncomeState, FormData>(
    saveDailyIncome,
    { status: "idle" },
  );

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="mb-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Log daily income
        </h3>
        <p className="mt-1 text-xs text-ink-soft">
          Record a cash total for a rented-chair day. Use this only on days you
          didn&apos;t log individual dogs.
        </p>
      </div>
      <form action={formAction} className="rounded-lg border border-line px-3 py-3">
        <input type="hidden" name="date" value={date} />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-faint">Location</span>
            <select
              name="location"
              defaultValue="gina"
              disabled={pending}
              className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base text-ink disabled:opacity-55"
            >
              <option value="gina">{locationLabels.gina ?? "Gina"}</option>
              <option value="annette">{locationLabels.annette ?? "Annette"}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-faint">
              Total collected
            </span>
            <input
              name="amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              disabled={pending}
              className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base font-semibold text-ink disabled:opacity-55"
            />
          </label>
        </div>
        <label className="mt-2 flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-faint">Note (optional)</span>
          <input
            name="note"
            type="text"
            placeholder="e.g. Cash day at the salon"
            disabled={pending}
            className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm text-ink disabled:opacity-55"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="mt-2 min-h-11 w-full rounded-xl bg-brand px-3 text-sm font-semibold text-white active:bg-brand-ink disabled:opacity-55"
        >
          Save daily income
        </button>
        {state.status === "error" ? (
          <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {state.formError ??
              Object.values(state.errors)[0] ??
              "Daily income could not be saved."}
          </p>
        ) : null}
        {state.status === "saved" ||
        state.status === "demo" ||
        state.status === "gated" ? (
          <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-ink">
            {state.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
