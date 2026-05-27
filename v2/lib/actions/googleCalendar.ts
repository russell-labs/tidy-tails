"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit.server";
import {
  disconnectGoogleCalendar,
  repairGoogleCalendarDropOffDurations,
} from "@/lib/googleCalendar.server";

export type CalendarDurationRepairState =
  | { status: "idle" }
  | {
      status: "done";
      message: string;
      scanned: number;
      updated: number;
      alreadyCorrect: number;
      skipped: number;
      failed: number;
    }
  | { status: "error"; message: string };

export async function disconnectGoogleCalendarAction() {
  try {
    await disconnectGoogleCalendar();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google Calendar could not be disconnected.";
    redirect(`/settings?calendar=error&message=${encodeURIComponent(message)}`);
  }
  await recordAuditEvent({
    eventType: "google_calendar.disconnected",
    summary: "Disconnected Google Calendar.",
  });
  revalidatePath("/settings");
  redirect("/settings?calendar=disconnected");
}

export async function repairCalendarDurationsAction(
  _prev?: CalendarDurationRepairState,
  _formData?: FormData,
): Promise<CalendarDurationRepairState> {
  void _prev;
  void _formData;

  const result = await repairGoogleCalendarDropOffDurations();
  if (result.status !== "repaired") {
    return { status: "error", message: result.message };
  }

  await recordAuditEvent({
    eventType: "google_calendar.duration_repaired",
    summary: `Repaired Google Calendar event durations: ${result.updated} updated, ${result.alreadyCorrect} already correct, ${result.failed} failed.`,
    metadata: {
      scanned: result.scanned,
      updated: result.updated,
      alreadyCorrect: result.alreadyCorrect,
      skipped: result.skipped,
      failed: result.failed,
    },
  });
  revalidatePath("/settings");
  return {
    status: "done",
    message: result.message,
    scanned: result.scanned,
    updated: result.updated,
    alreadyCorrect: result.alreadyCorrect,
    skipped: result.skipped,
    failed: result.failed,
  };
}
