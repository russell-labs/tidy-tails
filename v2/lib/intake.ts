// Pure logic for the "Add household" intake flow — creating a new client and
// their first pet together:
//   - validateIntake     — raw form input → a validated client + pet, or errors
//   - buildClientInsert  — the `clients` INSERT payload
//   - buildPetInsert     — the `pets` INSERT payload (client_id wired later)
//
// Pure: no I/O, no Supabase, no React. The server action
// (lib/actions/intake.ts) composes these; the intake sheet
// (components/AddHousehold.tsx) reuses validateIntake client-side for the
// review step — one validator, both paths. Unit-tested in intake.test.ts.
//
// Column shapes are grounded in the live v1 schema (verified 2026-05-17):
//   clients — first_name, last_name, phone, email, address, notes (+ id,
//     created_at, updated_at, tier, all DB-defaulted)
//   pets    — name, breed, size, allergies, allergies_detail, grooming_notes,
//     standard_fee (+ id, created_at, client_id)
// `pets.allergies` is a NULLABLE boolean (default false), so an unconfirmed
// allergy status is stored honestly as NULL — never fabricated to false.

import { digitsOnly } from "./format";

// The CHECK-constrained `pets.size` enum codes in the live schema.
export const PET_SIZES = ["small", "medium", "large", "xl"] as const;
export type PetSize = (typeof PET_SIZES)[number];

// The three allergy states the intake form offers. "unknown" is the safe
// default — it asserts nothing, and maps to a NULL `allergies` column.
export type AllergyState = "yes" | "no" | "unknown";

// Raw intake form input — every field arrives as a string (or absent).
export type IntakeInput = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string; // client notes
  pet_name: string;
  breed: string;
  size: string;
  allergy_state: string;
  allergies_detail: string;
  grooming_notes: string;
  typical_fee: string;
};

// A validated client + pet — optionals normalized to value-or-null.
export type ValidatedIntake = {
  client: {
    first_name: string;
    last_name: string | null;
    phone: string;
    email: string | null;
    address: string | null;
    notes: string | null;
  };
  pet: {
    name: string;
    breed: string | null;
    size: PetSize | null;
    // yes → true, no → false, unknown → null (the column is nullable).
    allergies: boolean | null;
    allergies_detail: string | null;
    grooming_notes: string | null;
    typical_fee: number | null;
  };
};

export type IntakeErrors = Partial<Record<keyof IntakeInput, string>>;

export type IntakeValidationResult =
  | { ok: true; value: ValidatedIntake }
  | { ok: false; errors: IntakeErrors };

const NAME_MAX = 80;
const EMAIL_MAX = 200;
const ADDRESS_MAX = 300;
const TEXT_MAX = 1000; // notes / grooming_notes / allergies_detail
// Lenient single-@ shape check — a typo guard, not RFC validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalText(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function parseAllergyState(raw: string | undefined): AllergyState | null {
  const v = (raw ?? "").trim();
  if (v === "") return "unknown"; // empty = not asserted = the safe default
  if (v === "yes" || v === "no" || v === "unknown") return v;
  return null; // anything else is a tampered/garbage value
}

/**
 * Validate raw intake form input into a client + pet. Owner last name, phone,
 * and pet name are required; everything else is optional, normalized to
 * value-or-null. Phone must carry a North American digit count (10, or 11 with
 * a leading 1); the entered string is kept verbatim, matching the v1 `phone`
 * column. Allergy detail is only carried when the state is "yes".
 */
export function validateIntake(
  raw: Partial<IntakeInput>,
): IntakeValidationResult {
  const errors: IntakeErrors = {};

  // ---- client -----------------------------------------------------------
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

  // ---- pet --------------------------------------------------------------
  const pet_name = (raw.pet_name ?? "").trim();
  if (!pet_name) errors.pet_name = "Enter the pet's name.";
  else if (pet_name.length > NAME_MAX)
    errors.pet_name = "That name is too long.";

  const breed = optionalText(raw.breed);
  if (breed && breed.length > NAME_MAX) {
    errors.breed = "That breed is too long.";
  }

  const sizeRaw = (raw.size ?? "").trim();
  let size: PetSize | null = null;
  if (sizeRaw) {
    if ((PET_SIZES as readonly string[]).includes(sizeRaw)) {
      size = sizeRaw as PetSize;
    } else {
      errors.size = "Pick a size from the list.";
    }
  }

  const allergyState = parseAllergyState(raw.allergy_state);
  if (allergyState === null) {
    errors.allergy_state = "Pick yes, no, or unknown.";
  }
  // Detail is meaningful only when the answer is "yes"; otherwise dropped.
  const detailRaw = optionalText(raw.allergies_detail);
  if (allergyState === "yes" && detailRaw && detailRaw.length > TEXT_MAX) {
    errors.allergies_detail = "Those allergy notes are too long.";
  }

  const grooming_notes = optionalText(raw.grooming_notes);
  if (grooming_notes && grooming_notes.length > TEXT_MAX) {
    errors.grooming_notes = "Those notes are too long.";
  }

  const feeRaw = (raw.typical_fee ?? "").trim();
  let typical_fee: number | null = null;
  if (feeRaw) {
    const n = Number(feeRaw);
    if (!Number.isFinite(n) || n < 0) {
      errors.typical_fee = "Fee must be a number that isn't negative.";
    } else {
      typical_fee = n;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // allergyState is non-null here — the null branch set an error above.
  const allergies =
    allergyState === "yes" ? true : allergyState === "no" ? false : null;
  const allergies_detail = allergyState === "yes" ? detailRaw : null;

  return {
    ok: true,
    value: {
      client: { first_name, last_name, phone, email, address, notes },
      pet: {
        name: pet_name,
        breed,
        size,
        allergies,
        allergies_detail,
        grooming_notes,
        typical_fee,
      },
    },
  };
}

// The `clients` INSERT payload — only the columns the intake flow owns.
export type ClientInsert = {
  first_name: string;
  last_name: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
};

/**
 * Build the `clients` INSERT payload from a validated intake. `id`,
 * `created_at`, `updated_at` take DB defaults; `tier` is left to its DB
 * default ('new') rather than fabricated here.
 */
export function buildClientInsert(v: ValidatedIntake): ClientInsert {
  return { ...v.client };
}

// The `pets` INSERT payload — only the columns the intake flow owns.
// `client_id` is deliberately absent: it is wired in by the server action
// from the row returned by the `clients` insert (see lib/actions/intake.ts).
export type PetInsert = {
  name: string;
  breed: string | null;
  size: PetSize | null;
  allergies: boolean | null;
  allergies_detail: string | null;
  grooming_notes: string | null;
  standard_fee: number | null;
};

/**
 * Build the `pets` INSERT payload from a validated intake. `allergies` is set
 * explicitly — including an explicit NULL for "unknown" — so the column's
 * `DEFAULT false` never silently turns an unconfirmed status into "no
 * allergies". The form's `typical_fee` maps onto the live `standard_fee`
 * column. `id` / `created_at` take DB defaults; `client_id` is wired by the
 * action after the client row is created.
 */
export function buildPetInsert(v: ValidatedIntake): PetInsert {
  const { pet } = v;
  return {
    name: pet.name,
    breed: pet.breed,
    size: pet.size,
    allergies: pet.allergies,
    allergies_detail: pet.allergies_detail,
    grooming_notes: pet.grooming_notes,
    standard_fee: pet.typical_fee,
  };
}
