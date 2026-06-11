"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseAltContact } from "@/lib/altContact";
import { editClient, type EditClientState } from "@/lib/actions/editClient";
import {
  deleteClient,
  type DeleteClientState,
} from "@/lib/actions/deleteClient";
import type { Client } from "@/lib/data/types";
import { validateEditClient, type EditClientErrors } from "@/lib/editClient";
import { formatPhone } from "@/lib/format";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";
import { Field, ReviewRow } from "./FormPrimitives";

const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint";

function ownerLabel(firstName: string, lastName: string | null): string {
  return `${firstName} ${lastName ?? ""}`.trim() || "Unnamed owner";
}

export function EditClient({
  client,
  mode,
  writesEnabled,
  canDelete,
}: {
  client: Client;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  canDelete: boolean;
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
        Edit household / owner
      </button>
      <Sheet open={open} onClose={close} title="Edit household / owner">
        <EditClientForm
          key={formKey}
          client={client}
          mode={mode}
          writesEnabled={writesEnabled}
          canDelete={canDelete}
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
  canDelete,
  onDone,
}: {
  client: Client;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  canDelete: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<EditClientState, FormData>(
    editClient,
    { status: "idle" },
  );
  const [deleteState, deleteAction, deletePending] = useActionState<
    DeleteClientState,
    FormData
  >(deleteClient, { status: "idle" });
  const [step, setStep] = useState<"form" | "review" | "confirmDelete">("form");

  // A successful delete removes this household, so the detail page would 404 on
  // re-render. Navigate back to the clients list instead of closing in place.
  useEffect(() => {
    if (deleteState.status === "deleted") {
      router.push("/");
    }
  }, [deleteState.status, router]);
  const [errors, setErrors] = useState<EditClientErrors>({});
  const [firstName, setFirstName] = useState(client.first_name);
  const [lastName, setLastName] = useState(client.last_name);
  const [phone, setPhone] = useState(client.phone);
  // The three structured contact fields are parsed out of the stored alt_contact
  // so they pre-fill exactly as Add household captured them (parity, TT-003).
  const initialAlt = parseAltContact(client.alt_contact);
  const [secondaryName, setSecondaryName] = useState(initialAlt.secondaryName ?? "");
  const [secondaryCell, setSecondaryCell] = useState(initialAlt.secondaryCell ?? "");
  const [landline, setLandline] = useState(initialAlt.landline ?? "");
  const [email, setEmail] = useState(client.email ?? "");
  const [address, setAddress] = useState(client.address ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");

  function toReview() {
    const validation = validateEditClient({
      client_id: client.id,
      first_name: firstName,
      last_name: lastName,
      phone,
      secondary_contact_name: secondaryName,
      secondary_cell: secondaryCell,
      landline,
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

  if (step === "confirmDelete") {
    const householdName = ownerLabel(client.first_name, client.last_name);
    const deleteError =
      deleteState.status === "error" ? deleteState.message : undefined;
    const deleteNotice =
      deleteState.status === "demo" || deleteState.status === "gated"
        ? deleteState.message
        : undefined;
    return (
      <form action={deleteAction} className="flex flex-col gap-3.5">
        <SubmitDogOverlay label="Deleting household" show={deletePending} />
        <input type="hidden" name="client_id" value={client.id} />
        <div className="rounded-xl bg-danger-soft p-3.5">
          <p className="text-sm font-semibold text-danger-ink">
            Delete {householdName}?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-danger-ink">
            Are you sure you&apos;d like to delete{" "}
            <span className="font-semibold">{householdName}</span> as a
            household? This removes the household, its pets, and any bookings.
            This can&apos;t be undone.
          </p>
        </div>
        {deleteError ? (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {deleteError}
          </p>
        ) : null}
        {deleteNotice ? (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            {deleteNotice}
          </p>
        ) : null}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => setStep("form")}
            disabled={deletePending}
            className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-base font-semibold text-ink-soft active:bg-canvas disabled:opacity-50"
          >
            Keep household
          </button>
          <button
            type="submit"
            disabled={deletePending}
            className="flex-1 rounded-xl bg-danger px-4 py-3 text-base font-semibold text-white active:bg-danger-ink disabled:opacity-50"
          >
            Delete household
          </button>
        </div>
      </form>
    );
  }

  const formError =
    state.status === "error"
      ? (state.formError ?? "Please check the household details and try again.")
      : undefined;
  const originalOwnerName = ownerLabel(client.first_name, client.last_name);
  const ownerName = ownerLabel(firstName, lastName);

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <SubmitDogOverlay label="Saving household" show={pending} />
      <input type="hidden" name="client_id" value={client.id} />
      <input type="hidden" name="first_name" value={firstName} />
      <input type="hidden" name="last_name" value={lastName} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="secondary_contact_name" value={secondaryName} />
      <input type="hidden" name="secondary_cell" value={secondaryCell} />
      <input type="hidden" name="landline" value={landline} />
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
          <p className="rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-soft">
            Use this when the household is under the wrong owner name. It
            changes who appears as the owner across search, schedule, messages,
            and reports.
          </p>
          <Field label="Owner first name (optional)" error={errors.first_name}>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Owner last name" error={errors.last_name}>
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
          <Field
            label="Secondary contact name (optional)"
            error={errors.secondary_contact_name}
          >
            <input
              type="text"
              value={secondaryName}
              onChange={(e) => setSecondaryName(e.target.value)}
              placeholder="Partner, spouse, or backup contact"
              className={fieldClass}
            />
          </Field>
          <Field label="Secondary cell (optional)" error={errors.secondary_cell}>
            <input
              type="tel"
              inputMode="tel"
              value={secondaryCell}
              onChange={(e) => setSecondaryCell(e.target.value)}
              placeholder="416-555-0199"
              className={fieldClass}
            />
          </Field>
          <Field label="Landline (optional)" error={errors.landline}>
            <input
              type="tel"
              inputMode="tel"
              value={landline}
              onChange={(e) => setLandline(e.target.value)}
              placeholder="416-555-0200"
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
              placeholder="Anything you should know about this household"
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

          <section className="mt-1 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3 text-danger-ink">
            <h3 className="text-sm font-semibold">Delete household</h3>
            <p className="mt-1 text-xs leading-relaxed">
              Removes the whole household and its pets. Only allowed when the
              household has no groom history — for test or duplicate entries.
            </p>
            {canDelete ? (
              <button
                type="button"
                onClick={() => setStep("confirmDelete")}
                className="mt-3 w-full rounded-xl bg-danger-ink px-4 py-3 text-sm font-semibold text-white active:opacity-90"
              >
                Delete household
              </button>
            ) : (
              <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-xs font-medium">
                This household has groom history, so deletion is blocked.
              </p>
            )}
          </section>
        </>
      ) : (
        <>
          <p className="text-sm text-ink">
            This will update the household owner from{" "}
            <span className="font-semibold">{originalOwnerName}</span> to{" "}
            <span className="font-semibold">{ownerName}</span>.
          </p>
          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Owner" value={ownerName} />
            <ReviewRow label="Phone" value={formatPhone(phone)} />
            {secondaryName.trim() ? (
              <ReviewRow label="Secondary" value={secondaryName} />
            ) : null}
            {secondaryCell.trim() ? (
              <ReviewRow label="Secondary cell" value={formatPhone(secondaryCell)} />
            ) : null}
            {landline.trim() ? (
              <ReviewRow label="Landline" value={formatPhone(landline)} />
            ) : null}
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

