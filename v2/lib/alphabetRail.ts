export function letterFromRailPoint({
  y,
  top,
  height,
  letters,
}: {
  y: number;
  top: number;
  height: number;
  letters: string[];
}): string | null {
  if (height <= 0 || letters.length === 0) return null;

  const progress = Math.max(0, Math.min(1, (y - top) / height));
  const index = Math.min(
    letters.length - 1,
    Math.floor(progress * letters.length),
  );

  return letters[index] ?? null;
}

export function shouldRevealAlphabetRail({
  currentY,
  previousY,
  hasRecentScrollIntent,
  suppressUntil = 0,
  now = Date.now(),
  minDelta = 8,
}: {
  currentY: number;
  previousY: number;
  hasRecentScrollIntent: boolean;
  suppressUntil?: number;
  now?: number;
  minDelta?: number;
}): boolean {
  if (now < suppressUntil || !hasRecentScrollIntent) return false;
  return Math.abs(currentY - previousY) >= minDelta;
}

export function isInAlphabetRailHotZone({
  x,
  viewportWidth,
  width = 56,
}: {
  x: number;
  viewportWidth: number;
  width?: number;
}): boolean {
  return viewportWidth - x <= width;
}

export function alphabetRailRevealDelay({
  isScrubbing,
}: {
  isScrubbing: boolean;
}): number {
  return isScrubbing ? 0 : 180;
}

export function shouldHandleAlphabetRailScroll({
  isVisible,
  isScrubbing,
  shouldReveal,
}: {
  isVisible: boolean;
  isScrubbing: boolean;
  shouldReveal: boolean;
}): boolean {
  return isVisible || isScrubbing || shouldReveal;
}

export function shouldUseAlphabetRail({
  contactsOpen,
  letterCount,
}: {
  contactsOpen: boolean;
  letterCount: number;
}): boolean {
  return contactsOpen && letterCount > 4;
}

export function shouldShowContactsResults({
  contactsOpen,
  query,
}: {
  contactsOpen: boolean;
  query: string;
}): boolean {
  return contactsOpen || query.trim().length > 0;
}
