import { vi } from "vitest";
import type { Appointment, Client, ClientRecord, Pet } from "@/lib/data/types";

type SupabaseError = { message: string } | null;

export type SupabaseResult = {
  data?: unknown;
  error: SupabaseError;
};

export type SupabaseOperation = {
  table: string;
  action: "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  options?: unknown;
  filters: Array<{
    method: "eq" | "in" | "gte" | "not" | "contains";
    column: string;
    value: unknown;
  }>;
  select?: string;
  orders: Array<{ column: string; options?: unknown }>;
  limit?: number;
};

type QueryBuilder = PromiseLike<SupabaseResult> & {
  contains: (column: string, value: unknown) => QueryBuilder;
  delete: () => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  gte: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, value: unknown[]) => QueryBuilder;
  insert: (payload: unknown) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  maybeSingle: () => Promise<SupabaseResult>;
  not: (column: string, operator: string, value: unknown) => QueryBuilder;
  order: (column: string, options?: unknown) => QueryBuilder;
  select: (columns?: string) => QueryBuilder;
  single: () => Promise<SupabaseResult>;
  update: (payload: unknown) => QueryBuilder;
  upsert: (payload: unknown, options?: unknown) => QueryBuilder;
};

export type SupabaseTestClient = {
  auth: {
    getUser: ReturnType<typeof vi.fn>;
    signInWithOAuth: ReturnType<typeof vi.fn>;
    signInWithPassword: ReturnType<typeof vi.fn>;
    signUp: ReturnType<typeof vi.fn>;
    resetPasswordForEmail: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
};

export type SupabaseHarness = {
  client: SupabaseTestClient;
  operations: SupabaseOperation[];
  queueResult: (result: SupabaseResult) => void;
  reset: () => void;
};

function defaultResult(): SupabaseResult {
  return { data: null, error: null };
}

export function createSupabaseHarness(): SupabaseHarness {
  const operations: SupabaseOperation[] = [];
  let queuedResults: SupabaseResult[] = [];

  function nextResult(): SupabaseResult {
    return queuedResults.shift() ?? defaultResult();
  }

  function makeQueryBuilder(table: string): QueryBuilder {
    const operation = {
      table,
      filters: [],
      orders: [],
    } as Omit<SupabaseOperation, "action"> &
      Partial<Pick<SupabaseOperation, "action">>;

    const builder: QueryBuilder = {
      contains: (column, value) => {
        operation.filters.push({ method: "contains", column, value });
        return builder;
      },
      delete: () => {
        operation.action = "delete";
        operations.push(operation as SupabaseOperation);
        return builder;
      },
      eq: (column, value) => {
        operation.filters.push({ method: "eq", column, value });
        return builder;
      },
      gte: (column, value) => {
        operation.filters.push({ method: "gte", column, value });
        return builder;
      },
      in: (column, value) => {
        operation.filters.push({ method: "in", column, value });
        return builder;
      },
      insert: (payload) => {
        operation.action = "insert";
        operation.payload = payload;
        operations.push(operation as SupabaseOperation);
        return builder;
      },
      limit: (count) => {
        operation.limit = count;
        return builder;
      },
      maybeSingle: async () => nextResult(),
      not: (column, operator, value) => {
        operation.filters.push({ method: "not", column, value: { operator, value } });
        return builder;
      },
      order: (column, options) => {
        operation.orders.push({ column, options });
        return builder;
      },
      select: (columns = "*") => {
        operation.select = columns;
        return builder;
      },
      single: async () => nextResult(),
      then: (onFulfilled, onRejected) =>
        Promise.resolve(nextResult()).then(onFulfilled, onRejected),
      update: (payload) => {
        operation.action = "update";
        operation.payload = payload;
        operations.push(operation as SupabaseOperation);
        return builder;
      },
      upsert: (payload, options) => {
        operation.action = "upsert";
        operation.payload = payload;
        operation.options = options;
        operations.push(operation as SupabaseOperation);
        return builder;
      },
    };
    return builder;
  }

  const client: SupabaseTestClient = {
    auth: {
      getUser: vi.fn(),
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => makeQueryBuilder(table)),
  };

  return {
    client,
    operations,
    queueResult: (result) => {
      queuedResults.push(result);
    },
    reset: () => {
      operations.length = 0;
      queuedResults = [];
      client.from.mockClear();
      client.auth.getUser.mockReset();
      client.auth.signInWithOAuth.mockReset();
      client.auth.signInWithPassword.mockReset();
      client.auth.signUp.mockReset();
      client.auth.resetPasswordForEmail.mockReset();
      client.auth.updateUser.mockReset();
      client.auth.signOut.mockReset();
    },
  };
}

export function form(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

export function isoDate(offsetDays = 0): string {
  const today = new Date();
  const date = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays),
  );
  return date.toISOString().slice(0, 10);
}

export function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    first_name: "Mary",
    last_name: "Jones",
    phone: "7055550100",
    alt_contact: null,
    email: "mary@example.com",
    address: "10 Main Street",
    notes: null,
    sms_consent: false,
    sms_consent_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function pet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: "pet-1",
    client_id: "client-1",
    name: "Kiwi",
    breed: "Terrier",
    size: "small",
    color: "Black",
    age: null,
    sex: "F",
    date_of_birth: null,
    allergies: false,
    allergies_detail: null,
    grooming_notes: null,
    typical_fee: 70,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appt-1",
    client_id: "client-1",
    pet_id: "pet-1",
    date: isoDate(14),
    time_slot: "10:30am",
    service: "Full groom",
    price: 70,
    tip: null,
    notes: null,
    status: "booked",
    location: "gina",
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function clientRecord(
  overrides: {
    client?: Partial<Client>;
    pets?: Pet[];
    appointments?: Appointment[];
  } = {},
): ClientRecord {
  const recordClient = client(overrides.client);
  return {
    client: recordClient,
    pets: overrides.pets ?? [pet({ client_id: recordClient.id })],
    appointments: overrides.appointments ?? [appointment({ client_id: recordClient.id })],
  };
}

export function smsRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sms-1",
    groomer_id: "operator-1",
    client_id: "client-1",
    direction: "inbound",
    from_phone: "+17055550100",
    to_phone: "+17055550199",
    body: "Can we move Kiwi?",
    twilio_message_sid: "SM-inbound",
    status: "received",
    match_status: "matched",
    received_at: "2026-06-01T12:00:00.000Z",
    sent_at: null,
    created_at: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}
