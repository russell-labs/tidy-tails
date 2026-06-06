"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { bookingLocationLabel } from "@/lib/booking";
import {
  buildDayCloseoutUpsert,
  validateDayCloseoutInput,
  type DayCloseoutErrors,
} from "@/lib/dayCloseout";
import { dataMode, requireOrgId } from "@/lib/data/repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isDayCloseoutWriteEnabled } from "@/lib/writeGate";

export type DayCloseoutState =
  | { status: "idle" }
  | { status: "error"; errors: DayCloseoutErrors; formError?: string }
  | { status: "demo" | "gated" | "saved"; message: string };

export async function saveDayCloseoutOverride(
  _prev: DayCloseoutState,
  formData: FormData,
): Promise<DayCloseoutState> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    };
  }

  const validation = validateDayCloseoutInput({
    date: String(formData.get("date") ?? ""),
    location: String(formData.get("location") ?? ""),
    final_payout: String(formData.get("final_payout") ?? ""),
    calculated_payout: String(formData.get("calculated_payout") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!validation.ok) return { status: "error", errors: validation.errors };
  const closeout = validation.value;

  if (dataMode() === "fixtures") {
    return {
      status: "demo",
      message: "Demo only - day closeout was not saved.",
    };
  }
  if (!isDayCloseoutWriteEnabled()) {
    return {
      status: "gated",
      message: "Day closeout writes are not switched on yet. Nothing was saved.",
    };
  }

  const orgId = await requireOrgId();
  const supabase = await createServerSupabase();
  const payload = buildDayCloseoutUpsert(closeout);
  const { error } = await supabase
    .from("day_closeout_overrides")
    .upsert({
      ...payload,
      groomer_id: user.id,
      org_id: orgId,
    }, {
      onConflict: "groomer_id,date,location",
    });
  if (error) {
    return {
      status: "error",
      errors: {},
      formError: "That day closeout could not be saved.",
    };
  }

  revalidatePath("/schedule");
  revalidatePath("/reports");
  revalidatePath("/reports/export");
  await recordAuditEvent({
    eventType: "day_closeout.updated",
    summary: `Saved ${bookingLocationLabel(closeout.location)} closeout for ${closeout.date}.`,
    metadata: {
      date: closeout.date,
      location: closeout.location,
      finalPayout: closeout.final_payout,
      calculatedPayout: closeout.calculated_payout,
      note: closeout.note,
    },
  });

  return { status: "saved", message: "Day closeout saved." };
}
