import type { Appointment, Client, Pet } from "./data/types";
import { collapseLoggedGroomDuplicates } from "./appointmentLedger";
import {
  appointmentWorkflowLabel,
  appointmentWorkflowStage,
  isScheduleSlateAppointment,
  type AppointmentWorkflowStage,
} from "./appointmentWorkflow";
import { normalizeTimeForCompare } from "./booking";

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

export type ScheduledAppointmentGroup = {
  id: string;
  primary: ScheduledAppointment;
  rows: ScheduledAppointment[];
  appointmentIds: string[];
  petNames: string[];
  petCount: number;
  workflowStage: AppointmentWorkflowStage;
  workflowLabel: string | null;
  gross: number;
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

function comparableTimeKey(raw: string | null | undefined): string {
  const rank = timeRank(raw);
  return Number.isFinite(rank) ? String(rank) : normalizeTimeForCompare(raw);
}

function visitKey(appointment: Pick<Appointment, "client_id" | "pet_id" | "date">): string {
  return `${appointment.client_id}::${appointment.pet_id}::${appointment.date}`;
}

function sameHouseholdTimeKey(
  appointment: Pick<Appointment, "id" | "client_id" | "date" | "time_slot">,
): string {
  const time = comparableTimeKey(appointment.time_slot);
  if (!time) return `${appointment.id}`;
  return `${appointment.client_id}::${appointment.date}::${time}`;
}

function groupStage(rows: ScheduledAppointment[]): {
  stage: AppointmentWorkflowStage;
  label: string | null;
} {
  const stages = rows.map((row) => row.workflowStage);
  if (stages.includes("exception")) return { stage: "exception", label: "Needs review" };
  if (stages.includes("active")) {
    return { stage: "active", label: rows.length > 1 ? "In progress" : rows[0].workflowLabel };
  }
  if (stages.every((stage) => stage === "completed")) {
    return { stage: "completed", label: rows.length > 1 ? "Logged" : rows[0].workflowLabel };
  }
  if (stages.includes("completed")) {
    return { stage: "active", label: "Partly logged" };
  }
  return { stage: "scheduled", label: rows.length > 1 ? `${rows.length} dogs` : rows[0].workflowLabel };
}

export function groupScheduledAppointments(
  rows: ScheduledAppointment[],
): ScheduledAppointmentGroup[] {
  const groups = new Map<string, ScheduledAppointment[]>();
  for (const row of rows) {
    const key = sameHouseholdTimeKey(row.appointment);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.values()).map((groupRows) => {
    const primary = groupRows[0];
    const { stage, label } = groupStage(groupRows);
    return {
      id: groupRows.map((row) => row.appointment.id).join(":"),
      primary,
      rows: groupRows,
      appointmentIds: groupRows.map((row) => row.appointment.id),
      petNames: groupRows.map((row) => row.pet?.name ?? "Unknown pet"),
      petCount: groupRows.length,
      workflowStage: stage,
      workflowLabel: label,
      gross: groupRows.reduce(
        (sum, row) => sum + (row.appointment.price ?? 0),
        0,
      ),
    };
  });
}

export function scheduledAppointmentGroupFor(
  appointments: Appointment[],
  appointmentId: string,
): Appointment[] {
  const target = appointments.find((appointment) => appointment.id === appointmentId);
  if (!target) return [];
  const key = sameHouseholdTimeKey(target);
  if (key === target.id) return [target];
  return appointments.filter(
    (appointment) => sameHouseholdTimeKey(appointment) === key,
  );
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
