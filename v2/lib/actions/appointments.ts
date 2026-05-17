"use server";

// M2 — the "Add appointment" booking write action.
//
// IMPORTANT: this action does NOT persist anything in this ship.
//   - fixture mode  → a dry-run: the whole flow runs (validation, ownership,
//     payload), nothing is saved — fixtures are immutable demo data.
//   - live mode     → the write gate is CLOSED. Live appointment writes turn
//     on only after the Ship 2.2b RLS cutover (HANDOFF item 9) or an explicit
//     docs/DECISIONS.md gate-lift. Until then this action refuses to write.
//
// There is deliberately no `.insert()` here yet. The validated payload is
// built (buildAppointmentInsert) so the shape is proven; persistence is the
// one step that waits for the gate.

import { dataMode, getClientRecord } from "@/lib/data/repo";
import { serviceLabel } from "@/lib/data/live";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  buildAppointmentInsert,
  findOwnedPet,
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
  fee: number | null;
};

export type BookingState =
  | { status: "idle" }
  | { status: "error"; errors: BookingErrors; formError?: string }
  | { status: "demo"; summary: BookingSummary }
  | { status: "gated"; summary: BookingSummary; message: string };

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
    fee: payload.fee,
  };

  if (dataMode() === "fixtures") {
    // Dry-run — the flow ran end to end; fixtures are demo data, nothing saved.
    return { status: "demo", summary };
  }

  // Live mode: write gate CLOSED. When it lifts (Ship 2.2b cutover, or an
  // explicit docs/DECISIONS.md gate-lift), the live persist is one call:
  //   const supabase = await createServerSupabase();
  //   const { error } = await supabase.from("appointments").insert(payload);
  //   ...then revalidatePath(`/clients/${booking.client_id}`).
  return {
    status: "gated",
    summary,
    message:
      "Live booking writes aren't switched on yet — they turn on after the " +
      "Ship 2.2b security cutover. Nothing was saved.",
  };
}
