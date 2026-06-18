// Agentic layer — live status indicator (presentational).
//
// Shows what the assistant is doing right now: the voice states "Listening…"
// (recording) and "Transcribing…" (server-side speech-to-text), then "Thinking…"
// before any tool runs, the specific tool-in-use phrase ("Looking up your
// schedule…") while a read tool executes, and "Speaking…" while it reads the
// answer back. Driven by the streamed run events plus the client's mic/TTS state;
// pure presentation, mobile first, matching the assistant's own bubble (sparkle
// avatar + white card). Announced via an aria-live region so the state change is
// read out on assistive tech.

import { toolStatusLabel } from "@/lib/agent/toolStatus";

export type AssistantStatusPhase =
  | "listening"
  | "transcribing"
  | "thinking"
  | "tool"
  | "speaking";

export type AssistantStatusProps = {
  phase: AssistantStatusPhase;
  /** The running tool's name when phase is "tool". */
  toolName?: string;
};

const PHASE_LABEL: Record<Exclude<AssistantStatusPhase, "tool">, string> = {
  listening: "Listening…",
  transcribing: "Transcribing…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

export function AssistantStatus({ phase, toolName }: AssistantStatusProps) {
  const label =
    phase === "tool"
      ? toolName
        ? toolStatusLabel(toolName)
        : "Looking that up…"
      : PHASE_LABEL[phase];

  return (
    <div className="flex items-start gap-2.5" aria-live="polite">
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
        </svg>
      </span>
      <div className="flex items-center gap-2 rounded-[16px_16px_16px_4px] border border-line bg-surface px-4 py-2.5 text-sm text-ink-soft shadow-soft">
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" />
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}
