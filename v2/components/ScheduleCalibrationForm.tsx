"use client";

import { useActionState } from "react";
import {
  saveScheduleCalibrationWithState,
  type OperatorSettingsState,
} from "@/lib/actions/settings";
import type { ScheduleCalibration } from "@/lib/operatorSettings";
import { SubmitDogOverlay } from "./SubmitDog";

const numberClass =
  "w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink";
const textClass =
  "w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-sm leading-relaxed text-ink";

function NumberField({
  name,
  label,
  value,
  step = "1",
}: {
  name: keyof ScheduleCalibration;
  label: string;
  value: number;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      <input
        type="number"
        name={name}
        step={step}
        defaultValue={value}
        className={numberClass}
      />
    </label>
  );
}

export function ScheduleCalibrationForm({
  calibration,
}: {
  calibration: ScheduleCalibration;
}) {
  const [state, formAction, pending] = useActionState<
    OperatorSettingsState,
    FormData
  >(saveScheduleCalibrationWithState, { status: "idle" });

  return (
    <form action={formAction} className="border-t border-line px-3.5 py-3">
      <SubmitDogOverlay label="Saving schedule calibration" show={pending} />
      {state.status === "saved" ? (
        <p className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
          Schedule calibration saved.
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <NumberField
          name="normalDogCount"
          label="Normal dogs"
          value={calibration.normalDogCount}
        />
        <NumberField
          name="heavyDogCount"
          label="Caution dogs"
          value={calibration.heavyDogCount}
        />
        <NumberField
          name="largeDogMax"
          label="Large max"
          value={calibration.largeDogMax}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberField
          name="annetteLargeCrateLimit"
          label="Annette large crates"
          value={calibration.annetteLargeCrateLimit}
        />
        <NumberField
          name="ginaLargeCrateLimit"
          label="Gina large crates"
          value={calibration.ginaLargeCrateLimit}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberField
          name="heavyLoadPoints"
          label="Caution points"
          value={calibration.heavyLoadPoints}
          step="0.25"
        />
        <NumberField
          name="targetLoadPoints"
          label="Heavy points"
          value={calibration.targetLoadPoints}
          step="0.25"
        />
      </div>

      <details className="mt-3 rounded-lg border border-line bg-canvas">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-ink">
          Dog size weights
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
          <NumberField
            name="smallDogPoints"
            label="Small"
            value={calibration.smallDogPoints}
            step="0.25"
          />
          <NumberField
            name="mediumDogPoints"
            label="Medium"
            value={calibration.mediumDogPoints}
            step="0.25"
          />
          <NumberField
            name="largeDogPoints"
            label="Large"
            value={calibration.largeDogPoints}
            step="0.25"
          />
          <NumberField
            name="xlDogPoints"
            label="XL"
            value={calibration.xlDogPoints}
            step="0.25"
          />
        </div>
      </details>

      <details className="mt-3 rounded-lg border border-line bg-canvas">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-ink">
          Coat, style, and behavior
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
          <NumberField
            name="styleAdjustment"
            label="Style"
            value={calibration.styleAdjustment}
            step="0.25"
          />
          <NumberField
            name="longCoatAdjustment"
            label="Long coat"
            value={calibration.longCoatAdjustment}
            step="0.25"
          />
          <NumberField
            name="behaviorAdjustment"
            label="Handling"
            value={calibration.behaviorAdjustment}
            step="0.25"
          />
          <NumberField
            name="mattingAdjustment"
            label="Matting"
            value={calibration.mattingAdjustment}
            step="0.25"
          />
          <NumberField
            name="straightShaveAdjustment"
            label="Simple cut"
            value={calibration.straightShaveAdjustment}
            step="0.25"
          />
          <NumberField
            name="bathOnlyAdjustment"
            label="Bath only"
            value={calibration.bathOnlyAdjustment}
            step="0.25"
          />
          <NumberField
            name="fullGroomAdjustment"
            label="Full groom"
            value={calibration.fullGroomAdjustment}
            step="0.25"
          />
          <NumberField
            name="nailTrimAdjustment"
            label="Nails"
            value={calibration.nailTrimAdjustment}
            step="0.25"
          />
        </div>
      </details>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">Warning wording</span>
        <textarea
          name="warningLanguage"
          rows={2}
          defaultValue={calibration.warningLanguage}
          className={textClass}
        />
      </label>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">
          Special handling notes
        </span>
        <textarea
          name="specialHandlingNotes"
          rows={4}
          defaultValue={calibration.specialHandlingNotes}
          className={textClass}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-3 w-full rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink disabled:opacity-60"
      >
        Save schedule calibration
      </button>
    </form>
  );
}
