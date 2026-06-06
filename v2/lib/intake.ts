// Pure logic for the "Add household" intake flow — creating one client and
// one or more pets together:
//   - validateIntake     — raw form input → a validated client + pets, or errors
//   - buildClientInsert  — the `clients` INSERT payload
//   - buildPetInserts    — the `pets` INSERT payloads (client_id wired later)
//
// Pure: no I/O, no Supabase, no React. The server action
// (lib/actions/intake.ts) composes these; the intake sheet
// (components/AddHousehold.tsx) reuses validateIntake client-side for review.

import { digitsOnly } from "./format";
import { parseStoredPetBirthDate } from "./petAge";

// The CHECK-constrained `pets.size` enum codes in the live schema.
export const PET_SIZES = ["small", "medium", "large", "xl"] as const;
export type PetSize = (typeof PET_SIZES)[number];

// "unknown" is the safe default — it asserts nothing.
export type AllergyState = "yes" | "no" | "unknown";
export type VaccinationState = "yes" | "no" | "unknown";

export type PetIntakeInput = {
  pet_name: string;
  breed: string;
  size: string;
  allergy_state: string;
  allergies_detail: string;
  vaccination_state: string;
  vaccination_detail: string;
  age: string;
  date_of_birth: string;
  grooming_notes: string;
  typical_fee: string;
};

// Raw intake form input — every scalar field arrives as a string (or absent).
export type IntakeInput = PetIntakeInput & {
  first_name: string;
  last_name: string;
  phone: string;
  secondary_contact_name: string;
  secondary_cell: string;
  landline: string;
  email: string;
  address: string;
  notes: string; // client notes
  sms_consent: string; // "on" when the client agreed to texts (WS0)
  pets?: Partial<PetIntakeInput>[];
};

export type ValidatedIntakePet = {
  name: string;
  breed: string | null;
  size: PetSize | null;
  // yes → true, no → false, unknown → null (the column is nullable).
  allergies: boolean | null;
  allergies_detail: string | null;
  vaccination_state: VaccinationState;
  vaccination_detail: string | null;
  age: string | null;
  date_of_birth: string | null;
  grooming_notes: string | null;
  typical_fee: number | null;
};

// A validated client + pets — optionals normalized to value-or-null.
export type ValidatedIntake = {
  client: {
    first_name: string;
    last_name: string | null;
    phone: string;
    alt_contact: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    sms_consent: boolean;
  };
  pets: ValidatedIntakePet[];
};

export type IntakeErrors = Partial<Record<keyof IntakeInput | string, string>>;

export type IntakeValidationResult =
  | { ok: true; value: ValidatedIntake }
  | { ok: false; errors: IntakeErrors };

const NAME_MAX = 80;
const EMAIL_MAX = 200;
const ADDRESS_MAX = 300;
const TEXT_MAX = 1000; // notes / grooming_notes / allergies_detail
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Lenient single-@ shape check — a typo guard, not RFC validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalText(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function phoneLooksValid(phone: string | null): boolean {
  if (!phone) return true;
  const phoneDigits = digitsOnly(phone);
  return (
    phoneDigits.length === 10 ||
    (phoneDigits.length === 11 && phoneDigits.startsWith("1"))
  );
}

function parseChoice<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
): T | null {
  const v = (raw ?? "").trim();
  if (v === "") return "unknown" as T;
  return allowed.includes(v as T) ? (v as T) : null;
}

function formatAltContact({
  secondaryName,
  secondaryCell,
  landline,
}: {
  secondaryName: string | null;
  secondaryCell: string | null;
  landline: string | null;
}): string | null {
  const parts: string[] = [];
  if (secondaryName && secondaryCell) {
    parts.push(`Secondary: ${secondaryName} - ${secondaryCell}`);
  } else if (secondaryName) {
    parts.push(`Secondary: ${secondaryName}`);
  } else if (secondaryCell) {
    parts.push(`Secondary cell: ${secondaryCell}`);
  }
  if (landline) parts.push(`Landline: ${landline}`);
  return parts.length > 0 ? parts.join("; ") : null;
}

function rawPets(raw: Partial<IntakeInput>): Partial<PetIntakeInput>[] {
  if (Array.isArray(raw.pets) && raw.pets.length > 0) return raw.pets;
  return [
    {
      pet_name: raw.pet_name,
      breed: raw.breed,
      size: raw.size,
      allergy_state: raw.allergy_state,
      allergies_detail: raw.allergies_detail,
      vaccination_state: raw.vaccination_state,
      vaccination_detail: raw.vaccination_detail,
      age: raw.age,
      date_of_birth: raw.date_of_birth,
      grooming_notes: raw.grooming_notes,
      typical_fee: raw.typical_fee,
    },
  ];
}

function errorKey(index: number, key: keyof PetIntakeInput): string {
  return index === 0 ? key : `pets.${index}.${key}`;
}

function validatePet(
  raw: Partial<PetIntakeInput>,
  index: number,
  errors: IntakeErrors,
): ValidatedIntakePet | null {
  const pet_name = (raw.pet_name ?? "").trim();
  if (!pet_name) errors[errorKey(index, "pet_name")] = "Enter the pet's name.";
  else if (pet_name.length > NAME_MAX)
    errors[errorKey(index, "pet_name")] = "That name is too long.";

  const breed = optionalText(raw.breed);
  if (breed && breed.length > NAME_MAX) {
    errors[errorKey(index, "breed")] = "That breed is too long.";
  }

  const sizeRaw = (raw.size ?? "").trim();
  let size: PetSize | null = null;
  if (sizeRaw) {
    if ((PET_SIZES as readonly string[]).includes(sizeRaw)) {
      size = sizeRaw as PetSize;
    } else {
      errors[errorKey(index, "size")] = "Pick a size from the list.";
    }
  }

  const allergyState = parseChoice<AllergyState>(raw.allergy_state, [
    "yes",
    "no",
    "unknown",
  ]);
  if (allergyState === null) {
    errors[errorKey(index, "allergy_state")] = "Pick yes, no, or unknown.";
  }

  const allergiesDetail = optionalText(raw.allergies_detail);
  if (allergiesDetail && allergiesDetail.length > TEXT_MAX) {
    errors[errorKey(index, "allergies_detail")] =
      "Those allergy notes are too long.";
  }

  const vaccinationState = parseChoice<VaccinationState>(
    raw.vaccination_state,
    ["yes", "no", "unknown"],
  );
  if (vaccinationState === null) {
    errors[errorKey(index, "vaccination_state")] = "Pick yes, no, or unknown.";
  }

  const vaccinationDetail = optionalText(raw.vaccination_detail);
  if (vaccinationDetail && vaccinationDetail.length > TEXT_MAX) {
    errors[errorKey(index, "vaccination_detail")] =
      "Those vaccination notes are too long.";
  }

  const age = optionalText(raw.age);
  if (age && age.length > NAME_MAX) {
    errors[errorKey(index, "age")] = "That age is too long.";
  }

  const birthRaw = (raw.date_of_birth ?? "").trim();
  let date_of_birth: string | null = null;
  if (birthRaw) {
    if (ISO_DATE.test(birthRaw) && parseStoredPetBirthDate(birthRaw)) {
      date_of_birth = birthRaw;
    } else {
      errors[errorKey(index, "date_of_birth")] = "Use a valid birth date.";
    }
  }

  const grooming_notes = optionalText(raw.grooming_notes);
  if (grooming_notes && grooming_notes.length > TEXT_MAX) {
    errors[errorKey(index, "grooming_notes")] = "Those notes are too long.";
  }

  const feeRaw = (raw.typical_fee ?? "").trim();
  let typical_fee: number | null = null;
  if (feeRaw) {
    const n = Number(feeRaw);
    if (!Number.isFinite(n) || n < 0) {
      errors[errorKey(index, "typical_fee")] =
        "Fee must be a number that isn't negative.";
    } else {
      typical_fee = n;
    }
  }

  if (
    !pet_name ||
    allergyState === null ||
    vaccinationState === null ||
    errors[errorKey(index, "breed")] ||
    errors[errorKey(index, "size")] ||
    errors[errorKey(index, "allergies_detail")] ||
    errors[errorKey(index, "vaccination_detail")] ||
    errors[errorKey(index, "age")] ||
    errors[errorKey(index, "date_of_birth")] ||
    errors[errorKey(index, "grooming_notes")] ||
    errors[errorKey(index, "typical_fee")]
  ) {
    return null;
  }

  const allergies =
    allergyState === "yes" ? true : allergyState === "no" ? false : null;

  return {
    name: pet_name,
    breed,
    size,
    allergies,
    allergies_detail: allergyState === "yes" ? allergiesDetail : null,
    vaccination_state: vaccinationState,
    vaccination_detail:
      vaccinationState === "unknown" ? null : vaccinationDetail,
    age,
    date_of_birth,
    grooming_notes,
    typical_fee,
  };
}

/**
 * Validate raw intake form input into a client + pets. Owner last name, phone,
 * and at least one pet name are required; everything else is optional. Phone
 * values must carry a North American digit count (10, or 11 with a leading 1).
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
  if (!phone) {
    errors.phone = "Enter a phone number.";
  } else if (!phoneLooksValid(phone)) {
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

  // SMS consent (WS0). The hidden input carries "on" only when the operator
  // ticked the consent box; the timestamp is stamped by the action at insert.
  const sms_consent = raw.sms_consent === "on";

  const pets = rawPets(raw)
    .map((pet, index) => validatePet(pet, index, errors))
    .filter((pet): pet is ValidatedIntakePet => Boolean(pet));

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      client: {
        first_name,
        last_name,
        phone,
        alt_contact: formatAltContact({
          secondaryName,
          secondaryCell,
          landline,
        }),
        email,
        address,
        notes,
        sms_consent,
      },
      pets,
    },
  };
}

// The `clients` INSERT payload — only the columns the intake flow owns.
export type ClientInsert = {
  first_name: string;
  last_name: string | null;
  phone: string;
  alt_contact: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  sms_consent: boolean;
  sms_consent_at: string | null;
};

// `consentAt` is the timestamp to record when the client consented; the action
// passes the current time. It is only applied when consent was actually given,
// so a non-consenting intake stores sms_consent=false / sms_consent_at=null.
export function buildClientInsert(
  v: ValidatedIntake,
  consentAt: string | null = null,
): ClientInsert {
  return {
    ...v.client,
    sms_consent: v.client.sms_consent,
    sms_consent_at: v.client.sms_consent ? consentAt : null,
  };
}

// The `pets` INSERT payload — only columns already used by the live app.
// `client_id` is deliberately absent: it is wired in by the server action.
export type PetInsert = {
  name: string;
  breed: string | null;
  size: PetSize | null;
  allergies: boolean | null;
  allergies_detail: string | null;
  age: string | null;
  grooming_notes: string | null;
  standard_fee: number | null;
};

function vaccinationLabel(state: VaccinationState): string | null {
  if (state === "yes") return "Yes";
  if (state === "no") return "No";
  return null;
}

function groomingNotesForInsert(pet: ValidatedIntakePet): string | null {
  const notes: string[] = [];
  const label = vaccinationLabel(pet.vaccination_state);
  if (label) {
    notes.push(
      pet.vaccination_detail
        ? `Vaccinations: ${label} - ${pet.vaccination_detail}`
        : `Vaccinations: ${label}`,
    );
  }
  if (pet.grooming_notes) notes.push(pet.grooming_notes);
  return notes.length > 0 ? notes.join("\n") : null;
}

export function buildPetInserts(v: ValidatedIntake): PetInsert[] {
  return v.pets.map((pet) => ({
    name: pet.name,
    breed: pet.breed,
    size: pet.size,
    allergies: pet.allergies,
    allergies_detail: pet.allergies_detail,
    // Existing edit-pet code stores ISO birth dates in the live `age` column.
    age: pet.date_of_birth ?? pet.age,
    grooming_notes: groomingNotesForInsert(pet),
    standard_fee: pet.typical_fee,
  }));
}

// Backward-compatible helper for tests and existing call sites that expect the
// first pet payload.
export function buildPetInsert(v: ValidatedIntake): PetInsert {
  return buildPetInserts(v)[0]!;
}
