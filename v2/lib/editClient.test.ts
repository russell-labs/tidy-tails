import { describe, expect, it } from "vitest";
import { buildEditClientUpdate, validateEditClient } from "./editClient";

const valid = {
  client_id: "client-1",
  first_name: "Mary",
  last_name: "Anca",
  phone: "705-330-1807",
  alt_contact: "",
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
});
