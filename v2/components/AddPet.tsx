"use client";

import { useActionState, useState } from "react";
import { addPet, type AddPetState } from "@/lib/actions/pets";
import { PET_SIZES, type AllergyState, type PetSize } from "@/lib/intake";
import { validateAddPet, type AddPetErrors } from "@/lib/addPet";
import type { Client } from "@/lib/data/types";
import { formatMoney, fullName } from "@/lib/format";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";

const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint";
const labelClass = "text-sm font-medium text-ink-soft";

const SIZE_LABELS: Record<PetSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  xl: "Extra large",
};

function allergyLabel(allergies: boolean | null): string {
  if (allergies === true) return "Yes";
  if (allergies === false) return "No";
  return "Unknown";
}

export function AddPet({
  client,
  mode,
}: {
  client: Client;
  mode: "fixtures" | "live";
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
        className="rounded-xl border border-brand bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-ink active:bg-brand-soft/70"
      >
        Add pet
      </button>
      <Sheet open={open} onClose={close} title="Add a pet">
        <AddPetForm key={formKey} client={client} mode={mode} onDone={close} />
      </Sheet>
    </>
  );
}

function AddPetForm({
  client,
  mode,
  onDone,
}: {
  client: Client;
  mode: "fixtures" | "live";
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<AddPetState, FormData>(
    addPet,
    { status: "idle" },
  );
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<AddPetErrors>({});

  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [size, setSize] = useState("");
  const [allergyState, setAllergyState] = useState<AllergyState>("unknown");
  const [allergiesDetail, setAllergiesDetail] = useState("");
  const [groomingNotes, setGroomingNotes] = useState("");
  const [typicalFee, setTypicalFee] = useState("");

  function toReview() {
    const validation = validateAddPet({
      client_id: client.id,
      name,
      breed,
      size,
      allergy_state: allergyState,
      allergies_detail: allergiesDetail,
      grooming_notes: groomingNotes,
      typical_fee: typicalFee,
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
      ? (state.formError ?? "Please check the pet details and try again.")
      : undefined;

  const ownerName = fullName(client.first_name, client.last_name);

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <SubmitDogOverlay label="Saving pet" show={pending} />
      <input type="hidden" name="client_id" value={client.id} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="breed" value={breed} />
      <input type="hidden" name="size" value={size} />
      <input type="hidden" name="allergy_state" value={allergyState} />
      <input type="hidden" name="allergies_detail" value={allergiesDetail} />
      <input type="hidden" name="grooming_notes" value={groomingNotes} />
      <input type="hidden" name="typical_fee" value={typicalFee} />

      <ModeNote mode={mode} />

      {formError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}

      {step === "form" ? (
        <>
          <p className="text-sm text-ink-soft">
            Add a pet under{" "}
            <span className="font-semibold text-ink">{ownerName}</span>.
          </p>

          <Field label="Pet name" error={errors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Biscuit"
              className={fieldClass}
            />
          </Field>

          <Field label="Breed (optional)" error={errors.breed}>
            <input
              type="text"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              placeholder="Cockapoo"
              className={fieldClass}
            />
          </Field>

          <Field label="Size (optional)" error={errors.size}>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className={fieldClass}
            >
              <option value="">Not set</option>
              {PET_SIZES.map((code) => (
                <option key={code} value={code}>
                  {SIZE_LABELS[code]}
                </option>
              ))}
            </select>
          </Field>

          <AllergyPicker
            value={allergyState}
            onChange={setAllergyState}
            detail={allergiesDetail}
            onDetailChange={setAllergiesDetail}
            detailError={errors.allergies_detail}
          />

          <Field label="Grooming notes (optional)" error={errors.grooming_notes}>
            <textarea
              value={groomingNotes}
              onChange={(e) => setGroomingNotes(e.target.value)}
              placeholder="Cut, temperament, card notes, anything useful"
              className={`${fieldClass} min-h-24 resize-none`}
            />
          </Field>

          <Field label="Typical fee (optional)" error={errors.typical_fee}>
            <input
              type="text"
              inputMode="decimal"
              value={typicalFee}
              onChange={(e) => setTypicalFee(e.target.value)}
              placeholder="0.00"
              className={fieldClass}
            />
          </Field>

          <button
            type="button"
            onClick={toReview}
            className="rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink"
          >
            Review pet
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink">
            This will add <span className="font-semibold">{name}</span> under{" "}
            <span className="font-semibold">{ownerName}</span>.
          </p>

          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Name" value={name} />
            <ReviewRow label="Breed" value={breed.trim() || "Not set"} />
            <ReviewRow
              label="Size"
              value={size ? (SIZE_LABELS[size as PetSize] ?? "Not set") : "Not set"}
            />
            <ReviewRow
              label="Allergies"
              value={
                allergyState === "yes"
                  ? allergiesDetail.trim()
                    ? `Yes — ${allergiesDetail.trim()}`
                    : "Yes"
                  : allergyState === "no"
                    ? "No"
                    : "Unknown"
              }
            />
            {groomingNotes.trim() ? (
              <ReviewRow label="Grooming notes" value={groomingNotes} />
            ) : null}
            <ReviewRow
              label="Typical fee"
              value={
                typicalFee.trim() ? formatMoney(Number(typicalFee)) : "No fee set"
              }
            />
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

function AllergyPicker({
  value,
  onChange,
  detail,
  onDetailChange,
  detailError,
}: {
  value: AllergyState;
  onChange: (v: AllergyState) => void;
  detail: string;
  onDetailChange: (v: string) => void;
  detailError?: string;
}) {
  const options: { code: AllergyState; label: string }[] = [
    { code: "unknown", label: "Unknown" },
    { code: "no", label: "No" },
    { code: "yes", label: "Yes" },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>Allergies</span>
      <div role="radiogroup" aria-label="Allergies" className="flex gap-2">
        {options.map((o) => {
          const selected = value === o.code;
          return (
            <button
              key={o.code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.code)}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                selected
                  ? "border-brand bg-brand-soft text-brand-ink"
                  : "border-line bg-surface text-ink-soft active:bg-canvas"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {value === "yes" ? (
        <div className="mt-1.5">
          <input
            type="text"
            value={detail}
            onChange={(e) => onDetailChange(e.target.value)}
            placeholder="What is the pet allergic to?"
            aria-label="Allergy detail"
            className={fieldClass}
          />
          {detailError ? (
            <span className="mt-1 block text-xs text-danger-ink">
              {detailError}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ModeNote({ mode }: { mode: "fixtures" | "live" }) {
  if (mode === "live") {
    return (
      <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
        Add Pet can save once its production switch is on. Review before saving.
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
  state: Extract<AddPetState, { status: "demo" | "gated" | "saved" }>;
  onDone: () => void;
}) {
  const { summary } = state;
  const headline =
    state.status === "demo"
      ? "Demo only — nothing was saved"
      : state.status === "saved"
        ? "Saved — pet added"
        : "Not saved — adding pets is switched off";
  const detail =
    state.status === "demo"
      ? "This is anonymized practice data, so the pet was not added."
      : state.status === "saved"
        ? `${summary.petName} is now on ${summary.ownerName}'s file.`
        : state.message;
  const tone =
    state.status === "saved"
      ? "bg-brand-soft text-brand-ink"
      : "bg-warn-soft text-warn";

  return (
    <div className="flex flex-col gap-3.5">
      <div className={`rounded-xl p-3.5 ${tone}`}>
        <p className="text-sm font-semibold">{headline}</p>
        <p className="mt-0.5 text-xs leading-relaxed">{detail}</p>
      </div>

      <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
        <ReviewRow label="Owner" value={summary.ownerName} />
        <ReviewRow label="Pet" value={summary.petName} />
        <ReviewRow label="Breed" value={summary.breed ?? "Not set"} />
        <ReviewRow
          label="Size"
          value={summary.size ? SIZE_LABELS[summary.size] : "Not set"}
        />
        <ReviewRow label="Allergies" value={allergyLabel(summary.allergies)} />
        <ReviewRow
          label="Typical fee"
          value={
            summary.typicalFee != null
              ? formatMoney(summary.typicalFee)
              : "No fee set"
          }
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
