import { digitsOnly } from "./format";
import { applyOperatorName } from "./operatorIdentity";

const MESSAGE_MAX = 480;

export type ReadyPickupTemplateVars = {
  ownerFirstName: string | null;
  petName: string | null;
  operatorName?: string;
};

export function renderReadyPickupTemplate(
  template: string,
  vars: ReadyPickupTemplateVars,
): string {
  const owner = (vars.ownerFirstName ?? "").trim() || "there";
  const pet = (vars.petName ?? "").trim() || "your dog";
  const rendered = template
    .replaceAll("[first name]", owner)
    .replaceAll("[pet name]", pet)
    .trim();
  return applyOperatorName(rendered, vars.operatorName ?? "");
}

export function buildReadyPickupMessage({
  ownerFirstName,
  petName,
  operatorName,
  template,
}: ReadyPickupTemplateVars & { operatorName: string; template?: string }): string {
  return renderReadyPickupTemplate(
    template ??
      "Hi [first name], [pet name] is ready to be picked up. — [your name]",
    { ownerFirstName, petName, operatorName },
  );
}

export type ReadyPickupInput = {
  phone: string;
  message: string;
};

export type ValidatedReadyPickup = {
  phone: string;
  message: string;
};

export type ReadyPickupErrors = Partial<Record<keyof ReadyPickupInput, string>>;

export type ReadyPickupValidationResult =
  | { ok: true; value: ValidatedReadyPickup }
  | { ok: false; errors: ReadyPickupErrors };

export function validateReadyPickupInput(
  raw: Partial<ReadyPickupInput>,
): ReadyPickupValidationResult {
  const errors: ReadyPickupErrors = {};
  const phone = (raw.phone ?? "").trim();
  const phoneDigits = digitsOnly(phone);
  if (
    !(
      phoneDigits.length === 10 ||
      (phoneDigits.length === 11 && phoneDigits.startsWith("1"))
    )
  ) {
    errors.phone = "That phone number doesn't look right.";
  }

  const message = (raw.message ?? "").trim();
  if (!message) {
    errors.message = "Write a pickup message before reviewing.";
  } else if (message.length > MESSAGE_MAX) {
    errors.message = "That message is too long.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { phone, message } };
}
