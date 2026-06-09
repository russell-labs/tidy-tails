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

describe("EditClient structured contact fields (TT-003 parity with Add)", () => {
  const source = readFileSync("components/EditClient.tsx", "utf8");

  it("renders the same three structured contact fields as Add household", () => {
    expect(source).toContain('label="Secondary contact name (optional)"');
    expect(source).toContain('label="Secondary cell (optional)"');
    expect(source).toContain('label="Landline (optional)"');
    // The old single freeform field is gone.
    expect(source).not.toContain('label="Alternate contact"');
  });

  it("submits the three fields (recombined into alt_contact server-side)", () => {
    expect(source).toContain('name="secondary_contact_name"');
    expect(source).toContain('name="secondary_cell"');
    expect(source).toContain('name="landline"');
    expect(source).not.toContain('name="alt_contact"');
  });

  it("pre-fills the fields from the stored alt_contact via parseAltContact", () => {
    expect(source).toContain("parseAltContact(client.alt_contact)");
    expect(source).toContain("initialAlt.secondaryName");
    expect(source).toContain("initialAlt.secondaryCell");
    expect(source).toContain("initialAlt.landline");
  });

  it("echoes the secondary contact fields on the review step (parity with Add)", () => {
    expect(source).toContain('ReviewRow label="Secondary"');
    expect(source).toContain('ReviewRow label="Secondary cell"');
    expect(source).toContain('ReviewRow label="Landline"');
  });
});
