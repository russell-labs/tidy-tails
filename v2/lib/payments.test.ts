import { describe, expect, it } from "vitest";
import {
  allocatePaidTotalAcrossAppointments,
  paymentSummaryForAppointments,
  normalizePaymentMethod,
  parsePaymentInfo,
  paymentLabel,
  paymentPillForAppointments,
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

  it("summarizes payment pills across grouped appointments", () => {
    expect(
      paymentPillForAppointments([
        { notes: "[payment:cash; payment_status:paid]" },
        { notes: "[payment:interac; payment_status:paid]" },
      ]),
    ).toEqual({ status: "paid", label: "Paid" });
    expect(
      paymentPillForAppointments([
        { notes: "[payment:cash; payment_status:paid]" },
        { notes: "[payment:cash; payment_status:waiting]" },
      ]),
    ).toEqual({ status: "waiting", label: "Waiting payment" });
    expect(
      paymentPillForAppointments([
        { notes: "[payment:cash; payment_status:paid]" },
        { notes: null },
      ]),
    ).toEqual({ status: "partial", label: "Partial payment" });
    expect(paymentPillForAppointments([{ notes: null }])).toBeNull();
  });

  it("summarizes groom fee, paid total, and tip for the schedule bubble", () => {
    expect(
      paymentSummaryForAppointments([
        {
          price: 60,
          tip: 10,
          notes: "[payment:cash; payment_status:paid]",
        },
        {
          price: 55,
          tip: null,
          notes: "[payment:cash; payment_status:paid]",
        },
      ]),
    ).toEqual({
      fee: 115,
      paid: 125,
      tip: 10,
      isPaid: true,
    });

    expect(
      paymentSummaryForAppointments([
        { price: 60, tip: null, notes: "[payment:cash; payment_status:waiting]" },
      ]),
    ).toEqual({
      fee: 60,
      paid: null,
      tip: null,
      isPaid: false,
    });
  });

  it("derives tip and net from one paid total for grouped household appointments", () => {
    expect(
      allocatePaidTotalAcrossAppointments(
        [
          { id: "milo", price: 70 },
          { id: "chloe", price: 55 },
        ],
        140,
      ),
    ).toEqual({
      ok: true,
      updates: [
        { id: "milo", tip: 15, net: 85 },
        { id: "chloe", tip: 0, net: 55 },
      ],
    });

    expect(
      allocatePaidTotalAcrossAppointments([{ id: "milo", price: 70 }], 60),
    ).toEqual({
      ok: false,
      message: "Paid amount cannot be less than the groom fee.",
    });
  });
});
