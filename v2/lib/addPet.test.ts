import { describe, expect, it } from "vitest";
import { buildAddPetInsert, validateAddPet } from "./addPet";

const valid = {
  client_id: "client-1",
  name: "Molly",
  breed: "Cavachon",
  size: "medium",
  allergy_state: "unknown",
  allergies_detail: "",
  grooming_notes: "Keep ears short.",
  typical_fee: "65",
};

describe("validateAddPet", () => {
  it("normalizes a valid pet for an existing household", () => {
    const result = validateAddPet(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      client_id: "client-1",
      name: "Molly",
      breed: "Cavachon",
      size: "medium",
      allergies: null,
      allergies_detail: null,
      grooming_notes: "Keep ears short.",
      typical_fee: 65,
    });
  });

  it("requires a client id and pet name", () => {
    const result = validateAddPet({ ...valid, client_id: "", name: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.client_id).toBeTruthy();
    expect(result.errors.name).toBeTruthy();
  });

  it("stores allergy detail only when allergies are yes", () => {
    const yes = validateAddPet({
      ...valid,
      allergy_state: "yes",
      allergies_detail: "No scented shampoo.",
    });
    expect(yes.ok).toBe(true);
    if (!yes.ok) return;
    expect(yes.value.allergies).toBe(true);
    expect(yes.value.allergies_detail).toBe("No scented shampoo.");

    const no = validateAddPet({
      ...valid,
      allergy_state: "no",
      allergies_detail: "ignored",
    });
    expect(no.ok).toBe(true);
    if (!no.ok) return;
    expect(no.value.allergies).toBe(false);
    expect(no.value.allergies_detail).toBeNull();
  });

  it("rejects invalid size and negative fee", () => {
    const result = validateAddPet({
      ...valid,
      size: "giant",
      typical_fee: "-1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.size).toBeTruthy();
    expect(result.errors.typical_fee).toBeTruthy();
  });
});

describe("buildAddPetInsert", () => {
  it("maps typical_fee to the live standard_fee column", () => {
    const result = validateAddPet(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildAddPetInsert(result.value)).toMatchObject({
      client_id: "client-1",
      name: "Molly",
      standard_fee: 65,
    });
  });
});
