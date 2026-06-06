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
  buildPetInserts,
  validateIntake,
  type IntakeErrors,
  type PetSize,
  type PetIntakeInput,
} from "@/lib/intake";
import { fullName } from "@/lib/format";

// A human-readable echo of the intake — for the review and result screens.
export type IntakeSummary = {
  ownerName: string;
  phone: string;
  petNames: string[];
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

function formString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function petFromIndexedFields(formData: FormData, index: number): PetIntakeInput {
  const prefix = `pet_${index}_`;
  return {
    pet_name: formString(formData, `${prefix}name`),
    breed: formString(formData, `${prefix}breed`),
    size: formString(formData, `${prefix}size`),
    allergy_state: formString(formData, `${prefix}allergy_state`),
    allergies_detail: formString(formData, `${prefix}allergies_detail`),
    vaccination_state: formString(formData, `${prefix}vaccination_state`),
    vaccination_detail: formString(formData, `${prefix}vaccination_detail`),
    age: formString(formData, `${prefix}age`),
    date_of_birth: formString(formData, `${prefix}date_of_birth`),
    grooming_notes: formString(formData, `${prefix}grooming_notes`),
    typical_fee: formString(formData, `${prefix}typical_fee`),
  };
}

function petsFromFormData(formData: FormData): PetIntakeInput[] | undefined {
  const count = Number(formData.get("pet_count") ?? 0);
  if (!Number.isInteger(count) || count < 1) return undefined;
  return Array.from({ length: count }, (_, index) =>
    petFromIndexedFields(formData, index),
  );
}

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
    first_name: formString(formData, "first_name"),
    last_name: formString(formData, "last_name"),
    phone: formString(formData, "phone"),
    secondary_contact_name: formString(formData, "secondary_contact_name"),
    secondary_cell: formString(formData, "secondary_cell"),
    landline: formString(formData, "landline"),
    email: formString(formData, "email"),
    address: formString(formData, "address"),
    notes: formString(formData, "notes"),
    sms_consent: formString(formData, "sms_consent"),
    pet_name: formString(formData, "pet_name"),
    breed: formString(formData, "breed"),
    size: formString(formData, "size"),
    allergy_state: formString(formData, "allergy_state"),
    allergies_detail: formString(formData, "allergies_detail"),
    vaccination_state: formString(formData, "vaccination_state"),
    vaccination_detail: formString(formData, "vaccination_detail"),
    age: formString(formData, "age"),
    date_of_birth: formString(formData, "date_of_birth"),
    grooming_notes: formString(formData, "grooming_notes"),
    typical_fee: formString(formData, "typical_fee"),
    pets: petsFromFormData(formData),
  };

  const validation = validateIntake(raw);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors };
  }
  const intake = validation.value;

  // The validated INSERT payloads — proven shapes, not yet persisted. The
  // summary echoes them so the review/result screens show exactly what would
  // be written.
  const clientPayload = buildClientInsert(intake, new Date().toISOString());
  const petPayloads = buildPetInserts(intake);
  const firstPetPayload = petPayloads[0];

  const summary: IntakeSummary = {
    ownerName: fullName(clientPayload.first_name, clientPayload.last_name ?? ""),
    phone: clientPayload.phone,
    petNames: petPayloads.map((pet) => pet.name),
    petBreed: firstPetPayload?.breed ?? null,
    petSize: firstPetPayload?.size ?? null,
    allergies: firstPetPayload?.allergies ?? null,
    typicalFee: firstPetPayload?.standard_fee ?? null,
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
    .insert(petPayloads.map((pet) => ({ ...pet, client_id: clientRow.id })));

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
  revalidatePath(`/clients/${clientRow.id}`);
  await recordAuditEvent({
    eventType: "client.created",
    clientId: clientRow.id,
    summary: `Added household ${summary.ownerName} with ${summary.petNames.length} pet${summary.petNames.length === 1 ? "" : "s"}: ${summary.petNames.join(", ")}.`,
    metadata: { fee: summary.typicalFee, petNames: summary.petNames },
  });
  return { status: "saved", summary };
}
