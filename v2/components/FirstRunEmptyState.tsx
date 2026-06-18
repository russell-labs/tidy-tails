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
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"
        aria-hidden="true"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="6.5" cy="11" r="1.9" />
          <circle cx="10" cy="7.6" r="2.1" />
          <circle cx="14" cy="7.6" r="2.1" />
          <circle cx="17.5" cy="11" r="1.9" />
          <ellipse cx="12" cy="15.8" rx="4.6" ry="4" />
        </svg>
      </div>
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-soft">
        {description}
      </p>
      {action ? <div className="mx-auto mt-5 max-w-xs">{action}</div> : null}
    </div>
  );
}
