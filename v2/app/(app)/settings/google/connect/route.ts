import { NextResponse } from "next/server";
import { createGoogleCalendarAuthUrl } from "@/lib/googleCalendar.server";

export async function GET(request: Request) {
  try {
    const url = await createGoogleCalendarAuthUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google Calendar connect failed.";
    const target = new URL("/settings", request.url);
    target.searchParams.set("calendar", "error");
    target.searchParams.set("message", message);
    return NextResponse.redirect(target);
  }
}
