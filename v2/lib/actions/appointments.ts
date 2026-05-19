"use server";

// M2 — the "Add appointment" booking write action.
//
//   - fixture mode → a dry-run: the whole flow runs (validation, ownership,
//     payload), nothing is saved — fixtures are immutable demo data.
//   - live mode    → the write is governed by the server-side kill-switch
//     isAddAppointmentWriteEnabled() (env flag
//     TIDYTAILS_ENABLE_ADD_APPOINTMENT_WRITE, default OFF). Flag OFF → the
//     action returns `gated` and runs NO insert; the OFF path is byte-identical
//     to the pre-flip behaviour. Flag ON → it persists one `appointments` row.
//     The flag is set only after the Ship 2.2b RLS cutover and an explicit
//     per-surface flip approval — see _reports/2026-05-18-ship-2.2b-write-flip-plan.md.
//
// The persist path is a single-row INSERT — on failure nothing is partially
// written. `groomer_id` is stamped by the column DEFAULT auth.uid() on the
// authenticated insert; it is never set explicitly here.

import { revalidatePath } from "next/cache";
import { dataMode, getClientRecord, loadAppointments } from "@/lib/data/repo";
import { mapAppointmentRow, serviceLabel } from "@/lib/data/live";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isAddAppointmentWriteEnabled } from "@/lib/writeGate";
import {
  checkGoogleCalendarAppointmentAvailability,
  syncAppointmentToGoogleCalendar,
} from "@/lib/googleCalendar.server";
import {
  bookingLocationLabel,
  buildAppointmentInsert,
  findOwnedPet,
  hasBookedTimeConflict,
  validateBookingInput,
  type BookingErrors,
} from "@/lib/booking";
import { fullName } from "@/lib/format";

// A human-readable echo of the booking — for the review and result screens.
export type BookingSummary = {
  petName: string;
  ownerName: string;
  date: string;
  time: string | null;
  service: string | null; // user-facing label
  location: string | null;
  customerInvite: string | null;
  fee: number | null;
  calendar?: {
    status: "disabled" | "not_connected" | "skipped" | "synced" | "failed";
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
    date: String(formData.get("date") ?? ""),
    time_slot: String(formData.get("time_slot") ?? ""),
    service_type: String(formData.get("service_type") ?? ""),
    location: String(formData.get("location") ?? ""),
    send_invite: String(formData.get("send_invite") ?? ""),
    fee: String(formData.get("fee") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const validation = validateBookingInput(raw);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors };
  }
  const booking = validation.value;

  // Ownership: re-fetch the household and confirm the pet belongs to it.
  // The client_id/pet_id pair from the form is never trusted — the
  // appointments table has no constraint tying a pet to its client.
  const record = await getClientRecord(booking.client_id);
  if (!record) {
    return {
      status: "error",
      errors: {},
      formError: "That client could not be found. Nothing was saved.",
    };
  }
  const pet = findOwnedPet(record.pets, booking.pet_id, booking.client_id);
  if (!pet) {
    return {
      status: "error",
      errors: {},
      formError: "That pet is not on this client's file. Nothing was saved.",
    };
  }

  // The validated INSERT payload — proven shape, not yet persisted.
  const payload = buildAppointmentInsert(booking);

  const summary: BookingSummary = {
    petName: pet.name,
    ownerName: fullName(record.client.first_name, record.client.last_name),
    date: payload.date,
    time: payload.time_slot,
    service: serviceLabel(payload.service_type),
    location: bookingLocationLabel(payload.location),
    customerInvite:
      booking.send_invite && record.client.email
        ? record.client.email
        : booking.send_invite
          ? "No owner email on file"
          : null,
    fee: payload.fee,
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
  if (hasBookedTimeConflict(allAppointments, payload.date, payload.time_slot)) {
    return {
      status: "error",
      errors: {},
      formError:
        "That time is already booked in Tidy Tails. Choose another time.",
    };
  }

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
  if (googleAvailability.status === "failed") {
    return {
      status: "error",
      errors: {},
      formError: `Couldn't check Google Calendar availability: ${googleAvailability.message}`,
    };
  }

  // Flag ON: persist exactly one appointments row. The auth-aware server client
  // carries Samantha's JWT, so the column DEFAULT auth.uid() stamps groomer_id.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("appointments")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    return {
      status: "error",
      errors: {},
      formError: "That appointment could not be saved. Nothing was written.",
    };
  }
  const savedAppointment = mapAppointmentRow(data ?? {});
  const calendar = await syncAppointmentToGoogleCalendar({
    appointment: savedAppointment,
    client: record.client,
    pet,
    sendCustomerInvite: booking.send_invite && Boolean(record.client.email),
  });
  summary.calendar = { status: calendar.status, message: calendar.message };
  revalidatePath(`/clients/${booking.client_id}`);
  return { status: "saved", summary };
}
