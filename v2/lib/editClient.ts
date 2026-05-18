import { digitsOnly } from "./format";

export type EditClientInput = {
  client_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  alt_contact: string;
  email: string;
  address: string;
  notes: string;
};

export type ValidatedEditClient = {
  client_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  alt_contact: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

export type EditClientErrors = Partial<Record<keyof EditClientInput, string>>;

export type EditClientValidationResult =
  | { ok: true; value: ValidatedEditClient }
  | { ok: false; errors: EditClientErrors };

export type EditClientUpdate = Omit<ValidatedEditClient, "client_id">;

const NAME_MAX = 80;
const EMAIL_MAX = 200;
const ADDRESS_MAX = 300;
const TEXT_MAX = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalText(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

export function validateEditClient(
  raw: Partial<EditClientInput>,
): EditClientValidationResult {
  const errors: EditClientErrors = {};

  const client_id = (raw.client_id ?? "").trim();
  if (!client_id) errors.client_id = "Choose the household.";

  const first_name = (raw.first_name ?? "").trim();
  const last_name = (raw.last_name ?? "").trim();
  if (!first_name) errors.first_name = "Enter the owner's first name.";
  else if (first_name.length > NAME_MAX)
    errors.first_name = "That name is too long.";
  if (!last_name) errors.last_name = "Enter the owner's last name.";
  else if (last_name.length > NAME_MAX)
    errors.last_name = "That name is too long.";

  const phone = (raw.phone ?? "").trim();
  const phoneDigits = digitsOnly(phone);
  if (!phone) {
    errors.phone = "Enter a phone number.";
  } else if (
    !(
      phoneDigits.length === 10 ||
      (phoneDigits.length === 11 && phoneDigits.startsWith("1"))
    )
  ) {
    errors.phone = "Enter a 10-digit phone number.";
  }

  const alt_contact = optionalText(raw.alt_contact);
  if (alt_contact && alt_contact.length > TEXT_MAX) {
    errors.alt_contact = "That alternate contact is too long.";
  }

  const email = optionalText(raw.email);
  if (email && (email.length > EMAIL_MAX || !EMAIL_RE.test(email))) {
    errors.email = "That email doesn't look right.";
  }

  const address = optionalText(raw.address);
  if (address && address.length > ADDRESS_MAX) {
    errors.address = "That address is too long.";
  }

  const notes = optionalText(raw.notes);
  if (notes && notes.length > TEXT_MAX) {
    errors.notes = "Those notes are too long.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      client_id,
      first_name,
      last_name,
      phone,
      alt_contact,
      email,
      address,
      notes,
    },
  };
}

export function buildEditClientUpdate(
  v: ValidatedEditClient,
): EditClientUpdate {
  return {
    first_name: v.first_name,
    last_name: v.last_name,
    phone: v.phone,
    alt_contact: v.alt_contact,
    email: v.email,
    address: v.address,
    notes: v.notes,
  };
}
