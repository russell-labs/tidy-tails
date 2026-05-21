import { createHmac, timingSafeEqual } from "node:crypto";
import { digitsOnly } from "./format";

export type TwilioConfig = {
  accountSid: string;
  authUsername: string;
  authPassword: string;
  fromNumber: string;
};

export type TwilioConfigResult =
  | { ok: true; value: TwilioConfig }
  | { ok: false; missing: string[] };

export type TwilioMessage = {
  to: string;
  body: string;
};

export type TwilioSendResult =
  | { ok: true; sid: string | null }
  | { ok: false; message: string };

type TwilioErrorPayload = {
  code?: number;
  message?: string;
};

const TWILIO_ACCOUNT_SID = "TIDYTAILS_TWILIO_ACCOUNT_SID";
const TWILIO_AUTH_TOKEN = "TIDYTAILS_TWILIO_AUTH_TOKEN";
const TWILIO_API_KEY_SID = "TIDYTAILS_TWILIO_API_KEY_SID";
const TWILIO_API_KEY_SECRET = "TIDYTAILS_TWILIO_API_KEY_SECRET";
const TWILIO_FROM_NUMBER = "TIDYTAILS_TWILIO_FROM_NUMBER";

function requiredEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getTwilioConfig(): TwilioConfigResult {
  const accountSid = requiredEnv(TWILIO_ACCOUNT_SID);
  const authToken = requiredEnv(TWILIO_AUTH_TOKEN);
  const apiKeySid = requiredEnv(TWILIO_API_KEY_SID);
  const apiKeySecret = requiredEnv(TWILIO_API_KEY_SECRET);
  const fromNumber = requiredEnv(TWILIO_FROM_NUMBER);
  const hasApiKeyPair = Boolean(apiKeySid && apiKeySecret);

  const missing = [
    [TWILIO_ACCOUNT_SID, accountSid],
    hasApiKeyPair ? null : [TWILIO_AUTH_TOKEN, authToken],
    [TWILIO_FROM_NUMBER, fromNumber],
  ]
    .filter((entry): entry is [string, string | null] => Boolean(entry))
    .filter(([, value]) => !value)
    .map(([name]) => String(name));

  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    value: {
      accountSid: accountSid!,
      authUsername: apiKeySid ?? accountSid!,
      authPassword: apiKeySecret ?? authToken!,
      fromNumber: fromNumber!,
    },
  };
}

export function getTwilioWebhookAuthToken(): string | null {
  return requiredEnv(TWILIO_AUTH_TOKEN);
}

export function buildTwilioRequestSignature(
  url: string,
  params: URLSearchParams,
  authToken: string,
): string {
  const payload = Array.from(params.entries())
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .reduce((value, [key, paramValue]) => `${value}${key}${paramValue}`, url);

  return createHmac("sha1", authToken).update(payload).digest("base64");
}

export function validateTwilioRequestSignature({
  url,
  params,
  signature,
  authToken,
}: {
  url: string;
  params: URLSearchParams;
  signature: string | null;
  authToken: string;
}): boolean {
  if (!signature) return false;

  const expected = buildTwilioRequestSignature(url, params, authToken);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function toTwilioPhone(raw: string): string | null {
  const digits = digitsOnly(raw);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function buildTwilioMessageRequest(
  config: TwilioConfig,
  message: TwilioMessage,
): {
  url: string;
  headers: Record<string, string>;
  body: URLSearchParams;
} {
  const body = new URLSearchParams();
  body.set("To", message.to);
  body.set("From", config.fromNumber);
  body.set("Body", message.body);

  return {
    url: `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${config.authUsername}:${config.authPassword}`,
      ).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  };
}

export async function sendTwilioSms(
  config: TwilioConfig,
  message: TwilioMessage,
): Promise<TwilioSendResult> {
  const request = buildTwilioMessageRequest(config, message);
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
  });

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => ({}))) as TwilioErrorPayload;
    if (payload.code === 21608) {
      return {
        ok: false,
        message:
          "Twilio trial accounts can only text verified recipient numbers. Upgrade Twilio or verify this number, then try again.",
      };
    }
    return {
      ok: false,
      message: payload.message
        ? `Twilio could not send the SMS: ${payload.message}`
        : "Twilio could not send the SMS.",
    };
  }

  const payload = (await response.json().catch(() => ({}))) as { sid?: string };
  return { ok: true, sid: payload.sid ?? null };
}
