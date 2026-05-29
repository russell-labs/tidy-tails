// Formatting helpers. Pure functions, safe in server or client components.

const MS_PER_DAY = 86_400_000;

export function formatMoney(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return amount.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  });
}

/** "May 8, 2026" */
export function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Jun 29, 2026" — compact but unambiguous for review screens. */
export function formatReviewDate(iso: string): string {
  return formatDate(iso);
}

export function formatDateTime(
  iso: string,
  timeZone = "America/Toronto",
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const monthIndex = Number(value("month")) - 1;
  const day = Number(value("day"));
  const hour24 = Number(value("hour"));
  const minute = value("minute").padStart(2, "0");
  const hour12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? "PM" : "AM";
  const month =
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][monthIndex] ?? "";
  if (!month || !day || !minute) return "";
  return `${month} ${day}, ${hour12}:${minute} ${period}`;
}

/** "May 8" — year dropped when it matches the current year. */
export function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Whole days between an ISO date and today. Positive = future, negative = past. */
export function daysFromToday(iso: string): number {
  const target = new Date(iso + "T00:00:00").getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((target - today) / MS_PER_DAY);
}

/** Human relative date: "Today", "in 14 days", "45 days ago". */
export function relativeDate(iso: string): string {
  const delta = daysFromToday(iso);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  if (delta > 0) return `in ${delta} days`;
  return `${Math.abs(delta)} days ago`;
}

/** Strip everything that is not a digit — used for phone search + comparison. */
export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, "");
}

/** Pretty-print a North American phone number; leaves anything unusual untouched. */
export function formatPhone(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("1"))
    return `${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return raw;
}

export function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}
