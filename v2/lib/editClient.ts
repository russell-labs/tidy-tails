import { formatAltContact } from "./altContact";
import { digitsOnly } from "./format";

export type EditClientInput = {
  client_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  // The three structured "other contact" fields (parity with Add household).
  // They are recombined into the single `alt_contact` column on save; there are
  // no secondary_contact_name / secondary_cell columns.
  secondary_contact_name: string;
  secondary_cell: string;
  landline: string;
  email: string;
  address: string;
  notes: string;
};

export type ValidatedEditClient = {
  client_id: string;
  first_name: string;
  last_name: string | null;
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

// Same rule as intake: an optional phone is valid when empty, or carries a North
// American digit count (10, or 11 with a leading 1).
function phoneLooksValid(phone: string | null): boolean {
  if (!phone) return true;
  const d = digitsOnly(phone);
  return d.length === 10 || (d.length === 11 && d.startsWith("1"));
}

export function validateEditClient(
  raw: Partial<EditClientInput>,
): EditClientValidationResult {
  const errors: EditClientErrors = {};

  const client_id = (raw.client_id ?? "").trim();
  if (!client_id) errors.client_id = "Choose the household.";

  const first_name = (raw.first_name ?? "").trim();
  const last_name = optionalText(raw.last_name);
  if (first_name.length > NAME_MAX)
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

  const secondaryName = optionalText(raw.secondary_contact_name);
  if (secondaryName && secondaryName.length > NAME_MAX) {
    errors.secondary_contact_name = "That name is too long.";
  }

  const secondaryCell = optionalText(raw.secondary_cell);
  if (!phoneLooksValid(secondaryCell)) {
    errors.secondary_cell = "Enter a 10-digit phone number.";
  }

  const landline = optionalText(raw.landline);
  if (!phoneLooksValid(landline)) {
    errors.landline = "Enter a 10-digit phone number.";
  }

  // Recombine into the single alt_contact column via the shared formatter, so
  // an edit produces a byte-identical string to what create would write.
  const alt_contact = formatAltContact({ secondaryName, secondaryCell, landline });

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
