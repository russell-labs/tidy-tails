import { describe, it, expect } from "vitest";
import { buildClientInsert, buildPetInsert, validateIntake } from "./intake";

// A complete, valid raw intake. Individual tests override single fields so
// each test isolates exactly one behaviour.
const VALID = {
  first_name: "Dana",
  last_name: "Okafor",
  phone: "416-555-0142",
  email: "",
  address: "",
  notes: "",
  pet_name: "Biscuit",
  breed: "",
  size: "",
  allergy_state: "unknown",
  allergies_detail: "",
  grooming_notes: "",
  typical_fee: "",
};

describe("validateIntake — required fields", () => {
  it("accepts a minimal intake (owner name, phone, pet name) with optionals empty", () => {
    const r = validateIntake(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.client).toEqual({
        first_name: "Dana",
        last_name: "Okafor",
        phone: "416-555-0142",
        email: null,
        address: null,
        notes: null,
      });
      expect(r.value.pet).toEqual({
        name: "Biscuit",
        breed: null,
        size: null,
        allergies: null,
        allergies_detail: null,
        grooming_notes: null,
        typical_fee: null,
      });
    }
  });

  it("rejects a missing first name", () => {
    const r = validateIntake({ ...VALID, first_name: "  " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.first_name).toBeTruthy();
  });

  it("accepts a new household with only a first name", () => {
    const r = validateIntake({ ...VALID, last_name: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.client.last_name).toBeNull();
  });

  it("rejects a missing phone", () => {
    const r = validateIntake({ ...VALID, phone: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toBeTruthy();
  });

  it("rejects a missing pet name", () => {
    const r = validateIntake({ ...VALID, pet_name: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.pet_name).toBeTruthy();
  });

  it("trims surrounding whitespace from the owner and pet names", () => {
    const r = validateIntake({
      ...VALID,
      first_name: "  Dana ",
      pet_name: " Biscuit ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.client.first_name).toBe("Dana");
      expect(r.value.pet.name).toBe("Biscuit");
    }
  });
});

describe("validateIntake — phone handling", () => {
  it("accepts a plain 10-digit phone", () => {
    const r = validateIntake({ ...VALID, phone: "4165550142" });
    expect(r.ok).toBe(true);
  });

  it("accepts a formatted phone with parens, spaces and dashes", () => {
    const r = validateIntake({ ...VALID, phone: "(416) 555-0142" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.client.phone).toBe("(416) 555-0142");
  });

  it("accepts an 11-digit number with a leading country code 1", () => {
    const r = validateIntake({ ...VALID, phone: "1-416-555-0142" });
    expect(r.ok).toBe(true);
  });

  it("rejects a phone with too few digits", () => {
    const r = validateIntake({ ...VALID, phone: "555-0142" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toBeTruthy();
  });

  it("rejects an 11-digit number that does not start with 1", () => {
    const r = validateIntake({ ...VALID, phone: "44165550142" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toBeTruthy();
  });

  it("rejects a phone with no digits at all", () => {
    const r = validateIntake({ ...VALID, phone: "call me" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toBeTruthy();
  });
});

describe("validateIntake — optional client fields", () => {
  it("accepts a valid email and carries it through", () => {
    const r = validateIntake({ ...VALID, email: "dana@example.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.client.email).toBe("dana@example.com");
  });

  it("rejects a malformed email", () => {
    const r = validateIntake({ ...VALID, email: "dana@@example" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBeTruthy();
  });

  it("treats an empty email as null, not an error", () => {
    const r = validateIntake({ ...VALID, email: "  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.client.email).toBeNull();
  });

  it("carries an optional address and client notes through", () => {
    const r = validateIntake({
      ...VALID,
      address: "12 Maple St",
      notes: "Prefers mornings",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.client.address).toBe("12 Maple St");
      expect(r.value.client.notes).toBe("Prefers mornings");
    }
  });

  it("rejects over-long client notes", () => {
    const r = validateIntake({ ...VALID, notes: "x".repeat(1001) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.notes).toBeTruthy();
  });
});

describe("validateIntake — allergy state (yes / no / unknown)", () => {
  it("maps allergy_state 'yes' to allergies true and carries the detail", () => {
    const r = validateIntake({
      ...VALID,
      allergy_state: "yes",
      allergies_detail: "Reacts to oatmeal shampoo",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.pet.allergies).toBe(true);
      expect(r.value.pet.allergies_detail).toBe("Reacts to oatmeal shampoo");
    }
  });

  it("allows allergy_state 'yes' with no detail — detail is optional", () => {
    const r = validateIntake({
      ...VALID,
      allergy_state: "yes",
      allergies_detail: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.pet.allergies).toBe(true);
      expect(r.value.pet.allergies_detail).toBeNull();
    }
  });

  it("maps allergy_state 'no' to allergies false and forces detail null", () => {
    const r = validateIntake({
      ...VALID,
      allergy_state: "no",
      allergies_detail: "should be dropped",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.pet.allergies).toBe(false);
      expect(r.value.pet.allergies_detail).toBeNull();
    }
  });

  it("maps allergy_state 'unknown' to allergies null and detail null", () => {
    const r = validateIntake({
      ...VALID,
      allergy_state: "unknown",
      allergies_detail: "should be dropped",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.pet.allergies).toBeNull();
      expect(r.value.pet.allergies_detail).toBeNull();
    }
  });

  it("treats an empty allergy_state as unknown — the safe default", () => {
    const r = validateIntake({ ...VALID, allergy_state: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.pet.allergies).toBeNull();
  });

  it("rejects an allergy_state outside yes / no / unknown", () => {
    const r = validateIntake({ ...VALID, allergy_state: "maybe" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.allergy_state).toBeTruthy();
  });

  it("rejects over-long allergy detail", () => {
    const r = validateIntake({
      ...VALID,
      allergy_state: "yes",
      allergies_detail: "x".repeat(1001),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.allergies_detail).toBeTruthy();
  });
});

describe("validateIntake — optional pet fields", () => {
  it("accepts a valid size from the enum", () => {
    const r = validateIntake({ ...VALID, size: "large" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.pet.size).toBe("large");
  });

  it("rejects a size outside the enum", () => {
    const r = validateIntake({ ...VALID, size: "enormous" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.size).toBeTruthy();
  });

  it("treats an empty size as null", () => {
    const r = validateIntake({ ...VALID, size: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.pet.size).toBeNull();
  });

  it("carries an optional breed and grooming notes through", () => {
    const r = validateIntake({
      ...VALID,
      breed: "Cockapoo",
      grooming_notes: "Teddy bear cut",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.pet.breed).toBe("Cockapoo");
      expect(r.value.pet.grooming_notes).toBe("Teddy bear cut");
    }
  });

  it("accepts a typical fee", () => {
    const r = validateIntake({ ...VALID, typical_fee: "72.50" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.pet.typical_fee).toBe(72.5);
  });

  it("accepts a typical fee of 0", () => {
    const r = validateIntake({ ...VALID, typical_fee: "0" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.pet.typical_fee).toBe(0);
  });

  it("rejects a negative typical fee", () => {
    const r = validateIntake({ ...VALID, typical_fee: "-10" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.typical_fee).toBeTruthy();
  });

  it("rejects a non-numeric typical fee", () => {
    const r = validateIntake({ ...VALID, typical_fee: "lots" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.typical_fee).toBeTruthy();
  });
});

describe("buildClientInsert — payload shape", () => {
  it("builds a minimal client payload with optionals null", () => {
    const r = validateIntake(VALID);
    if (!r.ok) throw new Error("fixture should validate");
    expect(buildClientInsert(r.value)).toEqual({
      first_name: "Dana",
      last_name: "Okafor",
      phone: "416-555-0142",
      email: null,
      address: null,
      notes: null,
    });
  });

  it("carries email, address and notes when present", () => {
    const r = validateIntake({
      ...VALID,
      email: "dana@example.com",
      address: "12 Maple St",
      notes: "VIP",
    });
    if (!r.ok) throw new Error("fixture should validate");
    const payload = buildClientInsert(r.value);
    expect(payload.email).toBe("dana@example.com");
    expect(payload.address).toBe("12 Maple St");
    expect(payload.notes).toBe("VIP");
  });

  it("never sets id, created_at, updated_at, or tier — DB defaults", () => {
    const r = validateIntake(VALID);
    if (!r.ok) throw new Error("fixture should validate");
    const payload = buildClientInsert(r.value);
    for (const k of ["id", "created_at", "updated_at", "tier"]) {
      expect(payload).not.toHaveProperty(k);
    }
  });
});

describe("buildPetInsert — payload shape", () => {
  it("builds a minimal pet payload with optionals null and allergies explicitly null", () => {
    const r = validateIntake(VALID);
    if (!r.ok) throw new Error("fixture should validate");
    expect(buildPetInsert(r.value)).toEqual({
      name: "Biscuit",
      breed: null,
      size: null,
      allergies: null,
      allergies_detail: null,
      grooming_notes: null,
      standard_fee: null,
    });
  });

  it("writes allergies as an explicit null for unknown — never omits the key", () => {
    const r = validateIntake({ ...VALID, allergy_state: "unknown" });
    if (!r.ok) throw new Error("fixture should validate");
    const payload = buildPetInsert(r.value);
    expect(payload).toHaveProperty("allergies");
    expect(payload.allergies).toBeNull();
    expect(payload).toHaveProperty("allergies_detail");
    expect(payload.allergies_detail).toBeNull();
  });

  it("writes allergies true and carries the detail when allergy_state is yes", () => {
    const r = validateIntake({
      ...VALID,
      allergy_state: "yes",
      allergies_detail: "Oatmeal shampoo",
    });
    if (!r.ok) throw new Error("fixture should validate");
    const payload = buildPetInsert(r.value);
    expect(payload.allergies).toBe(true);
    expect(payload.allergies_detail).toBe("Oatmeal shampoo");
  });

  it("writes allergies false for allergy_state no", () => {
    const r = validateIntake({ ...VALID, allergy_state: "no" });
    if (!r.ok) throw new Error("fixture should validate");
    expect(buildPetInsert(r.value).allergies).toBe(false);
  });

  it("maps typical_fee onto the live standard_fee column", () => {
    const r = validateIntake({ ...VALID, typical_fee: "60" });
    if (!r.ok) throw new Error("fixture should validate");
    const payload = buildPetInsert(r.value);
    expect(payload).toHaveProperty("standard_fee", 60);
    expect(payload).not.toHaveProperty("typical_fee");
  });

  it("never sets id, created_at, or client_id — client_id is wired after the client insert", () => {
    const r = validateIntake(VALID);
    if (!r.ok) throw new Error("fixture should validate");
    const payload = buildPetInsert(r.value);
    for (const k of ["id", "created_at", "client_id"]) {
      expect(payload).not.toHaveProperty(k);
    }
  });
});
