import { describe, expect, it } from "vitest";
import { buildEditPetUpdate, validateEditPet } from "./editPet";

const valid = {
  client_id: "client-1",
  pet_id: "pet-1",
  name: "Whiskey",
  breed: "Silver Terrier Yorkie",
  allergy_state: "no",
  allergies_detail: "ignored when no",
  grooming_notes: "Long hair; typical fee $50-$60.",
  typical_fee: "60",
};

describe("validateEditPet", () => {
  it("normalizes editable pet details", () => {
    const result = validateEditPet(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      client_id: "client-1",
      pet_id: "pet-1",
      name: "Whiskey",
      breed: "Silver Terrier Yorkie",
      allergies: false,
      allergies_detail: null,
      grooming_notes: "Long hair; typical fee $50-$60.",
      typical_fee: 60,
    });
  });

  it("requires the household, pet, and pet name", () => {
    const result = validateEditPet({
      ...valid,
      client_id: "",
      pet_id: "",
      name: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.client_id).toBeTruthy();
    expect(result.errors.pet_id).toBeTruthy();
    expect(result.errors.name).toBeTruthy();
  });

  it("keeps allergy detail only when allergies are yes", () => {
    const result = validateEditPet({
      ...valid,
      allergy_state: "yes",
      allergies_detail: "No chicken treats.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.allergies).toBe(true);
    expect(result.value.allergies_detail).toBe("No chicken treats.");
  });

  it("allows unknown allergies and blank optional fields as null", () => {
    const result = validateEditPet({
      ...valid,
      breed: "",
      allergy_state: "unknown",
      allergies_detail: "",
      grooming_notes: "",
      typical_fee: "",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.breed).toBeNull();
    expect(result.value.allergies).toBeNull();
    expect(result.value.allergies_detail).toBeNull();
    expect(result.value.grooming_notes).toBeNull();
    expect(result.value.typical_fee).toBeNull();
  });

  it("rejects invalid allergy states and negative fees", () => {
    const result = validateEditPet({
      ...valid,
      allergy_state: "maybe",
      typical_fee: "-5",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.allergy_state).toBeTruthy();
    expect(result.errors.typical_fee).toBeTruthy();
  });
});

describe("buildEditPetUpdate", () => {
  it("maps typical fee to the live standard_fee column", () => {
    const result = validateEditPet(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildEditPetUpdate(result.value)).toEqual({
      name: "Whiskey",
      breed: "Silver Terrier Yorkie",
      allergies: false,
      allergies_detail: null,
      grooming_notes: "Long hair; typical fee $50-$60.",
      standard_fee: 60,
    });
  });
}
);
