"use client";

import { useActionState } from "react";
import {
  updateAppointmentWorkflow,
  type AppointmentWorkflowState,
} from "@/lib/actions/appointmentWorkflow";
import type { AppointmentWorkflowMarker } from "@/lib/appointmentWorkflow";

type WorkflowChoice = {
  value: "scheduled" | AppointmentWorkflowMarker;
  label: string;
  tone: string;
};

const choices: WorkflowChoice[] = [
  {
    value: "scheduled",
    label: "Not started",
    tone: "border-line bg-surface text-ink-soft",
  },
  {
    value: "in_progress",
    label: "Start groom",
    tone: "border-warn/40 bg-warn-soft text-warn",
  },
  {
    value: "ready_pickup",
    label: "Ready",
    tone: "border-warn/40 bg-warn-soft text-warn",
  },
];

export function AppointmentWorkflowControls({
  clientId,
  appointmentId,
  current,
  disabled,
}: {
  clientId: string;
  appointmentId: string;
  current: string | null;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    AppointmentWorkflowState,
    FormData
  >(updateAppointmentWorkflow, { status: "idle" });

  return (
    <form action={formAction} className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <p className="text-sm font-semibold text-ink">Schedule status</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {choices.map((choice) => {
          const active = current === choice.value;
          return (
            <button
              key={choice.value}
              type="submit"
              name="workflow_status"
              value={choice.value}
              disabled={disabled || pending || active}
              className={`min-h-11 rounded-xl border px-2 text-sm font-semibold disabled:opacity-55 ${choice.tone} ${
                active ? "ring-2 ring-brand/30" : ""
              }`}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
      {state.status === "error" ? (
        <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {state.message}
        </p>
      ) : null}
      {state.status === "demo" || state.status === "gated" || state.status === "saved" ? (
        <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-ink">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
