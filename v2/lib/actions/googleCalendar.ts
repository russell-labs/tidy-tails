"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { disconnectGoogleCalendar } from "@/lib/googleCalendar.server";

export async function disconnectGoogleCalendarAction() {
  await disconnectGoogleCalendar();
  await recordAuditEvent({
    eventType: "google_calendar.disconnected",
    summary: "Disconnected Google Calendar.",
  });
  revalidatePath("/settings");
}
