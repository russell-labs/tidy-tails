// Agentic layer — live status indicator (presentational).
//
// Shows what the assistant is doing right now: the voice states "Listening…"
// (recording) and "Transcribing…" (server-side speech-to-text), then "Thinking…"
// before any tool runs, the specific tool-in-use phrase ("Looking up your
// schedule…") while a read tool executes, and "Speaking…" while it reads the
// answer back. Driven by the streamed run events plus the client's mic/TTS state;
// pure presentation, mobile first, reusing the same left-aligned bubble shape as
// the chat. Announced via an aria-live region so the state change is read out on
// assistive tech.

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
    <div className="flex justify-start" aria-live="polite">
      <div className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-2.5 text-sm text-ink-faint shadow-sm">
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" />
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}
