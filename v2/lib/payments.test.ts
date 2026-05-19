import { describe, expect, it } from "vitest";
import {
  normalizePaymentMethod,
  parsePaymentInfo,
  paymentLabel,
  stripPaymentInfo,
  withPaymentInfo,
} from "./payments";

describe("payment note metadata", () => {
  it("appends structured payment metadata without losing human notes", () => {
    expect(
      withPaymentInfo("Trimmed short", {
        method: "cash",
        status: "paid",
      }),
    ).toBe("Trimmed short [payment:cash; payment_status:paid]");
  });

  it("replaces an existing marker instead of duplicating it", () => {
    expect(
      withPaymentInfo("Trimmed short [payment:cash; payment_status:paid]", {
        method: "interac",
        status: "paid",
      }),
    ).toBe("Trimmed short [payment:interac; payment_status:paid]");
  });

  it("parses paid cash, paid interac, and waiting payments", () => {
    expect(parsePaymentInfo("[payment:cash; payment_status:paid]")).toEqual({
      method: "cash",
      status: "paid",
    });
    expect(parsePaymentInfo("[payment:interac; payment_status:paid]")).toEqual({
      method: "interac",
      status: "paid",
    });
    expect(parsePaymentInfo("[payment:other; payment_status:waiting]")).toEqual({
      method: "other",
      status: "waiting",
    });
  });

  it("understands legacy payment notes from the old Excel-style data", () => {
    expect(parsePaymentInfo("payment:debit; breed:Cavachon")).toEqual({
      method: "interac",
      status: "paid",
    });
  });

  it("strips only the app-owned marker", () => {
    expect(
      stripPaymentInfo("Trimmed short [payment:cash; payment_status:paid]"),
    ).toBe("Trimmed short");
  });

  it("normalizes common Interac/e-transfer spellings", () => {
    expect(normalizePaymentMethod("debit")).toBe("interac");
    expect(normalizePaymentMethod("e-transfer")).toBe("interac");
    expect(normalizePaymentMethod("etransfer")).toBe("interac");
  });

  it("builds operator-facing labels", () => {
    expect(paymentLabel({ method: "cash", status: "paid" })).toBe("Paid - Cash");
    expect(paymentLabel({ method: "interac", status: "paid" })).toBe("Paid - Interac");
    expect(paymentLabel({ method: "cash", status: "waiting" })).toBe(
      "Waiting on payment",
    );
    expect(paymentLabel({ method: null, status: null })).toBe("Not recorded");
  });
});
