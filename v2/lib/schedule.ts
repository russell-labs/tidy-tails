import type { Appointment, Client, Pet } from "./data/types";
import { collapseLoggedGroomDuplicates } from "./appointmentLedger";
import {
  appointmentWorkflowLabel,
  appointmentWorkflowStage,
  isScheduleSlateAppointment,
  type AppointmentWorkflowStage,
} from "./appointmentWorkflow";

export type WeekRange = {
  start: string;
  end: string;
  label: string;
};

export type ScheduledAppointment = {
  appointment: Appointment;
  client: Client | null;
  pet: Pet | null;
  isLogged: boolean;
  workflowStage: AppointmentWorkflowStage;
  workflowLabel: string | null;
};

export type ScheduleView = "week" | "day";

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

function visitKey(appointment: Pick<Appointment, "client_id" | "pet_id" | "date">): string {
  return `${appointment.client_id}::${appointment.pet_id}::${appointment.date}`;
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

export function shiftDay(date: string, days: number): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T12:00:00`)
    : new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
}

export function scheduleView(raw: string | null | undefined): ScheduleView {
  return raw === "day" ? "day" : "week";
}

function appointmentRows({
  appointments,
  clients,
  pets,
  range,
  date,
}: {
  appointments: Appointment[];
  clients: Client[];
  pets: Pet[];
  range?: WeekRange;
  date?: string;
}): ScheduledAppointment[] {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));
  const bookedByVisitKey = new Map(
    appointments
      .filter((appointment) => appointment.status === "booked")
      .map((appointment) => [visitKey(appointment), appointment]),
  );

  return collapseLoggedGroomDuplicates(appointments)
    .map((appointment) => {
      const status = appointment.status ?? "completed";
      const booked = status === "completed" ? bookedByVisitKey.get(visitKey(appointment)) : null;
      if (!booked) return appointment;
      return {
        ...appointment,
        time_slot: appointment.time_slot ?? booked.time_slot,
        location: appointment.location ?? booked.location,
      };
    })
    .filter((appointment) => {
      return isScheduleSlateAppointment(appointment) && (
        (range
          ? appointment.date >= range.start && appointment.date <= range.end
          : appointment.date === date)
      );
    })
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return timeRank(a.time_slot) - timeRank(b.time_slot);
    })
    .map((appointment) => {
      const status = appointment.status ?? "completed";
      return {
        appointment,
        client: clientsById.get(appointment.client_id) ?? null,
        pet: petsById.get(appointment.pet_id) ?? null,
        isLogged: status === "completed",
        workflowStage: appointmentWorkflowStage(appointment),
        workflowLabel: appointmentWorkflowLabel(appointment),
      };
    });
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
  return appointmentRows({ appointments, clients, pets, range });
}

export function appointmentsForDay({
  appointments,
  clients,
  pets,
  date,
}: {
  appointments: Appointment[];
  clients: Client[];
  pets: Pet[];
  date: string;
}): ScheduledAppointment[] {
  return appointmentRows({ appointments, clients, pets, date });
}

export function bookedFeesForDate(
  appointments: Appointment[],
  date: string,
): number {
  return collapseLoggedGroomDuplicates(appointments)
    .filter(
      (appointment) =>
        (appointment.status ?? "completed") === "booked" &&
        appointment.date === date,
    )
    .reduce((sum, appointment) => sum + (appointment.price ?? 0), 0);
}
