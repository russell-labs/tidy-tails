"use client";

import { useActionState, useState } from "react";
import { editClient, type EditClientState } from "@/lib/actions/editClient";
import type { Client } from "@/lib/data/types";
import { validateEditClient, type EditClientErrors } from "@/lib/editClient";
import { formatPhone } from "@/lib/format";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";

const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint";
const labelClass = "text-sm font-medium text-ink-soft";

export function EditClient({
  client,
  mode,
  writesEnabled,
}: {
  client: Client;
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
        className="mt-3 rounded-xl border border-brand bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand-ink active:bg-brand-soft/70"
      >
        Edit household
      </button>
      <Sheet open={open} onClose={close} title="Edit household">
        <EditClientForm
          key={formKey}
          client={client}
          mode={mode}
          writesEnabled={writesEnabled}
          onDone={close}
        />
      </Sheet>
    </>
  );
}

function EditClientForm({
  client,
  mode,
  writesEnabled,
  onDone,
}: {
  client: Client;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<EditClientState, FormData>(
    editClient,
    { status: "idle" },
  );
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<EditClientErrors>({});
  const [firstName, setFirstName] = useState(client.first_name);
  const [lastName, setLastName] = useState(client.last_name);
  const [phone, setPhone] = useState(client.phone);
  const [altContact, setAltContact] = useState(client.alt_contact ?? "");
  const [email, setEmail] = useState(client.email ?? "");
  const [address, setAddress] = useState(client.address ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");

  function toReview() {
    const validation = validateEditClient({
      client_id: client.id,
      first_name: firstName,
      last_name: lastName,
      phone,
      alt_contact: altContact,
      email,
      address,
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
      ? (state.formError ?? "Please check the household details and try again.")
      : undefined;
  const ownerName = `${firstName} ${lastName}`.trim();

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <SubmitDogOverlay label="Saving household" show={pending} />
      <input type="hidden" name="client_id" value={client.id} />
      <input type="hidden" name="first_name" value={firstName} />
      <input type="hidden" name="last_name" value={lastName} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="alt_contact" value={altContact} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="address" value={address} />
      <input type="hidden" name="notes" value={notes} />

      <ModeNote mode={mode} writesEnabled={writesEnabled} />

      {formError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}

      {step === "form" ? (
        <>
          <Field label="First name" error={errors.first_name}>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Last name (optional)" error={errors.last_name}>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Alternate contact" error={errors.alt_contact}>
            <input
              type="text"
              value={altContact}
              onChange={(e) => setAltContact(e.target.value)}
              placeholder="Optional"
              className={fieldClass}
            />
          </Field>
          <Field label="Email" error={errors.email}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Optional"
              className={fieldClass}
            />
          </Field>
          <Field label="Address" error={errors.address}>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Optional"
              className={fieldClass}
            />
          </Field>
          <Field label="Household notes" error={errors.notes}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything Sam should know about this household"
              className={`${fieldClass} min-h-24 resize-none`}
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
          <p className="text-sm text-ink">
            This will update <span className="font-semibold">{ownerName}</span>.
          </p>
          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Name" value={ownerName} />
            <ReviewRow label="Phone" value={formatPhone(phone)} />
            <ReviewRow label="Address" value={address.trim() || "Not set"} />
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
              Confirm & save
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
        ? "Production mode - confirming will update this household."
        : "Production mode - the server will confirm the write gate before saving."}
    </p>
  );
}

function ResultScreen({
  state,
  onDone,
}: {
  state: Extract<EditClientState, { status: "demo" | "gated" | "saved" }>;
  onDone: () => void;
}) {
  const headline =
    state.status === "saved"
      ? "Saved - household updated"
      : state.status === "demo"
        ? "Demo only - nothing was saved"
        : "Not saved - household editing is switched off";
  const tone =
    state.status === "saved"
      ? "bg-brand-soft text-brand-ink"
      : "bg-warn-soft text-warn";
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`rounded-xl p-3.5 ${tone}`}>
        <p className="text-sm font-semibold">{headline}</p>
        <p className="mt-0.5 text-xs leading-relaxed">
          {state.status === "saved" ? state.summary.ownerName : "Nothing was written."}
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
