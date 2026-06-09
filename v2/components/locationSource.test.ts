import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

// WS4a clarification 1: the location source is strategy-gated. Sam's batched
// booking picker keeps the hardcoded BOOKING_LOCATIONS; only the one_to_one
// picker reads the org's onboarding locations. Pin both ends so a future change
// can't silently swap Sam's picker.

describe("location source is strategy-gated", () => {
  const addAppointment = readFileSync("components/AddAppointment.tsx", "utf8");
  const oneToOne = readFileSync("components/OneToOneAddAppointment.tsx", "utf8");

  it("Sam's batched picker still uses the hardcoded BOOKING_LOCATIONS", () => {
    expect(addAppointment).toContain("BOOKING_LOCATIONS");
    // Sam's picker must NOT pull from per-org settings locations.
    expect(addAppointment).not.toContain("orgSettings.locations");
    expect(addAppointment).not.toContain("OrgLocation");
  });

  it("the 1:1 picker reads the org's locations, not the hardcoded two", () => {
    expect(oneToOne).toContain("locations");
    expect(oneToOne).toContain("OrgLocation");
    expect(oneToOne).not.toContain("BOOKING_LOCATIONS");
  });
});
