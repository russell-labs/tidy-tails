"use client";

import { useActionState, useState } from "react";
import { logGroom, type GroomState } from "@/lib/actions/grooms";
import { SERVICE_TYPES, type ServiceType } from "@/lib/booking";
import { lastKnownPrice, lastKnownService } from "@/lib/derive";
import { validateGroomLog, type GroomLogErrors } from "@/lib/groom";
import { serviceLabel } from "@/lib/data/live";
import type { Appointment, Client, Pet } from "@/lib/data/types";
import { formatMoney, formatReviewDate, fullName } from "@/lib/format";
import { Sheet } from "./Sheet";

// Log Groom — record a completed groom: form → review → result. Nothing is
// persisted in this ship: fixture mode is a dry-run, live mode is gated (see
// lib/actions/grooms.ts). Mirrors the M2 AddAppointment flow.

const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint";
const labelClass = "text-sm font-medium text-ink-soft";

export function LogGroom({
  client,
  pets,
  appointments,
  mode,
  writesEnabled,
}: {
  client: Client;
  pets: Pet[];
  appointments: Appointment[];
  mode: "fixtures" | "live";
  writesEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Remount the form on each close so a reopened sheet starts fresh.
  const [formKey, setFormKey] = useState(0);

  // No pet, nothing to log — the household needs a pet first.
  if (pets.length === 0) return null;

  function close() {
    setOpen(false);
    setFormKey((k) => k + 1);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand bg-brand-soft px-3 py-3 text-base font-semibold text-brand-ink active:bg-brand-soft/70"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        Log groom
      </button>

      <Sheet open={open} onClose={close} title="Log a groom">
        <GroomForm
          key={formKey}
          client={client}
          pets={pets}
          appointments={appointments}
          mode={mode}
          writesEnabled={writesEnabled}
          onDone={close}
        />
      </Sheet>
    </>
  );
}

function GroomForm({
  client,
  pets,
  appointments,
  mode,
  writesEnabled,
  onDone,
}: {
  client: Client;
  pets: Pet[];
  appointments: Appointment[];
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<GroomState, FormData>(
    logGroom,
    { status: "idle" },
  );
  // `step` is plain local state, never derived from `state` — a server result
  // must not lock navigation. A server-side error (expired session, ownership
  // refusal) surfaces as the banner below, which renders on either step.
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<GroomLogErrors>({});

  const [petId, setPetId] = useState(pets[0].id);
  // A completed groom defaults to today — the common case is logging it right
  // after the visit. UTC slice matches the server's UTC `new Date()` validator.
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const initialDefaults = groomDefaults(pets[0], appointments);
  const [serviceType, setServiceType] = useState(initialDefaults.serviceType);
  const [fee, setFee] = useState(initialDefaults.fee);
  const [tip, setTip] = useState("");
  const [notes, setNotes] = useState("");

  const selectedPet = pets.find((p) => p.id === petId) ?? pets[0];
  const ownerName = fullName(client.first_name, client.last_name);

  function onPetChange(id: string) {
    setPetId(id);
    const p = pets.find((x) => x.id === id);
    if (!p) return;
    const defaults = groomDefaults(p, appointments);
    setServiceType(defaults.serviceType);
    setFee(defaults.fee);
    setTip("");
  }

  function toReview() {
    const v = validateGroomLog({
      client_id: client.id,
      pet_id: petId,
      date,
      service_type: serviceType,
      fee,
      tip,
      notes,
    });
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    setStep("review");
  }

  // Terminal: the action ran — a demo dry-run, gated (no write), or saved.
  if (
    state.status === "demo" ||
    state.status === "gated" ||
    state.status === "saved"
  ) {
    return <ResultScreen state={state} onDone={onDone} />;
  }

  // Field-level errors come from the client-side review check; a server error
  // surfaces as a banner. The server's own field errors are unreachable in the
  // happy path (the review step runs the same validator first), so a generic
  // banner covers the rare case rather than re-mapping them onto fields.
  const formError =
    state.status === "error"
      ? (state.formError ?? "Please check the groom details and try again.")
      : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      {/* Hidden fields carry the current values into the server action,
          regardless of which step is visible. */}
      <input type="hidden" name="client_id" value={client.id} />
      <input type="hidden" name="pet_id" value={petId} />
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
          {pets.length > 1 ? (
            <Field label="Pet" error={errors.pet_id}>
              <select
                value={petId}
                onChange={(e) => onPetChange(e.target.value)}
                className={fieldClass}
              >
                {pets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-sm text-ink-soft">
              Pet:{" "}
              <span className="font-semibold text-ink">{selectedPet.name}</span>
            </p>
          )}

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
              onChange={(e) => setServiceType(e.target.value as ServiceType | "")}
              className={fieldClass}
            >
              <option value="">Not set</option>
              {SERVICE_TYPES.map((code) => (
                <option key={code} value={code}>
                  {serviceLabel(code)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Fee" error={errors.fee} hint="Prefilled from the pet's last charged fee when available.">
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

          <Field label="Notes (optional)" error={errors.notes}>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to remember"
              className={fieldClass}
            />
          </Field>

          <button
            type="button"
            onClick={toReview}
            className="rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink"
          >
            Review groom
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink">
            This will log a completed groom for{" "}
            <span className="font-semibold">{selectedPet.name}</span> under{" "}
            <span className="font-semibold">{ownerName}</span>.
          </p>

          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Date" value={formatReviewDate(date)} />
            <ReviewRow
              label="Service"
              value={
                serviceType ? (serviceLabel(serviceType) ?? "Not set") : "Not set"
              }
            />
            <ReviewRow
              label="Fee"
              value={fee.trim() ? formatMoney(Number(fee)) : "No fee set"}
            />
            <ReviewRow
              label="Tip"
              value={tip.trim() ? formatMoney(Number(tip)) : "No tip set"}
            />
            <ReviewRow
              label="Total"
              value={formatMoney((Number(fee) || 0) + (Number(tip) || 0))}
            />
            {notes.trim() ? <ReviewRow label="Notes" value={notes} /> : null}
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
              {pending ? "Saving…" : "Confirm & save"}
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
  if (mode === "live") {
    if (writesEnabled) {
      return (
        <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
          Production mode — confirming will save one completed groom.
        </p>
      );
    }
    return (
      <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
        Groom logging is not turned on yet. You can review the groom, but it
        will not be saved.
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
      Demo mode — this is anonymized practice data. Confirming will not save
      anything.
    </p>
  );
}

function ResultScreen({
  state,
  onDone,
}: {
  state: Extract<GroomState, { status: "demo" | "gated" | "saved" }>;
  onDone: () => void;
}) {
  const { summary } = state;
  const saved = state.status === "saved";
  const headline =
    state.status === "demo"
      ? "Demo only — nothing was saved"
      : state.status === "saved"
        ? "Saved — groom logged"
        : "Not saved — groom logging is switched off";
  const detail =
    state.status === "demo"
      ? "This is anonymized practice data, so the groom was not logged. The whole flow above is real — it starts saving once live writes are enabled."
      : state.status === "saved"
        ? `The completed groom is now on ${summary.ownerName}'s file.`
        : state.message;

  return (
    <div className="flex flex-col gap-3.5">
      <div
        className={`flex gap-2.5 rounded-xl p-3.5 ${
          saved ? "bg-brand-soft text-brand-ink" : "bg-warn-soft text-warn"
        }`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        >
          {saved ? (
            <>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </>
          ) : (
            <>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </>
          )}
        </svg>
        <div>
          <p className="text-sm font-semibold">{headline}</p>
          <p className="mt-0.5 text-xs leading-relaxed">{detail}</p>
        </div>
      </div>

      <p className="text-sm text-ink-soft">
        The groom reviewed was for{" "}
        <span className="font-semibold text-ink">{summary.petName}</span> under{" "}
        <span className="font-semibold text-ink">{summary.ownerName}</span>.
      </p>

      <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
        <ReviewRow label="Date" value={formatReviewDate(summary.date)} />
        <ReviewRow label="Service" value={summary.service ?? "Not set"} />
        <ReviewRow
          label="Fee"
          value={summary.fee != null ? formatMoney(summary.fee) : "No fee set"}
        />
        <ReviewRow
          label="Tip"
          value={summary.tip != null ? formatMoney(summary.tip) : "No tip set"}
        />
        <ReviewRow
          label="Total"
          value={formatMoney((summary.fee ?? 0) + (summary.tip ?? 0))}
        />
      </dl>

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
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
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

function groomDefaults(
  pet: Pet,
  appointments: Appointment[],
): { serviceType: ServiceType | ""; fee: string } {
  const petAppointments = appointments.filter((a) => a.pet_id === pet.id);
  const recentPrice = lastKnownPrice(petAppointments);
  const recentService = lastKnownService(petAppointments);
  return {
    serviceType: serviceCodeFromLabel(recentService),
    fee:
      recentPrice != null
        ? String(recentPrice)
        : pet.typical_fee != null
          ? String(pet.typical_fee)
          : "",
  };
}

function serviceCodeFromLabel(label: string | null): ServiceType | "" {
  if (!label) return "";
  const match = SERVICE_TYPES.find((code) => serviceLabel(code) === label);
  return match ?? "";
}
