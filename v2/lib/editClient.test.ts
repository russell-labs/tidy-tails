import { describe, expect, it } from "vitest";
import { formatAltContact } from "./altContact";
import { buildEditClientUpdate, validateEditClient } from "./editClient";

const valid = {
  client_id: "client-1",
  first_name: "Mary",
  last_name: "Anca",
  phone: "705-330-1807",
  secondary_contact_name: "",
  secondary_cell: "",
  landline: "",
  email: "",
  address: "123 Main St",
  notes: "Prefers texts.",
};

describe("validateEditClient", () => {
  it("normalizes editable household details", () => {
    const result = validateEditClient(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      client_id: "client-1",
      first_name: "Mary",
      last_name: "Anca",
      phone: "705-330-1807",
      alt_contact: null,
      email: null,
      address: "123 Main St",
      notes: "Prefers texts.",
    });
  });

  it("recombines the three contact fields into alt_contact via the shared formatter", () => {
    const result = validateEditClient({
      ...valid,
      secondary_contact_name: "Jane",
      secondary_cell: "416-555-0199",
      landline: "416-555-0200",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.alt_contact).toBe(
      formatAltContact({
        secondaryName: "Jane",
        secondaryCell: "416-555-0199",
        landline: "416-555-0200",
      }),
    );
    expect(result.value.alt_contact).toBe(
      "Secondary: Jane - 416-555-0199; Landline: 416-555-0200",
    );
  });

  it("validates the secondary cell and landline like intake (10 digits)", () => {
    const badCell = validateEditClient({ ...valid, secondary_cell: "555-0142" });
    expect(badCell.ok).toBe(false);
    if (badCell.ok) return;
    expect(badCell.errors.secondary_cell).toBeTruthy();

    const badLandline = validateEditClient({ ...valid, landline: "12345" });
    expect(badLandline.ok).toBe(false);
    if (badLandline.ok) return;
    expect(badLandline.errors.landline).toBeTruthy();
  });

  it("accepts a household with only a last name", () => {
    const result = validateEditClient({ ...valid, first_name: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.first_name).toBe("");
    expect(result.value.last_name).toBe("Anca");
  });

  it("requires client id, owner last name, and a usable phone", () => {
    const result = validateEditClient({
      ...valid,
      client_id: "",
      first_name: "",
      last_name: "",
      phone: "555-0142",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.client_id).toBeTruthy();
    expect(result.errors.last_name).toBeTruthy();
    expect(result.errors.phone).toBeTruthy();
  });

  it("rejects malformed email", () => {
    const result = validateEditClient({ ...valid, email: "mary" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.email).toBeTruthy();
  });
});

describe("buildEditClientUpdate", () => {
  it("builds the live clients update payload", () => {
    const result = validateEditClient(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildEditClientUpdate(result.value)).toEqual({
      first_name: "Mary",
      last_name: "Anca",
      phone: "705-330-1807",
      alt_contact: null,
      email: null,
      address: "123 Main St",
      notes: "Prefers texts.",
    });
  });

  it("writes the combined alt_contact to the clients update", () => {
    const result = validateEditClient({
      ...valid,
      secondary_contact_name: "Jane",
      secondary_cell: "416-555-0199",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildEditClientUpdate(result.value).alt_contact).toBe(
      "Secondary: Jane - 416-555-0199",
    );
  });
});
