"use client";

import { useActionState, useState } from "react";
import { saveIntake, type IntakeState } from "@/lib/actions/intake";
import {
  PET_SIZES,
  validateIntake,
  type AllergyState,
  type IntakeErrors,
  type PetSize,
  type VaccinationState,
} from "@/lib/intake";
import { formatMoney, formatPhone } from "@/lib/format";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";

// Add household — onboard a new client plus every pet Sam knows about during
// the call. Fixture mode is a dry-run; live mode persists only when the private
// TIDYTAILS_ENABLE_ADD_HOUSEHOLD_WRITE gate is on.

const fieldClass =
  "w-full min-h-12 rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-faint";
const labelClass = "text-sm font-medium text-ink-soft";

const SIZE_LABELS: Record<PetSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  xl: "Extra large",
};

type PetDraft = {
  id: string;
  name: string;
  breed: string;
  size: string;
  allergyState: AllergyState;
  allergiesDetail: string;
  vaccinationState: VaccinationState;
  vaccinationDetail: string;
  age: string;
  dateOfBirth: string;
  groomingNotes: string;
  typicalFee: string;
};

function newPetDraft(): PetDraft {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    name: "",
    breed: "",
    size: "",
    allergyState: "unknown",
    allergiesDetail: "",
    vaccinationState: "unknown",
    vaccinationDetail: "",
    age: "",
    dateOfBirth: "",
    groomingNotes: "",
    typicalFee: "",
  };
}

function allergyLabel(allergies: boolean | null): string {
  if (allergies === true) return "Yes";
  if (allergies === false) return "No";
  return "Unknown";
}

function choiceLabel(value: AllergyState | VaccinationState, detail: string): string {
  if (value === "yes") return detail.trim() ? `Yes - ${detail.trim()}` : "Yes";
  if (value === "no") return detail.trim() ? `No - ${detail.trim()}` : "No";
  return "Unknown";
}

function feeLabel(value: string): string {
  const trimmed = value.trim();
  return trimmed ? formatMoney(Number(trimmed)) : "No fee set";
}

export function AddHousehold({ mode }: { mode: "fixtures" | "live" }) {
  const [open, setOpen] = useState(false);
  // Remount the form on each close so a reopened sheet starts fresh.
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
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
        Add household
      </button>

      <Sheet
        open={open}
        onClose={close}
        title="Add a household"
        variant="fullscreen"
      >
        <IntakeForm key={formKey} mode={mode} onDone={close} />
      </Sheet>
    </>
  );
}

function IntakeForm({
  mode,
  onDone,
}: {
  mode: "fixtures" | "live";
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<IntakeState, FormData>(
    saveIntake,
    { status: "idle" },
  );
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<IntakeErrors>({});

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [secondaryName, setSecondaryName] = useState("");
  const [secondaryCell, setSecondaryCell] = useState("");
  const [landline, setLandline] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [pets, setPets] = useState<PetDraft[]>(() => [newPetDraft()]);
  const [collapsedPetIds, setCollapsedPetIds] = useState<Set<string>>(
    () => new Set(),
  );

  function patchPet(id: string, patch: Partial<PetDraft>) {
    setPets((current) =>
      current.map((pet) => (pet.id === id ? { ...pet, ...patch } : pet)),
    );
  }

  function addPet() {
    const next = newPetDraft();
    setPets((current) => [...current, next]);
    setCollapsedPetIds((current) => {
      const copy = new Set(current);
      copy.delete(next.id);
      return copy;
    });
  }

  function removePet(id: string) {
    setPets((current) => current.filter((pet) => pet.id !== id));
    setCollapsedPetIds((current) => {
      const copy = new Set(current);
      copy.delete(id);
      return copy;
    });
  }

  function togglePet(id: string) {
    setCollapsedPetIds((current) => {
      const copy = new Set(current);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }

  function toReview() {
    const v = validateIntake({
      first_name: firstName,
      last_name: lastName,
      phone,
      secondary_contact_name: secondaryName,
      secondary_cell: secondaryCell,
      landline,
      email,
      address,
      notes: clientNotes,
      pets: pets.map((pet) => ({
        pet_name: pet.name,
        breed: pet.breed,
        size: pet.size,
        allergy_state: pet.allergyState,
        allergies_detail: pet.allergiesDetail,
        vaccination_state: pet.vaccinationState,
        vaccination_detail: pet.vaccinationDetail,
        age: pet.age,
        date_of_birth: pet.dateOfBirth,
        grooming_notes: pet.groomingNotes,
        typical_fee: pet.typicalFee,
      })),
    });
    if (!v.ok) {
      setErrors(v.errors);
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
  const petNames = pets.map((pet) => pet.name.trim()).filter(Boolean);

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-2">
      <SubmitDogOverlay label="Saving household" show={pending} />

      <input type="hidden" name="first_name" value={firstName} />
      <input type="hidden" name="last_name" value={lastName} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="secondary_contact_name" value={secondaryName} />
      <input type="hidden" name="secondary_cell" value={secondaryCell} />
      <input type="hidden" name="landline" value={landline} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="address" value={address} />
      <input type="hidden" name="notes" value={clientNotes} />
      <input type="hidden" name="pet_count" value={pets.length} />
      {pets.map((pet, index) => (
        <div key={pet.id} className="hidden">
          <input type="hidden" name={`pet_${index}_name`} value={pet.name} />
          <input type="hidden" name={`pet_${index}_breed`} value={pet.breed} />
          <input type="hidden" name={`pet_${index}_size`} value={pet.size} />
          <input
            type="hidden"
            name={`pet_${index}_allergy_state`}
            value={pet.allergyState}
          />
          <input
            type="hidden"
            name={`pet_${index}_allergies_detail`}
            value={pet.allergiesDetail}
          />
          <input
            type="hidden"
            name={`pet_${index}_vaccination_state`}
            value={pet.vaccinationState}
          />
          <input
            type="hidden"
            name={`pet_${index}_vaccination_detail`}
            value={pet.vaccinationDetail}
          />
          <input type="hidden" name={`pet_${index}_age`} value={pet.age} />
          <input
            type="hidden"
            name={`pet_${index}_date_of_birth`}
            value={pet.dateOfBirth}
          />
          <input
            type="hidden"
            name={`pet_${index}_grooming_notes`}
            value={pet.groomingNotes}
          />
          <input
            type="hidden"
            name={`pet_${index}_typical_fee`}
            value={pet.typicalFee}
          />
        </div>
      ))}

      <ModeNote mode={mode} />

      {formError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}

      {step === "form" ? (
        <>
          <SectionLabel>Owner</SectionLabel>

          <Field label="First name (optional)" error={errors.first_name}>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Dana"
              className={fieldClass}
            />
          </Field>

          <Field label="Last name" error={errors.last_name}>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Okafor"
              className={fieldClass}
            />
          </Field>

          <Field label="Cell phone" error={errors.phone}>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="416-555-0142"
              className={fieldClass}
            />
          </Field>

          <SectionLabel>Other contacts</SectionLabel>

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

          <SectionLabel>Household</SectionLabel>

          <Field label="Email (optional)" error={errors.email}>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dana@example.com"
              className={fieldClass}
            />
          </Field>

          <Field label="Address (optional)" error={errors.address}>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, city"
              className={fieldClass}
            />
          </Field>

          <Field label="Owner notes (optional)" error={errors.notes}>
            <textarea
              value={clientNotes}
              onChange={(e) => setClientNotes(e.target.value)}
              placeholder="Anything to remember about the owner"
              className={`${fieldClass} min-h-24 resize-none`}
            />
          </Field>

          <SectionLabel>Pets</SectionLabel>
          <div className="flex flex-col gap-3">
            {pets.map((pet, index) => {
              const collapsed = index > 0 && collapsedPetIds.has(pet.id);
              return (
                <PetSection
                  key={pet.id}
                  pet={pet}
                  index={index}
                  collapsed={collapsed}
                  canRemove={pets.length > 1}
                  errors={errors}
                  onChange={(patch) => patchPet(pet.id, patch)}
                  onRemove={() => removePet(pet.id)}
                  onToggle={() => togglePet(pet.id)}
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={addPet}
            className="rounded-xl border border-brand bg-brand-soft px-4 py-3 text-base font-semibold text-brand-ink active:bg-brand-soft/70"
          >
            Add another pet
          </button>

          <button
            type="button"
            onClick={toReview}
            className="rounded-xl bg-brand px-4 py-3.5 text-base font-semibold text-white active:bg-brand-ink"
          >
            Review household
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink">
            This will create a new household for{" "}
            <span className="font-semibold">{ownerName}</span> with{" "}
            <span className="font-semibold">
              {petNames.length} {petNames.length === 1 ? "pet" : "pets"}
            </span>
            {petNames.length > 0 ? `: ${petNames.join(", ")}.` : "."}
          </p>

          <SectionLabel>Owner</SectionLabel>
          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Name" value={ownerName} />
            <ReviewRow label="Cell" value={formatPhone(phone)} />
            {secondaryName.trim() ? (
              <ReviewRow label="Secondary" value={secondaryName} />
            ) : null}
            {secondaryCell.trim() ? (
              <ReviewRow label="Secondary cell" value={formatPhone(secondaryCell)} />
            ) : null}
            {landline.trim() ? (
              <ReviewRow label="Landline" value={formatPhone(landline)} />
            ) : null}
            {email.trim() ? <ReviewRow label="Email" value={email} /> : null}
            {address.trim() ? (
              <ReviewRow label="Address" value={address} />
            ) : null}
            {clientNotes.trim() ? (
              <ReviewRow label="Notes" value={clientNotes} />
            ) : null}
          </dl>

          {pets.map((pet, index) => (
            <div key={pet.id}>
              <SectionLabel>{`Pet ${index + 1}`}</SectionLabel>
              <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
                <ReviewRow label="Name" value={pet.name} />
                <ReviewRow label="Breed" value={pet.breed.trim() || "Not set"} />
                <ReviewRow
                  label="Size"
                  value={
                    pet.size
                      ? (SIZE_LABELS[pet.size as PetSize] ?? "Not set")
                      : "Not set"
                  }
                />
                <ReviewRow
                  label="Age"
                  value={pet.dateOfBirth || pet.age.trim() || "Not set"}
                />
                <ReviewRow
                  label="Allergies"
                  value={choiceLabel(pet.allergyState, pet.allergiesDetail)}
                />
                <ReviewRow
                  label="Vaccinations"
                  value={choiceLabel(
                    pet.vaccinationState,
                    pet.vaccinationDetail,
                  )}
                />
                {pet.groomingNotes.trim() ? (
                  <ReviewRow label="Grooming notes" value={pet.groomingNotes} />
                ) : null}
                <ReviewRow label="Typical fee" value={feeLabel(pet.typicalFee)} />
              </dl>
            </div>
          ))}

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setStep("form")}
              disabled={pending}
              className="flex-1 rounded-xl border border-line bg-surface px-4 py-3.5 text-base font-semibold text-ink-soft active:bg-canvas disabled:opacity-50"
            >
              Back to edit
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-brand px-4 py-3.5 text-base font-semibold text-white active:bg-brand-ink disabled:opacity-50"
            >
              Confirm & save
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function PetSection({
  pet,
  index,
  collapsed,
  canRemove,
  errors,
  onChange,
  onRemove,
  onToggle,
}: {
  pet: PetDraft;
  index: number;
  collapsed: boolean;
  canRemove: boolean;
  errors: IntakeErrors;
  onChange: (patch: Partial<PetDraft>) => void;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const prefix = index === 0 ? "" : `pets.${index}.`;
  const title = `Pet ${index + 1}${pet.name.trim() ? ` - ${pet.name.trim()}` : ""}`;

  return (
    <section className="rounded-xl border border-line bg-canvas p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <div className="flex items-center gap-2">
          {index > 0 ? (
            <button
              type="button"
              onClick={onToggle}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-soft"
            >
              {collapsed ? "Edit" : "Hide"}
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg border border-danger-ink/20 bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-ink"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {collapsed ? (
        <p className="mt-2 text-xs text-ink-soft">
          {pet.breed.trim() || "Details hidden"}{" "}
          {pet.typicalFee.trim() ? `- ${feeLabel(pet.typicalFee)}` : ""}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Pet name" error={errors[`${prefix}pet_name`]}>
            <input
              type="text"
              value={pet.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Biscuit"
              className={fieldClass}
            />
          </Field>

          <Field label="Breed (optional)" error={errors[`${prefix}breed`]}>
            <input
              type="text"
              value={pet.breed}
              onChange={(e) => onChange({ breed: e.target.value })}
              placeholder="Cockapoo"
              className={fieldClass}
            />
          </Field>

          <Field label="Size (optional)" error={errors[`${prefix}size`]}>
            <select
              value={pet.size}
              onChange={(e) => onChange({ size: e.target.value })}
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Age (optional)" error={errors[`${prefix}age`]}>
              <input
                type="text"
                value={pet.age}
                onChange={(e) => onChange({ age: e.target.value })}
                placeholder="5-ish"
                className={fieldClass}
              />
            </Field>

            <Field
              label="Date of birth (optional)"
              error={errors[`${prefix}date_of_birth`]}
            >
              <input
                type="date"
                value={pet.dateOfBirth}
                onChange={(e) => onChange({ dateOfBirth: e.target.value })}
                className={fieldClass}
              />
            </Field>
          </div>

          <ChoicePicker
            label="Allergies"
            value={pet.allergyState}
            onChange={(allergyState) => onChange({ allergyState })}
            detail={pet.allergiesDetail}
            onDetailChange={(allergiesDetail) => onChange({ allergiesDetail })}
            detailError={errors[`${prefix}allergies_detail`]}
            detailMode="yes"
            detailPlaceholder="What is the pet allergic to?"
          />

          <ChoicePicker
            label="Vaccinations"
            value={pet.vaccinationState}
            onChange={(vaccinationState) => onChange({ vaccinationState })}
            detail={pet.vaccinationDetail}
            onDetailChange={(vaccinationDetail) =>
              onChange({ vaccinationDetail })
            }
            detailError={errors[`${prefix}vaccination_detail`]}
            detailMode="known"
            detailPlaceholder="Which records, expiry, or what is missing?"
          />

          <Field
            label="Grooming notes (optional)"
            error={errors[`${prefix}grooming_notes`]}
          >
            <textarea
              value={pet.groomingNotes}
              onChange={(e) => onChange({ groomingNotes: e.target.value })}
              placeholder="Cut, temperament, anything useful"
              className={`${fieldClass} min-h-24 resize-none`}
            />
          </Field>

          <Field label="Typical fee (optional)" error={errors[`${prefix}typical_fee`]}>
            <input
              type="text"
              inputMode="decimal"
              value={pet.typicalFee}
              onChange={(e) => onChange({ typicalFee: e.target.value })}
              placeholder="0.00"
              className={fieldClass}
            />
          </Field>
        </div>
      )}
    </section>
  );
}

function ChoicePicker({
  label,
  value,
  onChange,
  detail,
  onDetailChange,
  detailError,
  detailMode,
  detailPlaceholder,
}: {
  label: string;
  value: AllergyState | VaccinationState;
  onChange: (v: AllergyState) => void;
  detail: string;
  onDetailChange: (v: string) => void;
  detailError?: string;
  detailMode: "yes" | "known";
  detailPlaceholder: string;
}) {
  const options: { code: AllergyState; label: string }[] = [
    { code: "unknown", label: "Unknown" },
    { code: "no", label: "No" },
    { code: "yes", label: "Yes" },
  ];
  const showDetail =
    detailMode === "yes" ? value === "yes" : value === "yes" || value === "no";

  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-2">
        {options.map((o) => {
          const selected = value === o.code;
          return (
            <button
              key={o.code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.code)}
              className={`flex-1 rounded-xl border px-3 py-3 text-sm font-semibold ${
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
      {showDetail ? (
        <div className="mt-1.5">
          <input
            type="text"
            value={detail}
            onChange={(e) => onDetailChange(e.target.value)}
            placeholder={detailPlaceholder}
            aria-label={`${label} detail`}
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
        Use this for a brand-new owner and every pet in the household. Review
        carefully before saving.
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
      Demo mode - this is anonymized practice data. Confirming will not save
      anything.
    </p>
  );
}

function ResultScreen({
  state,
  onDone,
}: {
  state: Extract<IntakeState, { status: "demo" | "gated" | "saved" }>;
  onDone: () => void;
}) {
  const { summary } = state;
  const saved = state.status === "saved";
  const headline = saved
    ? "Household saved"
    : state.status === "demo"
      ? "Demo only - nothing was saved"
      : "Not saved - client/pet creation is switched off.";
  const detail = saved
    ? `The new owner and ${summary.petNames.length} pet${summary.petNames.length === 1 ? "" : "s"} were added to the production book.`
    : state.status === "demo"
      ? "This is anonymized practice data, so the household was not created. The whole flow above is real - it starts saving once live writes are enabled."
      : state.message;

  return (
    <div className="flex flex-col gap-3.5">
      <div
        className={`flex gap-2.5 rounded-xl p-3.5 ${
          saved ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
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
            <path d="M20 6 9 17l-5-5" />
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
        The household reviewed was{" "}
        <span className="font-semibold text-ink">{summary.ownerName}</span> with{" "}
        <span className="font-semibold text-ink">
          {summary.petNames.join(", ")}
        </span>
        .
      </p>

      <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
        <ReviewRow label="Phone" value={formatPhone(summary.phone)} />
        <ReviewRow label="First pet breed" value={summary.petBreed ?? "Not set"} />
        <ReviewRow
          label="First pet size"
          value={summary.petSize ? SIZE_LABELS[summary.petSize] : "Not set"}
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
      {children}
    </h3>
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
    <label className="flex flex-col gap-2">
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
