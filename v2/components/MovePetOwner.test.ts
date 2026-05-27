import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("MovePetOwner", () => {
  it("offers a clear change-owner household flow", () => {
    const source = readFileSync("components/MovePetOwner.tsx", "utf8");

    expect(source).toContain("Change owner / household");
    expect(source).toContain('name="to_client_id"');
    expect(source).toContain("Search owner, phone, or household");
    expect(source).toContain("searchMoveOwnerTargets");
    expect(source).toContain('value="new"');
    expect(source).toContain('name="new_owner_first_name"');
    expect(source).toContain("Confirm move");
  });
});
