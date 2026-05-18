"use server";

import { revalidatePath } from "next/cache";
import { operatorSettingsFromForm } from "@/lib/operatorSettings";
import { writeOperatorSettings } from "@/lib/operatorSettings.server";

export async function saveOperatorSettings(formData: FormData): Promise<void> {
  await writeOperatorSettings(operatorSettingsFromForm(formData));
  revalidatePath("/reports");
  revalidatePath("/settings");
}
