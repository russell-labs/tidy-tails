// Today's local calendar date as an ISO `YYYY-MM-DD` string.
//
// Uses the runtime's local timezone (via `getFullYear` / `getMonth` /
// `getDate`), not UTC, so it matches the day Sam is actually working. This
// formatter was previously redefined in the schedule page and the appointment
// forms; it is centralized here so every surface agrees on "today".
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// The weekday index (0 = Sunday .. 6 = Saturday, matching JS Date.getDay()) for
// a calendar date. A plain `YYYY-MM-DD` is parsed at LOCAL noon — the same
// noon-anchored parse the schedule helpers use — so the weekday never slips by
// one at a timezone boundary the way a bare `new Date("YYYY-MM-DD")` (parsed as
// UTC midnight) can. Any other/invalid input falls back to "today".
export function weekdayForISODate(date: string, today = new Date()): number {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T12:00:00`)
    : new Date(today);
  return parsed.getDay();
}
