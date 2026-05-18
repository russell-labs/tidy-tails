import { cookies } from "next/headers";
import {
  OPERATOR_SETTINGS_COOKIE,
  parseOperatorSettings,
  serializeOperatorSettings,
  type OperatorSettings,
} from "./operatorSettings";

export async function readOperatorSettings(): Promise<OperatorSettings> {
  const cookieStore = await cookies();
  return parseOperatorSettings(cookieStore.get(OPERATOR_SETTINGS_COOKIE)?.value);
}

export async function writeOperatorSettings(
  settings: OperatorSettings,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OPERATOR_SETTINGS_COOKIE, serializeOperatorSettings(settings), {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
