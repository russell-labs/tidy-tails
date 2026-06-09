"use client";

import { useActionState, useState } from "react";
import { prepareReminder, type ReminderState } from "@/lib/actions/reminders";
import {
  buildReminderMessage,
  validateReminderInput,
  type ReminderErrors,
} from "@/lib/reminders";
import { formatDate, formatPhone } from "@/lib/format";
import type { OperatorSettings } from "@/lib/operatorSettings";
import {
  HouseholdNumberSelect,
  defaultHouseholdNumber,
  householdHasNumberChoice,
} from "./HouseholdNumberSelect";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";

const MESSAGE_MAX = 480;

const textareaClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint resize-none leading-relaxed";

export function ScheduleReminder({
  clientId,
  appointmentId,
  ownerFirstName,
  ownerName,
  phone,
  altContact,
  petName,
  appointmentDate,
  appointmentTime,
  appointmentLocation,
  mode,
  reminderSettings,
}: {
  clientId: string;
  appointmentId: string;
  ownerFirstName: string;
  ownerName: string;
  phone: string;
  altContact: string | null;
  petName: string | null;
  appointmentDate: string;
  appointmentTime: string | null;
  appointmentLocation: string | null;
  mode: "fixtures" | "live";
  reminderSettings: Pick<
    OperatorSettings,
    "appointmentReminderTemplate" | "rebookReminderTemplate" | "locationSettings"
  >;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function close() {
    setOpen(false);
    setFormKey((key) => key + 1);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center justify-center rounded-xl border border-brand bg-brand-soft px-3 py-2.5 text-sm font-semibold text-brand-ink active:bg-brand-soft/70"
      >
        Send reminder
      </button>
      <Sheet open={open} onClose={close} title="Send reminder">
        <ScheduleReminderForm
          key={formKey}
          clientId={clientId}
          appointmentId={appointmentId}
          ownerFirstName={ownerFirstName}
          ownerName={ownerName}
          phone={phone}
          altContact={altContact}
          petName={petName}
          appointmentDate={appointmentDate}
          appointmentTime={appointmentTime}
          appointmentLocation={appointmentLocation}
          mode={mode}
          reminderSettings={reminderSettings}
          onDone={close}
        />
      </Sheet>
    </>
  );
}

function ScheduleReminderForm({
  clientId,
  appointmentId,
  ownerFirstName,
  ownerName,
  phone,
  altContact,
  petName,
  appointmentDate,
  appointmentTime,
  appointmentLocation,
  mode,
  reminderSettings,
  onDone,
}: {
  clientId: string;
  appointmentId: string;
  ownerFirstName: string;
  ownerName: string;
  phone: string;
  altContact: string | null;
  petName: string | null;
  appointmentDate: string;
  appointmentTime: string | null;
  appointmentLocation: string | null;
  mode: "fixtures" | "live";
  reminderSettings: Pick<
    OperatorSettings,
    "appointmentReminderTemplate" | "rebookReminderTemplate" | "locationSettings"
  >;
  onDone: () => void;
}) {
  const numberClient = { phone, alt_contact: altContact };
  const [toNumber, setToNumber] = useState(() =>
    defaultHouseholdNumber(numberClient),
  );
  const canChooseNumber = householdHasNumberChoice(numberClient);
  const [state, formAction, pending] = useActionState<ReminderState, FormData>(
    prepareReminder,
    { status: "idle" },
  );
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<ReminderErrors>({});
  const [message, setMessage] = useState(() =>
    buildReminderMessage({
      ownerFirstName,
      petName,
      appointmentDate,
      appointmentTime,
      appointmentLocation,
      appointmentTemplate: reminderSettings.appointmentReminderTemplate,
      rebookTemplate: reminderSettings.rebookReminderTemplate,
      locationSettings: reminderSettings.locationSettings,
    }),
  );

  function toReview() {
    const validation = validateReminderInput({ phone: toNumber, message });
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
    state.status === "sent"
  ) {
    return <ResultScreen state={state} onDone={onDone} />;
  }

  const formError =
    state.status === "error"
      ? (state.formError ?? "Please check the reminder and try again.")
      : undefined;
  const tooLong = message.length > MESSAGE_MAX;

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <SubmitDogOverlay label="Sending reminder" show={pending} />
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <input type="hidden" name="message" value={message} />
      <input
        type="hidden"
        name="to_number"
        value={canChooseNumber ? toNumber : ""}
      />

      <p
        className={`rounded-lg px-3 py-2 text-xs font-medium ${
          mode === "live"
            ? "bg-warn-soft text-warn"
            : "bg-brand-soft text-brand-ink"
        }`}
      >
        {mode === "live"
          ? "Sam reviews this message before anything sends. Confirming sends one SMS if reminder sending is switched on."
          : "Demo mode — confirming will not send anything."}
      </p>

      {formError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}

      <div className="rounded-xl bg-canvas px-3.5 py-2.5 text-sm">
        <span className="text-ink-soft">To </span>
        <span className="font-semibold text-ink">{ownerName}</span>
        <span className="text-ink-soft"> · {formatPhone(toNumber)}</span>
      </div>

      {canChooseNumber && step === "form" ? (
        <HouseholdNumberSelect
          client={numberClient}
          value={toNumber}
          onChange={setToNumber}
        />
      ) : null}

      <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
        Reminder for <span className="font-semibold">{petName ?? "the dog"}</span>{" "}
        · {formatDate(appointmentDate)}
        {appointmentTime ? ` at ${appointmentTime}` : ""}
      </p>

      {errors.phone ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {errors.phone} A reminder can&apos;t be prepared without a usable
          number.
        </p>
      ) : null}

      {step === "form" ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-soft">Message</span>
            <textarea
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className={textareaClass}
            />
            <span
              className={`text-xs ${tooLong ? "text-danger-ink" : "text-ink-faint"}`}
            >
              {message.length}/{MESSAGE_MAX}
            </span>
            {errors.message ? (
              <span className="text-xs text-danger-ink">{errors.message}</span>
            ) : null}
          </label>
          <button
            type="button"
            onClick={toReview}
            className="rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink"
          >
            Review reminder
          </button>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm leading-relaxed text-ink">
            {message}
          </div>
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
              Confirm & send
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function ResultScreen({
  state,
  onDone,
}: {
  state: Extract<ReminderState, { status: "demo" | "gated" | "sent" }>;
  onDone: () => void;
}) {
  const isSent = state.status === "sent";
  const headline = isSent
    ? "Reminder sent"
    : state.status === "demo"
      ? "Demo only — no text was sent"
      : "Not sent — reminder sending is switched off.";
  const detail = isSent
    ? (state.logWarning ?? "The SMS was sent after this explicit confirmation.")
    : state.status === "demo"
      ? "This is practice data, so no text was sent."
      : state.message;

  return (
    <div className="flex flex-col gap-3.5">
      <div
        className={`rounded-xl px-3.5 py-3 ${
          isSent ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
        }`}
      >
        <p className="text-sm font-semibold">{headline}</p>
        <p className="mt-0.5 text-xs leading-relaxed">{detail}</p>
      </div>
      <div className="rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm leading-relaxed text-ink">
        {state.summary.message}
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
