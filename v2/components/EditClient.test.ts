import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("EditClient owner editing copy", () => {
  it("makes owner name editing explicit on the household sheet", () => {
    const source = readFileSync("components/EditClient.tsx", "utf8");

    expect(source).toContain("Edit household / owner");
    expect(source).toContain('Field label="Owner first name (optional)"');
    expect(source).toContain('Field label="Owner last name"');
    expect(source).toContain('ReviewRow label="Owner"');
  });
});
