"use client";

import { useActionState, useState } from "react";
import { saveIntake, type IntakeState } from "@/lib/actions/intake";
import {
  PET_SIZES,
  validateIntake,
  type AllergyState,
  type IntakeErrors,
  type PetSize,
} from "@/lib/intake";
import { formatMoney, formatPhone } from "@/lib/format";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";

// Add household — onboard a new client + their first pet: form → review →
// result. Fixture mode is a dry-run; live mode persists only when the private
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

function allergyLabel(allergies: boolean | null): string {
  if (allergies === true) return "Yes";
  if (allergies === false) return "No";
  return "Unknown";
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
  // `step` is plain local state, never derived from `state` — a server result
  // must not lock navigation. A server-side error (expired session) surfaces
  // as the banner below, which renders on either step.
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<IntakeErrors>({});

  // Owner fields.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  // Pet fields. Allergy state defaults to "unknown" — it asserts nothing.
  const [petName, setPetName] = useState("");
  const [breed, setBreed] = useState("");
  const [size, setSize] = useState("");
  const [allergyState, setAllergyState] = useState<AllergyState>("unknown");
  const [allergiesDetail, setAllergiesDetail] = useState("");
  const [groomingNotes, setGroomingNotes] = useState("");
  const [typicalFee, setTypicalFee] = useState("");

  function toReview() {
    const v = validateIntake({
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      address,
      notes: clientNotes,
      pet_name: petName,
      breed,
      size,
      allergy_state: allergyState,
      allergies_detail: allergiesDetail,
      grooming_notes: groomingNotes,
      typical_fee: typicalFee,
    });
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    setStep("review");
  }

  // Terminal: the action ran.
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
      ? (state.formError ?? "Please check the household details and try again.")
      : undefined;

  const ownerName = `${firstName} ${lastName}`.trim();

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-2">
      <SubmitDogOverlay label="Saving household" show={pending} />
      {/* Hidden fields carry the current values into the server action,
          regardless of which step is visible. */}
      <input type="hidden" name="first_name" value={firstName} />
      <input type="hidden" name="last_name" value={lastName} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="address" value={address} />
      <input type="hidden" name="notes" value={clientNotes} />
      <input type="hidden" name="pet_name" value={petName} />
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

          <Field label="Phone" error={errors.phone}>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="416-555-0142"
              className={fieldClass}
            />
          </Field>

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
            <input
              type="text"
              value={clientNotes}
              onChange={(e) => setClientNotes(e.target.value)}
              placeholder="Anything to remember about the owner"
              className={fieldClass}
            />
          </Field>

          <SectionLabel>Pet</SectionLabel>

          <Field label="Pet name" error={errors.pet_name}>
            <input
              type="text"
              value={petName}
              onChange={(e) => setPetName(e.target.value)}
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
            <input
              type="text"
              value={groomingNotes}
              onChange={(e) => setGroomingNotes(e.target.value)}
              placeholder="Cut, temperament, anything useful"
              className={fieldClass}
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
            className="rounded-xl bg-brand px-4 py-3.5 text-base font-semibold text-white active:bg-brand-ink"
          >
            Review household
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink">
            This will create a new household for{" "}
            <span className="font-semibold">{ownerName}</span> with one pet,{" "}
            <span className="font-semibold">{petName}</span>.
          </p>

          <SectionLabel>Owner</SectionLabel>
          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Name" value={ownerName} />
            <ReviewRow label="Phone" value={formatPhone(phone)} />
            {email.trim() ? <ReviewRow label="Email" value={email} /> : null}
            {address.trim() ? (
              <ReviewRow label="Address" value={address} />
            ) : null}
            {clientNotes.trim() ? (
              <ReviewRow label="Notes" value={clientNotes} />
            ) : null}
          </dl>

          <SectionLabel>Pet</SectionLabel>
          <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
            <ReviewRow label="Name" value={petName} />
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
      <div
        role="radiogroup"
        aria-label="Allergies"
        className="flex gap-2"
      >
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
        Use this for a brand-new owner plus first pet. Review carefully before
        saving.
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
  state: Extract<IntakeState, { status: "demo" | "gated" | "saved" }>;
  onDone: () => void;
}) {
  const { summary } = state;
  const saved = state.status === "saved";
  const headline = saved
    ? "Household saved"
    : state.status === "demo"
      ? "Demo only — nothing was saved"
      : "Not saved — client/pet creation is switched off.";
  const detail = saved
    ? "The new owner and first pet were added to the production book."
    : state.status === "demo"
      ? "This is anonymized practice data, so the household was not created. The whole flow above is real — it starts saving once live writes are enabled."
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
        <span className="font-semibold text-ink">{summary.ownerName}</span> with
        the pet{" "}
        <span className="font-semibold text-ink">{summary.petName}</span>.
      </p>

      <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
        <ReviewRow label="Phone" value={formatPhone(summary.phone)} />
        <ReviewRow label="Breed" value={summary.petBreed ?? "Not set"} />
        <ReviewRow
          label="Size"
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
