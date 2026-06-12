"use client";

import { useEffect, useRef } from "react";
import { markSmsSeen } from "@/lib/actions/inbox";

// TT-018: opening a thread emits `sms.seen` once for its still-unseen inbound
// messages so the header bell clears even without a reply. Fires on mount only —
// the inbox's 10s router.refresh re-renders but does not remount this, so it
// never re-emits — and only when the page passed ids that need marking.
export function MarkThreadSeen({ smsIds }: { smsIds: string[] }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || smsIds.length === 0) return;
    fired.current = true;
    void markSmsSeen(smsIds);
  }, [smsIds]);
  return null;
}
