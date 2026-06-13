"use client";

// Agentic layer — chat surface (mobile-first), with live status.
//
// A phone-shaped conversation: a scrolling transcript over a fixed composer. It
// streams from the read-only `/api/assistant/stream` endpoint so it can show what
// the assistant is doing in real time — Thinking, the tool in use ("Looking up
// your schedule…"), then the answer (Done), or a friendly error. The transcript
// is held client-side and passed back as light context on each turn. Read-only by
// construction — the endpoint only ever returns an answer to display.

import { useRef, useState } from "react";
import type { AgentTurn } from "@/lib/agent/runAgent";
import { AssistantStatus } from "@/components/AssistantStatus";

type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; toolsUsed: string[] }
  | { kind: "error"; text: string };

/** The in-flight live state shown while a turn streams. */
type LiveStatus = { phase: "thinking" | "tool"; toolName?: string };

type StreamEvent =
  | { type: "thinking" }
  | { type: "tool"; name: string }
  | { type: "done"; answer: string; toolsUsed?: string[] }
  | { type: "error"; message: string };

const SUGGESTIONS = [
  "What does my day look like?",
  "What clipper did I use last time?",
  "How much did I make today?",
];

const GENERIC_ERROR = "Something went wrong answering that. Please try again.";

export function AssistantChat() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  function scrollToEnd() {
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }

  function applyEvent(event: StreamEvent) {
    if (event.type === "thinking") {
      setStatus({ phase: "thinking" });
    } else if (event.type === "tool") {
      setStatus({ phase: "tool", toolName: event.name });
    } else if (event.type === "done") {
      setEntries((current) => [
        ...current,
        { kind: "assistant", text: event.answer ?? "", toolsUsed: event.toolsUsed ?? [] },
      ]);
      setStatus(null);
      scrollToEnd();
    } else if (event.type === "error") {
      setEntries((current) => [...current, { kind: "error", text: event.message }]);
      setStatus(null);
      scrollToEnd();
    }
  }

  async function streamTurn(message: string, history: AgentTurn[]) {
    let response: Response;
    try {
      response = await fetch("/api/assistant/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
    } catch {
      applyEvent({ type: "error", message: GENERIC_ERROR });
      return;
    }

    if (!response.ok || !response.body) {
      const message =
        response.status === 401
          ? "Your session ended. Sign in again to use the assistant."
          : response.status === 404
            ? "The assistant isn't available."
            : GENERIC_ERROR;
      applyEvent({ type: "error", message });
      return;
    }

    // Parse the NDJSON event stream line by line as it arrives.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawTerminal = false;

    const drainLine = (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      try {
        const event = JSON.parse(text) as StreamEvent;
        if (event.type === "done" || event.type === "error") sawTerminal = true;
        applyEvent(event);
      } catch {
        // Ignore an unparseable partial; the terminal check below covers a truncated stream.
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        drainLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    drainLine(buffer);

    // Defensive: a stream that ended without a done/error (e.g. dropped
    // connection) must not leave the UI stuck thinking.
    if (!sawTerminal) {
      applyEvent({ type: "error", message: GENERIC_ERROR });
    }
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    // Light context: the transcript so far as plain user/assistant turns.
    const history: AgentTurn[] = entries
      .filter((entry): entry is Entry & { kind: "user" | "assistant" } =>
        entry.kind === "user" || entry.kind === "assistant",
      )
      .map((entry) => ({ role: entry.kind, text: entry.text }));

    setEntries((current) => [...current, { kind: "user", text: trimmed }]);
    setDraft("");
    setPending(true);
    setStatus({ phase: "thinking" });
    scrollToEnd();

    void streamTurn(trimmed, history).finally(() => {
      setPending(false);
      setStatus(null);
    });
  }

  return (
    // Self-contained chat panel: a fixed dynamic-viewport height leaves room for
    // the app header and the fixed bottom nav, the transcript scrolls inside,
    // and the composer is the panel's last row (above the nav, not page-fixed).
    <div className="flex h-[calc(100dvh-12rem)] flex-col overflow-hidden rounded-2xl border border-line bg-canvas">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {entries.length === 0 ? (
          <div className="mt-6 text-center">
            <p className="text-sm text-ink-soft">
              Ask about your schedule, a household, a dog&apos;s history and groom
              notes, your income, or who&apos;s due for a rebooking.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  disabled={pending}
                  className="rounded-xl border border-line bg-surface px-4 py-2.5 text-left text-sm font-medium text-ink-soft active:bg-brand-soft disabled:opacity-60"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {entries.map((entry, index) => (
          <Bubble key={index} entry={entry} />
        ))}

        {status ? <AssistantStatus phase={status.phase} toolName={status.toolName} /> : null}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-line bg-surface px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <label className="sr-only" htmlFor="assistant-input">
          Message the assistant
        </label>
        <textarea
          id="assistant-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(draft);
            }
          }}
          rows={1}
          placeholder="Ask about your business…"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={pending || draft.trim() === ""}
          className="min-h-11 shrink-0 rounded-xl bg-brand px-4 text-sm font-semibold text-white active:bg-brand-ink disabled:bg-canvas disabled:text-ink-faint"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function Bubble({ entry }: { entry: Entry }) {
  if (entry.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-brand px-4 py-2.5 text-sm text-white">
          {entry.text}
        </div>
      </div>
    );
  }
  if (entry.kind === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger-ink">
          {entry.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex max-w-[85%] flex-col items-start gap-1">
      <div className="whitespace-pre-wrap rounded-2xl bg-surface px-4 py-2.5 text-sm text-ink shadow-sm">
        {entry.text}
      </div>
      {entry.toolsUsed.length > 0 ? (
        <span className="px-1 text-xs text-ink-faint">
          Done · looked up {entry.toolsUsed.length === 1 ? "1 thing" : `${entry.toolsUsed.length} things`}
        </span>
      ) : null}
    </div>
  );
}
