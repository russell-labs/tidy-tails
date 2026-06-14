"use client";

// Agentic layer — thumbs up/down under an assistant answer.
//
// Presentational + prop-driven: the parent owns the rated state and wires onRate
// to record the feedback (an audit event, via recordAgentFeedback). Once rated,
// the controls are replaced by a small thank-you so a rating is given once.

export type FeedbackRating = "up" | "down";

export function AnswerFeedback({
  rated,
  onRate,
}: {
  rated: FeedbackRating | null;
  onRate: (rating: FeedbackRating) => void;
}) {
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
