import { PET_SIZES, type AllergyState, type PetSize } from "./intake";

export type AddPetInput = {
  client_id: string;
  name: string;
  breed: string;
  size: string;
  allergy_state: string;
  allergies_detail: string;
  grooming_notes: string;
  typical_fee: string;
};

export type ValidatedAddPet = {
  client_id: string;
  name: string;
  breed: string | null;
  size: PetSize | null;
  allergies: boolean | null;
  allergies_detail: string | null;
  grooming_notes: string | null;
  typical_fee: number | null;
};

export type AddPetErrors = Partial<Record<keyof AddPetInput, string>>;

export type AddPetValidationResult =
  | { ok: true; value: ValidatedAddPet }
  | { ok: false; errors: AddPetErrors };

export type AddPetInsert = {
  client_id: string;
  name: string;
  breed: string | null;
  size: PetSize | null;
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
  if (v === "") return "unknown";
  if (v === "yes" || v === "no" || v === "unknown") return v;
  return null;
}

export function validateAddPet(
  raw: Partial<AddPetInput>,
): AddPetValidationResult {
  const errors: AddPetErrors = {};

  const client_id = (raw.client_id ?? "").trim();
  if (!client_id) errors.client_id = "Choose the household.";

  const name = (raw.name ?? "").trim();
  if (!name) errors.name = "Enter the pet's name.";
  else if (name.length > NAME_MAX) errors.name = "That name is too long.";

  const breed = optionalText(raw.breed);
  if (breed && breed.length > NAME_MAX) errors.breed = "That breed is too long.";

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

  const allergies =
    allergyState === "yes" ? true : allergyState === "no" ? false : null;
  const allergies_detail = allergyState === "yes" ? detailRaw : null;

  return {
    ok: true,
    value: {
      client_id,
      name,
      breed,
      size,
      allergies,
      allergies_detail,
      grooming_notes,
      typical_fee,
    },
  };
}

export function buildAddPetInsert(v: ValidatedAddPet): AddPetInsert {
  return {
    client_id: v.client_id,
    name: v.name,
    breed: v.breed,
    size: v.size,
    allergies: v.allergies,
    allergies_detail: v.allergies_detail,
    grooming_notes: v.grooming_notes,
    standard_fee: v.typical_fee,
  };
}
