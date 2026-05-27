"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sendClientSmsMessage, type InboxActionState } from "@/lib/actions/inbox";
import type { Client } from "@/lib/data/types";
import type { SmsMessage } from "@/lib/inboundSms";
import { formatPhone, fullName } from "@/lib/format";
import { buildSmsConversationView } from "@/lib/smsConversationView";
import { SmsMessages } from "./SmsMessages";
import { SubmitDogOverlay } from "./SubmitDog";

const MESSAGE_MAX = 480;
const INITIAL_STATE: InboxActionState = { status: "idle" };

export function ClientSmsConversation({
  client,
  messages,
}: {
  client: Client;
  messages: SmsMessage[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<"write" | "review">("write");

  async function submitMessage(
    previousState: InboxActionState,
    formData: FormData,
  ): Promise<InboxActionState> {
    const nextState = await sendClientSmsMessage(previousState, formData);
    if (nextState.status === "sent") {
      setMessage("");
      setStep("write");
      router.refresh();
    }
    return nextState;
  }

  const [state, formAction, pending] = useActionState<InboxActionState, FormData>(
    submitMessage,
    INITIAL_STATE,
  );
  const trimmedLength = message.trim().length;
  const tooLong = trimmedLength > MESSAGE_MAX;
  const ownerName = fullName(client.first_name, client.last_name);
  const orderedMessages = [...messages].reverse();
  const [showAllMessages, setShowAllMessages] = useState(false);
  const conversationView = buildSmsConversationView({
    messages: orderedMessages,
    showAll: showAllMessages,
  });

  function reviewMessage() {
    if (!message.trim() || tooLong) return;
    setStep("review");
  }

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = window.setInterval(refreshWhenVisible, 10000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [router]);

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Text conversation
        </h2>
        <span className="shrink-0 text-xs font-medium text-ink-soft">
          {formatPhone(client.phone)}
        </span>
      </div>

      <div className="space-y-3">
        <form action={formAction} className="relative rounded-xl border border-line bg-surface p-3.5">
          <SubmitDogOverlay label="Sending text" show={pending} />
          <input type="hidden" name="client_id" value={client.id} />
          <input type="hidden" name="message" value={message} />

          {state.status === "error" ? (
            <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {state.message}
            </p>
          ) : null}

          {state.status === "sent" ? (
            <p className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-ink">
              {state.message}
            </p>
          ) : null}

          {step === "write" ? (
            <div className="space-y-2.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-soft">
                  Message to {ownerName}
                </span>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(event) => setMessage(event.currentTarget.value)}
                  maxLength={MESSAGE_MAX}
                  className="w-full resize-none rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
                  placeholder="Write Sam's text..."
                />
              </label>
              <div className="flex items-center justify-between gap-3">
                <span className={`text-xs ${tooLong ? "text-danger-ink" : "text-ink-faint"}`}>
                  {trimmedLength}/{MESSAGE_MAX}
                </span>
                <button
                  type="button"
                  onClick={reviewMessage}
                  disabled={pending || !message.trim() || tooLong}
                  className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white active:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Review text
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3.5 py-2.5 text-sm">
                <span className="text-ink-soft">To </span>
                <span className="font-semibold text-ink">{ownerName}</span>
                <span className="text-ink-soft"> · {formatPhone(client.phone)}</span>
              </div>
              <div className="whitespace-pre-wrap rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm leading-relaxed text-ink">
                {message}
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep("write")}
                  disabled={pending}
                  className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-bold text-ink-soft active:bg-canvas disabled:opacity-50"
                >
                  Back to edit
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white active:bg-brand-ink disabled:opacity-50"
                >
                  Confirm & send
                </button>
              </div>
            </div>
          )}
        </form>

        <div className="space-y-2">
          {conversationView.canToggleHistory ? (
            <button
              type="button"
              onClick={() => setShowAllMessages((value) => !value)}
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink-soft active:bg-canvas"
              aria-expanded={showAllMessages}
            >
              {conversationView.toggleLabel}
            </button>
          ) : null}
          <SmsMessages
            messages={conversationView.visibleMessages}
            emptyText="No text messages recorded for this household yet."
            canHide
          />
        </div>
      </div>
    </section>
  );
}
