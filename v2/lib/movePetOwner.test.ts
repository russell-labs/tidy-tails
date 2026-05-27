import { describe, expect, it } from "vitest";
import {
  buildMovePetOwnerUpdates,
  buildNewOwnerClientInsert,
  searchMoveOwnerTargets,
  validateMovePetOwner,
} from "./movePetOwner";
import type { Client } from "./data/types";

const valid = {
  pet_id: "pet-1",
  from_client_id: "client-old",
  to_client_id: "client-new",
};

describe("validateMovePetOwner", () => {
  it("validates moving a pet from one household to another", () => {
    expect(validateMovePetOwner(valid)).toEqual({
      ok: true,
      value: { ...valid, move_mode: "existing" },
    });
  });

  it("requires pet, source household, and target household", () => {
    const result = validateMovePetOwner({
      pet_id: "",
      from_client_id: "",
      to_client_id: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.pet_id).toBeTruthy();
    expect(result.errors.from_client_id).toBeTruthy();
    expect(result.errors.to_client_id).toBeTruthy();
  });

  it("rejects moving to the same household", () => {
    const result = validateMovePetOwner({
      ...valid,
      to_client_id: "client-old",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.to_client_id).toBeTruthy();
  });

  it("validates creating a new owner during the move", () => {
    const result = validateMovePetOwner({
      pet_id: "pet-1",
      from_client_id: "client-old",
      move_mode: "new",
      new_owner_first_name: "Marina",
      new_owner_last_name: "Kitchen",
      new_owner_phone: "",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      pet_id: "pet-1",
      from_client_id: "client-old",
      move_mode: "new",
      to_client_id: null,
      newOwner: {
        first_name: "Marina",
        last_name: "Kitchen",
        phone: "",
      },
    });
  });

  it("requires a new owner first name when creating a household", () => {
    const result = validateMovePetOwner({
      pet_id: "pet-1",
      from_client_id: "client-old",
      move_mode: "new",
      new_owner_first_name: "",
      new_owner_last_name: "Kitchen",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.new_owner_first_name).toBeTruthy();
  });
});

describe("buildMovePetOwnerUpdates", () => {
  it("builds the pets and appointments client_id updates", () => {
    expect(buildMovePetOwnerUpdates({ ...valid, move_mode: "existing" })).toEqual({
      petUpdate: { client_id: "client-new" },
      appointmentUpdate: { client_id: "client-new" },
      rollbackPetUpdate: { client_id: "client-old" },
      rollbackAppointmentUpdate: { client_id: "client-old" },
    });
  });
});

describe("buildNewOwnerClientInsert", () => {
  it("builds a minimal household insert for a newly discovered owner", () => {
    const result = validateMovePetOwner({
      pet_id: "pet-1",
      from_client_id: "client-old",
      move_mode: "new",
      new_owner_first_name: "Marina",
      new_owner_last_name: "Kitchen",
      new_owner_phone: "",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.move_mode !== "new") return;
    expect(buildNewOwnerClientInsert(result.value)).toEqual({
      first_name: "Marina",
      last_name: "Kitchen",
      phone: "",
      notes: "Created while moving a dog to the correct owner.",
    });
  });
});

const ownerTargets = [
  {
    id: "client-z",
    first_name: "Zoe",
    last_name: "Miller",
    phone: "705-555-0303",
  },
  {
    id: "client-marina",
    first_name: "Marina",
    last_name: "Kitchen",
    phone: "705-330-0000",
  },
  {
    id: "client-abby",
    first_name: "Abby",
    last_name: "Kitchen",
    phone: "705-555-9191",
  },
] as Client[];

describe("searchMoveOwnerTargets", () => {
  it("returns owner targets alphabetically when the query is empty", () => {
    expect(searchMoveOwnerTargets("", ownerTargets).map((client) => client.id)).toEqual([
      "client-abby",
      "client-marina",
      "client-z",
    ]);
  });

  it("searches owner names like the household search", () => {
    expect(searchMoveOwnerTargets("mar", ownerTargets).map((client) => client.id)).toEqual([
      "client-marina",
    ]);
  });

  it("searches phone fragments", () => {
    expect(searchMoveOwnerTargets("9191", ownerTargets).map((client) => client.id)).toEqual([
      "client-abby",
    ]);
  });
});
