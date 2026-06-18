"use client";

import { useActionState } from "react";
import {
  saveOperatorSettingsWithState,
  type OperatorSettingsState,
} from "@/lib/actions/settings";
import {
  LAPSED_THRESHOLD_OPTIONS,
  type OperatorSettings,
} from "@/lib/operatorSettings";
import { SubmitDogOverlay } from "./SubmitDog";

export function MessageDraftSettingsForm({
  settings,
}: {
  settings: OperatorSettings;
}) {
  const [state, formAction, pending] = useActionState<
    OperatorSettingsState,
    FormData
  >(saveOperatorSettingsWithState, { status: "idle" });

  return (
    <form
      action={formAction}
      className="rounded-xl border border-line bg-surface px-3.5 py-3"
    >
      <SubmitDogOverlay label="Saving message settings" show={pending} />
      {state.status === "saved" ? (
        <p className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
          Message settings saved.
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-ink-soft">
        The app prepares drafts only. You still review and confirm every
        message before anything sends.
      </p>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">
          Booking confirmation
        </span>
        <textarea
          name="bookingConfirmationTemplate"
          rows={5}
          defaultValue={settings.bookingConfirmationTemplate}
          className="tt-textarea resize-none"
        />
      </label>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">
          First platform text
        </span>
        <textarea
          name="firstPlatformTextTemplate"
          rows={6}
          defaultValue={settings.firstPlatformTextTemplate}
          className="tt-textarea resize-none"
        />
      </label>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">
          Appointment reminder
        </span>
        <textarea
          name="appointmentReminderTemplate"
          rows={4}
          defaultValue={settings.appointmentReminderTemplate}
          className="tt-textarea resize-none"
        />
      </label>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">
          Rebook follow-up
        </span>
        <textarea
          name="rebookReminderTemplate"
          rows={4}
          defaultValue={settings.rebookReminderTemplate}
          className="tt-textarea resize-none"
        />
      </label>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">
          Ready for pickup
        </span>
        <textarea
          name="readyPickupTemplate"
          rows={4}
          defaultValue={settings.readyPickupTemplate}
          className="tt-textarea resize-none"
        />
      </label>

      <fieldset className="mt-3">
        <legend className="text-sm font-semibold text-ink">
          Lapsed-client threshold
        </legend>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {LAPSED_THRESHOLD_OPTIONS.map((days) => (
            <label
              key={days}
              className="has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-white rounded-lg border border-line bg-canvas px-2 py-2 text-center text-xs font-semibold text-ink-soft"
            >
              <input
                type="radio"
                name="lapsedThresholdDays"
                value={days}
                defaultChecked={settings.lapsedThresholdDays === days}
                className="sr-only"
              />
              {days}d
            </label>
          ))}
        </div>
      </fieldset>

      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        Placeholders: [first name], [pet name], [date], [time], [service],
        [location]. Reports use this threshold by default.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="tt-btn tt-btn-primary mt-3 w-full"
      >
        Save message settings
      </button>
    </form>
  );
}
