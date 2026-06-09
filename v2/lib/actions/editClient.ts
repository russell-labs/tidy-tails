"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { dataMode, getClientRecord } from "@/lib/data/repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isEditClientWriteEnabled } from "@/lib/writeGate";
import {
  buildEditClientUpdate,
  validateEditClient,
  type EditClientErrors,
  type EditClientUpdate,
} from "@/lib/editClient";
import { fullName } from "@/lib/format";

export type EditClientSummary = {
  ownerName: string;
  phone: string;
  address: string | null;
};

export type EditClientState =
  | { status: "idle" }
  | { status: "error"; errors: EditClientErrors; formError?: string }
  | { status: "demo"; summary: EditClientSummary }
  | { status: "gated"; summary: EditClientSummary; message: string }
  | { status: "saved"; summary: EditClientSummary };

export async function editClient(
  _prev: EditClientState,
  formData: FormData,
): Promise<EditClientState> {
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
    first_name: String(formData.get("first_name") ?? ""),
    last_name: String(formData.get("last_name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    secondary_contact_name: String(formData.get("secondary_contact_name") ?? ""),
    secondary_cell: String(formData.get("secondary_cell") ?? ""),
    landline: String(formData.get("landline") ?? ""),
    email: String(formData.get("email") ?? ""),
    address: String(formData.get("address") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const validation = validateEditClient(raw);
  if (!validation.ok) return { status: "error", errors: validation.errors };
  const client = validation.value;

  const record = await getClientRecord(client.client_id);
  if (!record) {
    return {
      status: "error",
      errors: {},
      formError: "That household could not be found. Nothing was saved.",
    };
  }

  const payload: EditClientUpdate = buildEditClientUpdate(client);
  const summary: EditClientSummary = {
    ownerName: fullName(payload.first_name, payload.last_name ?? ""),
    phone: payload.phone,
    address: payload.address,
  };

  if (dataMode() === "fixtures") return { status: "demo", summary };

  if (!isEditClientWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Household editing is not switched on yet. Nothing was saved.",
    };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("clients")
    .update(payload)
    .eq("id", client.client_id);
  if (error) {
    return {
      status: "error",
      errors: {},
      formError: "Those household details could not be saved. Nothing was written.",
    };
  }

  revalidatePath("/");
  revalidatePath(`/clients/${client.client_id}`);
  await recordAuditEvent({
    eventType: "client.updated",
    clientId: client.client_id,
    summary: `Edited household ${summary.ownerName}.`,
  });
  return { status: "saved", summary };
}
