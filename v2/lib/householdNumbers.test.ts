import { describe, expect, it } from "vitest";
import {
  householdNumberOptions,
  resolveHouseholdSendNumber,
} from "./householdNumbers";

// A minimal Client-shaped record — only the two fields the helper reads.
function client(phone: string, altContact: string | null = null) {
  return { phone, alt_contact: altContact };
}

describe("householdNumberOptions", () => {
  it("returns just the primary cell when there is no alt contact", () => {
    const options = householdNumberOptions(client("705-555-0100"));
    expect(options).toEqual([
      {
        kind: "primary",
        value: "705-555-0100",
        label: "Primary cell",
        textable: true,
      },
    ]);
  });

  it("adds the secondary cell parsed from alt_contact", () => {
    const options = householdNumberOptions(
      client("705-555-0100", "Secondary: Jamie - 705-555-0200"),
    );
    expect(options).toEqual([
      {
        kind: "primary",
        value: "705-555-0100",
        label: "Primary cell",
        textable: true,
      },
      {
        kind: "secondary",
        value: "705-555-0200",
        label: "Secondary cell",
        textable: true,
      },
    ]);
  });

  it("shows the landline but marks it not textable", () => {
    const options = householdNumberOptions(
      client("705-555-0100", "Landline: 705-555-0300"),
    );
    expect(options).toContainEqual({
      kind: "landline",
      value: "705-555-0300",
      label: "Landline — can't receive texts",
      textable: false,
    });
  });

  it("lists primary, secondary cell, and landline together", () => {
    const options = householdNumberOptions(
      client(
        "705-555-0100",
        "Secondary: Jamie - 705-555-0200; Landline: 705-555-0300",
      ),
    );
    expect(options.map((o) => o.kind)).toEqual([
      "primary",
      "secondary",
      "landline",
    ]);
    expect(options.find((o) => o.kind === "landline")?.textable).toBe(false);
  });

  it("does not duplicate the secondary cell when it equals the primary", () => {
    const options = householdNumberOptions(
      client("705-555-0100", "Secondary: Jamie - (705) 555-0100"),
    );
    expect(options).toHaveLength(1);
    expect(options[0].kind).toBe("primary");
  });

  it("keeps a legacy / unparseable alt_contact from becoming a phantom number", () => {
    // parseAltContact returns such a value as secondaryName, never as a cell.
    const options = householdNumberOptions(
      client("705-555-0100", "ask for the husband at the front desk"),
    );
    expect(options).toHaveLength(1);
    expect(options[0].kind).toBe("primary");
  });

  it("marks a non-textable primary number as not textable", () => {
    const options = householdNumberOptions(client("not-a-number"));
    expect(options[0].textable).toBe(false);
  });
});

describe("resolveHouseholdSendNumber", () => {
  it("defaults to the primary cell when nothing is chosen", () => {
    const result = resolveHouseholdSendNumber(client("705-555-0100"), null);
    expect(result).toEqual({ ok: true, value: "705-555-0100" });
  });

  it("defaults to the primary cell when an empty choice is submitted", () => {
    const result = resolveHouseholdSendNumber(client("705-555-0100"), "   ");
    expect(result).toEqual({ ok: true, value: "705-555-0100" });
  });

  it("accepts the secondary cell when it is the household's number", () => {
    const result = resolveHouseholdSendNumber(
      client("705-555-0100", "Secondary: Jamie - 705-555-0200"),
      "705-555-0200",
    );
    expect(result).toEqual({ ok: true, value: "705-555-0200" });
  });

  it("matches regardless of formatting of the submitted number", () => {
    const result = resolveHouseholdSendNumber(
      client("705-555-0100", "Secondary: Jamie - 705-555-0200"),
      "(705) 555-0200",
    );
    expect(result).toEqual({ ok: true, value: "705-555-0200" });
  });

  it("rejects the landline even though it is on the household", () => {
    const result = resolveHouseholdSendNumber(
      client("705-555-0100", "Landline: 705-555-0300"),
      "705-555-0300",
    );
    expect(result).toEqual({ ok: false, reason: "not_textable" });
  });

  it("rejects a number that does not belong to the household", () => {
    const result = resolveHouseholdSendNumber(
      client("705-555-0100", "Secondary: Jamie - 705-555-0200"),
      "705-555-9999",
    );
    expect(result).toEqual({ ok: false, reason: "not_in_household" });
  });
});
