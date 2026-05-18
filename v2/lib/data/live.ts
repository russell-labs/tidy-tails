// Pure mapping layer for the live Supabase read path.
//
// Live Supabase rows are shaped by the v1 schema, which differs from the v2
// domain types in `types.ts`:
//   - appointments carry `service_type` (an enum code) and `fee` — not
//     `service` / `price`;
//   - pets carry `standard_fee` — not `typical_fee`.
//
// The Ship 2.1 scaffold read `service` / `price` directly, so live mode
// silently produced blank services and $0 prices. These mappers translate the
// live row shape to the domain types. They are pure — no I/O, no Supabase
// client — so the row-shaping contract is unit-tested with synthetic rows
// (live.test.ts). The Supabase wiring lives in repo.ts.

import type { Appointment, Client, Pet } from "./types";

export type Row = Record<string, unknown>;

const str = (v: unknown): string =>
  typeof v === "string" ? v : v == null ? "" : String(v);

const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;

// Postgres `numeric` can serialize as a number or a string depending on the
// PostgREST config — accept both, reject anything non-finite.
const numOrNull = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

// appointments.service_type is a CHECK-constrained enum code. Sam sees a label.
const SERVICE_LABELS: Record<string, string> = {
  full_groom: "Full groom",
  bath_only: "Bath only",
  nail_trim: "Nail trim",
  other: "Other",
};

/**
 * Turn a live `service_type` enum code into a user-facing label, or null when
 * the row has no service. An unrecognized code passes through unchanged rather
 * than being dropped — better to show a raw code than to lose the fact.
 */
export function serviceLabel(code: unknown): string | null {
  if (typeof code !== "string" || code === "") return null;
  return SERVICE_LABELS[code] ?? code;
}

export function mapClientRow(r: Row): Client {
  return {
    id: str(r.id),
    first_name: str(r.first_name),
    last_name: str(r.last_name),
    phone: str(r.phone),
    alt_contact: strOrNull(r.alt_contact),
    email: strOrNull(r.email),
    address: strOrNull(r.address),
    notes: strOrNull(r.notes),
    created_at: str(r.created_at),
  };
}

export function mapPetRow(r: Row): Pet {
  return {
    id: str(r.id),
    client_id: str(r.client_id),
    name: str(r.name),
    breed: strOrNull(r.breed),
    color: strOrNull(r.color),
    sex: r.sex === "M" || r.sex === "F" ? r.sex : null,
    // The live `pets` table has no date_of_birth column (it stores `age` as
    // free text) — a v2 schema addition, null on live reads.
    date_of_birth: strOrNull(r.date_of_birth),
    allergies: r.allergies === true,
    allergies_detail: strOrNull(r.allergies_detail),
    grooming_notes: strOrNull(r.grooming_notes),
    typical_fee: numOrNull(r.standard_fee), // live column is `standard_fee`
    created_at: str(r.created_at),
  };
}

export function mapAppointmentRow(r: Row): Appointment {
  return {
    id: str(r.id),
    client_id: str(r.client_id),
    pet_id: str(r.pet_id),
    date: str(r.date).slice(0, 10),
    service: serviceLabel(r.service_type), // live column is `service_type`
    price: numOrNull(r.fee), // live column is `fee`
    tip: numOrNull(r.tip),
    notes: strOrNull(r.notes),
    created_at: str(r.created_at),
  };
}

/**
 * Fetch every row of a table by paging through fixed-size ranges.
 *
 * A single PostgREST select is capped (Supabase default: 1000 rows), so a
 * table larger than the cap silently truncates. This pages until a page comes
 * back shorter than `pageSize`. When the row count is an exact multiple of
 * `pageSize` it costs one trailing empty request — correct, not wrong.
 *
 * `fetchPage(from, to)` fetches one inclusive range. It is injected so the
 * paging contract can be tested with a synthetic fetcher — no Supabase client.
 */
export async function fetchAllRows(
  fetchPage: (from: number, to: number) => Promise<Row[]>,
  pageSize = 1000,
): Promise<Row[]> {
  if (pageSize < 1) throw new Error("fetchAllRows: pageSize must be >= 1");
  const all: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}
