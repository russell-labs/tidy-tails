import type { Appointment } from "./data/types";

export const APPOINTMENT_WORKFLOW_MARKERS = [
  "in_progress",
  "ready_pickup",
] as const;

export type AppointmentWorkflowMarker =
  (typeof APPOINTMENT_WORKFLOW_MARKERS)[number];

export type AppointmentWorkflowStage =
  | "scheduled"
  | "active"
  | "completed"
  | "exception";

const WORKFLOW_MARKER =
  /\s*\[workflow:(in_progress|ready_pickup)\]\s*/i;

export function isAppointmentWorkflowMarker(
  value: string | null | undefined,
): value is AppointmentWorkflowMarker {
  return (APPOINTMENT_WORKFLOW_MARKERS as readonly string[]).includes(
    value ?? "",
  );
}

export function parseAppointmentWorkflowMarker(
  notes: string | null | undefined,
): AppointmentWorkflowMarker | null {
  const match = (notes ?? "").match(WORKFLOW_MARKER);
  const marker = match?.[1]?.toLowerCase();
  return isAppointmentWorkflowMarker(marker) ? marker : null;
}

export function stripAppointmentWorkflowMarker(
  notes: string | null | undefined,
): string | null {
  const stripped = (notes ?? "")
    .replace(WORKFLOW_MARKER, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped === "" ? null : stripped;
}

export function withAppointmentWorkflowMarker(
  notes: string | null | undefined,
  marker: AppointmentWorkflowMarker | null,
): string | null {
  const cleanNotes = stripAppointmentWorkflowMarker(notes);
  if (!marker) return cleanNotes;
  const nextMarker = `[workflow:${marker}]`;
  return cleanNotes ? `${cleanNotes} ${nextMarker}` : nextMarker;
}

export function appointmentWorkflowStage(
  appointment: Pick<Appointment, "notes" | "status">,
): AppointmentWorkflowStage {
  const status = appointment.status ?? "completed";
  if (status === "completed") return "completed";
  if (status === "cancelled" || status === "no_show") return "exception";
  return parseAppointmentWorkflowMarker(appointment.notes)
    ? "active"
    : "scheduled";
}

export function appointmentWorkflowLabel(
  appointment: Pick<Appointment, "notes" | "status">,
): string | null {
  const stage = appointmentWorkflowStage(appointment);
  if (stage === "completed") return "Logged";
  if (stage === "exception") {
    return appointment.status === "no_show" ? "No-show" : "Cancelled";
  }
  const marker = parseAppointmentWorkflowMarker(appointment.notes);
  if (marker === "ready_pickup") return "Ready";
  if (marker === "in_progress") return "In progress";
  return null;
}

export function isScheduleSlateAppointment(
  appointment: Pick<Appointment, "status" | "time_slot">,
): boolean {
  const status = appointment.status ?? "completed";
  if (status === "booked") return true;
  return (
    ["completed", "cancelled", "no_show"].includes(status) &&
    appointment.time_slot != null
  );
}
