"use client";

import { useActionState } from "react";
import {
  saveWeekdayLocationsWithState,
  type OperatorSettingsState,
} from "@/lib/actions/settings";
import {
  WEEKDAY_OFF_VALUE,
  WEEKDAY_ORDER,
  type OrgLocation,
  type WeekdayLocations,
} from "@/lib/orgSettings";

const selectClass = "tt-input";

// The currently-saved location for a weekday, but only if it is still one of the
// org's locations — a removed/renamed location falls back to "Off" so the select
// never shows a value that has no matching option.
function selectedForWeekday(
  weekdayLocations: WeekdayLocations,
  weekday: number,
  locations: OrgLocation[],
): string {
  const saved = weekdayLocations[weekday];
  if (!saved) return WEEKDAY_OFF_VALUE;
  const match = locations.find(
    (l) => l.name.trim().toLowerCase() === saved.trim().toLowerCase(),
  );
  return match ? match.name : WEEKDAY_OFF_VALUE;
}

export function WeekdayLocationSettingsForm({
  locations,
  weekdayLocations,
}: {
  locations: OrgLocation[];
  weekdayLocations: WeekdayLocations;
}) {
  const [state, formAction, pending] = useActionState<
    OperatorSettingsState,
    FormData
  >(saveWeekdayLocationsWithState, { status: "idle" });

  return (
    <form action={formAction} className="px-3.5 py-3">
      {state.status === "saved" ? (
        <p className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
          Weekly schedule saved.
        </p>
      ) : null}

      {locations.length === 0 ? (
        <p className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-soft">
          Add your salon locations first, then set which one you work each day.
        </p>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-ink-soft">
            Set which location you work each weekday. This repeats every week
            until you change it. Choose &ldquo;Off&rdquo; for a day you
            don&rsquo;t work.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2">
            {WEEKDAY_ORDER.map(({ key, long }) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-sm font-medium text-ink">{long}</span>
                <select
                  name={`weekday.${key}`}
                  defaultValue={selectedForWeekday(
                    weekdayLocations,
                    key,
                    locations,
                  )}
                  className={`${selectClass} w-40`}
                >
                  <option value={WEEKDAY_OFF_VALUE}>Off</option>
                  {locations.map((location) => (
                    <option key={location.name} value={location.name}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="tt-btn tt-btn-primary mt-3 w-full"
          >
            {pending ? "Saving…" : "Save weekly schedule"}
          </button>
        </>
      )}
    </form>
  );
}
