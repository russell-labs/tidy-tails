"use server";

import { revalidatePath } from "next/cache";
import { dataMode, getClientRecord } from "@/lib/data/repo";
import { mapAppointmentRow, serviceLabel } from "@/lib/data/live";
import type { Appointment } from "@/lib/data/types";
import { syncAppointmentToGoogleCalendar } from "@/lib/googleCalendar.server";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isEditAppointmentWriteEnabled } from "@/lib/writeGate";
import {
  buildEditAppointmentUpdate,
  validateEditAppointment,
  type EditAppointmentErrors,
  type EditAppointmentUpdate,
} from "@/lib/editAppointment";
import { fullName } from "@/lib/format";

export type EditAppointmentSummary = {
  ownerName: string;
  petName: string;
  date: string;
  time: string | null;
  service: string | null;
  fee: number | null;
  tip: number | null;
  calendar?: {
    status: "disabled" | "not_connected" | "skipped" | "synced" | "failed";
    message: string;
  };
};

export type EditAppointmentState =
  | { status: "idle" }
  | { status: "error"; errors: EditAppointmentErrors; formError?: string }
  | { status: "demo"; summary: EditAppointmentSummary }
  | { status: "gated"; summary: EditAppointmentSummary; message: string }
  | { status: "saved"; summary: EditAppointmentSummary };

export async function editAppointment(
  _prev: EditAppointmentState,
  formData: FormData,
): Promise<EditAppointmentState> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    };
  }

  const raw = {
    client_id: String(formData.get("client_id") ?? ""),
    appointment_id: String(formData.get("appointment_id") ?? ""),
    date: String(formData.get("date") ?? ""),
    time_slot: String(formData.get("time_slot") ?? ""),
    service_type: String(formData.get("service_type") ?? ""),
    fee: String(formData.get("fee") ?? ""),
    tip: String(formData.get("tip") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const validation = validateEditAppointment(raw);
  if (!validation.ok) return { status: "error", errors: validation.errors };
  const appointment = validation.value;

  const record = await getClientRecord(appointment.client_id);
  if (!record) {
    return {
      status: "error",
      errors: {},
      formError: "That household could not be found. Nothing was saved.",
    };
  }
  const existing = record.appointments.find(
    (candidate) => candidate.id === appointment.appointment_id,
  );
  if (!existing) {
    return {
      status: "error",
      errors: {},
      formError: "That visit is not on this household. Nothing was saved.",
    };
  }
  const petName =
    record.pets.find((pet) => pet.id === existing.pet_id)?.name ?? "the pet";

  const payload: EditAppointmentUpdate = buildEditAppointmentUpdate(appointment);
  const summary: EditAppointmentSummary = {
    ownerName: fullName(record.client.first_name, record.client.last_name),
    petName,
    date: payload.date,
    time: payload.time_slot,
    service: serviceLabel(payload.service_type),
    fee: payload.fee,
    tip: payload.tip,
  };

  if (dataMode() === "fixtures") return { status: "demo", summary };

  if (!isEditAppointmentWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Visit editing is not switched on yet. Nothing was saved.",
    };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("appointments")
    .update(payload)
    .eq("id", appointment.appointment_id)
    .eq("client_id", appointment.client_id)
    .select("*")
    .single();
  if (error) {
    return {
      status: "error",
      errors: {},
      formError: "That visit could not be saved. Nothing was written.",
    };
  }
  const savedAppointment = mapAppointmentRow(data ?? {}) as Appointment;
  const pet = record.pets.find((candidate) => candidate.id === existing.pet_id);
  if (pet) {
    const calendar = await syncAppointmentToGoogleCalendar({
      appointment: savedAppointment,
      client: record.client,
      pet,
    });
    summary.calendar = { status: calendar.status, message: calendar.message };
  }

  revalidatePath(`/clients/${appointment.client_id}`);
  revalidatePath(`/clients/${appointment.client_id}/pets/${existing.pet_id}`);
  return { status: "saved", summary };
}
