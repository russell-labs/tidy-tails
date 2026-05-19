"use client";

import { useEffect, useState } from "react";

export function SubmitDog({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <svg
        className="submit-dog-line h-5 w-5 shrink-0"
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path pathLength="1" d="M8 17c0-5.2 3.8-9 8-9s8 3.8 8 9c0 4.6-3.1 7.5-8 7.5S8 21.6 8 17Z" />
        <path pathLength="1" className="submit-dog-accent" d="M10 10 6.5 5.5 6 14" />
        <path pathLength="1" className="submit-dog-accent" d="M22 10 25.5 5.5 26 14" />
        <path pathLength="1" d="M13 17h.01M19 17h.01" />
        <path pathLength="1" className="submit-dog-accent" d="M15 20h2l-1 1.6Z" />
        <path pathLength="1" d="M12.5 23c1.4 1.2 5.6 1.2 7 0" />
      </svg>
      <span>{label}</span>
    </span>
  );
}

export function SubmitDogOverlay({
  label,
  show,
}: {
  label: string;
  show: boolean;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setVisible(show),
      show ? 1 : 1400,
    );
    return () => window.clearTimeout(timeout);
  }, [show]);

  if (!visible) return null;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-ink/10"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface/95 px-7 py-6 text-brand shadow-lg">
        <svg
          className="submit-dog-line h-16 w-16"
          viewBox="0 0 32 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path pathLength="1" d="M8 17c0-5.2 3.8-9 8-9s8 3.8 8 9c0 4.6-3.1 7.5-8 7.5S8 21.6 8 17Z" />
          <path pathLength="1" className="submit-dog-accent" d="M10 10 6.5 5.5 6 14" />
          <path pathLength="1" className="submit-dog-accent" d="M22 10 25.5 5.5 26 14" />
          <path pathLength="1" d="M13 17h.01M19 17h.01" />
          <path pathLength="1" className="submit-dog-accent" d="M15 20h2l-1 1.6Z" />
          <path pathLength="1" d="M12.5 23c1.4 1.2 5.6 1.2 7 0" />
        </svg>
        <span className="text-sm font-semibold text-ink">{label}</span>
      </div>
    </div>
  );
}
