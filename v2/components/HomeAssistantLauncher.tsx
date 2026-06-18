"use client";

import { useState } from "react";
import { AssistantChat } from "./AssistantChat";

// Home-screen assistant launcher. Collapsed, it's a slim bar that mirrors the
// chat composer — a single "Ask about your business…" affordance with the mic
// and read-aloud glyphs, nothing else — so it sits quietly under the Contacts
// list. Engaging it (a tap anywhere on the bar) expands it IN PLACE into the
// full assistant thread, boxed in its own card via <AssistantChat embedded>, so
// Sam never leaves the home screen. Embedded mode keeps the chat self-contained
// (its own height cap + internal scroll, no body-flag viewport pinning), so the
// home page's scroll is never hijacked. Minimize returns it to the slim bar.
//
// The launcher itself is dumb chrome — every safety pattern (confirm cards,
// voice-only read-back, read-aloud/mute) lives in AssistantChat and is reused
// unchanged. Writes capability flows through writesEnabled exactly as the
// /assistant route passes it.
export function HomeAssistantLauncher({
  writesEnabled,
  // Test-only seam (mirrors InboxAssistantReply's initialState) so the expanded
  // render can be asserted without simulating a click. Defaults collapsed.
  defaultExpanded = false,
}: {
  writesEnabled: boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (expanded) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Collapse the assistant"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-soft transition-colors active:bg-brand-soft active:text-brand"
          >
            <ChevronUpIcon />
            <span>Minimize</span>
          </button>
        </div>
        <AssistantChat embedded writesEnabled={writesEnabled} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      // The accessible name leads with the visible bar text so speech-input users
      // ("Ask about your business") can activate it (WCAG 2.5.3 Label in Name).
      aria-label="Ask about your business — open the assistant"
      className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left shadow-soft transition-colors active:bg-brand-soft"
    >
      <span className="flex min-h-[46px] flex-1 items-center rounded-xl border border-line bg-canvas px-3.5 text-sm text-ink-faint">
        Ask about your business…
      </span>
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-canvas text-ink-soft"
      >
        <SpeakerOnIcon />
      </span>
      <span aria-hidden="true" className="tt-fab shrink-0">
        <MicIcon />
      </span>
    </button>
  );
}

// --- Icons (inline, no dependency — mirrors AssistantChat's own glyphs) -------

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M6 11a6 6 0 0 0 12 0M12 17v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpeakerOnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7 7 0 0 1 0 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}
