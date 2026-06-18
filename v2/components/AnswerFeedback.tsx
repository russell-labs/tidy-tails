"use client";

// Agentic layer — thumbs up/down under an assistant answer.
//
// Presentational + prop-driven: the parent owns the lifecycle and wires the
// callbacks to record the feedback (an audit event, via recordAgentFeedback).
// Once rated, the controls collapse to a small thank-you so a rating is given
// once.
//
// TT-039: a thumbs-DOWN opens one optional single-line note box ("What went
// wrong?") instead of collapsing straight away. The PARENT owns whether we are
// awaiting the note (`awaitingNote`); this component only renders the box and
// reports the result — Send submits whatever was typed (onSubmitNote), Skip
// submits nothing (onSkipNote). Either way the parent records the thumbs-down,
// so a negative signal is never lost. Thumbs-UP is unchanged: instant thank-you,
// no note step.

export type FeedbackRating = "up" | "down";

export function AnswerFeedback({
  rated,
  awaitingNote = false,
  onRate,
  onSubmitNote,
  onSkipNote,
}: {
  rated: FeedbackRating | null;
  /** True only between a thumbs-down and the note being sent/skipped. */
  awaitingNote?: boolean;
  onRate: (rating: FeedbackRating) => void;
  /** Send the (optional) note text — empty string is allowed (acts like skip). */
  onSubmitNote?: (note: string) => void;
  /** Dismiss the note box, recording the thumbs-down with no note. */
  onSkipNote?: () => void;
}) {
  if (rated === "down" && awaitingNote) {
    return (
      <form
        className="flex w-full max-w-[85%] items-center gap-1 px-1"
        onSubmit={(event) => {
          event.preventDefault();
          const note = String(new FormData(event.currentTarget).get("note") ?? "");
          onSubmitNote?.(note);
        }}
      >
        <input
          type="text"
          name="note"
          maxLength={200}
          autoComplete="off"
          aria-label="What went wrong?"
          placeholder="What went wrong? (optional)"
          className="min-h-9 flex-1 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand"
        />
        <button
          type="submit"
          className="min-h-9 shrink-0 rounded-lg bg-brand px-3 text-xs font-semibold text-white active:bg-brand-ink"
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => onSkipNote?.()}
          className="min-h-9 shrink-0 rounded-lg px-2 text-xs text-ink-faint active:bg-brand-soft"
        >
          Skip
        </button>
      </form>
    );
  }
  if (rated) {
    return (
      <span className="px-1 text-xs text-ink-faint">
        Thanks for the feedback.
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1 px-1">
      <span className="text-xs text-ink-faint">Helpful?</span>
      <button
        type="button"
        aria-label="Helpful"
        onClick={() => onRate("up")}
        className="grid h-7 w-7 place-items-center rounded-lg text-ink-faint active:bg-brand-soft"
      >
        <ThumbIcon up />
      </button>
      <button
        type="button"
        aria-label="Not helpful"
        onClick={() => onRate("down")}
        className="grid h-7 w-7 place-items-center rounded-lg text-ink-faint active:bg-brand-soft"
      >
        <ThumbIcon up={false} />
      </button>
    </div>
  );
}

function ThumbIcon({ up }: { up: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={up ? "" : "rotate-180"}
    >
      <path
        d="M7 10v10H4V10h3zm3 0l3-7a2 2 0 0 1 2 2v3h4a2 2 0 0 1 2 2.4l-1.5 6A2 2 0 0 1 20.5 20H10V10z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
