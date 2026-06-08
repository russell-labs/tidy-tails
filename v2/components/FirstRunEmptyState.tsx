import type { ReactNode } from "react";

// First-run empty state for a brand-new business (WS3 Slice C).
//
// A freshly-onboarded org has zero clients, pets, and appointments. Each main
// surface (search, schedule, reports, messages) renders this instead of a blank
// screen or a misleading "nothing to do" message, with a single clear first
// action — add your first client. Pure presentational; the caller supplies the
// copy and the action (the existing AddHousehold sheet).

export function FirstRunEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-soft">
      <div
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-ink"
        aria-hidden="true"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-soft">
        {description}
      </p>
      {action ? <div className="mx-auto mt-5 max-w-xs">{action}</div> : null}
    </div>
  );
}
