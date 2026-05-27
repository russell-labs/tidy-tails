"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { dataMode, getClientRecord } from "@/lib/data/repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isEditPetWriteEnabled } from "@/lib/writeGate";
import {
  buildEditPetUpdate,
  validateEditPet,
  type EditPetErrors,
  type EditPetUpdate,
} from "@/lib/editPet";
import { fullName } from "@/lib/format";

export type EditPetSummary = {
  ownerName: string;
  petName: string;
  breed: string | null;
  size: string | null;
  color: string | null;
  dateOfBirth: string | null;
  allergies: boolean | null;
  typicalFee: number | null;
};

export type EditPetState =
  | { status: "idle" }
  | { status: "error"; errors: EditPetErrors; formError?: string }
  | { status: "demo"; summary: EditPetSummary }
  | { status: "gated"; summary: EditPetSummary; message: string }
  | { status: "saved"; summary: EditPetSummary };

export async function editPet(
  _prev: EditPetState,
  formData: FormData,
): Promise<EditPetState> {
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
    name: String(formData.get("name") ?? ""),
    breed: String(formData.get("breed") ?? ""),
    size: String(formData.get("size") ?? ""),
    color: String(formData.get("color") ?? ""),
    date_of_birth: String(formData.get("date_of_birth") ?? ""),
    allergy_state: String(formData.get("allergy_state") ?? ""),
    allergies_detail: String(formData.get("allergies_detail") ?? ""),
    grooming_notes: String(formData.get("grooming_notes") ?? ""),
    typical_fee: String(formData.get("typical_fee") ?? ""),
  };

  const validation = validateEditPet(raw);
  if (!validation.ok) return { status: "error", errors: validation.errors };
  const pet = validation.value;

  const record = await getClientRecord(pet.client_id);
  if (!record) {
    return {
      status: "error",
      errors: {},
      formError: "That household could not be found. Nothing was saved.",
    };
  }

  const existing = record.pets.find((candidate) => candidate.id === pet.pet_id);
  if (!existing) {
    return {
      status: "error",
      errors: {},
      formError: "That pet is not on this household. Nothing was saved.",
    };
  }

  const payload: EditPetUpdate = buildEditPetUpdate(pet);
  const summary: EditPetSummary = {
    ownerName: fullName(record.client.first_name, record.client.last_name),
    petName: payload.name,
    breed: payload.breed,
    size: payload.size,
    color: payload.color,
    dateOfBirth: pet.date_of_birth,
    allergies: payload.allergies,
    typicalFee: payload.standard_fee,
  };

  if (dataMode() === "fixtures") return { status: "demo", summary };

  if (!isEditPetWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Pet editing is not switched on yet. Nothing was saved.",
    };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("pets")
    .update(payload)
    .eq("id", pet.pet_id)
    .eq("client_id", pet.client_id);
  if (error) {
    return {
      status: "error",
      errors: {},
      formError: "Those pet details could not be saved. Nothing was written.",
    };
  }

  revalidatePath(`/clients/${pet.client_id}`);
  revalidatePath(`/clients/${pet.client_id}/pets/${pet.pet_id}`);
  await recordAuditEvent({
    eventType: "pet.updated",
    clientId: pet.client_id,
    petId: pet.pet_id,
    summary: `Edited ${summary.petName} under ${summary.ownerName}.`,
    metadata: { fee: summary.typicalFee },
  });
  return { status: "saved", summary };
}
