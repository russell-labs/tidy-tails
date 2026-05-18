"use server";

import { revalidatePath } from "next/cache";
import { disconnectGoogleCalendar } from "@/lib/googleCalendar.server";

export async function disconnectGoogleCalendarAction() {
  await disconnectGoogleCalendar();
  revalidatePath("/settings");
}

