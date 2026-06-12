// Loading-skeleton primitives (M1). Pure presentation, server-safe (no
// "use client"): rendered by route-level loading.tsx files while the
// force-dynamic pages fetch. Uses Tailwind's animate-pulse — no new CSS.
//
// Accessibility: the wrapper announces a single polite "Loading…" status;
// the shimmer blocks themselves are decorative and aria-hidden.

import { type ReactNode } from "react";

export function SkeletonBlock({ className }: { className: string }) {
  return (
    <div aria-hidden="true" className={`animate-pulse rounded bg-line ${className}`} />
  );
}

export function SkeletonCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
      {children}
    </div>
  );
}

export function SkeletonPage({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <main className="px-4 py-4" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {children}
    </main>
  );
}

// The repeated card shape used by the list-style routes: a title line, a
// support line, and a trailing detail line.
export function SkeletonCardList({ cards }: { cards: number }) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      {Array.from({ length: cards }, (_, i) => (
        <SkeletonCard key={i}>
          <SkeletonBlock className="h-5 w-2/5" />
          <SkeletonBlock className="mt-2.5 h-4 w-3/5" />
          <SkeletonBlock className="mt-2.5 h-4 w-1/4" />
        </SkeletonCard>
      ))}
    </div>
  );
}

export function SkeletonHeader({ wide = false }: { wide?: boolean }) {
  return (
    <header>
      <SkeletonBlock className={`h-7 ${wide ? "w-48" : "w-36"}`} />
      <SkeletonBlock className="mt-2 h-4 w-56" />
    </header>
  );
}
