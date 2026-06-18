"use client";

import { useActionState } from "react";
import {
  saveLocationSettingsWithState,
  type OperatorSettingsState,
} from "@/lib/actions/settings";
import type { LocationSettingsMap } from "@/lib/operatorSettings";
import { SubmitDogOverlay } from "./SubmitDog";

const inputClass = "tt-input";
const textareaClass = "tt-textarea resize-none";

function LocationBlock({
  code,
  title,
  settings,
}: {
  code: keyof LocationSettingsMap;
  title: string;
  settings: LocationSettingsMap[keyof LocationSettingsMap];
}) {
  return (
    <fieldset className="rounded-lg border border-line bg-canvas p-3">
      <legend className="px-1 text-sm font-semibold text-ink">{title}</legend>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-soft">Display name</span>
          <input
            name={`location.${code}.displayName`}
            defaultValue={settings.displayName}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-soft">
            Customer address text
          </span>
          <textarea
            name={`location.${code}.customerAddress`}
            defaultValue={settings.customerAddress}
            rows={2}
            className={textareaClass}
          />
        </label>
        <input
          type="hidden"
          name={`location.${code}.payoutType`}
          value="percent"
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-soft">
            Salon keeps %
          </span>
          <input
            type="number"
            name={`location.${code}.salonKeepsPercent`}
            min="0"
            max="100"
            step="0.01"
            defaultValue={settings.salonKeepsPercent}
            className={inputClass}
          />
        </label>
      </div>
    </fieldset>
  );
}

export function LocationSettingsForm({
  settings,
}: {
  settings: LocationSettingsMap;
}) {
  const [state, formAction, pending] = useActionState<
    OperatorSettingsState,
    FormData
  >(saveLocationSettingsWithState, { status: "idle" });

  return (
    <form action={formAction} className="border-t border-line px-3.5 py-3">
      <SubmitDogOverlay label="Saving salon settings" show={pending} />
      {state.status === "saved" ? (
        <p className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
          Salon settings saved.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        <LocationBlock code="gina" title="Gina" settings={settings.gina} />
        <LocationBlock code="annette" title="Annette" settings={settings.annette} />
      </div>

      <div className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-ink-soft">
        Custom locations and daily-rate payouts are ready in the calculation
        model, but adding new appointment locations needs the database location
        constraint updated first.
      </div>

      <button
        type="submit"
        disabled={pending}
        className="tt-btn tt-btn-primary mt-3 w-full"
      >
        Save salon settings
      </button>
    </form>
  );
}
