import type { Appointment, Client, Pet } from "./data/types";

export type WeekRange = {
  start: string;
  end: string;
  label: string;
};

export type ScheduledAppointment = {
  appointment: Appointment;
  client: Client | null;
  pet: Pet | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeRank(raw: string | null | undefined): number {
  if (!raw) return Number.POSITIVE_INFINITY;
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return Number.POSITIVE_INFINITY;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (m[3] === "pm" && hours !== 12) hours += 12;
  if (m[3] === "am" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function weekRangeForDate(rawDate: string, today = new Date()): WeekRange {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? new Date(`${rawDate}T12:00:00`)
    : new Date(today);
  const day = parsed.getDay();
  const start = new Date(parsed);
  start.setDate(parsed.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: iso(start),
    end: iso(end),
    label: `${start.toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
    })} - ${end.toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`,
  };
}

export function shiftWeek(startDate: string, weeks: number): string {
  const d = new Date(`${startDate}T12:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return iso(d);
}

export function appointmentsForWeek({
  appointments,
  clients,
  pets,
  range,
}: {
  appointments: Appointment[];
  clients: Client[];
  pets: Pet[];
  range: WeekRange;
}): ScheduledAppointment[] {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));

  return appointments
    .filter((appointment) => {
      const status = appointment.status ?? "completed";
      return (
        status === "booked" &&
        appointment.date >= range.start &&
        appointment.date <= range.end
      );
    })
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return timeRank(a.time_slot) - timeRank(b.time_slot);
    })
    .map((appointment) => ({
      appointment,
      client: clientsById.get(appointment.client_id) ?? null,
      pet: petsById.get(appointment.pet_id) ?? null,
    }));
}
