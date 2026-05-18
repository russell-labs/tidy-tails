export const OPERATOR_SETTINGS_COOKIE = "tt_operator_settings_v1";

export const LAPSED_THRESHOLD_OPTIONS = [60, 90, 120, 180] as const;

export type LapsedThresholdDays = (typeof LAPSED_THRESHOLD_OPTIONS)[number];

export type OperatorSettings = {
  appointmentReminderTemplate: string;
  rebookReminderTemplate: string;
  lapsedThresholdDays: LapsedThresholdDays;
};

export const DEFAULT_OPERATOR_SETTINGS: OperatorSettings = {
  appointmentReminderTemplate:
    "Hi [first name], reminder that [pet name] is booked with Tidy Tails on [date]. See you soon! — Samantha",
  rebookReminderTemplate:
    "Hi [first name], it's been a little while since [pet name]'s last visit. Would you like to book in for a groom? — Samantha",
  lapsedThresholdDays: 90,
};

export const TEMPLATE_MAX_LENGTH = 1000;

function isLapsedThreshold(value: number): value is LapsedThresholdDays {
  return LAPSED_THRESHOLD_OPTIONS.includes(value as LapsedThresholdDays);
}

function normalizeTemplate(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, TEMPLATE_MAX_LENGTH);
}

export function normalizeOperatorSettings(raw: {
  appointmentReminderTemplate?: unknown;
  rebookReminderTemplate?: unknown;
  lapsedThresholdDays?: unknown;
}): OperatorSettings {
  const threshold = Number(raw.lapsedThresholdDays);
  return {
    appointmentReminderTemplate: normalizeTemplate(
      raw.appointmentReminderTemplate,
      DEFAULT_OPERATOR_SETTINGS.appointmentReminderTemplate,
    ),
    rebookReminderTemplate: normalizeTemplate(
      raw.rebookReminderTemplate,
      DEFAULT_OPERATOR_SETTINGS.rebookReminderTemplate,
    ),
    lapsedThresholdDays: isLapsedThreshold(threshold)
      ? threshold
      : DEFAULT_OPERATOR_SETTINGS.lapsedThresholdDays,
  };
}

export function parseOperatorSettings(raw: string | undefined): OperatorSettings {
  if (!raw) return DEFAULT_OPERATOR_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_OPERATOR_SETTINGS;
    return normalizeOperatorSettings(parsed);
  } catch {
    return DEFAULT_OPERATOR_SETTINGS;
  }
}

export function serializeOperatorSettings(settings: OperatorSettings): string {
  return JSON.stringify(normalizeOperatorSettings(settings));
}

export function operatorSettingsFromForm(formData: FormData): OperatorSettings {
  return normalizeOperatorSettings({
    appointmentReminderTemplate: formData.get("appointmentReminderTemplate"),
    rebookReminderTemplate: formData.get("rebookReminderTemplate"),
    lapsedThresholdDays: Number(formData.get("lapsedThresholdDays")),
  });
}
