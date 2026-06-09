"use client";

// Onboarding wizard for a brand-new business (WS3 front door + TT-004/005).
//
// Captures the real shape of the business: an up-front STRUCTURE question (own /
// works-for-others / both), one scheduling style for the owned operation, and
// one or more locations each typed OWNED (keep 100% + track expenses) or RENTED
// (percent / daily-rate split). The review step can be edited (Back + per-section
// Edit) before "Create my business" commits. CAPTURE only — take-home reporting
// and payout math are WS4b/WS4c. Everything persists into org_settings.settings
// via createOrganization; no DB migration.

import { useActionState, useState } from "react";
import {
  createOrganization,
  type OnboardingState,
} from "@/lib/actions/onboarding";
import {
  EXPENSE_CATEGORIES,
  MAX_LOCATIONS,
  type BusinessStructure,
  type LocationExpenses,
  type SchedulingStyle,
} from "@/lib/onboarding";
import { SubmitDogOverlay } from "./SubmitDog";

type LocationType = "owned" | "rented";

type LocationDraft = {
  name: string;
  address: string;
  type: LocationType;
  // rented split
  payoutType: "percent" | "daily_rate";
  salonKeepsPercent: string;
  dailyRate: string;
  // owned expenses (optional amounts as strings)
  expenses: Record<keyof LocationExpenses, string>;
};

function emptyExpenses(): Record<keyof LocationExpenses, string> {
  return { rentMortgage: "", utilities: "", supplies: "", upkeep: "", cleaning: "" };
}

function emptyLocation(type: LocationType): LocationDraft {
  return {
    name: "",
    address: "",
    type,
    payoutType: "percent",
    salonKeepsPercent: "30",
    dailyRate: "",
    expenses: emptyExpenses(),
  };
}

function defaultTypeFor(structure: BusinessStructure): LocationType {
  return structure === "works_for_others" ? "rented" : "owned";
}

const STRUCTURE_OPTIONS: {
  value: BusinessStructure;
  title: string;
  detail: string;
}[] = [
  {
    value: "own",
    title: "I run my own business",
    detail: "You own your space (or work from home/mobile) and keep what you charge.",
  },
  {
    value: "works_for_others",
    title: "I work at other shops",
    detail: "You rent a chair or are paid a cut per dog/day at shops you don't own.",
  },
  {
    value: "hybrid",
    title: "Both",
    detail: "Your own business plus chairs at other shops.",
  },
];

// Steps are fixed so per-section Edit can jump to a known index.
const STEPS = ["Structure", "Business", "Scheduling", "Locations", "Economics", "Review"] as const;
const STEP = { structure: 0, business: 1, scheduling: 2, locations: 3, economics: 4, review: 5 };

const inputClass =
  "min-h-12 rounded-xl border border-line bg-white px-4 py-3 text-base text-ink placeholder:text-ink-faint transition focus:border-brand";
const primaryButton =
  "min-h-12 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-ink active:bg-brand-ink disabled:opacity-60";
const ghostButton =
  "min-h-12 rounded-xl border border-line bg-white px-4 py-3 text-base font-semibold text-ink-soft transition hover:border-brand disabled:opacity-60";

export function OnboardingWizard() {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    createOrganization,
    null,
  );

  const [step, setStep] = useState(0);
  const [businessStructure, setBusinessStructure] = useState<BusinessStructure>("own");
  const [businessName, setBusinessName] = useState("");
  const [schedulingStyle, setSchedulingStyle] = useState<SchedulingStyle>("batched");
  const [locations, setLocations] = useState<LocationDraft[]>([emptyLocation("owned")]);

  function chooseStructure(value: BusinessStructure) {
    setBusinessStructure(value);
    // Changing the fundamental structure re-defaults each location's type (the
    // per-location toggle still overrides on the Locations step). Only the `type`
    // flag changes — payout %, daily rate, and expense entries are preserved via
    // the spread, so an Edit-and-continue with the same structure is a no-op.
    const nextType = defaultTypeFor(value);
    setLocations((prev) => prev.map((l) => ({ ...l, type: nextType })));
  }

  function updateLocation(index: number, patch: Partial<LocationDraft>) {
    setLocations((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function updateExpense(index: number, key: keyof LocationExpenses, value: string) {
    setLocations((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, expenses: { ...l.expenses, [key]: value } } : l,
      ),
    );
  }

  const businessOk = businessName.trim().length > 0;
  const locationsDetailsOk = locations.every((l) => l.name.trim() && l.address.trim());
  const economicsOk = locations.every(
    (l) => l.type === "owned" || l.payoutType !== "daily_rate" || Number(l.dailyRate) > 0,
  );

  const payload = {
    businessName: businessName.trim(),
    businessStructure,
    schedulingStyle,
    locations: locations.map((l) =>
      l.type === "owned"
        ? {
            type: "owned" as const,
            name: l.name.trim(),
            address: l.address.trim(),
            expenses: l.expenses,
          }
        : {
            type: "rented" as const,
            name: l.name.trim(),
            address: l.address.trim(),
            payoutType: l.payoutType,
            salonKeepsPercent: Number(l.salonKeepsPercent),
            dailyRate: l.dailyRate,
          },
    ),
  };

  const error = state && "error" in state ? state.error : null;
  const continueDisabled =
    (step === STEP.business && !businessOk) ||
    (step === STEP.locations && !locationsDetailsOk) ||
    (step === STEP.economics && !economicsOk);

  return (
    <div className="overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-[0_18px_60px_rgba(28,27,34,0.10)]">
      <div className="border-b border-line bg-white px-6 pb-6 pt-7 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          Tidy Tails
        </p>
        <h1 className="mt-2 text-xl font-semibold text-ink">
          Let&rsquo;s set up your business
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Step {step + 1} of {STEPS.length} — {STEPS[step]}
        </p>
        <ol className="mt-4 flex gap-1.5" aria-hidden="true">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-line"}`}
            />
          ))}
        </ol>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <SubmitDogOverlay label="Creating your business" show={pending} />

        {/* Step 1 — business structure */}
        {step === STEP.structure && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium text-ink-soft">
              How is your grooming set up?
            </legend>
            {STRUCTURE_OPTIONS.map((opt) => (
              <ChoiceCard
                key={opt.value}
                name="businessStructure"
                checked={businessStructure === opt.value}
                onChange={() => chooseStructure(opt.value)}
                title={opt.title}
                detail={opt.detail}
              />
            ))}
          </fieldset>
        )}

        {/* Step 2 — business name */}
        {step === STEP.business && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-soft">Business name</span>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Rusty&rsquo;s Shop"
              className={inputClass}
              autoFocus
            />
          </label>
        )}

        {/* Step 3 — scheduling style (for the owned operation) */}
        {step === STEP.scheduling && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium text-ink-soft">
              How do you schedule your own days?
            </legend>
            {businessStructure === "works_for_others" ? (
              <p className="rounded-xl bg-brand-soft/50 px-4 py-3 text-xs leading-5 text-ink-soft">
                You&rsquo;re paid per dog/day at shops you work for, so they set the
                schedule. This default is fine — you can change it later.
              </p>
            ) : null}
            <ChoiceCard
              name="schedulingStyle"
              checked={schedulingStyle === "batched"}
              onChange={() => setSchedulingStyle("batched")}
              title="By the whole day (load-based)"
              detail="You book a set of dogs per day and balance the load — you decide the order."
            />
            <ChoiceCard
              name="schedulingStyle"
              checked={schedulingStyle === "one_to_one"}
              onChange={() => setSchedulingStyle("one_to_one")}
              title="By appointment time (1:1 blocks)"
              detail="Each booking is a specific time slot of a set length."
            />
          </fieldset>
        )}

        {/* Step 4 — locations (name + address + owned/rented) */}
        {step === STEP.locations && (
          <div className="flex flex-col gap-4">
            {locations.map((loc, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">Location {i + 1}</span>
                  {locations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLocations((prev) => prev.filter((_, j) => j !== i))}
                      className="text-sm font-medium text-danger-ink hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink-soft">Name</span>
                  <input
                    value={loc.name}
                    onChange={(e) => updateLocation(i, { name: e.target.value })}
                    maxLength={200}
                    placeholder="e.g. Rusty's Shop, Gina's"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink-soft">Address</span>
                  <input
                    value={loc.address}
                    onChange={(e) => updateLocation(i, { address: e.target.value })}
                    maxLength={200}
                    placeholder="Street, city"
                    className={inputClass}
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink-soft">Is this yours or a chair you rent?</span>
                  <div className="grid grid-cols-2 gap-2">
                    <TypeToggle
                      active={loc.type === "owned"}
                      onClick={() => updateLocation(i, { type: "owned" })}
                      label="I own it"
                    />
                    <TypeToggle
                      active={loc.type === "rented"}
                      onClick={() => updateLocation(i, { type: "rented" })}
                      label="I rent / get a cut"
                    />
                  </div>
                </div>
              </div>
            ))}
            {locations.length < MAX_LOCATIONS && (
              <button
                type="button"
                onClick={() =>
                  setLocations((prev) => [...prev, emptyLocation(defaultTypeFor(businessStructure))])
                }
                className={ghostButton}
              >
                + Add another location
              </button>
            )}
          </div>
        )}

        {/* Step 5 — economics per location (branches on type) */}
        {step === STEP.economics && (
          <div className="flex flex-col gap-4">
            {locations.map((loc, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
                <span className="text-sm font-semibold text-ink">
                  {loc.name.trim() || `Location ${i + 1}`}
                </span>
                {loc.type === "owned" ? (
                  <>
                    <p className="rounded-lg bg-brand-soft/50 px-3 py-2 text-xs leading-5 text-ink-soft">
                      You keep 100% here. Add your monthly expenses if you want to track
                      take-home later — all optional.
                    </p>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <label key={cat.key} className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-ink-soft">{cat.label}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={loc.expenses[cat.key]}
                          onChange={(e) => updateExpense(i, cat.key, e.target.value)}
                          placeholder="$ optional"
                          className={`${inputClass} w-36`}
                        />
                      </label>
                    ))}
                  </>
                ) : (
                  <>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-ink-soft">The shop&rsquo;s cut</span>
                      <select
                        value={loc.payoutType}
                        onChange={(e) =>
                          updateLocation(i, { payoutType: e.target.value as LocationDraft["payoutType"] })
                        }
                        className={inputClass}
                      >
                        <option value="percent">A percentage of each groom</option>
                        <option value="daily_rate">A flat daily rate</option>
                      </select>
                    </label>
                    {loc.payoutType === "percent" ? (
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-ink-soft">The shop keeps %</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={100}
                          value={loc.salonKeepsPercent}
                          onChange={(e) => updateLocation(i, { salonKeepsPercent: e.target.value })}
                          className={inputClass}
                        />
                      </label>
                    ) : (
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-ink-soft">Daily rate ($)</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={loc.dailyRate}
                          onChange={(e) => updateLocation(i, { dailyRate: e.target.value })}
                          placeholder="e.g. 85"
                          className={inputClass}
                        />
                      </label>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step 6 — review (Back + per-section Edit) */}
        {step === STEP.review && (
          <div className="flex flex-col gap-4">
            <dl className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 text-sm">
              <ReviewRow
                label="Setup"
                value={STRUCTURE_OPTIONS.find((o) => o.value === businessStructure)?.title ?? ""}
                onEdit={() => setStep(STEP.structure)}
              />
              <ReviewRow
                label="Business"
                value={businessName.trim()}
                onEdit={() => setStep(STEP.business)}
              />
              <ReviewRow
                label="Scheduling"
                value={
                  schedulingStyle === "one_to_one"
                    ? "By appointment time (1:1 blocks)"
                    : "By the whole day (load-based)"
                }
                onEdit={() => setStep(STEP.scheduling)}
              />
              <div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="font-medium text-ink-soft">Locations</dt>
                  <button
                    type="button"
                    onClick={() => setStep(STEP.locations)}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    Edit
                  </button>
                </div>
                <dd className="mt-1 flex flex-col gap-1 text-ink">
                  {locations.map((l, i) => (
                    <span key={i}>
                      {l.name.trim()} — {l.address.trim()} ({describeEconomics(l)})
                    </span>
                  ))}
                </dd>
              </div>
            </dl>

            {error && (
              <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(STEP.economics)} className={ghostButton}>
                Back
              </button>
              <form action={formAction} className="flex-1">
                <input type="hidden" name="payload" value={JSON.stringify(payload)} />
                <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
                  {pending ? "Creating your business..." : "Create my business"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Step navigation (review has its own Back + submit) */}
        {step < STEP.review && (
          <div className="mt-6 flex gap-3">
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className={ghostButton}>
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={continueDisabled}
              className={`${primaryButton} flex-1`}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function describeEconomics(l: LocationDraft): string {
  if (l.type === "owned") {
    const entered = EXPENSE_CATEGORIES.filter((c) => Number(l.expenses[c.key]) > 0).length;
    return entered > 0 ? `own — keep 100%, ${entered} expense${entered === 1 ? "" : "s"}` : "own — keep 100%";
  }
  return l.payoutType === "percent"
    ? `rented — shop keeps ${Number(l.salonKeepsPercent) || 0}%`
    : `rented — $${Number(l.dailyRate) || 0}/day`;
}

function ChoiceCard({
  name,
  checked,
  onChange,
  title,
  detail,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col gap-1 rounded-xl border bg-white p-4 transition ${
        checked ? "border-brand ring-1 ring-brand" : "border-line"
      }`}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onChange}
          className="h-4 w-4 accent-brand"
        />
        <span className="text-sm font-semibold text-ink">{title}</span>
      </span>
      <span className="pl-6 text-xs leading-5 text-ink-soft">{detail}</span>
    </label>
  );
}

function TypeToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
        active ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-white text-ink-soft"
      }`}
    >
      {label}
    </button>
  );
}

function ReviewRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-medium text-ink-soft">{label}</dt>
      <dd className="flex items-baseline gap-3 text-right text-ink">
        <span>{value}</span>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-xs font-semibold text-brand hover:underline"
        >
          Edit
        </button>
      </dd>
    </div>
  );
}
