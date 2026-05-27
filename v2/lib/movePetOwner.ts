import type { Client } from "./data/types";
import { searchHouseholds, type SearchHousehold } from "./search";

export type MovePetOwnerInput = {
  pet_id: string;
  from_client_id: string;
  to_client_id?: string;
  move_mode?: string;
  new_owner_first_name?: string;
  new_owner_last_name?: string;
  new_owner_phone?: string;
};

export type ValidatedMovePetOwner =
  | {
      pet_id: string;
      from_client_id: string;
      move_mode: "existing";
      to_client_id: string;
    }
  | {
      pet_id: string;
      from_client_id: string;
      move_mode: "new";
      to_client_id: null;
      newOwner: {
        first_name: string;
        last_name: string | null;
        phone: string;
      };
    };

export type MovePetOwnerErrors = Partial<Record<keyof MovePetOwnerInput, string>>;

export type MovePetOwnerValidationResult =
  | { ok: true; value: ValidatedMovePetOwner }
  | { ok: false; errors: MovePetOwnerErrors };

export function validateMovePetOwner(
  raw: Partial<MovePetOwnerInput>,
): MovePetOwnerValidationResult {
  const errors: MovePetOwnerErrors = {};
  const pet_id = (raw.pet_id ?? "").trim();
  const from_client_id = (raw.from_client_id ?? "").trim();
  const move_mode = (raw.move_mode ?? "existing").trim();
  const to_client_id = (raw.to_client_id ?? "").trim();

  if (!pet_id) errors.pet_id = "Choose the pet.";
  if (!from_client_id) errors.from_client_id = "Choose the current household.";

  if (move_mode !== "existing" && move_mode !== "new") {
    errors.move_mode = "Choose whether to use an existing or new household.";
  }

  if (move_mode === "existing") {
    if (!to_client_id) errors.to_client_id = "Choose the new owner.";
    if (from_client_id && to_client_id && from_client_id === to_client_id) {
      errors.to_client_id = "Choose a different household.";
    }
  }

  const new_owner_first_name = (raw.new_owner_first_name ?? "").trim();
  const new_owner_last_name = (raw.new_owner_last_name ?? "").trim();
  const new_owner_phone = (raw.new_owner_phone ?? "").trim();
  if (move_mode === "new") {
    if (!new_owner_first_name) {
      errors.new_owner_first_name = "Enter the new owner's first name.";
    }
    if (new_owner_first_name.length > 80) {
      errors.new_owner_first_name = "That name is too long.";
    }
    if (new_owner_last_name.length > 80) {
      errors.new_owner_last_name = "That name is too long.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (move_mode === "new") {
    return {
      ok: true,
      value: {
        pet_id,
        from_client_id,
        move_mode: "new",
        to_client_id: null,
        newOwner: {
          first_name: new_owner_first_name,
          last_name: new_owner_last_name || null,
          phone: new_owner_phone,
        },
      },
    };
  }
  return {
    ok: true,
    value: { pet_id, from_client_id, move_mode: "existing", to_client_id },
  };
}

export function buildMovePetOwnerUpdates(
  move: ValidatedMovePetOwner & { to_client_id: string },
) {
  return {
    petUpdate: { client_id: move.to_client_id },
    appointmentUpdate: { client_id: move.to_client_id },
    rollbackPetUpdate: { client_id: move.from_client_id },
    rollbackAppointmentUpdate: { client_id: move.from_client_id },
  };
}

export function buildNewOwnerClientInsert(
  move: Extract<ValidatedMovePetOwner, { move_mode: "new" }>,
) {
  return {
    first_name: move.newOwner.first_name,
    last_name: move.newOwner.last_name,
    phone: move.newOwner.phone,
    notes: "Created while moving a dog to the correct owner.",
  };
}

export function searchMoveOwnerTargets(query: string, clients: Client[]): Client[] {
  const byId = new Map(clients.map((client) => [client.id, client]));
  const households: SearchHousehold[] = clients.map((client) => ({
    id: client.id,
    firstName: client.first_name,
    lastName: client.last_name ?? "",
    phone: client.phone,
    pets: [],
  }));

  return searchHouseholds(query, households)
    .map((result) => byId.get(result.household.id))
    .filter((client): client is Client => Boolean(client));
}
