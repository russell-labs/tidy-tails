"use client";

import { useActionState, useState } from "react";
import {
  sendReadyPickupText,
  type ReadyPickupState,
} from "@/lib/actions/readyPickup";
import type { Client, Pet } from "@/lib/data/types";
import { formatPhone, fullName } from "@/lib/format";
import {
  buildReadyPickupMessage,
  validateReadyPickupInput,
  type ReadyPickupErrors,
} from "@/lib/readyPickup";
import type { OperatorSettings } from "@/lib/operatorSettings";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";

const MESSAGE_MAX = 480;
const textareaClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint resize-none leading-relaxed";

export function ReadyPickupMessage({
  client,
  pet,
  mode,
  settings,
}: {
  client: Client;
  pet: Pet;
  mode: "fixtures" | "live";
  settings: Pick<OperatorSettings, "readyPickupTemplate">;
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
        className="flex w-full items-center justify-center rounded-xl border border-brand bg-brand-soft px-3 py-3 text-base font-semibold text-brand-ink active:bg-brand-soft/70"
      >
        Ready pickup text
      </button>
      <Sheet open={open} onClose={close} title="Ready for pickup">
        <ReadyPickupForm
          key={formKey}
          client={client}
          pet={pet}
          mode={mode}
          settings={settings}
          onDone={close}
        />
      </Sheet>
    </>
  );
}

function ReadyPickupForm({
  client,
  pet,
  mode,
  settings,
  onDone,
}: {
  client: Client;
  pet: Pet;
  mode: "fixtures" | "live";
  settings: Pick<OperatorSettings, "readyPickupTemplate">;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ReadyPickupState, FormData>(
    sendReadyPickupText,
    { status: "idle" },
  );
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<ReadyPickupErrors>({});
  const [message, setMessage] = useState(() =>
    buildReadyPickupMessage({
      ownerFirstName: client.first_name,
      petName: pet.name,
      template: settings.readyPickupTemplate,
    }),
  );
  const ownerName = fullName(client.first_name, client.last_name);

  function toReview() {
    const validation = validateReadyPickupInput({ phone: client.phone, message });
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
      ? (state.formError ?? "Please check the pickup text and try again.")
      : undefined;
  const tooLong = message.length > MESSAGE_MAX;

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <SubmitDogOverlay label="Sending pickup text" show={pending} />
      <input type="hidden" name="client_id" value={client.id} />
      <input type="hidden" name="pet_id" value={pet.id} />
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

      {errors.phone ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {errors.phone}
        </p>
      ) : null}

      {step === "form" ? (
        <>
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
            Review pickup text
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink">
            This text will only send after this confirmation.
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
              Confirm & send
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
        Sam reviews this pickup text before anything sends.
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
      Demo mode — confirming will not send anything.
    </p>
  );
}

function ResultScreen({
  state,
  onDone,
}: {
  state: Extract<ReadyPickupState, { status: "demo" | "gated" | "sent" }>;
  onDone: () => void;
}) {
  const isSent = state.status === "sent";
  const headline = isSent
    ? "Pickup text sent"
    : state.status === "demo"
      ? "Demo only — no text was sent"
      : "Not sent — SMS sending is switched off";
  const detail = isSent
    ? (state.logWarning ?? "The SMS was sent after explicit confirmation.")
    : state.status === "demo"
      ? "This is practice data, so no text was sent."
      : state.message;

  return (
    <div className="flex flex-col gap-3.5">
      <div
        className={`rounded-xl p-3.5 ${
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
