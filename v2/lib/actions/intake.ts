"use server";

// "Add household" — the client + pet intake write action.
//
// Like the M2 booking and Log Groom actions it runs the COMPLETE flow
// (auth re-check, input validation, INSERT-payload construction) and then:
//   - fixture mode → a "demo" dry-run: nothing is saved.
//   - live mode    → persists only when TIDYTAILS_ENABLE_ADD_HOUSEHOLD_WRITE
//     is exactly "on". Flag OFF returns gated and runs no insert.
//
// This is a two-row write. The action compensates on pet-insert failure by
// deleting the just-created client row, so Sam is not left with an owner that
// has no first pet.

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { dataMode } from "@/lib/data/repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isAddHouseholdWriteEnabled } from "@/lib/writeGate";
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
  | { status: "gated"; summary: IntakeSummary; message: string }
  | { status: "saved"; summary: IntakeSummary };

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
    ownerName: fullName(clientPayload.first_name, clientPayload.last_name ?? ""),
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

  // Live mode. The server-side kill-switch decides whether this persists.
  // OFF (default) → return `gated` and run no insert.
  if (!isAddHouseholdWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Client and pet creation isn't switched on yet. Nothing was saved.",
    };
  }

  const supabase = await createServerSupabase();
  const { data: clientRow, error: clientError } = await supabase
    .from("clients")
    .insert(clientPayload)
    .select("id")
    .single();

  if (clientError || !clientRow?.id) {
    return {
      status: "error",
      errors: {},
      formError: "That household could not be saved. Nothing was written.",
    };
  }

  const { error: petError } = await supabase
    .from("pets")
    .insert({ ...petPayload, client_id: clientRow.id });

  if (petError) {
    await supabase.from("clients").delete().eq("id", clientRow.id);
    return {
      status: "error",
      errors: {},
      formError:
        "That pet could not be saved, so the new household was rolled back.",
    };
  }

  revalidatePath("/");
  await recordAuditEvent({
    eventType: "client.created",
    clientId: clientRow.id,
    summary: `Added household ${summary.ownerName} with pet ${summary.petName}.`,
    metadata: { fee: summary.typicalFee },
  });
  return { status: "saved", summary };
}
