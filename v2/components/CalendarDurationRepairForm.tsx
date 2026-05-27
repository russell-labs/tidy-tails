"use client";

import { useActionState } from "react";
import {
  repairCalendarDurationsAction,
  type CalendarDurationRepairState,
} from "@/lib/actions/googleCalendar";
import { SubmitDogOverlay } from "./SubmitDog";

const INITIAL_STATE: CalendarDurationRepairState = { status: "idle" };

export function CalendarDurationRepairForm() {
  const [state, formAction, pending] = useActionState<
    CalendarDurationRepairState,
    FormData
  >(repairCalendarDurationsAction, INITIAL_STATE);

  return (
    <form action={formAction} className="mt-3 border-t border-line pt-3">
      <SubmitDogOverlay label="Repairing calendar events" show={pending} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm font-semibold text-ink-soft active:bg-surface disabled:opacity-60"
      >
        Repair 15-minute calendar events
      </button>
      {state.status === "done" ? (
        <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
          {state.message} Scanned {state.scanned}; {state.alreadyCorrect} already correct;{" "}
          {state.skipped} skipped.
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
