import { getTwilioConfig, getTwilioWebhookAuthToken } from "./twilio";

export type SmsReadiness = {
  outboundConfigured: boolean;
  inboundSignatureConfigured: boolean;
  inboundPersistenceConfigured: boolean;
  webhookUrl: string;
  ready: boolean;
};

export function readSmsReadiness(): SmsReadiness {
  const outboundConfigured = getTwilioConfig().ok;
  const inboundSignatureConfigured = Boolean(getTwilioWebhookAuthToken());
  const inboundPersistenceConfigured = Boolean(
    process.env.TIDYTAILS_SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );

  return {
    outboundConfigured,
    inboundSignatureConfigured,
    inboundPersistenceConfigured,
    webhookUrl: `${appUrl()}/api/twilio/inbound-sms`,
    ready:
      outboundConfigured &&
      inboundSignatureConfigured &&
      inboundPersistenceConfigured,
  };
}

function appUrl(): string {
  return (
    process.env.TIDYTAILS_APP_URL?.replace(/\/+$/, "") ??
    "https://tidy-tails-v2.vercel.app"
  );
}
