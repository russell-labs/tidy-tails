"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import {
  isAppointmentWorkflowMarker,
  withAppointmentWorkflowMarker,
  type AppointmentWorkflowMarker,
} from "@/lib/appointmentWorkflow";
import { dataMode, getClientRecord } from "@/lib/data/repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isEditAppointmentWriteEnabled } from "@/lib/writeGate";
import { isImpersonating } from "@/lib/admin/impersonation.server";
import { fullName } from "@/lib/format";

export type AppointmentWorkflowAction = "scheduled" | AppointmentWorkflowMarker;

export type AppointmentWorkflowState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "demo" | "gated" | "saved";
      message: string;
      label: string;
    };

function labelFor(action: AppointmentWorkflowAction): string {
  if (action === "in_progress") return "In progress";
  if (action === "ready_pickup") return "Ready";
  return "Not started";
}

function parseAction(value: string): AppointmentWorkflowAction | null {
  if (value === "scheduled") return "scheduled";
  return isAppointmentWorkflowMarker(value) ? value : null;
}

export async function updateAppointmentWorkflow(
  _prev: AppointmentWorkflowState,
  formData: FormData,
): Promise<AppointmentWorkflowState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your session ended. Sign in again." };

  const clientId = String(formData.get("client_id") ?? "").trim();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  const action = parseAction(String(formData.get("workflow_status") ?? "").trim());
  if (!clientId || !appointmentId || !action) {
    return { status: "error", message: "Missing workflow details." };
  }

  const record = await getClientRecord(clientId);
  const appointment = record?.appointments.find(
    (candidate) => candidate.id === appointmentId,
  );
  if (!record || !appointment) {
    return { status: "error", message: "That appointment could not be found." };
  }
  if (appointment.status === "completed") {
    return {
      status: "error",
      message: "That groom is already logged. Use Edit visit for corrections.",
    };
  }
  if (appointment.status === "cancelled" || appointment.status === "no_show") {
    return {
      status: "error",
      message: "That appointment is an exception. Use Edit visit for corrections.",
    };
  }

  const label = labelFor(action);
  if (dataMode() === "fixtures") {
    return { status: "demo", label, message: `Demo only - marked ${label}.` };
  }
  if (!isEditAppointmentWriteEnabled()) {
    return {
      status: "gated",
      label,
      message: "Schedule status changes are not switched on yet. Nothing was saved.",
    };
  }
  // TT-015: read-only support view — never write a tenant row while impersonating.
  if (await isImpersonating()) {
    return {
      status: "gated",
      label,
      message: "Schedule status changes are not switched on yet. Nothing was saved.",
    };
  }

  const nextNotes = withAppointmentWorkflowMarker(
    appointment.notes,
    action === "scheduled" ? null : action,
  );
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("appointments")
    .update({ notes: nextNotes })
    .eq("id", appointmentId)
    .eq("client_id", clientId);
  if (error) {
    return { status: "error", message: "That schedule status could not be saved." };
  }

  const pet = record.pets.find((candidate) => candidate.id === appointment.pet_id);
  revalidatePath("/schedule");
  revalidatePath(`/clients/${clientId}`);
  if (appointment.pet_id) revalidatePath(`/clients/${clientId}/pets/${appointment.pet_id}`);
  await recordAuditEvent({
    eventType: "appointment.updated",
    clientId,
    petId: appointment.pet_id,
    appointmentId,
    summary: `Marked ${pet?.name ?? "appointment"} ${label.toLowerCase()} for ${fullName(
      record.client.first_name,
      record.client.last_name,
    )}.`,
    metadata: {
      status: action,
      date: appointment.date,
    },
  });
  return { status: "saved", label, message: `Marked ${label}.` };
}
