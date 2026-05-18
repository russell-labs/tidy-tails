"use server";

// "Add household" — the client + pet intake write action.
//
// IMPORTANT: this action does NOT persist anything in this ship. Like the M2
// booking and Log Groom actions it runs the COMPLETE flow (auth re-check,
// input validation, INSERT-payload construction) and then, instead of
// persisting, returns a result:
//   - fixture mode → a "demo" dry-run: nothing is saved.
//   - live mode    → the write gate is CLOSED. Live client/pet creation turns
//     on only after the Ship 2.2b RLS cutover. Until then it refuses to write.
//
// There is deliberately no `.insert()` here yet. The validated payloads are
// built (buildClientInsert / buildPetInsert) so the shapes are proven;
// persistence is the one step that waits for the gate.

import { dataMode } from "@/lib/data/repo";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  buildClientInsert,
  buildPetInsert,
  validateIntake,
  type IntakeErrors,
  type PetSize,
} from "@/lib/intake";
import { fullName } from "@/lib/format";

// A human-readable echo of the intake — for the review and result screens.
export type IntakeSummary = {
  ownerName: string;
  phone: string;
  petName: string;
  petBreed: string | null;
  petSize: PetSize | null;
  allergies: boolean | null; // true = yes, false = no, null = unknown
  typicalFee: number | null;
};

export type IntakeState =
  | { status: "idle" }
  | { status: "error"; errors: IntakeErrors; formError?: string }
  | { status: "demo"; summary: IntakeSummary }
  | { status: "gated"; summary: IntakeSummary; message: string };

export async function saveIntake(
  _prev: IntakeState,
  formData: FormData,
): Promise<IntakeState> {
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
    first_name: String(formData.get("first_name") ?? ""),
    last_name: String(formData.get("last_name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    address: String(formData.get("address") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    pet_name: String(formData.get("pet_name") ?? ""),
    breed: String(formData.get("breed") ?? ""),
    size: String(formData.get("size") ?? ""),
    allergy_state: String(formData.get("allergy_state") ?? ""),
    allergies_detail: String(formData.get("allergies_detail") ?? ""),
    grooming_notes: String(formData.get("grooming_notes") ?? ""),
    typical_fee: String(formData.get("typical_fee") ?? ""),
  };

  const validation = validateIntake(raw);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors };
  }
  const intake = validation.value;

  // The validated INSERT payloads — proven shapes, not yet persisted. The
  // summary echoes them so the review/result screens show exactly what would
  // be written.
  const clientPayload = buildClientInsert(intake);
  const petPayload = buildPetInsert(intake);

  const summary: IntakeSummary = {
    ownerName: fullName(clientPayload.first_name, clientPayload.last_name),
    phone: clientPayload.phone,
    petName: petPayload.name,
    petBreed: petPayload.breed,
    petSize: petPayload.size,
    allergies: petPayload.allergies,
    typicalFee: petPayload.standard_fee,
  };

  if (dataMode() === "fixtures") {
    // Dry-run — the flow ran end to end; fixtures are demo data, nothing saved.
    return { status: "demo", summary };
  }

  // Live mode: write gate CLOSED. When it lifts (Ship 2.2b cutover), the live
  // persist is a two-step insert — the pet's client_id comes from the client
  // row just created. The two inserts are NOT atomic in PostgREST; a pet
  // failure after a client success leaves an orphan client, so the cutover
  // wires this as an RPC (or a client-insert revert on pet failure):
  //   const supabase = await createServerSupabase();
  //   const { data: c, error: cErr } = await supabase
  //     .from("clients").insert(clientPayload).select("id").single();
  //   const { error: pErr } = await supabase
  //     .from("pets").insert({ ...petPayload, client_id: c.id });
  //   ...then revalidatePath("/").
  return {
    status: "gated",
    summary,
    message: "Client and pet creation isn't switched on yet. Nothing was saved.",
  };
}
