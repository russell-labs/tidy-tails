"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { dataMode, getClientRecord, loadDataset } from "@/lib/data/repo";
import {
  buildMergeDuplicatePetPlan,
  buildPassedAwayGroomingNotes,
  canDeletePetProfile,
} from "@/lib/petLifecycle";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isEditPetWriteEnabled } from "@/lib/writeGate";
import { isImpersonating } from "@/lib/admin/impersonation.server";

type LifecycleSummary = {
  clientId: string;
  ownerName: string;
  petId: string;
  petName: string;
  duplicatePetId?: string;
  duplicatePetName?: string;
  movedAppointmentCount?: number;
};

export type PetLifecycleState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "demo"; summary: LifecycleSummary; message: string }
  | { status: "gated"; summary: LifecycleSummary; message: string }
  | { status: "saved"; summary: LifecycleSummary; message: string }
  | { status: "merged"; summary: LifecycleSummary; message: string }
  | { status: "deleted"; summary: LifecycleSummary; message: string };

function ownerName(record: NonNullable<Awaited<ReturnType<typeof getClientRecord>>>) {
  return `${record.client.first_name} ${record.client.last_name}`.trim();
}

function clientName(client: { first_name: string; last_name: string }): string {
  return `${client.first_name} ${client.last_name}`.trim();
}

async function loadLifecycleRecord(
  formData: FormData,
): Promise<
  | { ok: true; record: NonNullable<Awaited<ReturnType<typeof getClientRecord>>>; petId: string }
  | { ok: false; state: PetLifecycleState }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, state: { status: "error", message: "Your session ended. Sign in again." } };

  const clientId = String(formData.get("client_id") ?? "");
  const petId = String(formData.get("pet_id") ?? "");
  if (!clientId || !petId) {
    return { ok: false, state: { status: "error", message: "That pet could not be found." } };
  }

  const record = await getClientRecord(clientId);
  const pet = record?.pets.find((candidate) => candidate.id === petId);
  if (!record || !pet) {
    return { ok: false, state: { status: "error", message: "That pet is not on this household." } };
  }
  return { ok: true, record, petId };
}

export async function markPetPassedAway(
  _prev: PetLifecycleState,
  formData: FormData,
): Promise<PetLifecycleState> {
  const loaded = await loadLifecycleRecord(formData);
  if (!loaded.ok) return loaded.state;

  const { record, petId } = loaded;
  const pet = record.pets.find((candidate) => candidate.id === petId)!;
  const summary: LifecycleSummary = {
    clientId: record.client.id,
    ownerName: ownerName(record),
    petId,
    petName: pet.name,
  };
  const nextNotes = buildPassedAwayGroomingNotes(pet.grooming_notes);

  if (dataMode() === "fixtures") {
    return { status: "demo", summary, message: "Demo only - nothing was saved." };
  }
  if (!isEditPetWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Pet editing is not switched on yet. Nothing was saved.",
    };
  }
  // TT-015: read-only support view — never write a tenant row while impersonating.
  if (await isImpersonating()) {
    return {
      status: "gated",
      summary,
      message: "Pet editing is not switched on yet. Nothing was saved.",
    };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("pets")
    .update({ grooming_notes: nextNotes })
    .eq("id", petId)
    .eq("client_id", record.client.id);
  if (error) {
    return { status: "error", message: "That pet could not be marked passed away." };
  }

  revalidatePath(`/clients/${record.client.id}`);
  revalidatePath(`/clients/${record.client.id}/pets/${petId}`);
  await recordAuditEvent({
    eventType: "pet.passed_away",
    clientId: record.client.id,
    petId,
    summary: `Marked ${pet.name} passed away under ${summary.ownerName}.`,
  });
  return {
    status: "saved",
    summary,
    message: `${pet.name} is marked passed away. The profile stays in history.`,
  };
}

export async function deletePetProfile(
  _prev: PetLifecycleState,
  formData: FormData,
): Promise<PetLifecycleState> {
  const loaded = await loadLifecycleRecord(formData);
  if (!loaded.ok) return loaded.state;

  const { record, petId } = loaded;
  const pet = record.pets.find((candidate) => candidate.id === petId)!;
  const summary: LifecycleSummary = {
    clientId: record.client.id,
    ownerName: ownerName(record),
    petId,
    petName: pet.name,
  };

  if (!canDeletePetProfile({ petId, appointments: record.appointments })) {
    return {
      status: "error",
      message:
        "This pet has appointment history. Mark passed away or move the pet instead of deleting it.",
    };
  }
  if (dataMode() === "fixtures") {
    return { status: "demo", summary, message: "Demo only - nothing was deleted." };
  }
  if (!isEditPetWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Pet editing is not switched on yet. Nothing was deleted.",
    };
  }
  // TT-015: read-only support view — never write a tenant row while impersonating.
  if (await isImpersonating()) {
    return {
      status: "gated",
      summary,
      message: "Pet editing is not switched on yet. Nothing was deleted.",
    };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("pets")
    .delete()
    .eq("id", petId)
    .eq("client_id", record.client.id);
  if (error) {
    return { status: "error", message: "That pet profile could not be deleted." };
  }

  revalidatePath(`/clients/${record.client.id}`);
  revalidatePath(`/clients/${record.client.id}/pets/${petId}`);
  await recordAuditEvent({
    eventType: "pet.deleted",
    clientId: record.client.id,
    petId,
    summary: `Deleted duplicate pet profile ${pet.name} under ${summary.ownerName}.`,
  });
  return {
    status: "deleted",
    summary,
    message: `${pet.name} was removed from this household.`,
  };
}

export async function mergeDuplicatePetProfiles(
  _prev: PetLifecycleState,
  formData: FormData,
): Promise<PetLifecycleState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Your session ended. Sign in again." };
  }

  const clientId = String(formData.get("client_id") ?? "");
  const keepPetId = String(formData.get("keep_pet_id") ?? "");
  const duplicatePetId = String(formData.get("duplicate_pet_id") ?? "");
  if (!clientId || !keepPetId || !duplicatePetId) {
    return { status: "error", message: "Choose the duplicate pet profile to merge." };
  }

  const { clients, pets, appointments } = await loadDataset();
  const keepClient = clients.find((candidate) => candidate.id === clientId);
  const keepPet = pets.find(
    (candidate) => candidate.id === keepPetId && candidate.client_id === clientId,
  );
  const duplicatePet = pets.find((candidate) => candidate.id === duplicatePetId);
  const duplicateClient = duplicatePet
    ? clients.find((candidate) => candidate.id === duplicatePet.client_id)
    : null;
  if (!keepClient || !keepPet || !duplicatePet || !duplicateClient) {
    return { status: "error", message: "Both pet profiles must be found before merging." };
  }

  const plan = buildMergeDuplicatePetPlan({
    keep: keepPet,
    duplicate: duplicatePet,
    appointments,
  });
  if (!plan.ok) return { status: "error", message: plan.error };

  const summary: LifecycleSummary = {
    clientId: keepClient.id,
    ownerName: clientName(keepClient),
    petId: keepPet.id,
    petName: keepPet.name,
    duplicatePetId: duplicatePet.id,
    duplicatePetName: duplicatePet.name,
    movedAppointmentCount: plan.appointmentIdsToMove.length,
  };

  if (dataMode() === "fixtures") {
    return { status: "demo", summary, message: "Demo only - nothing was merged." };
  }
  if (!isEditPetWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Pet editing is not switched on yet. Nothing was merged.",
    };
  }
  // TT-015: read-only support view — never write a tenant row while impersonating.
  if (await isImpersonating()) {
    return {
      status: "gated",
      summary,
      message: "Pet editing is not switched on yet. Nothing was merged.",
    };
  }

  const supabase = await createServerSupabase();
  const { error: petError } = await supabase
    .from("pets")
    .update(plan.keeperPetUpdate)
    .eq("id", keepPet.id)
    .eq("client_id", keepClient.id);
  if (petError) {
    return { status: "error", message: "The kept pet profile could not be updated." };
  }

  if (plan.appointmentIdsToMove.length > 0) {
    const { error: appointmentError } = await supabase
      .from("appointments")
      .update({ client_id: keepClient.id, pet_id: keepPet.id })
      .eq("client_id", duplicateClient.id)
      .in("id", plan.appointmentIdsToMove);
    if (appointmentError) {
      return {
        status: "error",
        message:
          "The kept profile was updated, but the duplicate appointment history could not be moved.",
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("pets")
    .delete()
    .eq("id", duplicatePet.id)
    .eq("client_id", duplicateClient.id);
  if (deleteError) {
    return {
      status: "error",
      message:
        "The duplicate history was moved, but the duplicate pet profile could not be removed.",
    };
  }

  revalidatePath(`/clients/${keepClient.id}`);
  revalidatePath(`/clients/${duplicateClient.id}`);
  revalidatePath(`/clients/${keepClient.id}/pets/${keepPet.id}`);
  revalidatePath(`/clients/${duplicateClient.id}/pets/${duplicatePet.id}`);
  await recordAuditEvent({
    eventType: "pet.merged",
    clientId: keepClient.id,
    petId: keepPet.id,
    summary: `Merged duplicate ${duplicatePet.name} profile from ${clientName(duplicateClient)} into ${keepPet.name} under ${summary.ownerName}.`,
    metadata: {
      petIds: [keepPet.id, duplicatePet.id],
      fromClientId: duplicateClient.id,
      toClientId: keepClient.id,
      appointmentIds: plan.appointmentIdsToMove,
    },
  });
  return {
    status: "merged",
    summary,
    message: `${duplicatePet.name} was merged into ${keepPet.name}. ${plan.appointmentIdsToMove.length} appointment${plan.appointmentIdsToMove.length === 1 ? "" : "s"} moved.`,
  };
}
