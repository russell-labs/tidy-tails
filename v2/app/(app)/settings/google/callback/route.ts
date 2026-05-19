import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit.server";
import { handleGoogleCalendarCallback } from "@/lib/googleCalendar.server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await handleGoogleCalendarCallback({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
  });

  const target = new URL("/settings", request.url);
  if (result.ok) {
    await recordAuditEvent({
      eventType: "google_calendar.connected",
      summary: "Connected Google Calendar.",
    });
    target.searchParams.set("calendar", "connected");
  } else {
    target.searchParams.set("calendar", "error");
    target.searchParams.set("message", result.message);
  }
  return NextResponse.redirect(target);
}
