export type InboxReplyInput = {
  smsId: string;
  message: string;
};

export type ClientSmsInput = {
  clientId: string;
  message: string;
};

export type InboxReplyValidation =
  | { ok: true; value: InboxReplyInput }
  | { ok: false; error: string };

export type ClientSmsValidation =
  | { ok: true; value: ClientSmsInput }
  | { ok: false; error: string };

export function validateInboxReplyInput(input: InboxReplyInput): InboxReplyValidation {
  const smsId = input.smsId.trim();
  const message = input.message.trim();

  if (!smsId) return { ok: false, error: "Choose a customer reply first." };
  if (!message) return { ok: false, error: "Write a reply before sending." };
  if (message.length > 480) {
    return { ok: false, error: "Keep replies under 480 characters." };
  }

  return { ok: true, value: { smsId, message } };
}

export function validateClientSmsInput(input: ClientSmsInput): ClientSmsValidation {
  const clientId = input.clientId.trim();
  const message = input.message.trim();

  if (!clientId) return { ok: false, error: "Choose a household first." };
  if (!message) return { ok: false, error: "Write a text before sending." };
  if (message.length > 480) {
    return { ok: false, error: "Keep customer texts under 480 characters." };
  }

  return { ok: true, value: { clientId, message } };
}

export function buildSmsHandledUpdate(handledAt: string) {
  return {
    status: "handled",
    handled_at: handledAt,
  };
}
