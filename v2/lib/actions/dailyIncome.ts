"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { bookingLocationLabel } from "@/lib/booking";
import {
  buildDailyIncomeUpsert,
  validateDailyIncomeInput,
  type DailyIncomeErrors,
} from "@/lib/dailyIncome";
import { dataMode, requireOrgId } from "@/lib/data/repo";
import { isImpersonating } from "@/lib/admin/impersonation.server";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isDailyIncomeWriteEnabled } from "@/lib/writeGate";

export type DailyIncomeState =
  | { status: "idle" }
  | { status: "error"; errors: DailyIncomeErrors; formError?: string }
  | { status: "demo" | "gated" | "saved"; message: string };

export async function saveDailyIncome(
  _prev: DailyIncomeState,
  formData: FormData,
): Promise<DailyIncomeState> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    };
  }

  const validation = validateDailyIncomeInput({
    date: String(formData.get("date") ?? ""),
    location: String(formData.get("location") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!validation.ok) return { status: "error", errors: validation.errors };
  const income = validation.value;

  if (dataMode() === "fixtures") {
    return {
      status: "demo",
      message: "Demo only - daily income was not saved.",
    };
  }
  if (!isDailyIncomeWriteEnabled()) {
    return {
      status: "gated",
      message: "Daily income is not switched on yet. Nothing was saved.",
    };
  }
  // TT-015: read-only support view — never write a tenant row while impersonating.
  if (await isImpersonating()) {
    return {
      status: "gated",
      message: "Daily income is not switched on yet. Nothing was saved.",
    };
  }

  const orgId = await requireOrgId();
  const supabase = await createServerSupabase();
  const payload = buildDailyIncomeUpsert(income);
  const { error } = await supabase
    .from("daily_income")
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
      formError: "That daily income could not be saved.",
    };
  }

  revalidatePath("/schedule");
  revalidatePath("/reports");
  revalidatePath("/reports/export");
  await recordAuditEvent({
    eventType: "daily_income.updated",
    summary: `Logged ${bookingLocationLabel(income.location)} daily income for ${income.date}.`,
    metadata: {
      date: income.date,
      location: income.location,
      amount: income.amount,
      note: income.note,
    },
  });

  return { status: "saved", message: "Daily income saved." };
}
