"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import {
  isEditAppointmentWriteEnabled,
  isReminderSendEnabled,
} from "@/lib/writeGate";
import {
  bookingLocationLabel,
  googleAvailabilityBlocksBooking,
  hasBookedTimeConflict,
} from "@/lib/booking";
import {
  appointmentDeleteKind,
  buildCancellationTextDraft,
  buildEditAppointmentUpdate,
  buildSharedAppointmentGroupRowUpdate,
  buildSharedAppointmentGroupUpdate,
  shouldBlockAppointmentDeleteForCalendarStatus,
  validateBookingUpdateTextInput,
  validateCancellationTextInput,
  validateEditAppointment,
  type EditAppointmentErrors,
  type EditAppointmentUpdate,
} from "@/lib/editAppointment";
import { fullName } from "@/lib/format";
import { buildOutboundSmsInsert } from "@/lib/inboundSms";
import { customerLocationLabelFromSettings } from "@/lib/locationFinance";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import { parsePaymentInfo, type PaymentMethod, type PaymentStatus } from "@/lib/payments";
import { scheduledAppointmentGroupFor } from "@/lib/schedule";
import { getTwilioConfig, sendTwilioSms, toTwilioPhone } from "@/lib/twilio";

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
  | {
      status: "demo";
      summary: EditAppointmentSummary;
      bookingUpdateText?: AppointmentTextSend;
    }
  | { status: "gated"; summary: EditAppointmentSummary; message: string }
  | {
      status: "saved";
      summary: EditAppointmentSummary;
      bookingUpdateText?: AppointmentTextSend;
    };

type CalendarSummary = NonNullable<EditAppointmentSummary["calendar"]>;

type AppointmentTextSend = {
  status: "skipped" | "sent" | "gated" | "failed";
  message: string;
};

export type DeleteAppointmentState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "demo" | "gated" | "deleted";
      summary: EditAppointmentSummary;
      message?: string;
      calendar?: { status: string; message: string };
      cancellationText?: AppointmentTextSend;
    };

function checked(value: FormDataEntryValue | null): boolean {
  return ["on", "true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function wantsGroupScope(formData: FormData): boolean {
  return String(formData.get("edit_scope") ?? "").trim() === "group";
}

function appointmentPetNames(
  appointments: Appointment[],
  pets: { id: string; name: string }[],
): string {
  return appointments
    .map(
      (appointment) =>
        pets.find((pet) => pet.id === appointment.pet_id)?.name ?? "the pet",
    )
    .join(" + ");
}

function summarizeCalendarResults(
  results: Array<{ status: string; message: string }>,
): CalendarSummary {
  if (results.length === 0) {
    return { status: "skipped", message: "No calendar events needed syncing." };
  }
  if (results.length === 1) {
    const result = results[0];
    return {
      status: result.status as CalendarSummary["status"],
      message: result.message,
    };
  }
  const failed = results.filter((result) => result.status === "failed").length;
  const synced = results.filter((result) => result.status === "synced").length;
  if (failed > 0) {
    return {
      status: "failed",
      message: `${synced}/${results.length} calendar events synced; ${failed} need review.`,
    };
  }
  if (synced > 0) {
    return {
      status: "synced",
      message: `${synced}/${results.length} calendar events synced.`,
    };
  }
  return {
    status: (results[0].status ?? "skipped") as CalendarSummary["status"],
    message: `${results.length} calendar events checked.`,
  };
}

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
    salon_payout_override: String(formData.get("salon_payout_override") ?? ""),
  };
  const wantsBookingUpdateText = checked(formData.get("send_booking_update_text"));
  const groupScope = wantsGroupScope(formData);
  const bookingUpdateMessage = String(
    formData.get("booking_update_message") ?? "",
  ).trim();

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
  const groupAppointments = scheduledAppointmentGroupFor(
    record.appointments,
    existing.id,
  );
  const targetAppointments =
    groupScope && groupAppointments.length > 1 ? groupAppointments : [existing];
  const targetAppointmentIds = targetAppointments.map((candidate) => candidate.id);
  const targetPetName =
    targetAppointments.length > 1
      ? appointmentPetNames(targetAppointments, record.pets)
      : petName;
  const operatorSettings = await readOperatorSettings();

  const isGroupEdit = targetAppointments.length > 1;
  const payload: EditAppointmentUpdate | Pick<EditAppointmentUpdate, "date" | "time_slot" | "location"> = isGroupEdit
    ? buildSharedAppointmentGroupUpdate(appointment)
    : buildEditAppointmentUpdate(appointment);
  const fullPayload = isGroupEdit ? null : (payload as EditAppointmentUpdate);
  const summary: EditAppointmentSummary = {
    ownerName: fullName(record.client.first_name, record.client.last_name),
    petName: targetPetName,
    date: payload.date,
    time: payload.time_slot,
    service: fullPayload ? serviceLabel(fullPayload.service_type) : existing.service,
    location:
      customerLocationLabelFromSettings(
        payload.location,
        operatorSettings.locationSettings,
      ) ??
      bookingLocationLabel(payload.location),
    fee: fullPayload ? fullPayload.fee : existing.price,
    tip: fullPayload ? fullPayload.tip : existing.tip,
    paymentMethod: appointment.payment_method,
    paymentStatus: appointment.payment_status,
  };
  let bookingUpdateDraft: string | null = null;
  if (wantsBookingUpdateText) {
    const updateText = validateBookingUpdateTextInput(bookingUpdateMessage);
    if (!updateText.ok) {
      return { status: "error", errors: {}, formError: updateText.message };
    }
    bookingUpdateDraft = updateText.value;
  }

  if (dataMode() === "fixtures") {
    return {
      status: "demo",
      summary,
      bookingUpdateText: bookingUpdateDraft
        ? {
            status: "skipped",
            message: "Demo only - no booking update text was sent.",
          }
        : undefined,
    };
  }

  if (!isEditAppointmentWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Visit editing is not switched on yet. Nothing was saved.",
    };
  }

  const bookingSlotChanged =
    payload.date !== existing.date || payload.time_slot !== existing.time_slot;
  const calendarRelevantChanged =
    bookingSlotChanged ||
    Boolean(
      fullPayload &&
        fullPayload.service_type !== serviceCodeFromLabel(existing.service),
    );

  if (payload.time_slot && bookingSlotChanged) {
    const allAppointments = (await loadAppointments()).filter(
      (candidate) => !targetAppointmentIds.includes(candidate.id),
    );
    if (hasBookedTimeConflict(allAppointments, payload.date, payload.time_slot)) {
      return {
        status: "error",
        errors: {},
        formError:
          "That time is already booked in Tidy Tails. Choose another time.",
      };
    }
  }

  if (payload.time_slot && calendarRelevantChanged) {
    const googleAvailability = await checkGoogleCalendarAppointmentAvailability({
      date: payload.date,
      timeSlot: payload.time_slot,
      service: summary.service,
    });
    if (googleAvailabilityBlocksBooking(googleAvailability.status)) {
      return {
        status: "error",
        errors: {},
        formError: googleAvailability.message,
      };
    }
  }

  const supabase = await createServerSupabase();
  const writeResults = isGroupEdit
    ? await Promise.all(
        targetAppointments.map((targetAppointment) =>
          supabase
            .from("appointments")
            .update(
              buildSharedAppointmentGroupRowUpdate(appointment, {
                price: targetAppointment.price,
                tip: targetAppointment.tip,
                notes: targetAppointment.notes,
              }),
            )
            .eq("client_id", appointment.client_id)
            .eq("id", targetAppointment.id)
            .select("*")
            .single(),
        ),
      )
    : [
        await supabase
          .from("appointments")
          .update(payload)
          .eq("client_id", appointment.client_id)
          .eq("id", appointment.appointment_id)
          .select("*")
          .single(),
      ];
  const writeError = writeResults.find((result) => result.error)?.error;
  if (writeError) {
    return {
      status: "error",
      errors: {},
      formError: "That visit could not be saved. Nothing was written.",
    };
  }
  const savedAppointments = writeResults
    .map((result) => result.data)
    .filter(Boolean)
    .map((row) => mapAppointmentRow(row ?? {}) as Appointment);
  const calendarResults = await Promise.all(
    savedAppointments.map(async (savedAppointment) => {
      const pet = record.pets.find(
        (candidate) => candidate.id === savedAppointment.pet_id,
      );
      if (!pet) return { status: "skipped", message: "Pet was not found for calendar sync." };
      return syncAppointmentToGoogleCalendar({
        appointment: savedAppointment,
        client: record.client,
        pet,
      });
    }),
  );
  summary.calendar = summarizeCalendarResults(calendarResults);

  revalidatePath(`/clients/${appointment.client_id}`);
  for (const targetAppointment of targetAppointments) {
    revalidatePath(`/clients/${appointment.client_id}/pets/${targetAppointment.pet_id}`);
  }
  await recordAuditEvent({
    eventType: "appointment.updated",
    clientId: appointment.client_id,
    petId: existing.pet_id,
    appointmentId: appointment.appointment_id,
    summary: `Edited visit for ${summary.petName} under ${summary.ownerName}.`,
    metadata: {
      date: summary.date,
      appointmentIds: targetAppointmentIds,
      service: summary.service,
      location: summary.location,
      fee: summary.fee,
      tip: summary.tip,
      paymentMethod: summary.paymentMethod,
      paymentStatus: summary.paymentStatus,
      calendarStatus: summary.calendar?.status,
    },
  });
  let bookingUpdateText: AppointmentTextSend | undefined;
  if (bookingUpdateDraft) {
    bookingUpdateText = await sendAppointmentText({
      clientId: appointment.client_id,
      groomerId: user.id,
      label: "Booking update",
      to: record.client.phone,
      body: bookingUpdateDraft,
    });
    if (bookingUpdateText.status === "sent") {
      await recordAuditEvent({
        eventType: "sms.sent",
        clientId: appointment.client_id,
        petId: existing.pet_id,
        appointmentId: appointment.appointment_id,
        summary: `Sent booking update text for ${summary.petName} to ${summary.ownerName}.`,
        metadata: { channel: "sms", date: summary.date, appointmentIds: targetAppointmentIds },
      });
    }
  }
  return { status: "saved", summary, bookingUpdateText };
}

export async function deleteAppointment(
  _prev: DeleteAppointmentState,
  formData: FormData,
): Promise<DeleteAppointmentState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your session ended. Sign in again." };

  const clientId = String(formData.get("client_id") ?? "").trim();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  const groupScope = wantsGroupScope(formData);
  const wantsCancellationText = checked(formData.get("send_cancellation_text"));
  const cancellationMessage = String(formData.get("cancellation_message") ?? "").trim();
  if (!clientId || !appointmentId) {
    return { status: "error", message: "Missing appointment details." };
  }

  const record = await getClientRecord(clientId);
  const existing = record?.appointments.find((a) => a.id === appointmentId);
  if (!record || !existing) {
    return { status: "error", message: "That appointment could not be found." };
  }
  const pet = record.pets.find((candidate) => candidate.id === existing.pet_id);
  const groupAppointments = scheduledAppointmentGroupFor(record.appointments, existing.id);
  const targetAppointments =
    groupScope && groupAppointments.length > 1 ? groupAppointments : [existing];
  const targetAppointmentIds = targetAppointments.map((appointment) => appointment.id);
  const payment = parsePaymentInfo(existing.notes);
  const ownerName = fullName(record.client.first_name, record.client.last_name);
  const operatorSettings = await readOperatorSettings();
  const summary: EditAppointmentSummary = {
    ownerName,
    petName:
      targetAppointments.length > 1
        ? appointmentPetNames(targetAppointments, record.pets)
        : pet?.name ?? "the pet",
    date: existing.date,
    time: existing.time_slot,
    service: existing.service,
    fee: existing.price,
    location:
      customerLocationLabelFromSettings(
        existing.location,
        operatorSettings.locationSettings,
      ) ??
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

  const deleteKind = appointmentDeleteKind({
    status: existing.status,
    date: existing.date,
    today: new Date().toISOString().slice(0, 10),
  });
  const deleteKinds = targetAppointments.map((targetAppointment) =>
    appointmentDeleteKind({
      status: targetAppointment.status,
      date: targetAppointment.date,
      today: new Date().toISOString().slice(0, 10),
    }),
  );
  if (deleteKinds.includes("disabled")) {
    return {
      status: "error",
      message: "One of those appointments cannot be deleted from this screen.",
    };
  }
  let cancellationDraft: ReturnType<typeof buildCancellationTextDraft> | null = null;
  if (wantsCancellationText && deleteKind === "future_booking") {
    const cancellationText = validateCancellationTextInput(cancellationMessage);
    if (!cancellationText.ok) {
      return { status: "error", message: cancellationText.message };
    }
    cancellationDraft = buildCancellationTextDraft(cancellationText.value);
  }

  const calendarResults = await Promise.all(
    targetAppointments.map((targetAppointment) =>
      deleteAppointmentFromGoogleCalendar(targetAppointment),
    ),
  );
  const blockingCalendar = calendarResults.find((calendar) =>
    shouldBlockAppointmentDeleteForCalendarStatus(calendar.status),
  );
  if (blockingCalendar) {
    return {
      status: "error",
      message: `Google Calendar could not remove the event: ${blockingCalendar.message}`,
    };
  }
  const calendar = summarizeCalendarResults(calendarResults);

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("client_id", clientId)
    .in("id", targetAppointmentIds);
  if (error) {
    return { status: "error", message: "That booking could not be deleted." };
  }

  revalidatePath(`/clients/${clientId}`);
  for (const targetAppointment of targetAppointments) {
    if (targetAppointment.pet_id) {
      revalidatePath(`/clients/${clientId}/pets/${targetAppointment.pet_id}`);
    }
  }
  await recordAuditEvent({
    eventType: "appointment.deleted",
    clientId,
    petId: existing.pet_id,
    summary: `Deleted booking for ${summary.petName} under ${summary.ownerName}.`,
    metadata: {
      date: summary.date,
      appointmentIds: targetAppointmentIds,
      service: summary.service,
      fee: summary.fee,
      calendarStatus: calendar?.status,
    },
  });
  let cancellationText: AppointmentTextSend = {
    status: "skipped",
    message: "No cancellation text was requested.",
  };
  if (cancellationDraft) {
    cancellationText = await sendAppointmentText({
      clientId,
      groomerId: user.id,
      label: "Cancellation",
      to: record.client.phone,
      body: cancellationDraft.message,
    });
    if (cancellationText.status === "sent") {
      await recordAuditEvent({
        eventType: "sms.sent",
        clientId,
        petId: existing.pet_id,
        summary: `Sent cancellation text for ${summary.petName} to ${summary.ownerName}.`,
        metadata: { channel: "sms", date: summary.date },
      });
    }
  }
  redirect(`/schedule?view=day&day=${summary.date}`);
  return {
    status: "deleted",
    summary,
    message: "The booking was removed from Tidy Tails.",
    calendar: { status: calendar.status, message: calendar.message },
    cancellationText,
  };
}

async function sendAppointmentText({
  clientId,
  groomerId,
  label,
  to,
  body,
}: {
  clientId: string;
  groomerId: string;
  label: "Booking update" | "Cancellation";
  to: string;
  body: string;
}): Promise<AppointmentTextSend> {
  if (!isReminderSendEnabled()) {
    return {
      status: "gated",
      message: `${label} text was not sent because SMS sending is switched off.`,
    };
  }
  const twilioConfig = getTwilioConfig();
  if (!twilioConfig.ok) {
    return {
      status: "failed",
      message: `${label} text was not sent because Twilio is not configured.`,
    };
  }
  const normalizedPhone = toTwilioPhone(to);
  if (!normalizedPhone) {
    return {
      status: "failed",
      message: `${label} text was not sent because the customer phone number is not textable.`,
    };
  }
  const result = await sendTwilioSms(twilioConfig.value, {
    to: normalizedPhone,
    body,
  });
  if (!result.ok) {
    return {
      status: "failed",
      message: `${result.message} ${label} text was not sent.`,
    };
  }
  const supabase = await createServerSupabase();
  await supabase.from("sms_messages").insert(
    buildOutboundSmsInsert({
      clientId,
      groomerId,
      from: twilioConfig.value.fromNumber,
      to: normalizedPhone,
      body,
      messageSid: result.sid,
    }),
  );
  return { status: "sent", message: `${label} text sent to the customer.` };
}

function serviceCodeFromLabel(label: string | null): string | null {
  if (label === "Full groom") return "full_groom";
  if (label === "Puppy groom") return "puppy_groom";
  if (label === "Bath only") return "bath_only";
  if (label === "Nail trim") return "nail_trim";
  if (label === "Other") return "other";
  return null;
}
