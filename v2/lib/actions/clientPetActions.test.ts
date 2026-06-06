import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appointment,
  client,
  clientRecord,
  createSupabaseHarness,
  form,
  pet,
} from "./actionTestSupport";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/audit.server", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/data/repo", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/data/repo")>("@/lib/data/repo");
  return {
    ...actual,
    getClientRecord: vi.fn(),
    loadDataset: vi.fn(),
    requireOrgId: vi.fn(async () => "org-1"),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { editClient } from "./editClient";
import { editPet } from "./editPet";
import { saveIntake } from "./intake";
import { movePetOwner } from "./movePetOwner";
import { addPet } from "./pets";
import {
  deletePetProfile,
  markPetPassedAway,
  mergeDuplicatePetProfiles,
} from "./petLifecycle";
import { getClientRecord, loadDataset } from "@/lib/data/repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

const supabase = createSupabaseHarness();
const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const getClientRecordMock = vi.mocked(getClientRecord);
const loadDatasetMock = vi.mocked(loadDataset);

function expectNoWrites(): void {
  expect(createServerSupabaseMock).not.toHaveBeenCalled();
  expect(supabase.operations).toEqual([]);
}

function validClientForm(overrides: Record<string, string> = {}): FormData {
  return form({
    client_id: "client-1",
    first_name: "Mary",
    last_name: "Jones",
    phone: "705-555-0101",
    alt_contact: "Text first",
    email: "mary@example.com",
    address: "10 Main Street",
    notes: "Prefers mornings",
    ...overrides,
  });
}

function validAddPetForm(overrides: Record<string, string> = {}): FormData {
  return form({
    client_id: "client-1",
    name: "Maple",
    breed: "Poodle",
    size: "medium",
    allergy_state: "yes",
    allergies_detail: "Chicken",
    grooming_notes: "Teddy bear face",
    typical_fee: "82.50",
    ...overrides,
  });
}

function validEditPetForm(overrides: Record<string, string> = {}): FormData {
  return form({
    client_id: "client-1",
    pet_id: "pet-1",
    name: "Kiwi",
    breed: "Terrier mix",
    size: "small",
    color: "Black",
    date_of_birth: "2021-04-03",
    allergy_state: "no",
    allergies_detail: "",
    grooming_notes: "Use blue bow",
    typical_fee: "75",
    ...overrides,
  });
}

function validIntakeForm(overrides: Record<string, string> = {}): FormData {
  return form({
    first_name: "Sam",
    last_name: "Customer",
    phone: "705-555-0111",
    secondary_contact_name: "Pat",
    secondary_cell: "705-555-0112",
    landline: "",
    email: "sam.customer@example.com",
    address: "22 Lake Road",
    notes: "Referral from Mary",
    pet_name: "Roo",
    breed: "Corgi",
    size: "medium",
    allergy_state: "no",
    allergies_detail: "",
    vaccination_state: "yes",
    vaccination_detail: "Rabies current",
    age: "",
    date_of_birth: "2022-02-02",
    grooming_notes: "Nervous dryer",
    typical_fee: "68",
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  supabase.reset();
  vi.stubEnv("NEXT_PUBLIC_USE_LIVE_DATA", "on");

  createServerSupabaseMock.mockResolvedValue(
    supabase.client as unknown as Awaited<ReturnType<typeof createServerSupabase>>,
  );
  getCurrentUserMock.mockResolvedValue({
    id: "operator-1",
  } as Awaited<ReturnType<typeof getCurrentUser>>);
  getClientRecordMock.mockResolvedValue(clientRecord());
  loadDatasetMock.mockResolvedValue({
    clients: [client(), client({ id: "client-2", first_name: "Alex", last_name: "Lee" })],
    pets: [pet()],
    appointments: [],
    vaccinations: [],
  });
});

describe("editClient", () => {
  it("submits the expected household update payload when the gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_CLIENT_WRITE", "on");

    const result = await editClient({ status: "idle" }, validClientForm());

    expect(result).toMatchObject({
      status: "saved",
      summary: { ownerName: "Mary Jones", phone: "705-555-0101" },
    });
    expect(supabase.operations).toEqual([
      {
        table: "clients",
        action: "update",
        payload: {
          first_name: "Mary",
          last_name: "Jones",
          phone: "705-555-0101",
          alt_contact: "Text first",
          email: "mary@example.com",
          address: "10 Main Street",
          notes: "Prefers mornings",
        },
        filters: [{ method: "eq", column: "id", value: "client-1" }],
        orders: [],
      },
    ]);
  });

  it("returns gated and writes nothing when the edit-client gate is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_CLIENT_WRITE", "true");

    const result = await editClient({ status: "idle" }, validClientForm());

    expect(result).toMatchObject({ status: "gated" });
    expectNoWrites();
  });

  it("returns an auth error and writes nothing without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await editClient({ status: "idle" }, validClientForm());

    expect(result).toEqual({
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("returns field errors and writes nothing for invalid household input", async () => {
    const result = await editClient(
      { status: "idle" },
      validClientForm({
        client_id: "",
        last_name: "",
        phone: "bad",
        email: "not-email",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      errors: {
        client_id: expect.any(String),
        last_name: expect.any(String),
        phone: expect.any(String),
        email: expect.any(String),
      },
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe("addPet", () => {
  it("inserts the expected pet payload when the add-pet gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_ADD_PET_WRITE", "on");

    const result = await addPet({ status: "idle" }, validAddPetForm());

    expect(result).toMatchObject({
      status: "saved",
      summary: { petName: "Maple", typicalFee: 82.5 },
    });
    expect(supabase.operations).toEqual([
      {
        table: "pets",
        action: "insert",
        payload: {
          client_id: "client-1",
          name: "Maple",
          breed: "Poodle",
          size: "medium",
          allergies: true,
          allergies_detail: "Chicken",
          grooming_notes: "Teddy bear face",
          standard_fee: 82.5,
          org_id: "org-1",
        },
        filters: [],
        orders: [],
      },
    ]);
  });

  it("returns gated and writes nothing when the add-pet gate is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_ADD_PET_WRITE", "yes");

    const result = await addPet({ status: "idle" }, validAddPetForm());

    expect(result).toMatchObject({ status: "gated" });
    expectNoWrites();
  });

  it("returns an auth error and writes nothing without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await addPet({ status: "idle" }, validAddPetForm());

    expect(result).toEqual({
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("returns field errors and writes nothing for invalid pet input", async () => {
    const result = await addPet(
      { status: "idle" },
      validAddPetForm({
        client_id: "",
        name: "",
        size: "tiny",
        allergy_state: "maybe",
        typical_fee: "-1",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      errors: {
        client_id: expect.any(String),
        name: expect.any(String),
        size: expect.any(String),
        allergy_state: expect.any(String),
        typical_fee: expect.any(String),
      },
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe("editPet", () => {
  it("updates the expected pet payload when the edit-pet gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_PET_WRITE", "on");

    const result = await editPet({ status: "idle" }, validEditPetForm());

    expect(result).toMatchObject({
      status: "saved",
      summary: { petName: "Kiwi", typicalFee: 75 },
    });
    expect(supabase.operations).toEqual([
      {
        table: "pets",
        action: "update",
        payload: {
          name: "Kiwi",
          breed: "Terrier mix",
          size: "small",
          color: "Black",
          age: "2021-04-03",
          allergies: false,
          allergies_detail: null,
          grooming_notes: "Use blue bow",
          standard_fee: 75,
        },
        filters: [
          { method: "eq", column: "id", value: "pet-1" },
          { method: "eq", column: "client_id", value: "client-1" },
        ],
        orders: [],
      },
    ]);
  });

  it("returns gated and writes nothing when the edit-pet gate is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_PET_WRITE", "1");

    const result = await editPet({ status: "idle" }, validEditPetForm());

    expect(result).toMatchObject({ status: "gated" });
    expectNoWrites();
  });

  it("returns an auth error and writes nothing without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await editPet({ status: "idle" }, validEditPetForm());

    expect(result).toEqual({
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("returns field errors and writes nothing for invalid pet edit input", async () => {
    const result = await editPet(
      { status: "idle" },
      validEditPetForm({
        client_id: "",
        pet_id: "",
        name: "",
        size: "huge",
        date_of_birth: "yesterday",
        allergy_state: "maybe",
        typical_fee: "-5",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      errors: {
        client_id: expect.any(String),
        pet_id: expect.any(String),
        name: expect.any(String),
        size: expect.any(String),
        date_of_birth: expect.any(String),
        allergy_state: expect.any(String),
        typical_fee: expect.any(String),
      },
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe("saveIntake", () => {
  it("inserts a household and pet payload when the add-household gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_ADD_HOUSEHOLD_WRITE", "on");
    supabase.queueResult({ data: { id: "new-client-1" }, error: null });

    const result = await saveIntake({ status: "idle" }, validIntakeForm());

    expect(result).toMatchObject({
      status: "saved",
      summary: {
        ownerName: "Sam Customer",
        petNames: ["Roo"],
        typicalFee: 68,
      },
    });
    expect(supabase.operations).toEqual([
      {
        table: "clients",
        action: "insert",
        payload: {
          first_name: "Sam",
          last_name: "Customer",
          phone: "705-555-0111",
          alt_contact: "Secondary: Pat - 705-555-0112",
          email: "sam.customer@example.com",
          address: "22 Lake Road",
          notes: "Referral from Mary",
          sms_consent: false,
          sms_consent_at: null,
          org_id: "org-1",
        },
        filters: [],
        orders: [],
        select: "id",
      },
      {
        table: "pets",
        action: "insert",
        payload: [
          {
            client_id: "new-client-1",
            name: "Roo",
            breed: "Corgi",
            size: "medium",
            allergies: false,
            allergies_detail: null,
            age: "2022-02-02",
            grooming_notes: "Vaccinations: Yes - Rabies current\nNervous dryer",
            standard_fee: 68,
            org_id: "org-1",
          },
        ],
        filters: [],
        orders: [],
      },
    ]);
  });

  it("returns gated and writes nothing when the add-household gate is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_ADD_HOUSEHOLD_WRITE", "on ");

    const result = await saveIntake({ status: "idle" }, validIntakeForm());

    expect(result).toMatchObject({ status: "gated" });
    expectNoWrites();
  });

  it("records SMS consent on the new client when the consent box is ticked", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_ADD_HOUSEHOLD_WRITE", "on");
    supabase.queueResult({ data: { id: "new-client-1" }, error: null });

    await saveIntake({ status: "idle" }, validIntakeForm({ sms_consent: "on" }));

    const clientsInsert = supabase.operations.find(
      (op) => op.table === "clients" && op.action === "insert",
    );
    expect(clientsInsert?.payload).toMatchObject({ sms_consent: true });
    expect(
      (clientsInsert?.payload as { sms_consent_at?: unknown }).sms_consent_at,
    ).toEqual(expect.any(String));
  });

  it("returns an auth error and writes nothing without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await saveIntake({ status: "idle" }, validIntakeForm());

    expect(result).toEqual({
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    });
    expectNoWrites();
  });

  it("returns field errors and writes nothing for invalid intake input", async () => {
    const result = await saveIntake(
      { status: "idle" },
      validIntakeForm({
        last_name: "",
        phone: "bad",
        pet_name: "",
        allergy_state: "maybe",
        vaccination_state: "maybe",
        typical_fee: "-2",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      errors: {
        last_name: expect.any(String),
        phone: expect.any(String),
        pet_name: expect.any(String),
        allergy_state: expect.any(String),
        vaccination_state: expect.any(String),
        typical_fee: expect.any(String),
      },
    });
    expectNoWrites();
  });
});

describe("movePetOwner", () => {
  it("updates pet and appointment ownership when the edit-pet gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_PET_WRITE", "on");
    loadDatasetMock.mockResolvedValue({
      clients: [
        client({ id: "client-1", first_name: "Mary", last_name: "Jones" }),
        client({ id: "client-2", first_name: "Alex", last_name: "Lee" }),
      ],
      pets: [pet({ id: "pet-1", client_id: "client-1", name: "Kiwi" })],
      appointments: [appointment({ id: "appt-1", client_id: "client-1" })],
      vaccinations: [],
    });

    const result = await movePetOwner(
      { status: "idle" },
      form({
        pet_id: "pet-1",
        from_client_id: "client-1",
        move_mode: "existing",
        to_client_id: "client-2",
      }),
    );

    expect(result).toMatchObject({
      status: "saved",
      summary: {
        fromOwnerName: "Mary Jones",
        toOwnerName: "Alex Lee",
      },
    });
    expect(supabase.operations).toEqual([
      {
        table: "pets",
        action: "update",
        payload: { client_id: "client-2" },
        filters: [
          { method: "eq", column: "id", value: "pet-1" },
          { method: "eq", column: "client_id", value: "client-1" },
        ],
        orders: [],
      },
      {
        table: "appointments",
        action: "update",
        payload: { client_id: "client-2" },
        filters: [
          { method: "eq", column: "pet_id", value: "pet-1" },
          { method: "eq", column: "client_id", value: "client-1" },
        ],
        orders: [],
      },
    ]);
  });

  it("returns gated and writes nothing when the edit-pet gate is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_PET_WRITE", "true");

    const result = await movePetOwner(
      { status: "idle" },
      form({
        pet_id: "pet-1",
        from_client_id: "client-1",
        move_mode: "existing",
        to_client_id: "client-2",
      }),
    );

    expect(result).toMatchObject({ status: "gated" });
    expectNoWrites();
  });

  it("returns an auth error and writes nothing without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await movePetOwner(
      { status: "idle" },
      form({
        pet_id: "pet-1",
        from_client_id: "client-1",
        move_mode: "existing",
        to_client_id: "client-2",
      }),
    );

    expect(result).toEqual({
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    });
    expect(loadDatasetMock).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("returns field errors and writes nothing for invalid owner move input", async () => {
    const result = await movePetOwner(
      { status: "idle" },
      form({
        pet_id: "",
        from_client_id: "",
        move_mode: "existing",
        to_client_id: "",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      errors: {
        pet_id: expect.any(String),
        from_client_id: expect.any(String),
        to_client_id: expect.any(String),
      },
    });
    expect(loadDatasetMock).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe("markPetPassedAway", () => {
  it("stores the passed-away marker when the edit-pet gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_PET_WRITE", "on");
    getClientRecordMock.mockResolvedValue(
      clientRecord({
        pets: [pet({ grooming_notes: "Loved treats" })],
      }),
    );

    const result = await markPetPassedAway(
      { status: "idle" },
      form({ client_id: "client-1", pet_id: "pet-1" }),
    );

    expect(result).toMatchObject({ status: "saved" });
    expect(supabase.operations).toEqual([
      {
        table: "pets",
        action: "update",
        payload: {
          grooming_notes: "[Tidy Tails: passed away]\n\nLoved treats",
        },
        filters: [
          { method: "eq", column: "id", value: "pet-1" },
          { method: "eq", column: "client_id", value: "client-1" },
        ],
        orders: [],
      },
    ]);
  });

  it("returns gated and writes nothing when the edit-pet gate is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_PET_WRITE", "on ");

    const result = await markPetPassedAway(
      { status: "idle" },
      form({ client_id: "client-1", pet_id: "pet-1" }),
    );

    expect(result).toMatchObject({ status: "gated" });
    expectNoWrites();
  });

  it("returns an auth error and writes nothing without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await markPetPassedAway(
      { status: "idle" },
      form({ client_id: "client-1", pet_id: "pet-1" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Your session ended. Sign in again.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("returns validation feedback and writes nothing when ids are missing", async () => {
    const result = await markPetPassedAway(
      { status: "idle" },
      form({ client_id: "", pet_id: "" }),
    );

    expect(result).toEqual({ status: "error", message: "That pet could not be found." });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe("deletePetProfile", () => {
  it("deletes a pet without appointment history when the edit-pet gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_PET_WRITE", "on");
    getClientRecordMock.mockResolvedValue(clientRecord({ appointments: [] }));

    const result = await deletePetProfile(
      { status: "idle" },
      form({ client_id: "client-1", pet_id: "pet-1" }),
    );

    expect(result).toMatchObject({ status: "deleted" });
    expect(supabase.operations).toEqual([
      {
        table: "pets",
        action: "delete",
        filters: [
          { method: "eq", column: "id", value: "pet-1" },
          { method: "eq", column: "client_id", value: "client-1" },
        ],
        orders: [],
      },
    ]);
  });

  it("returns gated and writes nothing when the edit-pet gate is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_PET_WRITE", "false");
    getClientRecordMock.mockResolvedValue(clientRecord({ appointments: [] }));

    const result = await deletePetProfile(
      { status: "idle" },
      form({ client_id: "client-1", pet_id: "pet-1" }),
    );

    expect(result).toMatchObject({ status: "gated" });
    expectNoWrites();
  });

  it("returns an auth error and writes nothing without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await deletePetProfile(
      { status: "idle" },
      form({ client_id: "client-1", pet_id: "pet-1" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Your session ended. Sign in again.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("returns validation feedback and writes nothing when ids are missing", async () => {
    const result = await deletePetProfile(
      { status: "idle" },
      form({ client_id: "", pet_id: "" }),
    );

    expect(result).toEqual({ status: "error", message: "That pet could not be found." });
    expectNoWrites();
  });
});

describe("mergeDuplicatePetProfiles", () => {
  it("updates keeper, moves appointments, and deletes duplicate when the edit-pet gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_PET_WRITE", "on");
    loadDatasetMock.mockResolvedValue({
      clients: [
        client({ id: "client-1", first_name: "Mary", last_name: "Jones" }),
        client({ id: "client-2", first_name: "Alex", last_name: "Lee" }),
      ],
      pets: [
        pet({ id: "pet-1", client_id: "client-1", name: "Kiwi", breed: null }),
        pet({
          id: "pet-2",
          client_id: "client-2",
          name: "Kiwi duplicate",
          breed: "Terrier",
          grooming_notes: "Duplicate notes",
          typical_fee: 80,
        }),
      ],
      appointments: [appointment({ id: "appt-2", client_id: "client-2", pet_id: "pet-2" })],
      vaccinations: [],
    });

    const result = await mergeDuplicatePetProfiles(
      { status: "idle" },
      form({
        client_id: "client-1",
        keep_pet_id: "pet-1",
        duplicate_pet_id: "pet-2",
      }),
    );

    expect(result).toMatchObject({
      status: "merged",
      summary: { movedAppointmentCount: 1 },
    });
    expect(supabase.operations).toEqual([
      {
        table: "pets",
        action: "update",
        payload: expect.objectContaining({
          name: "Kiwi",
          breed: "Terrier",
          standard_fee: 70,
          grooming_notes:
            "[Tidy Tails: Merged duplicate profile pet-2]\nDuplicate notes",
        }),
        filters: [
          { method: "eq", column: "id", value: "pet-1" },
          { method: "eq", column: "client_id", value: "client-1" },
        ],
        orders: [],
      },
      {
        table: "appointments",
        action: "update",
        payload: { client_id: "client-1", pet_id: "pet-1" },
        filters: [
          { method: "eq", column: "client_id", value: "client-2" },
          { method: "in", column: "id", value: ["appt-2"] },
        ],
        orders: [],
      },
      {
        table: "pets",
        action: "delete",
        filters: [
          { method: "eq", column: "id", value: "pet-2" },
          { method: "eq", column: "client_id", value: "client-2" },
        ],
        orders: [],
      },
    ]);
  });

  it("returns gated and writes nothing when the edit-pet gate is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_PET_WRITE", "no");
    loadDatasetMock.mockResolvedValue({
      clients: [client({ id: "client-1" }), client({ id: "client-2" })],
      pets: [
        pet({ id: "pet-1", client_id: "client-1" }),
        pet({ id: "pet-2", client_id: "client-2" }),
      ],
      appointments: [],
      vaccinations: [],
    });

    const result = await mergeDuplicatePetProfiles(
      { status: "idle" },
      form({
        client_id: "client-1",
        keep_pet_id: "pet-1",
        duplicate_pet_id: "pet-2",
      }),
    );

    expect(result).toMatchObject({ status: "gated" });
    expectNoWrites();
  });

  it("returns an auth error and writes nothing without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await mergeDuplicatePetProfiles(
      { status: "idle" },
      form({
        client_id: "client-1",
        keep_pet_id: "pet-1",
        duplicate_pet_id: "pet-2",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Your session ended. Sign in again.",
    });
    expect(loadDatasetMock).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("returns validation feedback and writes nothing when ids are missing", async () => {
    const result = await mergeDuplicatePetProfiles(
      { status: "idle" },
      form({
        client_id: "",
        keep_pet_id: "",
        duplicate_pet_id: "",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Choose the duplicate pet profile to merge.",
    });
    expect(loadDatasetMock).not.toHaveBeenCalled();
    expectNoWrites();
  });
});
