// Pure time helpers for the 1:1 (one_to_one) scheduling engine (WS4a).
//
// Appointments store a free-text `time_slot` like "10:00am" (Sam can hand-type),
// and 1:1 blocks need real arithmetic: parse a slot to minutes-since-midnight,
// format minutes back to the same canonical "h:mmam/pm" shape the booking tiles
// already use, and test whether two duration blocks overlap (with an optional
// buffer). No I/O, no React — unit-tested in time.test.ts.

// The default working-day window for open-block generation. Cheryl's exact hours
// were not captured at intake, so this is a sensible default with a per-org
// override seam (org_settings.settings.workingDay). 8:00am–6:00pm.
export const DEFAULT_WORKING_DAY = { startMinutes: 8 * 60, endMinutes: 18 * 60 };

export type WorkingDay = { startMinutes: number; endMinutes: number };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Minutes-since-midnight → "h:mmam/pm" (byte-identical to booking.ts's tiles, so
// the 1:1 picker writes the same canonical format Sam's slots use).
export function formatMinutes(totalMinutes: number): string {
  const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours24 = Math.floor(m / 60);
  const minutes = m % 60;
  const suffix = hours24 >= 12 ? "pm" : "am";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${pad(minutes)}${suffix}`;
}

const TIME_RE = /^(\d{1,2}):(\d{2})(am|pm)$/;

// "10:00am" → 600. Returns null for anything it cannot confidently parse — the
// caller (overlap math) must then fail TOWARD conflict, never silently skip the
// block. Tolerant of spacing/case/periods via the same normalization the booking
// conflict check uses ("10:00 a.m." → "10:00am").
export function parseTimeToMinutes(raw: string | null | undefined): number | null {
  const normalized = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\./g, "");
  const match = TIME_RE.exec(normalized);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3];
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  if (suffix === "am") {
    if (hours === 12) hours = 0;
  } else {
    if (hours !== 12) hours += 12;
  }
  return hours * 60 + minutes;
}

// Do blocks [startA, startA+durA) and [startB, startB+durB) conflict, requiring
// at least `bufferMinutes` of clear gap between them? With buffer 0 this is plain
// overlap: blocks that merely touch (end == next start) do NOT conflict. With
// buffer 15, a gap of exactly 15 minutes is allowed; a smaller gap conflicts.
export function blocksOverlap(
  startA: number,
  durationA: number,
  startB: number,
  durationB: number,
  bufferMinutes = 0,
): boolean {
  return (
    startA < startB + durationB + bufferMinutes &&
    startB < startA + durationA + bufferMinutes
  );
}
