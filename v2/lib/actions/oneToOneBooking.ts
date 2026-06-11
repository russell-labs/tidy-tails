"use server";

// WS4a — the one_to_one (1:1) booking write action + open-block availability.
//
// Mirrors createBooking's safety posture (re-verify the operator, ownership
// re-check, fixtures dry-run, the same isAddAppointmentWriteEnabled kill-switch),
// but for duration blocks: it validates the location against the ORG's own
// locations (server-authoritative, not the gina/annette enum), detects overlaps
// against persisted block durations, and persists duration_minutes. It carries no
// SMS/calendar side effects — 1:1 reminders are WS4d.

import { revalidatePath } from "next/cache";
import { isScheduleSlateAppointment } from "@/lib/appointmentWorkflow";
import { recordAuditEvent } from "@/lib/audit.server";
import {
  dataMode,
  getClientRecord,
  loadAppointments,
  requireOrgId,
} from "@/lib/data/repo";
import { serviceLabel } from "@/lib/data/live";
import { findOwnedPet } from "@/lib/booking";
import { fullName } from "@/lib/format";
import { isOrgLocation, orgLocationAddress } from "@/lib/orgSettings";
import { loadOrgSettings } from "@/lib/orgSettings.server";
import {
  buildOneToOneAppointmentInsert,
  validateOneToOneBooking,
  type OneToOneBookingErrors,
} from "@/lib/oneToOneBooking";
import {
  availableBlocks,
  hasOverlapConflict,
  resolveExistingBlock,
} from "@/lib/scheduling/oneToOne";
import { parseTimeToMinutes } from "@/lib/scheduling/time";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isAddAppointmentWriteEnabled } from "@/lib/writeGate";
import { isImpersonating } from "@/lib/admin/impersonation.server";

// Conservative fallback length for an existing block whose duration_minutes is
// null (legacy row): assume a long block so overlap math fails TOWARD conflict.
const FALLBACK_BLOCK_MINUTES = 120;

export type OneToOneBookingSummary = {
  petName: string;
  ownerName: string;
  date: string;
  time: string;
  durationMinutes: number;
  service: string | null;
  location: string; // address for customer-facing copy
  fee: number | null;
};

export type OneToOneBookingState =
  | { status: "idle" }
  | { status: "error"; errors: OneToOneBookingErrors; formError?: string }
  | { status: "demo"; summary: OneToOneBookingSummary }
  | { status: "gated"; summary: OneToOneBookingSummary; message: string }
  | { status: "saved"; summary: OneToOneBookingSummary };

export async function createOneToOneBooking(
  _prev: OneToOneBookingState,
  formData: FormData,
): Promise<OneToOneBookingState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", errors: {}, formError: "Your session ended. Sign in again." };
  }

  const raw = {
    client_id: String(formData.get("client_id") ?? ""),
    pet_id: String(formData.get("pet_id") ?? ""),
    date: String(formData.get("date") ?? ""),
    time_slot: String(formData.get("time_slot") ?? ""),
    service_type: String(formData.get("service_type") ?? ""),
    location: String(formData.get("location") ?? ""),
    duration_minutes: String(formData.get("duration_minutes") ?? ""),
    fee: String(formData.get("fee") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const validation = validateOneToOneBooking(raw);
  if (!validation.ok) return { status: "error", errors: validation.errors };
  const booking = validation.value;

  const orgSettings = await loadOrgSettings();

  // Server-authoritative per-org location validation: the submitted location must
  // be one of this org's own locations, never trusted from the form alone.
  if (!isOrgLocation(orgSettings, booking.location)) {
    return {
      status: "error",
      errors: { location: "Choose one of your locations." },
    };
  }

  // Ownership re-check: the chosen pet must belong to the chosen client.
  const record = await getClientRecord(booking.client_id);
  if (!record) {
    return { status: "error", errors: {}, formError: "That client could not be found. Nothing was saved." };
  }
  const pet = findOwnedPet(record.pets, booking.pet_id, booking.client_id);
  if (!pet) {
    return { status: "error", errors: {}, formError: "That dog is not on this client's file. Nothing was saved." };
  }

  const summary: OneToOneBookingSummary = {
    petName: pet.name,
    ownerName: fullName(record.client.first_name, record.client.last_name),
    date: booking.date,
    time: booking.time_slot,
    durationMinutes: booking.duration_minutes,
    service: serviceLabel(booking.service_type),
    // Customer-facing copy uses the ADDRESS, not the internal location name.
    location: orgLocationAddress(orgSettings, booking.location) ?? booking.location,
    fee: booking.fee,
  };

  if (dataMode() === "fixtures") return { status: "demo", summary };

  if (!isAddAppointmentWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Booking writes aren't switched on yet. Nothing was saved.",
    };
  }
  // TT-015: read-only support view — never write a tenant row while impersonating.
  if (await isImpersonating()) {
    return {
      status: "gated",
      summary,
      message: "Booking writes aren't switched on yet. Nothing was saved.",
    };
  }

  // Exclusive overlap detection (server-authoritative). Resolve every active
  // same-date block from persisted durations; an unparseable start or null
  // duration is handled conservatively (fail toward conflict).
  const candidateStart = parseTimeToMinutes(booking.time_slot);
  if (candidateStart === null) {
    return { status: "error", errors: { time_slot: "Pick the start time again." } };
  }
  const allAppointments = await loadAppointments();
  const existing = allAppointments
    .filter((a) => a.date === booking.date && isScheduleSlateAppointment(a))
    .map((a) =>
      resolveExistingBlock(a.time_slot, a.duration_minutes ?? null, FALLBACK_BLOCK_MINUTES),
    );
  if (
    hasOverlapConflict({
      candidateStartMinutes: candidateStart,
      candidateDurationMinutes: booking.duration_minutes,
      existing,
      bufferMinutes: orgSettings.bufferMinutes,
    })
  ) {
    return {
      status: "error",
      errors: {},
      formError: "That block overlaps an appointment already on this day. Pick another time.",
    };
  }

  const supabase = await createServerSupabase();
  const orgId = await requireOrgId();
  const { data, error } = await supabase
    .from("appointments")
    .insert({ ...buildOneToOneAppointmentInsert(booking), org_id: orgId })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { status: "error", errors: {}, formError: "That appointment could not be saved. Nothing was written." };
  }

  revalidatePath("/schedule");
  revalidatePath(`/clients/${booking.client_id}`);
  await recordAuditEvent({
    eventType: "appointment.created",
    clientId: booking.client_id,
    petId: booking.pet_id,
    appointmentId: (data as { id: string }).id,
    summary: `Booked ${pet.name} for ${summary.ownerName}.`,
    metadata: { date: booking.date, service: summary.service, status: "booked" },
  });
  return { status: "saved", summary };
}

export type OneToOneAvailability = {
  slots: string[];
  bufferMinutes: number;
};

// Open blocks of `durationMinutes` on `date` for the current org, for the 1:1
// booking picker. Advisory — the createOneToOneBooking action is the authority.
export async function getOneToOneAvailability(
  date: string,
  durationMinutes: number,
): Promise<OneToOneAvailability> {
  const orgSettings = await loadOrgSettings();
  const allAppointments = await loadAppointments();
  const existing = allAppointments
    .filter((a) => a.date === date && isScheduleSlateAppointment(a))
    .map((a) =>
      resolveExistingBlock(a.time_slot, a.duration_minutes ?? null, FALLBACK_BLOCK_MINUTES),
    );
  const slots = availableBlocks({
    durationMinutes,
    existing,
    bufferMinutes: orgSettings.bufferMinutes,
    workingDay: orgSettings.workingDay,
  });
  return { slots, bufferMinutes: orgSettings.bufferMinutes };
}
