"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { dataMode, getClientRecord, loadAppointments } from "@/lib/data/repo";
import { mapAppointmentRow, serviceLabel } from "@/lib/data/live";
import type { Appointment } from "@/lib/data/types";
import {
  checkGoogleCalendarAppointmentAvailability,
  deleteAppointmentFromGoogleCalendar,
  syncAppointmentToGoogleCalendar,
} from "@/lib/googleCalendar.server";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isEditAppointmentWriteEnabled } from "@/lib/writeGate";
import {
  bookingLocationLabel,
  customerBookingLocationLabel,
  hasBookedTimeConflict,
} from "@/lib/booking";
import {
  buildEditAppointmentUpdate,
  validateEditAppointment,
  type EditAppointmentErrors,
  type EditAppointmentUpdate,
} from "@/lib/editAppointment";
import { fullName } from "@/lib/format";
import { parsePaymentInfo, type PaymentMethod, type PaymentStatus } from "@/lib/payments";

export type EditAppointmentSummary = {
  ownerName: string;
  petName: string;
  date: string;
  time: string | null;
  service: string | null;
  location: string | null;
  fee: number | null;
  tip: number | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
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

export type DeleteAppointmentState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "demo" | "gated" | "deleted";
      summary: EditAppointmentSummary;
      message?: string;
      calendar?: { status: string; message: string };
    };

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
    location: String(formData.get("location") ?? ""),
    fee: String(formData.get("fee") ?? ""),
    tip: String(formData.get("tip") ?? ""),
    payment_method: String(formData.get("payment_method") ?? ""),
    payment_status: String(formData.get("payment_status") ?? ""),
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
    location:
      customerBookingLocationLabel(payload.location) ??
      bookingLocationLabel(payload.location),
    fee: payload.fee,
    tip: payload.tip,
    paymentMethod: appointment.payment_method,
    paymentStatus: appointment.payment_status,
  };

  if (dataMode() === "fixtures") return { status: "demo", summary };

  if (!isEditAppointmentWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Visit editing is not switched on yet. Nothing was saved.",
    };
  }

  if (payload.time_slot) {
    const allAppointments = (await loadAppointments()).filter(
      (candidate) => candidate.id !== appointment.appointment_id,
    );
    if (hasBookedTimeConflict(allAppointments, payload.date, payload.time_slot)) {
      return {
        status: "error",
        errors: {},
        formError:
          "That time is already booked in Tidy Tails. Choose another time.",
      };
    }

    const calendarRelevantChanged =
      payload.date !== existing.date ||
      payload.time_slot !== existing.time_slot ||
      payload.service_type !== serviceCodeFromLabel(existing.service);
    if (calendarRelevantChanged) {
      const googleAvailability = await checkGoogleCalendarAppointmentAvailability({
        date: payload.date,
        timeSlot: payload.time_slot,
        service: summary.service,
      });
      if (googleAvailability.status === "busy") {
        return {
          status: "error",
          errors: {},
          formError: googleAvailability.message,
        };
      }
      if (
        googleAvailability.status === "failed" ||
        googleAvailability.status === "not_connected"
      ) {
        return {
          status: "error",
          errors: {},
          formError: `Couldn't check Google Calendar availability: ${googleAvailability.message}`,
        };
      }
    }
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
  await recordAuditEvent({
    eventType: "appointment.updated",
    clientId: appointment.client_id,
    petId: existing.pet_id,
    appointmentId: appointment.appointment_id,
    summary: `Edited visit for ${summary.petName} under ${summary.ownerName}.`,
    metadata: {
      date: summary.date,
      service: summary.service,
      location: summary.location,
      fee: summary.fee,
      tip: summary.tip,
      paymentMethod: summary.paymentMethod,
      paymentStatus: summary.paymentStatus,
      calendarStatus: summary.calendar?.status,
    },
  });
  return { status: "saved", summary };
}

export async function deleteAppointment(
  _prev: DeleteAppointmentState,
  formData: FormData,
): Promise<DeleteAppointmentState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your session ended. Sign in again." };

  const clientId = String(formData.get("client_id") ?? "").trim();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  if (!clientId || !appointmentId) {
    return { status: "error", message: "Missing appointment details." };
  }

  const record = await getClientRecord(clientId);
  const existing = record?.appointments.find((a) => a.id === appointmentId);
  if (!record || !existing) {
    return { status: "error", message: "That appointment could not be found." };
  }
  const pet = record.pets.find((candidate) => candidate.id === existing.pet_id);
  const payment = parsePaymentInfo(existing.notes);
  const summary: EditAppointmentSummary = {
    ownerName: fullName(record.client.first_name, record.client.last_name),
    petName: pet?.name ?? "the pet",
    date: existing.date,
    time: existing.time_slot,
    service: existing.service,
    fee: existing.price,
    location:
      customerBookingLocationLabel(existing.location) ??
      bookingLocationLabel(existing.location),
    tip: existing.tip,
    paymentMethod: payment.method ?? "cash",
    paymentStatus: payment.status ?? "paid",
  };

  if (dataMode() === "fixtures") {
    return { status: "demo", summary, message: "Demo data was not changed." };
  }
  if (!isEditAppointmentWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Booking deletion is not switched on yet. Nothing was deleted.",
    };
  }

  const calendar = await deleteAppointmentFromGoogleCalendar(existing);
  if (calendar.status === "failed") {
    return {
      status: "error",
      message: `Google Calendar could not remove the event: ${calendar.message}`,
    };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", appointmentId)
    .eq("client_id", clientId);
  if (error) {
    return { status: "error", message: "That booking could not be deleted." };
  }

  revalidatePath(`/clients/${clientId}`);
  if (existing.pet_id) revalidatePath(`/clients/${clientId}/pets/${existing.pet_id}`);
  await recordAuditEvent({
    eventType: "appointment.deleted",
    clientId,
    petId: existing.pet_id,
    summary: `Deleted booking for ${summary.petName} under ${summary.ownerName}.`,
    metadata: {
      date: summary.date,
      service: summary.service,
      fee: summary.fee,
      calendarStatus: calendar.status,
    },
  });
  return {
    status: "deleted",
    summary,
    message: "The booking was removed from Tidy Tails.",
    calendar: { status: calendar.status, message: calendar.message },
  };
}

function serviceCodeFromLabel(label: string | null): string | null {
  if (label === "Full groom") return "full_groom";
  if (label === "Bath only") return "bath_only";
  if (label === "Nail trim") return "nail_trim";
  if (label === "Other") return "other";
  return null;
}
