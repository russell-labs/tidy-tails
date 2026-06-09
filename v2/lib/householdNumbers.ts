// TT-007 — the textable numbers on a household, and the server-authoritative
// resolver for "which number does this text go to".
//
// A household keeps its primary cell in `clients.phone`; a secondary cell and a
// landline are packed into the `clients.alt_contact` text column (see
// `parseAltContact` in ./altContact). This module turns those into a small list
// of pickable options for the send UIs, and validates an operator's choice on
// the server so a crafted POST can never text a number that isn't on file — or
// the landline, which can't receive texts.
//
// CLIENT-SAFE: imports only ./altContact and ./format. It must NOT import
// ./twilio, which pulls in node:crypto and would drag server-only code into the
// client bundle. The 10/11-digit textable rule below is a deliberate local copy
// of `toTwilioPhone`'s rule; the authoritative send still runs the chosen value
// back through `toTwilioPhone` in the server action.

import type { Client } from "./data/types";
import { parseAltContact } from "./altContact";
import { digitsOnly } from "./format";

export type HouseholdNumberKind = "primary" | "secondary" | "landline";

export type HouseholdNumberOption = {
  kind: HouseholdNumberKind;
  /** The phone string exactly as stored on the household. */
  value: string;
  /** Short label for the picker. */
  label: string;
  /** A Twilio-textable mobile. Landlines and unparseable numbers are false. */
  textable: boolean;
};

type HouseholdLike = Pick<Client, "phone" | "alt_contact">;

// Mirror of toTwilioPhone's rule (lib/twilio.ts), kept client-safe. Returns a
// canonical `+1XXXXXXXXXX` string for matching/textability, or null when the
// digits can't form a North-American mobile number.
function normalizeTextable(raw: string | null | undefined): string | null {
  const digits = digitsOnly(raw ?? "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/**
 * The numbers on a household, in picker order: primary cell, then the secondary
 * cell (if one is on file), then the landline (shown but never textable).
 * Single-number households return a one-item list, so the send UIs can hide the
 * picker entirely and behave exactly as before.
 */
export function householdNumberOptions(
  client: HouseholdLike,
): HouseholdNumberOption[] {
  const options: HouseholdNumberOption[] = [];
  const seen = new Set<string>();

  const push = (option: HouseholdNumberOption) => {
    // De-dupe by canonical digits so a secondary cell that repeats the primary
    // (or its landline) doesn't show twice.
    const key = normalizeTextable(option.value) ?? digitsOnly(option.value);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    options.push(option);
  };

  const primary = (client.phone ?? "").trim();
  if (primary) {
    push({
      kind: "primary",
      value: primary,
      label: "Primary cell",
      textable: normalizeTextable(primary) != null,
    });
  }

  const { secondaryCell, landline } = parseAltContact(client.alt_contact);

  const secondary = (secondaryCell ?? "").trim();
  if (secondary) {
    push({
      kind: "secondary",
      value: secondary,
      label: "Secondary cell",
      textable: normalizeTextable(secondary) != null,
    });
  }

  const land = (landline ?? "").trim();
  if (land) {
    push({
      kind: "landline",
      value: land,
      label: "Landline — can't receive texts",
      textable: false,
    });
  }

  return options;
}

/** The selectable (textable) numbers — what a picker offers as real choices. */
export function textableHouseholdNumbers(
  client: HouseholdLike,
): HouseholdNumberOption[] {
  return householdNumberOptions(client).filter((option) => option.textable);
}

export type ResolvedSendNumber =
  | { ok: true; value: string }
  | { ok: false; reason: "not_in_household" | "not_textable" };

/**
 * Server-authoritative: given the freshly-fetched household record and the
 * operator's chosen number (from the form), return the number the text may be
 * sent to — or a rejection reason.
 *
 * - No choice (or blank) → the primary cell. Single-number households are
 *   therefore unchanged; the action keeps sending to `clients.phone`.
 * - A choice must match a number on file (any formatting) and be textable. The
 *   landline is rejected even though it's on the household, and a number that
 *   isn't on file at all is rejected — the client never decides the destination.
 */
export function resolveHouseholdSendNumber(
  client: HouseholdLike,
  chosen: string | null | undefined,
): ResolvedSendNumber {
  const requested = (chosen ?? "").trim();
  if (!requested) {
    // Default path — preserve today's behavior of texting the primary cell.
    return { ok: true, value: (client.phone ?? "").trim() };
  }

  const requestedNorm = normalizeTextable(requested);
  const match = householdNumberOptions(client).find((option) => {
    const optionNorm = normalizeTextable(option.value);
    return (
      optionNorm != null && requestedNorm != null && optionNorm === requestedNorm
    );
  });

  if (!match) return { ok: false, reason: "not_in_household" };
  if (!match.textable) return { ok: false, reason: "not_textable" };
  return { ok: true, value: match.value };
}
