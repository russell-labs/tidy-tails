"use server";

// M2 — the "Add appointment" booking write action.
//
//   - fixture mode → a dry-run: the whole flow runs (validation, ownership,
//     payload), nothing is saved — fixtures are immutable demo data.
//   - live mode    → the write is governed by the server-side kill-switch
//     isAddAppointmentWriteEnabled() (env flag
//     TIDYTAILS_ENABLE_ADD_APPOINTMENT_WRITE, default OFF). Flag OFF → the
//     action returns `gated` and runs NO insert; the OFF path is byte-identical
//     to the pre-flip behaviour. Flag ON → it persists one appointment row per
//     selected pet so reports stay row-based.
//     The flag is set only after the Ship 2.2b RLS cutover and an explicit
//     per-surface flip approval — see _reports/2026-05-18-ship-2.2b-write-flip-plan.md.
//
// The persist path is one batched INSERT — on failure nothing is partially
// written. `groomer_id` is stamped by the column DEFAULT auth.uid() on each
// authenticated insert; it is never set explicitly here.

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import {
  dataMode,
  getClientRecord,
  loadAppointments,
  requireOrgId,
} from "@/lib/data/repo";
import { mapAppointmentRow, serviceLabel } from "@/lib/data/live";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isAddAppointmentWriteEnabled } from "@/lib/writeGate";
import {
  checkGoogleCalendarAppointmentAvailability,
  syncAppointmentToGoogleCalendar,
} from "@/lib/googleCalendar.server";
import {
  buildBookingTextMessage,
  buildAppointmentInserts,
  findOwnedPets,
  formatPetNames,
  googleAvailabilityBlocksBooking,
  hasBookedTimeConflict,
  totalBookingFee,
  validateBookingInput,
  type BookingErrors,
} from "@/lib/booking";
import { fullName } from "@/lib/format";
import { customerFacingLocationLabel } from "@/lib/locationFinance";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import { sendCustomerSms } from "./sendCustomerSms";

// A human-readable echo of the booking — for the review and result screens.
export type BookingSummary = {
  petName: string;
  ownerName: string;
  date: string;
  time: string | null;
  service: string | null; // user-facing label
  location: string | null;
  customerInvite: string | null;
  bookingText: string | null;
  reminderPhone: string | null;
  fee: number | null;
  calendar?: {
    status: "disabled" | "not_connected" | "skipped" | "synced" | "failed";
    message: string;
  };
  bookingTextSend?: {
    status: "skipped" | "sent" | "gated" | "failed";
    message: string;
  };
};

export type BookingState =
  | { status: "idle" }
  | { status: "error"; errors: BookingErrors; formError?: string }
  | { status: "demo"; summary: BookingSummary }
  | { status: "gated"; summary: BookingSummary; message: string }
  | { status: "saved"; summary: BookingSummary };

export async function createBooking(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  // Defense-in-depth: the proxy gates every route, but a server action is its
  // own POST endpoint — re-verify the operator before doing anything.
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
    pet_id: String(formData.get("pet_id") ?? ""),
    pet_ids: String(formData.get("pet_ids") ?? ""),
    pet_services: String(formData.get("pet_services") ?? ""),
    pet_fees: String(formData.get("pet_fees") ?? ""),
    date: String(formData.get("date") ?? ""),
    time_slot: String(formData.get("time_slot") ?? ""),
    service_type: String(formData.get("service_type") ?? ""),
    location: String(formData.get("location") ?? ""),
    send_invite: String(formData.get("send_invite") ?? ""),
    customer_email: String(formData.get("customer_email") ?? ""),
    send_booking_text: String(formData.get("send_booking_text") ?? ""),
    booking_message: String(formData.get("booking_message") ?? ""),
    save_reminder_phone: String(formData.get("save_reminder_phone") ?? ""),
    sms_consent: String(formData.get("sms_consent") ?? ""),
    customer_phone: String(formData.get("customer_phone") ?? ""),
    fee: String(formData.get("fee") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    salon_payout_override: String(formData.get("salon_payout_override") ?? ""),
  };

  const validation = validateBookingInput(raw);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors };
  }
  const booking = validation.value;
  const operatorSettings = await readOperatorSettings();

  // Ownership: re-fetch the household and confirm every selected pet belongs
  // to it. The client_id/pet_ids pair from the form is never trusted — the
  // appointments table has no constraint tying a pet to its client.
  const record = await getClientRecord(booking.client_id);
  if (!record) {
    return {
      status: "error",
      errors: {},
      formError: "That client could not be found. Nothing was saved.",
    };
  }
  const selectedPets = findOwnedPets(record.pets, booking.pet_ids, booking.client_id);
  if (!selectedPets) {
    return {
      status: "error",
      errors: {},
      formError: "One of those pets is not on this client's file. Nothing was saved.",
    };
  }

  // SMS consent gate (WS0). A booking/reminder text can only be enabled if the
  // client has agreed — either consent already on file, or ticked in this
  // submission (which is persisted below). Enforced before the demo return so
  // fixtures/demo reflects the same gate. Runs only when a text is requested,
  // so already-consented and no-text flows are unchanged.
  const consentOnFile = record.client.sms_consent === true;
  const consentCapturedNow = booking.sms_consent;
  if (
    (booking.send_booking_text || booking.save_reminder_phone) &&
    !consentOnFile &&
    !consentCapturedNow
  ) {
    return {
      status: "error",
      errors: {
        sms_consent:
          "This client hasn't agreed to texts yet. Capture consent before sending.",
      },
    };
  }

  // The validated INSERT payloads — proven shape, not yet persisted.
  const payloads = buildAppointmentInserts(booking);
  const primaryPayload = payloads[0];
  const primaryPet = selectedPets[0];
  const petNames = formatPetNames(selectedPets.map((pet) => pet.name));
  const serviceLabels = Array.from(
    new Set(
      payloads
        .map((payload) => serviceLabel(payload.service_type))
        .filter((label): label is string => Boolean(label)),
    ),
  );
  const summaryService =
    serviceLabels.length === 0
      ? null
      : serviceLabels.length === 1
        ? serviceLabels[0]
        : "Grooming";

  const effectiveClient = {
    ...record.client,
    email:
      booking.send_invite && booking.customer_email
        ? booking.customer_email
        : record.client.email,
    phone:
      (booking.send_booking_text || booking.save_reminder_phone) &&
      booking.customer_phone
        ? booking.customer_phone
        : record.client.phone,
  };

  const summary: BookingSummary = {
    petName: petNames,
    ownerName: fullName(effectiveClient.first_name, effectiveClient.last_name),
    date: primaryPayload.date,
    time: primaryPayload.time_slot,
    service: summaryService,
    location: customerFacingLocationLabel(
      primaryPayload.location,
      operatorSettings.locationSettings,
    ),
    customerInvite:
      booking.send_invite && effectiveClient.email ? effectiveClient.email : null,
    bookingText:
      booking.send_booking_text && effectiveClient.phone
        ? effectiveClient.phone
        : null,
    reminderPhone:
      booking.save_reminder_phone && effectiveClient.phone
        ? effectiveClient.phone
        : null,
    fee: totalBookingFee(payloads),
  };

  if (dataMode() === "fixtures") {
    // Dry-run — the flow ran end to end; fixtures are demo data, nothing saved.
    return { status: "demo", summary };
  }

  // Live mode. The server-side kill-switch decides whether this persists.
  // OFF (default) → return `gated` and run no insert — identical to pre-flip.
  if (!isAddAppointmentWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Booking writes aren't switched on yet. Nothing was saved.",
    };
  }

  const allAppointments = await loadAppointments();
  if (
    hasBookedTimeConflict(allAppointments, primaryPayload.date, primaryPayload.time_slot, {
      clientId: booking.client_id,
      selectedPetIds: booking.pet_ids,
    })
  ) {
    return {
      status: "error",
      errors: {},
      formError:
        "That time is already booked in Tidy Tails. Choose another time.",
    };
  }

  const googleAvailability = await checkGoogleCalendarAppointmentAvailability({
    date: primaryPayload.date,
    timeSlot: primaryPayload.time_slot,
    service: summary.service,
  });
  if (googleAvailabilityBlocksBooking(googleAvailability.status)) {
    return {
      status: "error",
      errors: {},
      formError: googleAvailability.message,
    };
  }

  // Flag ON: persist the appointment rows. The auth-aware server client
  // carries Samantha's JWT, so the column DEFAULT auth.uid() stamps groomer_id.
  const supabase = await createServerSupabase();
  const clientPatch: {
    email?: string | null;
    phone?: string;
    sms_consent?: boolean;
    sms_consent_at?: string;
  } = {};
  if (booking.send_invite && booking.customer_email !== record.client.email) {
    clientPatch.email = booking.customer_email;
  }
  if (
    (booking.send_booking_text || booking.save_reminder_phone) &&
    booking.customer_phone !== record.client.phone
  ) {
    clientPatch.phone = booking.customer_phone ?? record.client.phone;
  }
  // Persist consent captured in this booking (only when not already on file).
  if (consentCapturedNow && !consentOnFile) {
    clientPatch.sms_consent = true;
    clientPatch.sms_consent_at = new Date().toISOString();
  }
  if (Object.keys(clientPatch).length > 0) {
    const { error } = await supabase
      .from("clients")
      .update(clientPatch)
      .eq("id", record.client.id);
    if (error) {
      return {
        status: "error",
        errors: {},
        formError:
          "The customer contact details could not be saved. Nothing was booked.",
      };
    }
  }

  const orgId = await requireOrgId();
  const { data, error } = await supabase
    .from("appointments")
    .insert(payloads.map((payload) => ({ ...payload, org_id: orgId })))
    .select("*");
  if (error) {
    return {
      status: "error",
      errors: {},
      formError: "That appointment could not be saved. Nothing was written.",
    };
  }
  const savedAppointments = Array.isArray(data)
    ? data.map((row) => mapAppointmentRow(row ?? {}))
    : [];
  const savedAppointment = savedAppointments[0];
  if (!savedAppointment) {
    return {
      status: "error",
      errors: {},
      formError: "That appointment could not be saved. Nothing was written.",
    };
  }
  const calendarAppointment =
    savedAppointments.length > 1
      ? {
          ...savedAppointment,
          service: summary.service,
          price: summary.fee,
        }
      : savedAppointment;
  const calendar = await syncAppointmentToGoogleCalendar({
    appointment: calendarAppointment,
    client: effectiveClient,
    pet: primaryPet,
    pets: selectedPets,
    sendCustomerInvite: booking.send_invite && Boolean(effectiveClient.email),
  });
  summary.calendar = { status: calendar.status, message: calendar.message };
  if (booking.send_booking_text && effectiveClient.phone) {
    const bookingTextBody =
      booking.booking_message?.trim() ||
      buildBookingTextMessage({
        ownerFirstName: effectiveClient.first_name,
        petName: petNames,
        date: summary.date,
        time: summary.time,
        service: summary.service,
        location: summary.location,
      });
    summary.bookingTextSend = await sendCustomerSms({
      clientId: booking.client_id,
      groomerId: user.id,
      to: effectiveClient.phone,
      body: bookingTextBody,
      label: "Booking",
    });
  } else {
    summary.bookingTextSend = {
      status: "skipped",
      message: "No booking text was requested.",
    };
  }
  revalidatePath(`/clients/${booking.client_id}`);
  await recordAuditEvent({
    eventType:
      savedAppointments.length > 1
        ? "appointment.group_created"
        : "appointment.created",
    clientId: booking.client_id,
    petId: booking.pet_id,
    appointmentId: savedAppointment.id,
    summary: `Booked ${petNames} for ${summary.ownerName}.`,
    metadata: {
      date: summary.date,
      service: summary.service,
      location: summary.location,
      fee: summary.fee,
      petIds: booking.pet_ids,
      appointmentIds: savedAppointments.map((appointment) => appointment.id),
      calendarStatus: summary.calendar?.status,
      status: "booked",
    },
  });
  if (summary.bookingTextSend?.status === "sent") {
    await recordAuditEvent({
      eventType: "sms.sent",
      clientId: booking.client_id,
      petId: booking.pet_id,
      appointmentId: savedAppointment.id,
      summary: `Sent booking text for ${petNames} to ${summary.ownerName}.`,
      metadata: { channel: "sms", date: summary.date },
    });
  }
  return { status: "saved", summary };
}
