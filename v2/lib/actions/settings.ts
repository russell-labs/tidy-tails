"use server";

import { revalidatePath } from "next/cache";
import {
  locationSettingsFromForm,
  operatorSettingsFromForm,
  scheduleCalibrationFromForm,
} from "@/lib/operatorSettings";
import {
  readOperatorSettings,
  writeOperatorSettings,
} from "@/lib/operatorSettings.server";
import { getCurrentUser } from "@/lib/supabase/server";

export async function saveOperatorSettings(formData: FormData): Promise<void> {
  // Defense-in-depth: the proxy gates every route, but a server action is its
  // own POST endpoint — re-verify the operator before writing settings.
  const user = await getCurrentUser();
  if (!user) return;
  const current = await readOperatorSettings();
  await writeOperatorSettings({
    ...operatorSettingsFromForm(formData),
    scheduleCalibration: current.scheduleCalibration,
    locationSettings: current.locationSettings,
  });
  revalidatePath("/reports");
  revalidatePath("/settings");
}

export async function saveLocationSettingsWithState(
  _prev: OperatorSettingsState,
  formData: FormData,
): Promise<OperatorSettingsState> {
  const user = await getCurrentUser();
  if (!user) return { status: "idle" };
  const current = await readOperatorSettings();
  await writeOperatorSettings({
    ...current,
    locationSettings: locationSettingsFromForm(formData),
  });
  revalidatePath("/clients");
  revalidatePath("/reports");
  revalidatePath("/schedule");
  revalidatePath("/settings");
  return { status: "saved", savedAt: new Date().toISOString() };
}

export type OperatorSettingsState =
  | { status: "idle" }
  | { status: "saved"; savedAt: string };

export async function saveOperatorSettingsWithState(
  _prev: OperatorSettingsState,
  formData: FormData,
): Promise<OperatorSettingsState> {
  const user = await getCurrentUser();
  if (!user) return { status: "idle" };
  await saveOperatorSettings(formData);
  return { status: "saved", savedAt: new Date().toISOString() };
}

export async function saveScheduleCalibrationWithState(
  _prev: OperatorSettingsState,
  formData: FormData,
): Promise<OperatorSettingsState> {
  const user = await getCurrentUser();
  if (!user) return { status: "idle" };
  const current = await readOperatorSettings();
  await writeOperatorSettings({
    ...current,
    scheduleCalibration: scheduleCalibrationFromForm(formData),
  });
  revalidatePath("/schedule");
  revalidatePath("/settings");
  return { status: "saved", savedAt: new Date().toISOString() };
}
