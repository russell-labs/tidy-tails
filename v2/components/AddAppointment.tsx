"use client";

import { useActionState, useState } from "react";
import { createBooking, type BookingState } from "@/lib/actions/appointments";
import {
  SERVICE_TYPES,
  validateBookingInput,
  type BookingErrors,
} from "@/lib/booking";
import { serviceLabel } from "@/lib/data/live";
import type { Client, Pet } from "@/lib/data/types";
import { formatMoney, fullName } from "@/lib/format";
import { Sheet } from "./Sheet";

// M2 — "Add appointment" booking flow: form → review → result. The wedge
// becomes Call/Text → Identify → Add Booking. Nothing is persisted in this
// ship: fixture mode is a dry-run, live mode is gated (see lib/actions).

const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint";
const labelClass = "text-sm font-medium text-ink-soft";

export function AddAppointment({
  client,
  pets,
  mode,
}: {
  client: Client;
  pets: Pet[];
  mode: "fixtures" | "live";
}) {
  const [open, setOpen] = useState(false);
  // Remount the form on each close so a reopened sheet starts fresh.
  const [formKey, setFormKey] = useState(0);

  // No pet, nothing to book — the household needs a pet first.
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
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-3 text-base font-semibold text-white active:bg-brand-ink"
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
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="12" y1="14" x2="12" y2="18" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
        Add appointment
      </button>

      <Sheet open={open} onClose={close} title="Add appointment">
        <BookingForm
          key={formKey}
          client={client}
          pets={pets}
          mode={mode}
          onDone={close}
        />
      </Sheet>
    </>
  );
}

function BookingForm({
  client,
  pets,
  mode,
  onDone,
}: {
  client: Client;
  pets: Pet[];
  mode: "fixtures" | "live";
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<BookingState, FormData>(
    createBooking,
    { status: "idle" },
  );
  // `step` is plain local state, never derived from `state` — a server result
  // must not lock navigation. A server-side error (expired session, ownership
  // refusal) surfaces as the banner below, which renders on either step, so the
  // operator sees it and can still go Back to edit and re-submit.
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<BookingErrors>({});

  const [petId, setPetId] = useState(pets[0].id);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [fee, setFee] = useState(
    pets[0].typical_fee != null ? String(pets[0].typical_fee) : "",
  );
  const [notes, setNotes] = useState("");

  const selectedPet = pets.find((p) => p.id === petId) ?? pets[0];
  const ownerName = fullName(client.first_name, client.last_name);

  function onPetChange(id: string) {
    setPetId(id);
    const p = pets.find((x) => x.id === id);
    setFee(p?.typical_fee != null ? String(p.typical_fee) : "");
  }

  function toReview() {
    const v = validateBookingInput({
      client_id: client.id,
      pet_id: petId,
      date,
      time_slot: time,
      service_type: serviceType,
      fee,
      notes,
    });
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    setStep("review");
  }

  // Terminal: the action ran. Nothing is ever saved in this ship.
  if (state.status === "demo" || state.status === "gated") {
    return <ResultScreen state={state} onDone={onDone} />;
  }

  // Field-level errors come from the client-side review check; a server error
  // surfaces as a banner. The server's own field errors are unreachable in the
  // happy path (the review step runs the same validator first), so a generic
  // banner covers the rare case rather than re-mapping them onto fields.
  const formError =
    state.status === "error"
      ? (state.formError ?? "Please check the booking details and try again.")
      : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      {/* Hidden fields carry the current values into the server action,
          regardless of which step is visible. */}
      <input type="hidden" name="client_id" value={client.id} />
      <input type="hidden" name="pet_id" value={petId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time_slot" value={time} />
      <input type="hidden" name="service_type" value={serviceType} />
      <input type="hidden" name="fee" value={fee} />
      <input type="hidden" name="notes" value={notes} />

      <ModeNote mode={mode} />

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

          <Field label="Time (optional)" error={errors.time_slot}>
            <input
              type="text"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="e.g. 10:00 or morning"
              className={fieldClass}
            />
          </Field>

          <Field label="Service (optional)" error={errors.service_type}>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
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

          <Field label="Fee (optional)" error={errors.fee}>
            <input
              type="text"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
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
            Review booking
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink">
            This will create one appointment for{" "}
            <span className="font-semibold">{selectedPet.name}</span> under{" "}
            <span className="font-semibold">{ownerName}</span>.
          </p>

          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Date" value={date} />
            <ReviewRow label="Time" value={time || "No time set"} />
            <ReviewRow
              label="Service"
              value={serviceType ? serviceLabel(serviceType) ?? "Not set" : "Not set"}
            />
            <ReviewRow
              label="Fee"
              value={fee.trim() ? formatMoney(Number(fee)) : "No fee set"}
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

function ModeNote({ mode }: { mode: "fixtures" | "live" }) {
  if (mode === "live") {
    return (
      <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
        Live mode — booking writes are switched off until the security cutover.
        Confirming will not save anything.
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
  state: Extract<BookingState, { status: "demo" | "gated" }>;
  onDone: () => void;
}) {
  const { summary } = state;
  const headline =
    state.status === "demo"
      ? "Demo only — nothing was saved"
      : "Not saved — live writes are switched off";
  const detail =
    state.status === "demo"
      ? "This is anonymized practice data, so the booking was not stored. The whole flow above is real — it starts saving once live writes are enabled."
      : state.message;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex gap-2.5 rounded-xl bg-warn-soft p-3.5 text-warn">
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
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div>
          <p className="text-sm font-semibold">{headline}</p>
          <p className="mt-0.5 text-xs leading-relaxed">{detail}</p>
        </div>
      </div>

      <p className="text-sm text-ink-soft">
        The booking reviewed was for{" "}
        <span className="font-semibold text-ink">{summary.petName}</span> under{" "}
        <span className="font-semibold text-ink">{summary.ownerName}</span>.
      </p>

      <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
        <ReviewRow label="Date" value={summary.date} />
        <ReviewRow label="Time" value={summary.time ?? "No time set"} />
        <ReviewRow label="Service" value={summary.service ?? "Not set"} />
        <ReviewRow
          label="Fee"
          value={summary.fee != null ? formatMoney(summary.fee) : "No fee set"}
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
