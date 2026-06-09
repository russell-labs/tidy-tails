// Shared formatting for the `clients.alt_contact` text column.
//
// The clients table has no secondary_contact_name / secondary_cell columns; the
// three structured "other contact" fields are packed into the single alt_contact
// text column. `formatAltContact` is the canonical writer (used by both the
// create/intake flow and the edit flow, so both produce byte-identical strings);
// `parseAltContact` is its inverse, used to pre-fill the edit form from a stored
// value. There is no schema change here — this is purely how the column's string
// is shaped.
//
// Format produced by formatAltContact (parts joined by "; "):
//   "Secondary: <name> - <cell>"   when both name and cell
//   "Secondary: <name>"            when name only
//   "Secondary cell: <cell>"       when cell only
//   "Landline: <x>"                appended when a landline is present
//   null                           when all three are empty

export type AltContactFields = {
  secondaryName: string | null;
  secondaryCell: string | null;
  landline: string | null;
};

export function formatAltContact({
  secondaryName,
  secondaryCell,
  landline,
}: AltContactFields): string | null {
  const parts: string[] = [];
  if (secondaryName && secondaryCell) {
    parts.push(`Secondary: ${secondaryName} - ${secondaryCell}`);
  } else if (secondaryName) {
    parts.push(`Secondary: ${secondaryName}`);
  } else if (secondaryCell) {
    parts.push(`Secondary cell: ${secondaryCell}`);
  }
  if (landline) parts.push(`Landline: ${landline}`);
  return parts.length > 0 ? parts.join("; ") : null;
}

const SECONDARY_PREFIX = "Secondary: ";
const SECONDARY_CELL_PREFIX = "Secondary cell: ";
const LANDLINE_PREFIX = "Landline: ";

// Inverse of formatAltContact. Reverses a value produced by formatAltContact
// back into the three fields, so the edit form can pre-fill them. A create →
// edit (no change) → save round-trip therefore leaves alt_contact byte-identical.
//
// Lossless fallback: a value that is NOT in the formatAltContact shape (a legacy
// row or a hand-typed note) is returned whole in `secondaryName` — never
// dropped — so the operator sees it and can restructure it. The cell phone in
// "Secondary: name - cell" carries no surrounding " - " (only intra-number
// hyphens), so splitting on the last " - " separates name from cell safely.
export function parseAltContact(
  value: string | null | undefined,
): AltContactFields {
  const empty: AltContactFields = {
    secondaryName: null,
    secondaryCell: null,
    landline: null,
  };
  const trimmed = (value ?? "").trim();
  if (!trimmed) return empty;

  const result: AltContactFields = { ...empty };
  for (const part of trimmed.split("; ")) {
    if (part.startsWith(SECONDARY_PREFIX)) {
      const rest = part.slice(SECONDARY_PREFIX.length);
      const sep = rest.lastIndexOf(" - ");
      if (sep >= 0) {
        result.secondaryName = rest.slice(0, sep);
        result.secondaryCell = rest.slice(sep + 3);
      } else {
        result.secondaryName = rest;
      }
    } else if (part.startsWith(SECONDARY_CELL_PREFIX)) {
      result.secondaryCell = part.slice(SECONDARY_CELL_PREFIX.length);
    } else if (part.startsWith(LANDLINE_PREFIX)) {
      result.landline = part.slice(LANDLINE_PREFIX.length);
    } else {
      // Unrecognized shape: keep the whole original value, lossless.
      return { secondaryName: trimmed, secondaryCell: null, landline: null };
    }
  }
  return result;
}
