import type { AllergyState } from "./intake";

export type EditPetInput = {
  client_id: string;
  pet_id: string;
  name: string;
  breed: string;
  allergy_state: string;
  allergies_detail: string;
  grooming_notes: string;
  typical_fee: string;
};

export type ValidatedEditPet = {
  client_id: string;
  pet_id: string;
  name: string;
  breed: string | null;
  allergies: boolean | null;
  allergies_detail: string | null;
  grooming_notes: string | null;
  typical_fee: number | null;
};

export type EditPetErrors = Partial<Record<keyof EditPetInput, string>>;

export type EditPetValidationResult =
  | { ok: true; value: ValidatedEditPet }
  | { ok: false; errors: EditPetErrors };

export type EditPetUpdate = {
  name: string;
  breed: string | null;
  allergies: boolean | null;
  allergies_detail: string | null;
  grooming_notes: string | null;
  standard_fee: number | null;
};

const NAME_MAX = 80;
const TEXT_MAX = 1000;

function optionalText(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function parseAllergyState(raw: string | undefined): AllergyState | null {
  const v = (raw ?? "").trim();
  if (v === "yes" || v === "no" || v === "unknown") return v;
  return null;
}

export function validateEditPet(
  raw: Partial<EditPetInput>,
): EditPetValidationResult {
  const errors: EditPetErrors = {};

  const client_id = (raw.client_id ?? "").trim();
  if (!client_id) errors.client_id = "Choose the household.";

  const pet_id = (raw.pet_id ?? "").trim();
  if (!pet_id) errors.pet_id = "Choose the pet.";

  const name = (raw.name ?? "").trim();
  if (!name) errors.name = "Enter the pet's name.";
  else if (name.length > NAME_MAX) errors.name = "That name is too long.";

  const breed = optionalText(raw.breed);
  if (breed && breed.length > NAME_MAX) errors.breed = "That breed is too long.";

  const allergyState = parseAllergyState(raw.allergy_state);
  if (allergyState === null) {
    errors.allergy_state = "Pick yes, no, or unknown.";
  }

  const allergiesDetail = optionalText(raw.allergies_detail);
  if (allergiesDetail && allergiesDetail.length > TEXT_MAX) {
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

  const allergies =
    allergyState === "yes" ? true : allergyState === "no" ? false : null;

  return {
    ok: true,
    value: {
      client_id,
      pet_id,
      name,
      breed,
      allergies,
      allergies_detail: allergyState === "yes" ? allergiesDetail : null,
      grooming_notes,
      typical_fee,
    },
  };
}

export function buildEditPetUpdate(v: ValidatedEditPet): EditPetUpdate {
  return {
    name: v.name,
    breed: v.breed,
    allergies: v.allergies,
    allergies_detail: v.allergies_detail,
    grooming_notes: v.grooming_notes,
    standard_fee: v.typical_fee,
  };
}
