import { describe, expect, it } from "vitest";
import {
  formatAltContact,
  parseAltContact,
  type AltContactFields,
} from "./altContact";

const COMBOS: { label: string; fields: AltContactFields; formatted: string | null }[] = [
  {
    label: "name + cell + landline",
    fields: { secondaryName: "Jane", secondaryCell: "416-555-0199", landline: "416-555-0200" },
    formatted: "Secondary: Jane - 416-555-0199; Landline: 416-555-0200",
  },
  {
    label: "name only",
    fields: { secondaryName: "Jane", secondaryCell: null, landline: null },
    formatted: "Secondary: Jane",
  },
  {
    label: "cell only",
    fields: { secondaryName: null, secondaryCell: "416-555-0199", landline: null },
    formatted: "Secondary cell: 416-555-0199",
  },
  {
    label: "landline only",
    fields: { secondaryName: null, secondaryCell: null, landline: "416-555-0200" },
    formatted: "Landline: 416-555-0200",
  },
  {
    label: "name + landline (no cell)",
    fields: { secondaryName: "Jane", secondaryCell: null, landline: "416-555-0200" },
    formatted: "Secondary: Jane; Landline: 416-555-0200",
  },
  {
    label: "cell + landline (no name)",
    fields: { secondaryName: null, secondaryCell: "416-555-0199", landline: "416-555-0200" },
    formatted: "Secondary cell: 416-555-0199; Landline: 416-555-0200",
  },
  {
    label: "none",
    fields: { secondaryName: null, secondaryCell: null, landline: null },
    formatted: null,
  },
];

describe("formatAltContact", () => {
  for (const { label, fields, formatted } of COMBOS) {
    it(`formats ${label}`, () => {
      expect(formatAltContact(fields)).toBe(formatted);
    });
  }
});

describe("parseAltContact ↔ formatAltContact round-trips", () => {
  for (const { label, fields, formatted } of COMBOS) {
    it(`parse(format()) recovers the fields for ${label}`, () => {
      expect(parseAltContact(formatAltContact(fields))).toEqual(fields);
    });

    it(`format(parse()) leaves the stored string unchanged for ${label}`, () => {
      expect(formatAltContact(parseAltContact(formatted))).toBe(formatted);
    });
  }
});

describe("parseAltContact empty input", () => {
  it("returns all-null for null, undefined, and blank", () => {
    const allNull = { secondaryName: null, secondaryCell: null, landline: null };
    expect(parseAltContact(null)).toEqual(allNull);
    expect(parseAltContact(undefined)).toEqual(allNull);
    expect(parseAltContact("   ")).toEqual(allNull);
  });
});

describe("parseAltContact lossless fallback", () => {
  it("returns an unparseable legacy value whole in secondaryName", () => {
    const legacy = "her sister Pat, call after 5pm";
    expect(parseAltContact(legacy)).toEqual({
      secondaryName: legacy,
      secondaryCell: null,
      landline: null,
    });
  });

  it("does not drop a value that is partly unrecognized", () => {
    const result = parseAltContact("Landline: 416-555-0200; freeform tail");
    // Any unrecognized part falls back to keeping the whole value, never dropping.
    expect(result.secondaryName).toBe("Landline: 416-555-0200; freeform tail");
    expect(result.secondaryCell).toBeNull();
    expect(result.landline).toBeNull();
  });

  it("keeps a hyphenated secondary name intact", () => {
    const formatted = formatAltContact({
      secondaryName: "Anne-Marie",
      secondaryCell: "416-555-0199",
      landline: null,
    });
    expect(parseAltContact(formatted)).toEqual({
      secondaryName: "Anne-Marie",
      secondaryCell: "416-555-0199",
      landline: null,
    });
  });
});
