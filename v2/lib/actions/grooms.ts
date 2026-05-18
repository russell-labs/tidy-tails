"use server";

// Log Groom — the "record a completed groom" write action.
//
// Runs the COMPLETE flow (auth re-check, input validation, pet/client ownership
// check, insert-payload construction), then:
//   - fixture mode → a "demo" dry-run: nothing is saved (fixtures are immutable
//     demo data).
//   - live mode    → the write is governed by the server-side kill-switch
//     isLogGroomWriteEnabled() (env flag TIDYTAILS_ENABLE_LOG_GROOM_WRITE,
//     default OFF). Flag OFF → the action returns `gated` and runs NO insert;
//     the OFF path is byte-identical to the pre-flip behaviour. Flag ON → it
//     persists one completed `appointments` row. The flag is set only after the
//     Ship 2.2b RLS cutover and an explicit per-surface flip approval.
//
// A completed groom is an `appointments` row with status='completed'
// (buildGroomInsert); validateGroomLog already rejects a future date. The
// persist path is a single-row INSERT — on failure nothing is partially
// written. `groomer_id` is stamped by the column DEFAULT auth.uid().

import { revalidatePath } from "next/cache";
import { dataMode, getClientRecord } from "@/lib/data/repo";
import { serviceLabel } from "@/lib/data/live";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isLogGroomWriteEnabled } from "@/lib/writeGate";
import { findOwnedPet } from "@/lib/booking";
import {
  buildGroomInsert,
  validateGroomLog,
  type GroomLogErrors,
} from "@/lib/groom";
import { fullName } from "@/lib/format";

// A human-readable echo of the logged groom — for the review and result screens.
export type GroomSummary = {
  petName: string;
  ownerName: string;
  date: string;
  service: string | null; // user-facing label
  fee: number | null;
  tip: number | null;
};

export type GroomState =
  | { status: "idle" }
  | { status: "error"; errors: GroomLogErrors; formError?: string }
  | { status: "demo"; summary: GroomSummary }
  | { status: "gated"; summary: GroomSummary; message: string }
  | { status: "saved"; summary: GroomSummary };

export async function logGroom(
  _prev: GroomState,
  formData: FormData,
): Promise<GroomState> {
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
    service_type: String(formData.get("service_type") ?? ""),
    fee: String(formData.get("fee") ?? ""),
    tip: String(formData.get("tip") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const validation = validateGroomLog(raw);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors };
  }
  const groom = validation.value;

  // Ownership: re-fetch the household and confirm the pet belongs to it. The
  // client_id/pet_id pair from the form is never trusted — the appointments
  // table has no constraint tying a pet to its client.
  const record = await getClientRecord(groom.client_id);
  if (!record) {
    return {
      status: "error",
      errors: {},
      formError: "That client could not be found. Nothing was saved.",
    };
  }
  const pet = findOwnedPet(record.pets, groom.pet_id, groom.client_id);
  if (!pet) {
    return {
      status: "error",
      errors: {},
      formError: "That pet is not on this client's file. Nothing was saved.",
    };
  }

  // The validated INSERT payload — proven shape, not yet persisted.
  const payload = buildGroomInsert(groom);

  const summary: GroomSummary = {
    petName: pet.name,
    ownerName: fullName(record.client.first_name, record.client.last_name),
    date: payload.date,
    service: serviceLabel(payload.service_type),
    fee: payload.fee,
    tip: payload.tip,
  };

  if (dataMode() === "fixtures") {
    // Dry-run — the flow ran end to end; fixtures are demo data, nothing saved.
    return { status: "demo", summary };
  }

  // Live mode. The server-side kill-switch decides whether this persists.
  // OFF (default) → return `gated` and run no insert — identical to pre-flip.
  if (!isLogGroomWriteEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Groom logging isn't switched on yet. Nothing was saved.",
    };
  }

  // Flag ON: persist exactly one completed appointments row. The auth-aware
  // server client carries Samantha's JWT, so DEFAULT auth.uid() stamps groomer_id.
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("appointments").insert(payload);
  if (error) {
    return {
      status: "error",
      errors: {},
      formError: "That groom could not be saved. Nothing was written.",
    };
  }
  revalidatePath(`/clients/${groom.client_id}`);
  return { status: "saved", summary };
}
