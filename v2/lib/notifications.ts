import type { Appointment } from "./data/types";

export function shouldShowTomorrowReviewNotification({
  appointments,
  now = new Date(),
  timeZone = "America/Toronto",
}: {
  appointments: Appointment[];
  now?: Date;
  timeZone?: string;
}): boolean {
  const parts = dateTimeParts(now, timeZone);
  if (parts.hour < 18) return false;
  const tomorrow = shiftISODate(parts.date, 1);
  return appointments.some(
    (appointment) =>
      appointment.date === tomorrow &&
      (appointment.status ?? "completed") === "booked",
  );
}

function dateTimeParts(date: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour") || 0),
  };
}

function shiftISODate(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}
