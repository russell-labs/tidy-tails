"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { dataMode, loadDataset } from "@/lib/data/repo";
import type { Client, Pet } from "@/lib/data/types";
import { fullName } from "@/lib/format";
import {
  buildNewOwnerClientInsert,
  buildMovePetOwnerUpdates,
  validateMovePetOwner,
  type MovePetOwnerErrors,
} from "@/lib/movePetOwner";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isEditPetWriteEnabled } from "@/lib/writeGate";

export type MovePetOwnerSummary = {
  petName: string;
  fromOwnerName: string;
  toOwnerName: string;
  movedAppointments: boolean;
};

export type MovePetOwnerState =
  | { status: "idle" }
  | { status: "error"; errors: MovePetOwnerErrors; formError?: string }
  | { status: "demo"; summary: MovePetOwnerSummary }
  | { status: "gated"; summary: MovePetOwnerSummary; message: string }
  | { status: "saved"; summary: MovePetOwnerSummary };

function ownerName(client: Client): string {
  return fullName(client.first_name, client.last_name);
}

function summaryFor({
  pet,
  fromClient,
  toClient,
  movedAppointments,
}: {
  pet: Pet;
  fromClient: Client;
  toClient: Client;
  movedAppointments: boolean;
}): MovePetOwnerSummary {
  return {
    petName: pet.name,
    fromOwnerName: ownerName(fromClient),
    toOwnerName: ownerName(toClient),
    movedAppointments,
  };
}

export async function movePetOwner(
  _prev: MovePetOwnerState,
  formData: FormData,
): Promise<MovePetOwnerState> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    };
  }

  const validation = validateMovePetOwner({
    pet_id: String(formData.get("pet_id") ?? ""),
    from_client_id: String(formData.get("from_client_id") ?? ""),
    move_mode: String(formData.get("move_mode") ?? ""),
    to_client_id: String(formData.get("to_client_id") ?? ""),
    new_owner_first_name: String(formData.get("new_owner_first_name") ?? ""),
    new_owner_last_name: String(formData.get("new_owner_last_name") ?? ""),
    new_owner_phone: String(formData.get("new_owner_phone") ?? ""),
  });
  if (!validation.ok) return { status: "error", errors: validation.errors };
  const move = validation.value;

  const { clients, pets } = await loadDataset();
  const pet = pets.find(
    (candidate) =>
      candidate.id === move.pet_id && candidate.client_id === move.from_client_id,
  );
  const fromClient = clients.find((client) => client.id === move.from_client_id);
  let toClient = move.move_mode === "existing"
    ? clients.find((client) => client.id === move.to_client_id)
    : null;

  if (!pet || !fromClient) {
    return {
      status: "error",
      errors: {},
      formError: "That pet is not on this household. Nothing was moved.",
    };
  }
  if (move.move_mode === "existing" && !toClient) {
    return {
      status: "error",
      errors: {},
      formError: "That new owner could not be found. Nothing was moved.",
    };
  }

  if (move.move_mode === "new") {
    toClient = {
      id: "new-owner-preview",
      first_name: move.newOwner.first_name,
      last_name: move.newOwner.last_name ?? "",
      phone: move.newOwner.phone,
      alt_contact: null,
      email: null,
      address: null,
      notes: null,
      created_at: "",
    };
  }

  const summary = summaryFor({
    pet,
    fromClient,
    toClient: toClient!,
    movedAppointments: true,
  });

  if (dataMode() === "fixtures") return { status: "demo", summary };

  if (!isEditPetWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Pet owner changes are not switched on yet. Nothing was moved.",
    };
  }

  const supabase = await createServerSupabase();
  let toClientId = move.move_mode === "existing" ? move.to_client_id : "";

  if (move.move_mode === "new") {
    const { data: newClient, error: newClientError } = await supabase
      .from("clients")
      .insert(buildNewOwnerClientInsert(move))
      .select("*")
      .single();
    if (newClientError || !newClient?.id) {
      return {
        status: "error",
        errors: {},
        formError: "The new owner could not be created. Nothing was moved.",
      };
    }
    toClientId = String(newClient.id);
  }

  const resolvedMove = {
    pet_id: move.pet_id,
    from_client_id: move.from_client_id,
    move_mode: "existing" as const,
    to_client_id: toClientId,
  };
  const updates = buildMovePetOwnerUpdates(resolvedMove);

  const { error: petError } = await supabase
    .from("pets")
    .update(updates.petUpdate)
    .eq("id", move.pet_id)
    .eq("client_id", move.from_client_id);
  if (petError) {
    return {
      status: "error",
      errors: {},
      formError:
        move.move_mode === "new"
          ? "The new owner was created, but that pet could not be moved."
          : "That pet could not be moved. Nothing was changed.",
    };
  }

  const { error: appointmentError } = await supabase
    .from("appointments")
    .update(updates.appointmentUpdate)
    .eq("pet_id", move.pet_id)
    .eq("client_id", move.from_client_id);
  if (appointmentError) {
    await supabase
      .from("pets")
      .update(updates.rollbackPetUpdate)
      .eq("id", move.pet_id)
      .eq("client_id", move.to_client_id);
    return {
      status: "error",
      errors: {},
      formError:
        "The pet move could not finish, so the app rolled the pet back to the original household.",
    };
  }

  revalidatePath("/");
  revalidatePath(`/clients/${move.from_client_id}`);
  revalidatePath(`/clients/${toClientId}`);
  revalidatePath(`/clients/${move.from_client_id}/pets/${move.pet_id}`);
  revalidatePath(`/clients/${toClientId}/pets/${move.pet_id}`);
  await recordAuditEvent({
    eventType: "pet.moved",
    clientId: toClientId,
    petId: move.pet_id,
    summary: `Moved ${pet.name} from ${summary.fromOwnerName} to ${summary.toOwnerName}.`,
    metadata: {
      fromClientId: move.from_client_id,
      toClientId,
      petIds: [move.pet_id],
    },
  });
  return { status: "saved", summary };
}
