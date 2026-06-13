"use client";

// Agentic layer — Phase 1 chat surface (mobile-first).
//
// A simple, phone-shaped conversation: a scrolling transcript over a fixed
// composer. It calls the read-only `askAgent` server action and renders the
// reply. The transcript is held client-side and passed back as light context on
// each turn. Read-only by construction — there is nothing here that writes or
// sends; the action only ever returns an answer to display.

import { useRef, useState, useTransition } from "react";
import { askAgent } from "@/lib/actions/agent";
import type { AgentTurn } from "@/lib/agent/runAgent";

type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; toolsUsed: string[] }
  | { kind: "error"; text: string };

const SUGGESTIONS = [
  "What does my day look like?",
  "Who haven't I rebooked lately?",
  "How much did I make today?",
];

export function AssistantChat() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement | null>(null);

  function scrollToEnd() {
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
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
    scrollToEnd();

    startTransition(async () => {
      const result = await askAgent(trimmed, history);
      setEntries((current) => [
        ...current,
        result.status === "answered"
          ? {
              kind: "assistant",
              text: result.answer ?? "",
              toolsUsed: result.toolsUsed ?? [],
            }
          : { kind: "error", text: result.message ?? "Something went wrong." },
      ]);
      scrollToEnd();
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
              Ask about your schedule, a household, a dog&apos;s history, your
              income, or who&apos;s due for a rebooking.
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

        {pending ? (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-surface px-4 py-2.5 text-sm text-ink-faint shadow-sm">
              Looking that up…
            </div>
          </div>
        ) : null}
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
    <div className="flex justify-start">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-surface px-4 py-2.5 text-sm text-ink shadow-sm">
        {entry.text}
      </div>
    </div>
  );
}
