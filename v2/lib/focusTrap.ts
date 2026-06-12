// Focus-trap helpers for modal surfaces (M4). The wrap-around decision is a
// pure function so it can be unit-tested without a DOM; the DOM-reading
// helpers stay thin.

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => el.getClientRects().length > 0 || el === document.activeElement);
}

// Decide where Tab should land. Returns the element to focus when the trap
// must intervene (wrapping at either edge, or focus has escaped the
// container), or null when the browser's natural tab order is already
// correct. Generic over a minimal element shape for testability.
export function resolveTabTarget<T>(
  focusable: readonly T[],
  active: T | null,
  shiftKey: boolean,
): T | null {
  if (focusable.length === 0) return null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const index = active === null ? -1 : focusable.indexOf(active);
  if (index === -1) return shiftKey ? last : first;
  if (!shiftKey && index === focusable.length - 1) return first;
  if (shiftKey && index === 0) return last;
  return null;
}
