"use client";

import { useActionState, useEffect, useState } from "react";
import {
  hideSmsMessage,
  markSmsHandled,
  sendInboxSmsReply,
  type InboxActionState,
} from "@/lib/actions/inbox";
import { setComposerBusy } from "@/lib/inboxAutoRefresh";
import { clearDraft, loadDraft, saveDraft } from "@/lib/inboxDraftStore";
import { InboxAssistantReply } from "@/components/InboxAssistantReply";

const INITIAL_STATE: InboxActionState = { status: "idle" };

export function InboxSmsActions({
  smsId,
  agentEnabled = false,
}: {
  smsId: string;
  /** When true (TIDYTAILS_ENABLE_AGENT on), offer the "draft a reply with the assistant" trigger. */
  agentEnabled?: boolean;
}) {
  // TT-020: the inbox auto-refresh can remount this composer mid-typing. Seeding
  // the initial state from the per-thread draft store means a remount recovers
  // an in-progress reply (the store is empty on first page load, so this never
  // diverges from the server-rendered empty textarea).
  const [message, setMessage] = useState(() => loadDraft(smsId));

  // Clear the persisted draft once the reply actually sends. Done in the action
  // wrapper (not an effect) so we never call setState from inside an effect.
  async function replyAction(
    previousState: InboxActionState,
    formData: FormData,
  ): Promise<InboxActionState> {
    const nextState = await sendInboxSmsReply(previousState, formData);
    if (nextState.status === "sent") {
      setMessage("");
      clearDraft(smsId);
      setComposerBusy(smsId, false);
    }
    return nextState;
  }

  const [replyState, sendReplyAction, replyPending] = useActionState(
    replyAction,
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
  const [confirmHide, setConfirmHide] = useState(false);
  const charCount = message.trim().length;
  const busy = replyPending || handledPending || hidePending;

  // Release the "busy" flag on unmount so a torn-down composer never wedges the
  // auto-refresh off. Cleanup-only effect — no setState in the effect body.
  useEffect(() => () => setComposerBusy(smsId, false), [smsId]);

  // Write-through on every keystroke (so a remount recovers it) and pause the
  // auto-refresh while there's unsent text.
  function updateMessage(next: string) {
    setMessage(next);
    saveDraft(smsId, next);
    setComposerBusy(smsId, next.trim().length > 0);
  }

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
          onChange={(event) => updateMessage(event.currentTarget.value)}
          onFocus={() => setComposerBusy(smsId, true)}
          onBlur={() => setComposerBusy(smsId, message.trim().length > 0)}
          rows={3}
          maxLength={480}
          className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          placeholder="Write your reply..."
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

      {/* Optional assistant draft-a-reply trigger (dark unless TIDYTAILS_ENABLE_AGENT).
          It proposes a reply through the same confirm card; nothing sends without Sam's tap. */}
      {agentEnabled ? <InboxAssistantReply smsId={smsId} /> : null}

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
