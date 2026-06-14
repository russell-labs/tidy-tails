"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { agentOriginMetadata } from "@/lib/auditSource";
import { dataMode, getClientRecord } from "@/lib/data/repo";
import { fullName } from "@/lib/format";
import { canDeleteHousehold } from "@/lib/householdLifecycle";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isDeleteClientWriteEnabled } from "@/lib/writeGate";

export type DeleteClientState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "demo"; ownerName: string; message: string }
  | { status: "gated"; ownerName: string; message: string }
  | { status: "deleted"; ownerName: string; message: string };

export async function deleteClient(
  _prev: DeleteClientState,
  formData: FormData,
): Promise<DeleteClientState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Your session ended. Sign in again." };
  }

  const clientId = String(formData.get("client_id") ?? "");
  if (!clientId) {
    return { status: "error", message: "That household could not be found." };
  }

  const record = await getClientRecord(clientId);
  if (!record) {
    return { status: "error", message: "That household could not be found." };
  }

  const ownerName = fullName(record.client.first_name, record.client.last_name);

  // Completed grooms are business records (v2/AGENTS.md). A household with any
  // appointment history is blocked from hard-delete; only clean test/duplicate
  // households can be removed.
  if (!canDeleteHousehold({ appointments: record.appointments })) {
    return {
      status: "error",
      message: "This household has groom history and can't be deleted.",
    };
  }

  if (dataMode() === "fixtures") {
    return {
      status: "demo",
      ownerName,
      message: "Demo only - nothing was deleted.",
    };
  }

  if (!isDeleteClientWriteEnabled()) {
    return {
      status: "gated",
      ownerName,
      message: "Deleting households is not switched on yet. Nothing was deleted.",
    };
  }

  const supabase = await createServerSupabase();

  // booking_requests is the only table that references clients AND pets with a
  // plain FK (no ON DELETE CASCADE), so a pending request would otherwise abort
  // the cascade — either directly (client_id) or when pets cascade-delete
  // (pet_id). Clear both axes first; pets and appointments then cascade
  // automatically when the client row is removed, and audit_events survive via
  // ON DELETE SET NULL.
  const { error: clientRequestError } = await supabase
    .from("booking_requests")
    .delete()
    .eq("client_id", clientId);
  if (clientRequestError) {
    return {
      status: "error",
      message: "That household could not be deleted. Nothing was removed.",
    };
  }

  const petIds = record.pets.map((pet) => pet.id);
  if (petIds.length > 0) {
    const { error: petRequestError } = await supabase
      .from("booking_requests")
      .delete()
      .in("pet_id", petIds);
    if (petRequestError) {
      return {
        status: "error",
        message: "That household could not be deleted. Nothing was removed.",
      };
    }
  }

  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) {
    return {
      status: "error",
      message: "That household could not be deleted. Nothing was removed.",
    };
  }

  revalidatePath("/");
  revalidatePath(`/clients/${clientId}`);
  await recordAuditEvent({
    eventType: "client.deleted",
    clientId,
    summary: `Deleted household ${ownerName}.`,
    metadata: { ...agentOriginMetadata(formData) },
  });

  return {
    status: "deleted",
    ownerName,
    message: `${ownerName} was deleted.`,
  };
}
