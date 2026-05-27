"use client";

import { useActionState, useState } from "react";
import {
  hideSmsMessage,
  markSmsHandled,
  sendInboxSmsReply,
  type InboxActionState,
} from "@/lib/actions/inbox";

const INITIAL_STATE: InboxActionState = { status: "idle" };

export function InboxSmsActions({ smsId }: { smsId: string }) {
  const [replyState, sendReplyAction, replyPending] = useActionState(
    sendInboxSmsReply,
    INITIAL_STATE,
  );
  const [handledState, markHandledAction, handledPending] = useActionState(
    markSmsHandled,
    INITIAL_STATE,
  );
  const [hideState, hideAction, hidePending] = useActionState(
    hideSmsMessage,
    INITIAL_STATE,
  );
  const [message, setMessage] = useState("");
  const [confirmHide, setConfirmHide] = useState(false);
  const charCount = message.trim().length;
  const busy = replyPending || handledPending || hidePending;

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line bg-canvas p-3">
      <form action={sendReplyAction} className="space-y-2">
        <input type="hidden" name="sms_id" value={smsId} />
        <label className="block text-xs font-bold uppercase tracking-wide text-ink-faint">
          Reply
        </label>
        <textarea
          name="message"
          value={message}
          onChange={(event) => setMessage(event.currentTarget.value)}
          rows={3}
          maxLength={480}
          className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          placeholder="Write Sam's reply..."
        />
        <div className="flex items-center justify-between gap-3">
          <p className={`text-xs ${charCount > 440 ? "text-warn" : "text-ink-faint"}`}>
            {charCount}/480
          </p>
          <button
            type="submit"
            disabled={busy || !message.trim()}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {replyPending ? "Sending..." : "Send reply"}
          </button>
        </div>
      </form>

      <form action={markHandledAction} className="flex items-center justify-between gap-3">
        <input type="hidden" name="sms_id" value={smsId} />
        <p className="text-xs text-ink-muted">Clear it without sending a reply.</p>
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-muted disabled:cursor-not-allowed disabled:opacity-45"
        >
          {handledPending ? "Clearing..." : "Mark handled"}
        </button>
      </form>

      <form action={hideAction} className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <input type="hidden" name="sms_id" value={smsId} />
        <p className="text-xs text-ink-muted">
          Hide tests, duplicates, or noise from normal views.
        </p>
        {confirmHide ? (
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-xl bg-danger px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {hidePending ? "Hiding..." : "Confirm hide"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmHide(true)}
            className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-muted disabled:cursor-not-allowed disabled:opacity-45"
          >
            Hide
          </button>
        )}
      </form>

      <ActionMessage state={replyState} />
      <ActionMessage state={handledState} />
      <ActionMessage state={hideState} />
    </div>
  );
}

function ActionMessage({ state }: { state: InboxActionState }) {
  if (state.status === "idle") return null;

  const tone =
    state.status === "error"
      ? "bg-red-50 text-red-700"
      : "bg-brand-soft text-brand";

  return (
    <p className={`rounded-xl px-3 py-2 text-sm font-semibold ${tone}`}>
      {state.message}
    </p>
  );
}
