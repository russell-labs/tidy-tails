"use client";

import { useActionState, useState } from "react";
import { prepareReminder, type ReminderState } from "@/lib/actions/reminders";
import {
  buildReminderMessage,
  pickReminderAppointment,
  validateReminderInput,
  type ReminderErrors,
} from "@/lib/reminders";
import type { Appointment, Client, Pet } from "@/lib/data/types";
import { formatDate, formatPhone, fullName } from "@/lib/format";
import type { OperatorSettings } from "@/lib/operatorSettings";
import { Sheet } from "./Sheet";
import { SubmitDog } from "./SubmitDog";

// Reminder Prep — prepare an appointment reminder text: draft → review →
// result. Nothing is ever sent automatically — Sam reviews and explicitly
// confirms every SMS. Live sending stays behind the server-only
// TIDYTAILS_ENABLE_REMINDER_SEND gate.

const MESSAGE_MAX = 480;

const textareaClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint resize-none leading-relaxed";

export function ClientActions({
  client,
  pets,
  appointments,
  mode,
  reminderSettings,
}: {
  client: Client;
  pets: Pet[];
  appointments: Appointment[];
  mode: "fixtures" | "live";
  reminderSettings: Pick<
    OperatorSettings,
    "appointmentReminderTemplate" | "rebookReminderTemplate"
  >;
}) {
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
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Send reminder
      </button>

      <Sheet open={open} onClose={close} title="Send a reminder">
        <ReminderForm
          key={formKey}
          client={client}
          pets={pets}
          appointments={appointments}
          mode={mode}
          reminderSettings={reminderSettings}
          onDone={close}
        />
      </Sheet>
    </>
  );
}

function ReminderForm({
  client,
  pets,
  appointments,
  mode,
  reminderSettings,
  onDone,
}: {
  client: Client;
  pets: Pet[];
  appointments: Appointment[];
  mode: "fixtures" | "live";
  reminderSettings: Pick<
    OperatorSettings,
    "appointmentReminderTemplate" | "rebookReminderTemplate"
  >;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ReminderState, FormData>(
    prepareReminder,
    { status: "idle" },
  );
  // `step` is plain local state, never derived from `state` — a server result
  // must not lock navigation. A server-side error surfaces as the banner below,
  // which renders on either step.
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<ReminderErrors>({});

  // The upcoming appointment this reminder is about, if any. When there is
  // none, the flow still offers a manual draft (a generic check-in message).
  const upcoming = pickReminderAppointment(appointments);
  const upcomingPet = upcoming
    ? pets.find((p) => p.id === upcoming.pet_id)
    : undefined;
  const petName = upcomingPet?.name ?? pets[0]?.name ?? null;
  const ownerName = fullName(client.first_name, client.last_name);

  const [message, setMessage] = useState(() =>
    buildReminderMessage({
      ownerFirstName: client.first_name,
      petName,
      appointmentDate: upcoming?.date ?? null,
      appointmentLocation: upcoming?.location ?? null,
      appointmentTemplate: reminderSettings.appointmentReminderTemplate,
      rebookTemplate: reminderSettings.rebookReminderTemplate,
    }),
  );

  function toReview() {
    const v = validateReminderInput({ phone: client.phone, message });
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    setStep("review");
  }

  // Terminal: the action ran. Sending only happens after explicit confirmation
  // and only when the private server-side reminder gate is enabled.
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
  // A phone problem can't be fixed from the message form (the number is the
  // client's number on file) — surface it as a banner, not a field error.
  const phoneError = errors.phone;
  const tooLong = message.length > MESSAGE_MAX;

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      {/* Hidden fields carry the current values into the server action. The
          recipient phone is re-read server-side from the client record. */}
      <input type="hidden" name="client_id" value={client.id} />
      <input type="hidden" name="message" value={message} />

      <ModeNote mode={mode} />

      {formError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}

      <div className="rounded-xl bg-canvas px-3.5 py-2.5 text-sm">
        <span className="text-ink-soft">To </span>
        <span className="font-semibold text-ink">{ownerName}</span>
        <span className="text-ink-soft"> · {formatPhone(client.phone)}</span>
      </div>

      {phoneError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {phoneError} A reminder can&apos;t be prepared without a usable
          number.
        </p>
      ) : null}

      {step === "form" ? (
        <>
      {upcoming ? (
            <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
              Reminder for{" "}
              <span className="font-semibold">
                {upcomingPet?.name ?? "the pet"}
              </span>{" "}
              · appointment {formatDate(upcoming.date)}
            </p>
          ) : (
            <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-ink-soft">
              No upcoming appointment is on file. This draft is a follow-up to
              help book the next visit.
            </p>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-soft">Message</span>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
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
          <p className="text-sm text-ink">
            This prepares a reminder text to{" "}
            <span className="font-semibold">{ownerName}</span>. Nothing is sent
            until you confirm.
          </p>

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
              {pending ? <SubmitDog label="Sending" /> : "Confirm & send"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function ModeNote({ mode }: { mode: "fixtures" | "live" }) {
  if (mode === "live") {
    return (
      <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
        Sam reviews this message before anything sends. If reminder sending is
        switched on, confirming sends one SMS.
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
      Demo mode — this is anonymized practice data. Confirming will not send
      anything.
    </p>
  );
}

function ResultScreen({
  state,
  onDone,
}: {
  state: Extract<ReminderState, { status: "demo" | "gated" | "sent" }>;
  onDone: () => void;
}) {
  const { summary } = state;
  const isSent = state.status === "sent";
  const headline = isSent
    ? "Reminder sent"
    : state.status === "demo"
      ? "Demo only — no text was sent"
      : "Not sent — reminder sending is switched off.";
  const detail = isSent
    ? (state.logWarning ??
      "The SMS was sent after this explicit confirmation.")
    : state.status === "demo"
      ? "This is anonymized practice data, so no text was sent. The whole flow above is real — it starts sending once reminder sending is enabled and you confirm."
      : state.message;

  return (
    <div className="flex flex-col gap-3.5">
      <div
        className={`flex gap-2.5 rounded-xl p-3.5 ${
          isSent ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
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
          {isSent ? (
            <>
              <path d="M20 6 9 17l-5-5" />
            </>
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
        The reminder reviewed was for{" "}
        <span className="font-semibold text-ink">{summary.ownerName}</span>
        {summary.appointmentDate ? (
          <>
            {" "}
            — appointment{" "}
            <span className="font-semibold text-ink">
              {formatDate(summary.appointmentDate)}
            </span>
          </>
        ) : null}
        .
      </p>

      <dl className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-soft">To</dt>
          <dd className="text-right font-medium text-ink">
            {formatPhone(summary.phone)}
          </dd>
        </div>
        {summary.petName ? (
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Pet</dt>
            <dd className="text-right font-medium text-ink">
              {summary.petName}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm leading-relaxed text-ink">
        {summary.message}
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
