import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICE_TYPES } from "./booking";

// TT-019 — the regression guard for the bug that blocked Puppy-groom bookings.
//
// `SERVICE_TYPES` (the values the booking form submits) MUST be a subset of the
// service_type CHECK constraint the live schema enforces. They had drifted:
// the app offered "Puppy groom" (`puppy_groom`) but the baseline CHECK on
// `appointments` / `booking_requests` never listed it, so every such insert was
// rejected with the generic "could not be saved" banner.
//
// This reads the committed migrations (the source of truth for the live schema)
// and asserts the EFFECTIVE constraint — the last definition wins — allows every
// app service type. Pure + no DB, so it runs in the normal unit suite and would
// have caught the original drift.

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");

function effectiveAllowedServiceTypes(table: string): string[] {
  const sql = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"))
    .join("\n");

  const re = new RegExp(
    `${table}_service_type_check[\\s\\S]*?array\\[([^\\]]*)\\]`,
    "gi",
  );
  let lastArray: string | null = null;
  for (const match of sql.matchAll(re)) lastArray = match[1];
  if (lastArray === null) {
    throw new Error(`No ${table}_service_type_check found in migrations`);
  }
  return Array.from(lastArray.matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

describe("TT-019 — DB service_type CHECK must allow every app SERVICE_TYPE", () => {
  for (const table of ["appointments", "booking_requests"]) {
    it(`${table}_service_type_check covers all SERVICE_TYPES (no app↔schema drift)`, () => {
      const allowed = effectiveAllowedServiceTypes(table);
      for (const serviceType of SERVICE_TYPES) {
        expect(allowed).toContain(serviceType);
      }
    });
  }
});
