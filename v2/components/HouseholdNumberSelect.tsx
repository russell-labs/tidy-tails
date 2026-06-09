"use client";

// TT-007 — pick which household number a text goes to. Renders a dropdown of the
// household's numbers: the primary cell, the secondary cell, and the landline
// (shown but DISABLED — it can't receive texts). The server re-validates the
// choice on send, so this is convenience, not the security boundary.
//
// Callers should only render this when `householdHasNumberChoice(client)` is
// true; a single-number household keeps the plain "To … · <phone>" line it had
// before.

import type { Client } from "@/lib/data/types";
import { formatPhone } from "@/lib/format";
import {
  householdNumberOptions,
  textableHouseholdNumbers,
} from "@/lib/householdNumbers";

type HouseholdLike = Pick<Client, "phone" | "alt_contact">;

/** True when the household has more than one number on file — i.e. a choice. */
export function householdHasNumberChoice(client: HouseholdLike): boolean {
  return householdNumberOptions(client).length > 1;
}

/** The default send number for a household — its primary (first textable) cell. */
export function defaultHouseholdNumber(client: HouseholdLike): string {
  return textableHouseholdNumbers(client)[0]?.value ?? (client.phone ?? "").trim();
}

export function HouseholdNumberSelect({
  client,
  value,
  onChange,
  label = "Send this text to",
}: {
  client: HouseholdLike;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const options = householdNumberOptions(client);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-soft">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      >
        {options.map((option) => (
          <option
            key={`${option.kind}-${option.value}`}
            value={option.value}
            disabled={!option.textable}
          >
            {option.label} · {formatPhone(option.value)}
          </option>
        ))}
      </select>
    </label>
  );
}
