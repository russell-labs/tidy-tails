"use client";

import { useActionState, useState } from "react";
import {
  editAppointment,
  type EditAppointmentState,
} from "@/lib/actions/editAppointment";
import { SERVICE_TYPES, type ServiceType } from "@/lib/booking";
import type { Appointment } from "@/lib/data/types";
import {
  validateEditAppointment,
  type EditAppointmentErrors,
} from "@/lib/editAppointment";
import { formatMoney } from "@/lib/format";
import { Sheet } from "./Sheet";

const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint";
const labelClass = "text-sm font-medium text-ink-soft";

const SERVICE_LABELS: Record<ServiceType, string> = {
  full_groom: "Full groom",
  bath_only: "Bath only",
  nail_trim: "Nail trim",
  other: "Other",
};

function serviceCodeFromLabel(label: string | null): string {
  const found = SERVICE_TYPES.find((code) => SERVICE_LABELS[code] === label);
  return found ?? "";
}

export function EditAppointment({
  clientId,
  appointment,
  petName,
  mode,
  writesEnabled,
}: {
  clientId: string;
  appointment: Appointment;
  petName?: string;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function close() {
    setOpen(false);
    setFormKey((k) => k + 1);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-brand active:bg-brand-soft"
      >
        Edit visit
      </button>
      <Sheet open={open} onClose={close} title="Edit visit">
        <EditAppointmentForm
          key={formKey}
          clientId={clientId}
          appointment={appointment}
          petName={petName}
          mode={mode}
          writesEnabled={writesEnabled}
          onDone={close}
        />
      </Sheet>
    </>
  );
}

function EditAppointmentForm({
  clientId,
  appointment,
  petName,
  mode,
  writesEnabled,
  onDone,
}: {
  clientId: string;
  appointment: Appointment;
  petName?: string;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    EditAppointmentState,
    FormData
  >(editAppointment, { status: "idle" });
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<EditAppointmentErrors>({});
  const [date, setDate] = useState(appointment.date);
  const [serviceType, setServiceType] = useState(
    serviceCodeFromLabel(appointment.service),
  );
  const [fee, setFee] = useState(
    appointment.price != null ? String(appointment.price) : "",
  );
  const [tip, setTip] = useState(
    appointment.tip != null ? String(appointment.tip) : "",
  );
  const [notes, setNotes] = useState(appointment.notes ?? "");

  function toReview() {
    const validation = validateEditAppointment({
      client_id: clientId,
      appointment_id: appointment.id,
      date,
      service_type: serviceType,
      fee,
      tip,
      notes,
    });
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setStep("review");
  }

  if (
    state.status === "demo" ||
    state.status === "gated" ||
    state.status === "saved"
  ) {
    return <ResultScreen state={state} onDone={onDone} />;
  }

  const formError =
    state.status === "error"
      ? (state.formError ?? "Please check the visit details and try again.")
      : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="appointment_id" value={appointment.id} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="service_type" value={serviceType} />
      <input type="hidden" name="fee" value={fee} />
      <input type="hidden" name="tip" value={tip} />
      <input type="hidden" name="notes" value={notes} />

      <ModeNote mode={mode} writesEnabled={writesEnabled} />

      {formError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}

      {step === "form" ? (
        <>
          <p className="text-sm text-ink-soft">
            Update visit details for{" "}
            <span className="font-semibold text-ink">{petName ?? "this pet"}</span>.
          </p>
          <Field label="Date" error={errors.date}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Service" error={errors.service_type}>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className={fieldClass}
            >
              <option value="">Not set</option>
              {SERVICE_TYPES.map((code) => (
                <option key={code} value={code}>
                  {SERVICE_LABELS[code]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fee" error={errors.fee}>
            <input
              type="text"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
              className={fieldClass}
            />
          </Field>
          <Field label="Tip" error={errors.tip}>
            <input
              type="text"
              inputMode="decimal"
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              placeholder="0.00"
              className={fieldClass}
            />
          </Field>
          <Field label="Notes" error={errors.notes}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cut notes, changes, anything useful"
              className={`${fieldClass} min-h-28 resize-none`}
            />
          </Field>
          <button
            type="button"
            onClick={toReview}
            className="rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink"
          >
            Review changes
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink">Review this visit update.</p>
          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Date" value={date} />
            <ReviewRow
              label="Service"
              value={
                serviceType
                  ? (SERVICE_LABELS[serviceType as ServiceType] ?? "Not set")
                  : "Not set"
              }
            />
            <ReviewRow label="Fee" value={fee ? formatMoney(Number(fee)) : "Not set"} />
            <ReviewRow label="Tip" value={tip ? formatMoney(Number(tip)) : "Not set"} />
            <ReviewRow label="Notes" value={notes.trim() || "Not set"} />
          </dl>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setStep("form")}
              disabled={pending}
              className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-base font-semibold text-ink-soft active:bg-canvas disabled:opacity-50"
            >
              Back to edit
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink disabled:opacity-50"
            >
              {pending ? "Saving..." : "Confirm & save"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function ModeNote({
  mode,
  writesEnabled,
}: {
  mode: "fixtures" | "live";
  writesEnabled: boolean;
}) {
  if (mode === "fixtures") {
    return (
      <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
        Demo mode - confirming will not save anything.
      </p>
    );
  }
  return (
    <p
      className={`rounded-lg px-3 py-2 text-xs font-medium ${
        writesEnabled ? "bg-brand-soft text-brand-ink" : "bg-warn-soft text-warn"
      }`}
    >
      {writesEnabled
        ? "Production mode - confirming will update this visit."
        : "Visit editing is switched off. You can review changes, but nothing will be saved."}
    </p>
  );
}

function ResultScreen({
  state,
  onDone,
}: {
  state: Extract<EditAppointmentState, { status: "demo" | "gated" | "saved" }>;
  onDone: () => void;
}) {
  const headline =
    state.status === "saved"
      ? "Saved - visit updated"
      : state.status === "demo"
        ? "Demo only - nothing was saved"
        : "Not saved - visit editing is switched off";
  const tone =
    state.status === "saved"
      ? "bg-brand-soft text-brand-ink"
      : "bg-warn-soft text-warn";
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`rounded-xl p-3.5 ${tone}`}>
        <p className="text-sm font-semibold">{headline}</p>
        <p className="mt-0.5 text-xs leading-relaxed">
          {state.status === "saved" ? `${state.summary.petName} · ${state.summary.date}` : "Nothing was written."}
        </p>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink"
      >
        Done
      </button>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
      {error ? <span className="text-xs text-danger-ink">{error}</span> : null}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
