const PAYOUT_OVERRIDE_MARKER =
  /\s*\[salon_payout:(\d+(?:\.\d{1,2})?)\]\s*/i;

export function parseSalonPayoutOverride(
  notes: string | null | undefined,
): number | null {
  const match = (notes ?? "").match(PAYOUT_OVERRIDE_MARKER);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

export function stripSalonPayoutOverride(
  notes: string | null | undefined,
): string | null {
  const stripped = (notes ?? "")
    .replace(PAYOUT_OVERRIDE_MARKER, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped === "" ? null : stripped;
}

export function withSalonPayoutOverride(
  notes: string | null | undefined,
  percent: number | null,
): string | null {
  const cleanNotes = stripSalonPayoutOverride(notes);
  if (percent == null) return cleanNotes;
  const marker = `[salon_payout:${percent}]`;
  return cleanNotes ? `${cleanNotes} ${marker}` : marker;
}

export function validateSalonPayoutOverrideInput(
  raw: string | null | undefined,
): { ok: true; value: number | null } | { ok: false; message: string } {
  const value = (raw ?? "").trim();
  if (!value) return { ok: true, value: null };
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return {
      ok: false,
      message: "Salon payout override must be a percent from 0 to 100.",
    };
  }
  return { ok: true, value: Math.round(percent * 100) / 100 };
}
