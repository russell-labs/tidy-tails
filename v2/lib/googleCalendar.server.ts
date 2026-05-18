import "server-only";

import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isGoogleCalendarSyncEnabled } from "@/lib/writeGate";
import {
  GOOGLE_CALENDAR_SCOPES,
  buildGoogleCalendarEvent,
  decryptRefreshToken,
  encryptRefreshToken,
  type EncryptedToken,
  type GoogleCalendarSyncResult,
} from "./googleCalendar";
import type { Appointment, Client, Pet } from "./data/types";

export type GoogleCalendarConnection = {
  google_email: string;
  calendar_id: string;
  connected_at: string;
  updated_at: string;
};

type ConnectionRow = GoogleCalendarConnection &
  EncryptedToken & {
    scope: string | null;
    token_type: string | null;
    expiry_date: string | null;
  };

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

const STATE_COOKIE = "tt_google_calendar_oauth_state";
const VERIFIER_COOKIE = "tt_google_calendar_oauth_verifier";
const CALENDAR_ID = "primary";

function appUrl(): string {
  const url =
    process.env.TIDYTAILS_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://tidy-tails-v2.vercel.app";
  return url.replace(/\/+$/, "");
}

export function googleRedirectUri(): string {
  return (
    process.env.TIDYTAILS_GOOGLE_REDIRECT_URI ??
    `${appUrl()}/settings/google/callback`
  );
}

function googleClientConfig() {
  const clientId = process.env.TIDYTAILS_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.TIDYTAILS_GOOGLE_CLIENT_SECRET;
  const tokenSecret = process.env.TIDYTAILS_GOOGLE_TOKEN_SECRET;
  return { clientId, clientSecret, tokenSecret };
}

export function isGoogleCalendarConfigured(): boolean {
  const { clientId, tokenSecret } = googleClientConfig();
  return Boolean(clientId && tokenSecret);
}

function nowPlus(seconds: number | undefined): string | null {
  if (!seconds) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await response.json()) as TokenResponse;
  if (!response.ok) {
    throw new Error(json.error_description ?? json.error ?? "Google token error");
  }
  return json;
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makeCodeVerifier(): string {
  return base64Url(randomBytes(64));
}

function codeChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

export async function createGoogleCalendarAuthUrl(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in before connecting Google Calendar.");
  const { clientId } = googleClientConfig();
  if (!clientId || !isGoogleCalendarConfigured()) {
    throw new Error("Google Calendar is not configured.");
  }

  const state = crypto.randomUUID();
  const verifier = makeCodeVerifier();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  cookieStore.set(VERIFIER_COOKIE, verifier, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("code_challenge", codeChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function handleGoogleCalendarCallback({
  code,
  state,
}: {
  code: string | null;
  state: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in before connecting Google." };

  const cookieStore = await cookies();
  const expected = cookieStore.get(STATE_COOKIE)?.value;
  const verifier = cookieStore.get(VERIFIER_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(VERIFIER_COOKIE);
  if (!code || !state || !expected || state !== expected || !verifier) {
    return { ok: false, message: "Google Calendar sign-in expired. Try again." };
  }

  const { clientId, clientSecret, tokenSecret } = googleClientConfig();
  if (!clientId || !tokenSecret) {
    return { ok: false, message: "Google Calendar is not configured." };
  }

  try {
    const token = await tokenRequest(
      new URLSearchParams({
        code,
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        code_verifier: verifier,
        redirect_uri: googleRedirectUri(),
        grant_type: "authorization_code",
      }),
    );
    if (!token.refresh_token) {
      return {
        ok: false,
        message:
          "Google did not return a refresh token. Disconnect access in Google and connect again.",
      };
    }

    const profile = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    }).then((r) => (r.ok ? r.json() : null));
    const googleEmail =
      profile && typeof profile.email === "string" ? profile.email : user.email;

    const encrypted = encryptRefreshToken(token.refresh_token, tokenSecret);
    const supabase = await createServerSupabase();
    const { error } = await supabase.from("google_calendar_connections").upsert(
      {
        groomer_id: user.id,
        google_email: googleEmail ?? "Google Calendar",
        calendar_id: CALENDAR_ID,
        refresh_token_ciphertext: encrypted.ciphertext,
        refresh_token_iv: encrypted.iv,
        refresh_token_tag: encrypted.tag,
        scope: token.scope ?? GOOGLE_CALENDAR_SCOPES.join(" "),
        token_type: token.token_type ?? "Bearer",
        expiry_date: nowPlus(token.expires_in),
      },
      { onConflict: "groomer_id" },
    );
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Google Calendar connect failed.",
    };
  }
}

export async function readGoogleCalendarConnection(): Promise<{
  configured: boolean;
  enabled: boolean;
  connection: GoogleCalendarConnection | null;
}> {
  if (!isGoogleCalendarConfigured()) {
    return { configured: false, enabled: isGoogleCalendarSyncEnabled(), connection: null };
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("google_email, calendar_id, connected_at, updated_at")
    .maybeSingle();
  if (error) {
    return { configured: true, enabled: isGoogleCalendarSyncEnabled(), connection: null };
  }
  return {
    configured: true,
    enabled: isGoogleCalendarSyncEnabled(),
    connection: (data as GoogleCalendarConnection | null) ?? null,
  };
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from("google_calendar_connections").delete().neq("id", "");
}

async function readConnectionRow(): Promise<ConnectionRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select(
      "google_email, calendar_id, refresh_token_ciphertext, refresh_token_iv, refresh_token_tag, scope, token_type, expiry_date, connected_at, updated_at",
    )
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    google_email: String(row.google_email ?? ""),
    calendar_id: String(row.calendar_id ?? CALENDAR_ID),
    ciphertext: String(row.refresh_token_ciphertext ?? ""),
    iv: String(row.refresh_token_iv ?? ""),
    tag: String(row.refresh_token_tag ?? ""),
    scope: typeof row.scope === "string" ? row.scope : null,
    token_type: typeof row.token_type === "string" ? row.token_type : null,
    expiry_date: typeof row.expiry_date === "string" ? row.expiry_date : null,
    connected_at: String(row.connected_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

async function refreshAccessToken(row: ConnectionRow): Promise<string> {
  const { clientId, clientSecret, tokenSecret } = googleClientConfig();
  if (!clientId || !tokenSecret) {
    throw new Error("Google Calendar is not configured.");
  }
  const refreshToken = decryptRefreshToken(row, tokenSecret);
  const token = await tokenRequest(
    new URLSearchParams({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  );
  if (!token.access_token) throw new Error("Google did not return an access token.");
  return token.access_token;
}

async function markAppointmentSync(
  appointmentId: string,
  patch: Record<string, string | null>,
): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from("appointments").update(patch).eq("id", appointmentId);
}

export async function syncAppointmentToGoogleCalendar({
  appointment,
  client,
  pet,
}: {
  appointment: Appointment;
  client: Client;
  pet: Pet;
}): Promise<GoogleCalendarSyncResult> {
  if (!isGoogleCalendarSyncEnabled()) {
    return { status: "disabled", message: "Google Calendar sync is switched off." };
  }
  if (!isGoogleCalendarConfigured()) {
    return { status: "disabled", message: "Google Calendar is not configured." };
  }

  const event = buildGoogleCalendarEvent({ appointment, client, pet });
  if (!event) {
    await markAppointmentSync(appointment.id, {
      google_sync_status: "skipped",
      google_sync_error: "Appointment time is not specific enough for Google Calendar.",
      google_synced_at: new Date().toISOString(),
    });
    return {
      status: "skipped",
      message: "Saved, but calendar sync needs a specific time like 10:30am.",
    };
  }

  const connection = await readConnectionRow();
  if (!connection) {
    return {
      status: "not_connected",
      message: "Saved. Connect Google Calendar in Settings to sync future bookings.",
    };
  }

  try {
    const accessToken = await refreshAccessToken(connection);
    const existingEventId = appointment.google_event_id;
    const calendarId = connection.calendar_id || CALENDAR_ID;
    const url = existingEventId
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEventId)}`
      : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const response = await fetch(url, {
      method: existingEventId ? "PATCH" : "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(event),
      cache: "no-store",
    });
    const json = (await response.json()) as { id?: string; error?: { message?: string } };
    if (!response.ok || !json.id) {
      throw new Error(json.error?.message ?? "Google Calendar event write failed.");
    }

    await markAppointmentSync(appointment.id, {
      google_event_id: json.id,
      google_calendar_id: calendarId,
      google_sync_status: "synced",
      google_sync_error: null,
      google_synced_at: new Date().toISOString(),
    });
    return { status: "synced", message: "Google Calendar synced.", eventId: json.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google Calendar sync failed.";
    await markAppointmentSync(appointment.id, {
      google_sync_status: "failed",
      google_sync_error: message.slice(0, 500),
      google_synced_at: new Date().toISOString(),
    });
    return { status: "failed", message };
  }
}
