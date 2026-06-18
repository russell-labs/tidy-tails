"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_VOICE_PREFERENCE,
  readVoicePreference,
  writeVoicePreference,
  type VoicePreference,
} from "@/lib/agent/voiceOutput";

// Settings — assistant read-aloud voice (CLIENT-SIDE, no DB).
//
// The assistant can read its answer back aloud after a voice turn (when read-aloud
// is on in the chat header). This control picks the VOICE used for that — a per-
// device preference stored in localStorage only. It does NOT touch the
// org_settings table, the settings server action, or any migration: the choice is
// a presentation preference, read by lib/agent/voiceOutput.ts when it asks the
// server to synthesize speech, and re-validated there against a server-side
// allowlist. Account-level cross-device sync would be a separate, approved change.
//
// Customer-facing copy is plain "Voice" wording. The buttons are ≥44px tap
// targets via the shared .tt-btn kit, so they satisfy the mobile tap-size rule
// without any new input styles.

const OPTIONS: { value: VoicePreference; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

/** Subscribe to cross-tab/storage changes so the selection stays in sync. */
function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function AssistantVoiceSettings() {
  // Render the stored value on the client; the server snapshot uses the default so
  // markup is stable through hydration (the real value is read on the client).
  const voice = useSyncExternalStore(
    subscribe,
    () => readVoicePreference(),
    () => DEFAULT_VOICE_PREFERENCE,
  );

  function select(next: VoicePreference) {
    writeVoicePreference(next);
    // Nudge subscribers in this tab (storage events only fire cross-tab).
    if (typeof window !== "undefined") {
      window.dispatchEvent(new StorageEvent("storage"));
    }
  }

  return (
    <div className="px-3.5 py-3">
      <p className="text-sm font-semibold text-ink">Voice</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        The voice the assistant uses when it reads an answer back aloud. Saved on
        this device.
      </p>
      <div
        role="radiogroup"
        aria-label="Assistant voice"
        className="mt-3 grid grid-cols-2 gap-2"
      >
        {OPTIONS.map((option) => {
          const selected = voice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => select(option.value)}
              className={`tt-btn ${selected ? "tt-btn-primary" : "tt-btn-secondary"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
