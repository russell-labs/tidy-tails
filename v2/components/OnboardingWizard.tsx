"use client";

// Onboarding wizard for a brand-new business (WS3 — the front door).
//
// A confirmed user with no organization lands here. The wizard captures the
// minimum WS3 needs — business name, scheduling style, and one or more GENERIC
// locations with per-location economics — then submits once to the
// createOrganization server action, which creates the org + owner membership +
// seeded settings. WS3 only RECORDS the scheduling style and economics; the 1:1
// scheduling engine and the economics engine are WS4. Locations are arbitrary;
// there is no Sam-specific gina/annette here.

import { useActionState, useState } from "react";
import {
  createOrganization,
  type OnboardingState,
} from "@/lib/actions/onboarding";
import { MAX_LOCATIONS, type SchedulingStyle } from "@/lib/onboarding";
import { SubmitDogOverlay } from "./SubmitDog";

type LocationDraft = {
  name: string;
  address: string;
  payoutType: "percent" | "daily_rate";
  salonKeepsPercent: string;
  dailyRate: string;
};

function emptyLocation(): LocationDraft {
  return {
    name: "",
    address: "",
    payoutType: "percent",
    salonKeepsPercent: "30",
    dailyRate: "",
  };
}

const STEPS = ["Business", "Scheduling", "Locations", "Economics", "Review"] as const;

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
  const [businessName, setBusinessName] = useState("");
  const [schedulingStyle, setSchedulingStyle] =
    useState<SchedulingStyle>("batched");
  const [locations, setLocations] = useState<LocationDraft[]>([emptyLocation()]);

  function updateLocation(index: number, patch: Partial<LocationDraft>) {
    setLocations((prev) =>
      prev.map((loc, i) => (i === index ? { ...loc, ...patch } : loc)),
    );
  }

  const businessOk = businessName.trim().length > 0;
  const locationsDetailsOk = locations.every(
    (l) => l.name.trim() && l.address.trim(),
  );
  const economicsOk = locations.every(
    (l) => l.payoutType !== "daily_rate" || Number(l.dailyRate) > 0,
  );

  const payload = {
    businessName: businessName.trim(),
    schedulingStyle,
    locations: locations.map((l) => ({
      name: l.name.trim(),
      address: l.address.trim(),
      payoutType: l.payoutType,
      salonKeepsPercent: Number(l.salonKeepsPercent),
      dailyRate: l.dailyRate,
    })),
  };

  const error = state && "error" in state ? state.error : null;

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
              className={`h-1.5 flex-1 rounded-full ${
                i <= step ? "bg-brand" : "bg-line"
              }`}
            />
          ))}
        </ol>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <SubmitDogOverlay label="Creating your business" show={pending} />

        {/* Step 1 — business name */}
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-soft">
                Business name
              </span>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                maxLength={120}
                placeholder="e.g. Cheryl&rsquo;s Mobile Grooming"
                className={inputClass}
                autoFocus
              />
            </label>
          </div>
        )}

        {/* Step 2 — scheduling style */}
        {step === 1 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium text-ink-soft">
              How do you schedule your day?
            </legend>
            <StyleOption
              checked={schedulingStyle === "batched"}
              onChange={() => setSchedulingStyle("batched")}
              title="By the whole day (load-based)"
              detail="You book a set of dogs per day and balance the load — you decide the order."
            />
            <StyleOption
              checked={schedulingStyle === "one_to_one"}
              onChange={() => setSchedulingStyle("one_to_one")}
              title="By appointment time (1:1 blocks)"
              detail="Each booking is a specific time slot of a set length."
            />
            <p className="text-xs leading-5 text-ink-faint">
              You can change this later. It tunes how the schedule works for you.
            </p>
          </fieldset>
        )}

        {/* Step 3 — locations (name + address) */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            {locations.map((loc, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">
                    Location {i + 1}
                  </span>
                  {locations.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setLocations((prev) => prev.filter((_, j) => j !== i))
                      }
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
                    placeholder="e.g. Main shop, North van"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink-soft">
                    Address
                  </span>
                  <input
                    value={loc.address}
                    onChange={(e) =>
                      updateLocation(i, { address: e.target.value })
                    }
                    maxLength={200}
                    placeholder="Street, city"
                    className={inputClass}
                  />
                </label>
              </div>
            ))}
            {locations.length < MAX_LOCATIONS && (
              <button
                type="button"
                onClick={() =>
                  setLocations((prev) => [...prev, emptyLocation()])
                }
                className={ghostButton}
              >
                + Add another location
              </button>
            )}
          </div>
        )}

        {/* Step 4 — economics per location */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            {locations.map((loc, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4"
              >
                <span className="text-sm font-semibold text-ink">
                  {loc.name.trim() || `Location ${i + 1}`}
                </span>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink-soft">
                    Payout model
                  </span>
                  <select
                    value={loc.payoutType}
                    onChange={(e) =>
                      updateLocation(i, {
                        payoutType: e.target.value as LocationDraft["payoutType"],
                      })
                    }
                    className={inputClass}
                  >
                    <option value="percent">Salon keeps a percentage</option>
                    <option value="daily_rate">Flat daily rate</option>
                  </select>
                </label>
                {loc.payoutType === "percent" ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink-soft">
                      Salon keeps %
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      value={loc.salonKeepsPercent}
                      onChange={(e) =>
                        updateLocation(i, { salonKeepsPercent: e.target.value })
                      }
                      className={inputClass}
                    />
                  </label>
                ) : (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink-soft">
                      Daily rate ($)
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={loc.dailyRate}
                      onChange={(e) =>
                        updateLocation(i, { dailyRate: e.target.value })
                      }
                      placeholder="e.g. 85"
                      className={inputClass}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step 5 — review + create */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <dl className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 text-sm">
              <SummaryRow label="Business" value={businessName.trim()} />
              <SummaryRow
                label="Scheduling"
                value={
                  schedulingStyle === "one_to_one"
                    ? "By appointment time (1:1 blocks)"
                    : "By the whole day (load-based)"
                }
              />
              <div>
                <dt className="font-medium text-ink-soft">Locations</dt>
                <dd className="mt-1 flex flex-col gap-1 text-ink">
                  {locations.map((l, i) => (
                    <span key={i}>
                      {l.name.trim()} — {l.address.trim()} (
                      {l.payoutType === "percent"
                        ? `salon keeps ${Number(l.salonKeepsPercent) || 0}%`
                        : `$${Number(l.dailyRate) || 0}/day`}
                      )
                    </span>
                  ))}
                </dd>
              </div>
            </dl>

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink"
              >
                {error}
              </p>
            )}

            <form action={formAction}>
              <input
                type="hidden"
                name="payload"
                value={JSON.stringify(payload)}
              />
              <button type="submit" disabled={pending} className={primaryButton}>
                {pending ? "Creating your business..." : "Create my business"}
              </button>
            </form>
          </div>
        )}

        {/* Step navigation (review step has its own submit) */}
        {step < 4 && (
          <div className="mt-6 flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className={ghostButton}
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={
                (step === 0 && !businessOk) ||
                (step === 2 && !locationsDetailsOk) ||
                (step === 3 && !economicsOk)
              }
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

function StyleOption({
  checked,
  onChange,
  title,
  detail,
}: {
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
          name="schedulingStyle"
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-medium text-ink-soft">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
