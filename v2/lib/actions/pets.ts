"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { agentOriginMetadata } from "@/lib/auditSource";
import { dataMode, getClientRecord, requireOrgId } from "@/lib/data/repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isAddPetWriteEnabled } from "@/lib/writeGate";
import {
  buildAddPetInsert,
  validateAddPet,
  type AddPetErrors,
  type AddPetInsert,
} from "@/lib/addPet";
import { fullName } from "@/lib/format";
import type { PetSize } from "@/lib/intake";

export type AddPetSummary = {
  ownerName: string;
  petName: string;
  breed: string | null;
  size: PetSize | null;
  allergies: boolean | null;
  typicalFee: number | null;
};

export type AddPetState =
  | { status: "idle" }
  | { status: "error"; errors: AddPetErrors; formError?: string }
  | { status: "demo"; summary: AddPetSummary }
  | { status: "gated"; summary: AddPetSummary; message: string }
  | { status: "saved"; summary: AddPetSummary };

export async function addPet(
  _prev: AddPetState,
  formData: FormData,
): Promise<AddPetState> {
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
    name: String(formData.get("name") ?? ""),
    breed: String(formData.get("breed") ?? ""),
    size: String(formData.get("size") ?? ""),
    allergy_state: String(formData.get("allergy_state") ?? ""),
    allergies_detail: String(formData.get("allergies_detail") ?? ""),
    grooming_notes: String(formData.get("grooming_notes") ?? ""),
    typical_fee: String(formData.get("typical_fee") ?? ""),
  };

  const validation = validateAddPet(raw);
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

  const payload: AddPetInsert = buildAddPetInsert(pet);
  const summary: AddPetSummary = {
    ownerName: fullName(record.client.first_name, record.client.last_name),
    petName: payload.name,
    breed: payload.breed,
    size: payload.size,
    allergies: payload.allergies,
    typicalFee: payload.standard_fee,
  };

  if (dataMode() === "fixtures") return { status: "demo", summary };

  if (!isAddPetWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Adding pets is not switched on yet. Nothing was saved.",
    };
  }

  const orgId = await requireOrgId();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("pets").insert({ ...payload, org_id: orgId });
  if (error) {
    return {
      status: "error",
      errors: {},
      formError: "That pet could not be saved. Nothing was written.",
    };
  }

  revalidatePath("/");
  revalidatePath(`/clients/${pet.client_id}`);
  await recordAuditEvent({
    eventType: "pet.created",
    clientId: pet.client_id,
    summary: `Added pet ${summary.petName} to ${summary.ownerName}.`,
    metadata: { fee: summary.typicalFee, ...agentOriginMetadata(formData) },
  });
  return { status: "saved", summary };
}
