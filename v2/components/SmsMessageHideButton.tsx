"use client";

import { useActionState, useState } from "react";
import { hideSmsMessage, type InboxActionState } from "@/lib/actions/inbox";

const INITIAL_STATE: InboxActionState = { status: "idle" };

export function SmsMessageHideButton({ smsId }: { smsId: string }) {
  const [state, formAction, pending] = useActionState(hideSmsMessage, INITIAL_STATE);
  const [confirming, setConfirming] = useState(false);

  if (state.status === "hidden") {
    return (
      <span className="text-xs font-semibold text-ink-faint">
        Hidden
      </span>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-semibold text-ink-faint underline-offset-2 active:text-ink-soft"
      >
        Hide
      </button>
    );
  }

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="sms_id" value={smsId} />
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-xs font-semibold text-ink-faint disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-bold text-danger-ink disabled:opacity-50"
      >
        {pending ? "Hiding..." : "Confirm hide"}
      </button>
    </form>
  );
}
