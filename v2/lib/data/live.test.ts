import { describe, it, expect } from "vitest";
import type { Row } from "./live";
import {
  fetchAllRows,
  mapAppointmentRow,
  mapClientRow,
  mapPetRow,
  serviceLabel,
} from "./live";

// Synthetic rows only — shaped like the live v1 Supabase schema, never a real
// dump. The point of these tests is the row-shaping contract: column names and
// null handling, the exact place the Ship 2.1 scaffold silently got wrong.

describe("serviceLabel — service_type enum → user-facing label", () => {
  it("maps each known enum code to a label", () => {
    expect(serviceLabel("full_groom")).toBe("Full groom");
    expect(serviceLabel("bath_only")).toBe("Bath only");
    expect(serviceLabel("nail_trim")).toBe("Nail trim");
    expect(serviceLabel("other")).toBe("Other");
  });

  it("returns null for a missing or empty service_type", () => {
    expect(serviceLabel(null)).toBeNull();
    expect(serviceLabel(undefined)).toBeNull();
    expect(serviceLabel("")).toBeNull();
  });

  it("passes an unrecognized code through unchanged rather than dropping it", () => {
    expect(serviceLabel("de_shed")).toBe("de_shed");
  });
});

describe("mapClientRow — live clients row → Client", () => {
  it("maps every field of a fully populated row", () => {
    const row: Row = {
      id: "c-1",
      first_name: "Marisol",
      last_name: "Park",
      phone: "705-555-0133",
      alt_contact: "705-555-9000",
      email: "marisol@example.com",
      address: "12 Maple St",
      notes: "Prefers mornings",
      created_at: "2025-01-02T10:00:00Z",
    };
    expect(mapClientRow(row)).toEqual({
      id: "c-1",
      first_name: "Marisol",
      last_name: "Park",
      phone: "705-555-0133",
      alt_contact: "705-555-9000",
      email: "marisol@example.com",
      address: "12 Maple St",
      notes: "Prefers mornings",
      created_at: "2025-01-02T10:00:00Z",
    });
  });

  it("yields empty strings for missing required fields and null for missing optionals", () => {
    expect(mapClientRow({})).toEqual({
      id: "",
      first_name: "",
      last_name: "",
      phone: "",
      alt_contact: null,
      email: null,
      address: null,
      notes: null,
      created_at: "",
    });
  });

  it("carries the live `address` column onto Client.address", () => {
    expect(mapClientRow({ address: "12 Maple St" }).address).toBe("12 Maple St");
  });

  it("maps a missing or empty address to null", () => {
    expect(mapClientRow({}).address).toBeNull();
    expect(mapClientRow({ address: "" }).address).toBeNull();
  });
});

describe("mapPetRow — live pets row → Pet", () => {
  it("maps the live `standard_fee` column onto typical_fee", () => {
    const row: Row = { id: "p-1", client_id: "c-1", name: "Bella", standard_fee: 56 };
    expect(mapPetRow(row).typical_fee).toBe(56);
  });

  it("coerces allergies to a strict boolean", () => {
    expect(mapPetRow({ allergies: true }).allergies).toBe(true);
    expect(mapPetRow({ allergies: false }).allergies).toBe(false);
    expect(mapPetRow({}).allergies).toBe(false);
  });

  it("leaves v2-only columns absent from the live schema as null", () => {
    // The live `pets` table has no date_of_birth and no typical_fee column.
    const pet = mapPetRow({ id: "p-1", client_id: "c-1", name: "Bella" });
    expect(pet.date_of_birth).toBeNull();
    expect(pet.typical_fee).toBeNull();
  });

  it("accepts only M/F for sex and nulls anything else", () => {
    expect(mapPetRow({ sex: "M" }).sex).toBe("M");
    expect(mapPetRow({ sex: "F" }).sex).toBe("F");
    expect(mapPetRow({ sex: "male" }).sex).toBeNull();
    expect(mapPetRow({}).sex).toBeNull();
  });
});

describe("mapAppointmentRow — live appointments row → Appointment", () => {
  it("maps service_type to a label, fee to price, and tip to tip", () => {
    const row: Row = {
      id: "a-1",
      client_id: "c-1",
      pet_id: "p-1",
      date: "2026-04-10",
      time_slot: "10:30am",
      service_type: "full_groom",
      fee: 80,
      tip: 15,
    };
    const appt = mapAppointmentRow(row);
    expect(appt.service).toBe("Full groom");
    expect(appt.time_slot).toBe("10:30am");
    expect(appt.price).toBe(80);
    expect(appt.tip).toBe(15);
  });

  it("reads a numeric fee returned as a string", () => {
    // Postgres `numeric` can serialize as a string; the mapper must parse it.
    expect(mapAppointmentRow({ fee: "85.50" }).price).toBe(85.5);
  });

  it("maps a null service_type to a null service (e.g. backfilled rows)", () => {
    expect(mapAppointmentRow({ service_type: null }).service).toBeNull();
  });

  it("maps a null fee to a null price — never to $0", () => {
    expect(mapAppointmentRow({ fee: null }).price).toBeNull();
  });

  it("maps a null tip to null — never to $0", () => {
    expect(mapAppointmentRow({ tip: null }).tip).toBeNull();
  });

  it("maps a null time_slot to null", () => {
    expect(mapAppointmentRow({ time_slot: null }).time_slot).toBeNull();
  });

  it("trims a timestamp date down to an ISO date", () => {
    expect(mapAppointmentRow({ date: "2026-04-10T14:30:00Z" }).date).toBe(
      "2026-04-10",
    );
  });
});

describe("fetchAllRows — range pagination past the PostgREST row cap", () => {
  // Synthetic fetcher over an in-memory array; records the ranges requested.
  function pagedFetcher(rowCount: number) {
    const rows: Row[] = Array.from({ length: rowCount }, (_, i) => ({ id: `r${i}` }));
    const calls: Array<[number, number]> = [];
    const fetchPage = async (from: number, to: number): Promise<Row[]> => {
      calls.push([from, to]);
      return rows.slice(from, to + 1);
    };
    return { fetchPage, calls };
  }

  it("returns every row from a single short page", async () => {
    const { fetchPage, calls } = pagedFetcher(3);
    const rows = await fetchAllRows(fetchPage, 10);
    expect(rows).toHaveLength(3);
    expect(calls).toEqual([[0, 9]]);
  });

  it("stitches multiple pages together in order", async () => {
    const { fetchPage, calls } = pagedFetcher(5);
    const rows = await fetchAllRows(fetchPage, 2);
    expect(rows.map((r) => r.id)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
    expect(calls).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it("makes one trailing empty request when the count is an exact multiple", async () => {
    const { fetchPage, calls } = pagedFetcher(4);
    const rows = await fetchAllRows(fetchPage, 2);
    expect(rows).toHaveLength(4);
    expect(calls).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it("returns an empty array for an empty table", async () => {
    const { fetchPage, calls } = pagedFetcher(0);
    expect(await fetchAllRows(fetchPage, 100)).toEqual([]);
    expect(calls).toEqual([[0, 99]]);
  });
});
