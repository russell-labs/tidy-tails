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
