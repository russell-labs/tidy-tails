import { digitsOnly } from "./format";

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
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
const TWILIO_FROM_NUMBER = "TIDYTAILS_TWILIO_FROM_NUMBER";

function requiredEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getTwilioConfig(): TwilioConfigResult {
  const accountSid = requiredEnv(TWILIO_ACCOUNT_SID);
  const authToken = requiredEnv(TWILIO_AUTH_TOKEN);
  const fromNumber = requiredEnv(TWILIO_FROM_NUMBER);

  const missing = [
    [TWILIO_ACCOUNT_SID, accountSid],
    [TWILIO_AUTH_TOKEN, authToken],
    [TWILIO_FROM_NUMBER, fromNumber],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => String(name));

  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    value: {
      accountSid: accountSid!,
      authToken: authToken!,
      fromNumber: fromNumber!,
    },
  };
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
        `${config.accountSid}:${config.authToken}`,
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
