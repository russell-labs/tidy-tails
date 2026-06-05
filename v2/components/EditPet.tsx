"use client";

import { useActionState, useState } from "react";
import { editPet, type EditPetState } from "@/lib/actions/editPet";
import type { Client, Pet } from "@/lib/data/types";
import {
  validateEditPet,
  type EditPetErrors,
} from "@/lib/editPet";
import { formatMoney, fullName } from "@/lib/format";
import { PET_SIZES, type AllergyState, type PetSize } from "@/lib/intake";
import { formatPetAge } from "@/lib/petAge";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";
import { Field, ReviewRow, labelClass } from "./FormPrimitives";

const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint";

const SIZE_LABELS: Record<PetSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  xl: "Extra large",
};

function allergyStateFromPet(pet: Pet): AllergyState {
  if (pet.allergies === true) return "yes";
  if (pet.allergies === false) return "no";
  return "unknown";
}

function allergyLabel(allergies: boolean | null): string {
  if (allergies === true) return "Yes";
  if (allergies === false) return "No";
  return "Unknown";
}

export function EditPet({
  client,
  pet,
  writesEnabled,
  mode,
}: {
  client: Client;
  pet: Pet;
  writesEnabled: boolean;
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
        className="mt-4 rounded-xl border border-brand bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand-ink active:bg-brand-soft/70"
      >
        Edit pet details
      </button>
      <Sheet open={open} onClose={close} title="Edit pet details">
        <EditPetForm
          key={formKey}
          client={client}
          pet={pet}
          mode={mode}
          writesEnabled={writesEnabled}
          onDone={close}
        />
      </Sheet>
    </>
  );
}

function EditPetForm({
  client,
  pet,
  mode,
  writesEnabled,
  onDone,
}: {
  client: Client;
  pet: Pet;
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<EditPetState, FormData>(
    editPet,
    { status: "idle" },
  );
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<EditPetErrors>({});

  const [name, setName] = useState(pet.name);
  const [breed, setBreed] = useState(pet.breed ?? "");
  const [size, setSize] = useState(pet.size ?? "");
  const [color, setColor] = useState(pet.color ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(pet.date_of_birth ?? "");
  const [allergyState, setAllergyState] = useState<AllergyState>(
    allergyStateFromPet(pet),
  );
  const [allergiesDetail, setAllergiesDetail] = useState(
    pet.allergies_detail ?? "",
  );
  const [groomingNotes, setGroomingNotes] = useState(pet.grooming_notes ?? "");
  const [typicalFee, setTypicalFee] = useState(
    pet.typical_fee != null ? String(pet.typical_fee) : "",
  );

  function toReview() {
    const validation = validateEditPet({
      client_id: client.id,
      pet_id: pet.id,
      name,
      breed,
      size,
      color,
      date_of_birth: dateOfBirth,
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
      <input type="hidden" name="pet_id" value={pet.id} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="breed" value={breed} />
      <input type="hidden" name="size" value={size} />
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="date_of_birth" value={dateOfBirth} />
      <input type="hidden" name="allergy_state" value={allergyState} />
      <input type="hidden" name="allergies_detail" value={allergiesDetail} />
      <input type="hidden" name="grooming_notes" value={groomingNotes} />
      <input type="hidden" name="typical_fee" value={typicalFee} />

      <ModeNote mode={mode} writesEnabled={writesEnabled} />

      {formError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}

      {step === "form" ? (
        <>
          <p className="text-sm text-ink-soft">
            Update <span className="font-semibold text-ink">{pet.name}</span>{" "}
            under <span className="font-semibold text-ink">{ownerName}</span>.
          </p>

          <Field label="Pet name" error={errors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
            />
          </Field>

          <Field label="Breed" error={errors.breed}>
            <input
              type="text"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              placeholder="Breed not recorded"
              className={fieldClass}
            />
          </Field>

          <Field label="Size" error={errors.size}>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className={fieldClass}
            >
              <option value="">Size not recorded</option>
              {PET_SIZES.filter((code) => code !== "xl").map((code) => (
                <option key={code} value={code}>
                  {SIZE_LABELS[code]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Colour" error={errors.color}>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Colour not recorded"
              className={fieldClass}
            />
          </Field>

          <Field
            label="Birth date"
            error={errors.date_of_birth}
          >
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className={fieldClass}
            />
            <span className="text-xs text-ink-faint">
              Used to keep age current over time.
            </span>
          </Field>

          <AllergyPicker
            value={allergyState}
            onChange={setAllergyState}
            detail={allergiesDetail}
            onDetailChange={setAllergiesDetail}
            detailError={errors.allergies_detail}
          />

          <Field label="Grooming notes" error={errors.grooming_notes}>
            <textarea
              value={groomingNotes}
              onChange={(e) => setGroomingNotes(e.target.value)}
              placeholder="Cut, temperament, card notes, anything useful"
              className={`${fieldClass} min-h-32 resize-none`}
            />
          </Field>

          <Field label="Typical fee" error={errors.typical_fee}>
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
            Review changes
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink">
            This will update <span className="font-semibold">{name}</span> under{" "}
            <span className="font-semibold">{ownerName}</span>.
          </p>

          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Name" value={name} />
            <ReviewRow label="Breed" value={breed.trim() || "Not set"} />
            <ReviewRow
              label="Size"
              value={size ? (SIZE_LABELS[size as PetSize] ?? "Not set") : "Not set"}
            />
            <ReviewRow label="Colour" value={color.trim() || "Not set"} />
            <ReviewRow
              label="Age"
              value={
                dateOfBirth
                  ? (formatPetAge(dateOfBirth) ?? "Birth date not valid")
                  : "Not set"
              }
            />
            <ReviewRow
              label="Allergies"
              value={
                allergyState === "yes"
                  ? allergiesDetail.trim()
                    ? `Yes - ${allergiesDetail.trim()}`
                    : "Yes"
                  : allergyState === "no"
                    ? "No"
                    : "Unknown"
              }
            />
            <ReviewRow
              label="Typical fee"
              value={
                typicalFee.trim() ? formatMoney(Number(typicalFee)) : "Not set"
              }
            />
            {groomingNotes.trim() ? (
              <ReviewRow label="Grooming notes" value={groomingNotes} />
            ) : null}
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
  if (writesEnabled) {
    return (
      <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
        Production mode - confirming will update this pet record.
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
      Production mode - the server will confirm the write gate before saving.
    </p>
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
              onClick={() => setAllergy(o.code, onChange)}
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

function setAllergy(
  next: AllergyState,
  onChange: (v: AllergyState) => void,
) {
  onChange(next);
}

function ResultScreen({
  state,
  onDone,
}: {
  state: Extract<EditPetState, { status: "demo" | "gated" | "saved" }>;
  onDone: () => void;
}) {
  const { summary } = state;
  const headline =
    state.status === "demo"
      ? "Demo only - nothing was saved"
      : state.status === "saved"
        ? "Saved - pet details updated"
        : "Not saved - pet editing is switched off";
  const detail =
    state.status === "demo"
      ? "This is anonymized practice data, so the pet was not updated."
      : state.status === "saved"
        ? `${summary.petName} is updated on ${summary.ownerName}'s file.`
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
          value={
            summary.size ? SIZE_LABELS[summary.size as PetSize] : "Not set"
          }
        />
        <ReviewRow label="Colour" value={summary.color ?? "Not set"} />
        <ReviewRow
          label="Age"
          value={
            summary.dateOfBirth
              ? (formatPetAge(summary.dateOfBirth) ?? "Not set")
              : "Not set"
          }
        />
        <ReviewRow label="Allergies" value={allergyLabel(summary.allergies)} />
        <ReviewRow
          label="Typical fee"
          value={
            summary.typicalFee != null
              ? formatMoney(summary.typicalFee)
              : "Not set"
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

