import { describe, expect, it } from "vitest";
import {
  buildReadyPickupMessage,
  renderReadyPickupTemplate,
  validateReadyPickupInput,
} from "./readyPickup";

describe("ready pickup messages", () => {
  it("renders a normal pickup message without first-platform wording", () => {
    const message = buildReadyPickupMessage({
      ownerFirstName: "Mary",
      petName: "Kiwi",
      template:
        "Hi [first name], [pet name] is ready to be picked up from Tidy Tails. — Samantha",
    });

    expect(message).toBe(
      "Hi Mary, Kiwi is ready to be picked up from Tidy Tails. — Samantha",
    );
    expect(message).not.toMatch(/new number|new Tidy Tails system/i);
  });

  it("falls back to a useful default", () => {
    expect(
      buildReadyPickupMessage({ ownerFirstName: "", petName: "" }),
    ).toBe("Hi there, your dog is ready to be picked up. — Samantha");
  });

  it("replaces placeholders in custom templates", () => {
    expect(
      renderReadyPickupTemplate("[first name] / [pet name]", {
        ownerFirstName: "Sam",
        petName: "Milo",
      }),
    ).toBe("Sam / Milo");
  });

  it("validates phone and message before any send action can run", () => {
    expect(
      validateReadyPickupInput({
        phone: "705-555-0101",
        message: "Ready!",
      }),
    ).toEqual({
      ok: true,
      value: { phone: "705-555-0101", message: "Ready!" },
    });

    const invalid = validateReadyPickupInput({ phone: "555", message: " " });
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.errors.phone).toBeTruthy();
    expect(invalid.errors.message).toBeTruthy();
  });
});
