export const OPERATOR_SETTINGS_COOKIE = "tt_operator_settings_v1";

export const LAPSED_THRESHOLD_OPTIONS = [60, 90, 120, 180] as const;

export type LapsedThresholdDays = (typeof LAPSED_THRESHOLD_OPTIONS)[number];

export type OperatorSettings = {
  bookingConfirmationTemplate: string;
  firstPlatformTextTemplate: string;
  appointmentReminderTemplate: string;
  rebookReminderTemplate: string;
  readyPickupTemplate: string;
  lapsedThresholdDays: LapsedThresholdDays;
  scheduleCalibration: ScheduleCalibration;
  locationSettings: LocationSettingsMap;
};

export type LocationPayoutType = "percent" | "daily_rate";

export type LocationSettings = {
  displayName: string;
  customerAddress: string;
  payoutType: LocationPayoutType;
  salonKeepsPercent: number;
  dailyRate: number | null;
};

export type LocationSettingsMap = {
  gina: LocationSettings;
  annette: LocationSettings;
};

export type ScheduleCalibration = {
  normalDogCount: number;
  heavyDogCount: number;
  largeDogMax: number;
  targetLoadPoints: number;
  heavyLoadPoints: number;
  smallDogPoints: number;
  mediumDogPoints: number;
  largeDogPoints: number;
  xlDogPoints: number;
  fullGroomAdjustment: number;
  bathOnlyAdjustment: number;
  nailTrimAdjustment: number;
  styleAdjustment: number;
  longCoatAdjustment: number;
  straightShaveAdjustment: number;
  behaviorAdjustment: number;
  mattingAdjustment: number;
  specialHandlingNotes: string;
  warningLanguage: string;
  annetteLargeCrateLimit: number;
  ginaLargeCrateLimit: number;
};

export const DEFAULT_SCHEDULE_CALIBRATION: ScheduleCalibration = {
  normalDogCount: 4,
  heavyDogCount: 5,
  largeDogMax: 3,
  targetLoadPoints: 7.5,
  heavyLoadPoints: 6.25,
  smallDogPoints: 1.35,
  mediumDogPoints: 1.35,
  largeDogPoints: 2.15,
  xlDogPoints: 2.65,
  fullGroomAdjustment: 0.25,
  bathOnlyAdjustment: -0.2,
  nailTrimAdjustment: -0.85,
  styleAdjustment: 0.85,
  longCoatAdjustment: 0.65,
  straightShaveAdjustment: -0.35,
  behaviorAdjustment: 0.75,
  mattingAdjustment: 0.35,
  specialHandlingNotes:
    "Book special constraint dogs deliberately. Jackson Wicks cannot have other dogs in the shop, so he belongs at the end of the day.",
  warningLanguage:
    "Check details: dog count, large dogs, coat/style work, and handling notes.",
  annetteLargeCrateLimit: 2,
  ginaLargeCrateLimit: 4,
};

export const DEFAULT_LOCATION_SETTINGS: LocationSettingsMap = {
  gina: {
    displayName: "Tidy Tails (Gina)",
    customerAddress: "60 Olive Crescent, Orillia",
    payoutType: "percent",
    salonKeepsPercent: 30,
    dailyRate: null,
  },
  annette: {
    displayName: "Tidy Tails (Annette)",
    customerAddress: "290 Millard Street, Orillia",
    payoutType: "percent",
    salonKeepsPercent: 35,
    dailyRate: null,
  },
};

export const DEFAULT_OPERATOR_SETTINGS: OperatorSettings = {
  bookingConfirmationTemplate:
    "Hi [first name], booking confirmed for [pet name]: [service] on [date] at [time] at [location]. See you then! — [your name]",
  firstPlatformTextTemplate:
    "Hi [first name], it’s [your name] from Tidy Tails. I’m starting to send booking details through my new Tidy Tails system, so this message may come from a new number. Booking confirmed for [pet name]: [service] on [date] at [time] at [location]. See you then! — [your name]",
  appointmentReminderTemplate:
    "Hi [first name], reminder that [pet name] is booked with Tidy Tails on [date] at [time]. See you soon! — [your name]",
  rebookReminderTemplate:
    "Hi [first name], it's been a little while since [pet name]'s last visit. Would you like to book in for a groom? — [your name]",
  readyPickupTemplate:
    "Hi [first name], [pet name] is ready to be picked up. — [your name]",
  lapsedThresholdDays: 90,
  scheduleCalibration: DEFAULT_SCHEDULE_CALIBRATION,
  locationSettings: DEFAULT_LOCATION_SETTINGS,
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

function normalizeNumber(
  raw: unknown,
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

function normalizeText(raw: unknown, fallback: string, max = 240): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
}

function normalizePayoutType(raw: unknown): LocationPayoutType {
  return raw === "daily_rate" ? "daily_rate" : "percent";
}

function normalizeOptionalMoney(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function normalizeLocationSettingsEntry(
  raw: unknown,
  fallback: LocationSettings,
): LocationSettings {
  const source =
    raw && typeof raw === "object"
      ? (raw as Partial<Record<keyof LocationSettings, unknown>>)
      : {};
  const payoutType = normalizePayoutType(source.payoutType);
  return {
    displayName: normalizeText(source.displayName, fallback.displayName),
    customerAddress: normalizeText(source.customerAddress, fallback.customerAddress),
    payoutType,
    salonKeepsPercent: normalizeNumber(
      source.salonKeepsPercent,
      fallback.salonKeepsPercent,
      { min: 0, max: 100 },
    ),
    dailyRate: normalizeOptionalMoney(source.dailyRate) ?? fallback.dailyRate,
  };
}

export function normalizeLocationSettings(raw: unknown): LocationSettingsMap {
  const source =
    raw && typeof raw === "object"
      ? (raw as Partial<Record<keyof LocationSettingsMap, unknown>>)
      : {};
  return {
    gina: normalizeLocationSettingsEntry(
      source.gina,
      DEFAULT_LOCATION_SETTINGS.gina,
    ),
    annette: normalizeLocationSettingsEntry(
      source.annette,
      DEFAULT_LOCATION_SETTINGS.annette,
    ),
  };
}

export function normalizeScheduleCalibration(raw: unknown): ScheduleCalibration {
  const source =
    raw && typeof raw === "object"
      ? (raw as Partial<Record<keyof ScheduleCalibration, unknown>>)
      : {};
  return {
    normalDogCount: normalizeNumber(
      source.normalDogCount,
      DEFAULT_SCHEDULE_CALIBRATION.normalDogCount,
      { min: 1, max: 12 },
    ),
    heavyDogCount: normalizeNumber(
      source.heavyDogCount,
      DEFAULT_SCHEDULE_CALIBRATION.heavyDogCount,
      { min: 1, max: 14 },
    ),
    largeDogMax: normalizeNumber(
      source.largeDogMax,
      DEFAULT_SCHEDULE_CALIBRATION.largeDogMax,
      { min: 1, max: 8 },
    ),
    targetLoadPoints: normalizeNumber(
      source.targetLoadPoints,
      DEFAULT_SCHEDULE_CALIBRATION.targetLoadPoints,
      { min: 2, max: 20 },
    ),
    heavyLoadPoints: normalizeNumber(
      source.heavyLoadPoints,
      DEFAULT_SCHEDULE_CALIBRATION.heavyLoadPoints,
      { min: 1, max: 20 },
    ),
    smallDogPoints: normalizeNumber(
      source.smallDogPoints,
      DEFAULT_SCHEDULE_CALIBRATION.smallDogPoints,
      { min: 0.5, max: 5 },
    ),
    mediumDogPoints: normalizeNumber(
      source.mediumDogPoints,
      DEFAULT_SCHEDULE_CALIBRATION.mediumDogPoints,
      { min: 0.5, max: 5 },
    ),
    largeDogPoints: normalizeNumber(
      source.largeDogPoints,
      DEFAULT_SCHEDULE_CALIBRATION.largeDogPoints,
      { min: 0.5, max: 6 },
    ),
    xlDogPoints: normalizeNumber(
      source.xlDogPoints,
      DEFAULT_SCHEDULE_CALIBRATION.xlDogPoints,
      { min: 0.5, max: 8 },
    ),
    fullGroomAdjustment: normalizeNumber(
      source.fullGroomAdjustment,
      DEFAULT_SCHEDULE_CALIBRATION.fullGroomAdjustment,
      { min: -3, max: 5 },
    ),
    bathOnlyAdjustment: normalizeNumber(
      source.bathOnlyAdjustment,
      DEFAULT_SCHEDULE_CALIBRATION.bathOnlyAdjustment,
      { min: -3, max: 5 },
    ),
    nailTrimAdjustment: normalizeNumber(
      source.nailTrimAdjustment,
      DEFAULT_SCHEDULE_CALIBRATION.nailTrimAdjustment,
      { min: -5, max: 5 },
    ),
    styleAdjustment: normalizeNumber(
      source.styleAdjustment,
      DEFAULT_SCHEDULE_CALIBRATION.styleAdjustment,
      { min: 0, max: 5 },
    ),
    longCoatAdjustment: normalizeNumber(
      source.longCoatAdjustment,
      DEFAULT_SCHEDULE_CALIBRATION.longCoatAdjustment,
      { min: 0, max: 5 },
    ),
    straightShaveAdjustment: normalizeNumber(
      source.straightShaveAdjustment,
      DEFAULT_SCHEDULE_CALIBRATION.straightShaveAdjustment,
      { min: -5, max: 2 },
    ),
    behaviorAdjustment: normalizeNumber(
      source.behaviorAdjustment,
      DEFAULT_SCHEDULE_CALIBRATION.behaviorAdjustment,
      { min: 0, max: 6 },
    ),
    mattingAdjustment: normalizeNumber(
      source.mattingAdjustment,
      DEFAULT_SCHEDULE_CALIBRATION.mattingAdjustment,
      { min: 0, max: 5 },
    ),
    specialHandlingNotes: normalizeTemplate(
      source.specialHandlingNotes,
      DEFAULT_SCHEDULE_CALIBRATION.specialHandlingNotes,
    ),
    warningLanguage: normalizeTemplate(
      source.warningLanguage,
      DEFAULT_SCHEDULE_CALIBRATION.warningLanguage,
    ),
    annetteLargeCrateLimit: normalizeNumber(
      source.annetteLargeCrateLimit,
      DEFAULT_SCHEDULE_CALIBRATION.annetteLargeCrateLimit,
      { min: 1, max: 8 },
    ),
    ginaLargeCrateLimit: normalizeNumber(
      source.ginaLargeCrateLimit,
      DEFAULT_SCHEDULE_CALIBRATION.ginaLargeCrateLimit,
      { min: 1, max: 8 },
    ),
  };
}

export function normalizeOperatorSettings(raw: {
  bookingConfirmationTemplate?: unknown;
  firstPlatformTextTemplate?: unknown;
  appointmentReminderTemplate?: unknown;
  rebookReminderTemplate?: unknown;
  readyPickupTemplate?: unknown;
  lapsedThresholdDays?: unknown;
  scheduleCalibration?: unknown;
  locationSettings?: unknown;
}): OperatorSettings {
  const threshold = Number(raw.lapsedThresholdDays);
  return {
    bookingConfirmationTemplate: normalizeTemplate(
      raw.bookingConfirmationTemplate,
      DEFAULT_OPERATOR_SETTINGS.bookingConfirmationTemplate,
    ),
    firstPlatformTextTemplate: normalizeTemplate(
      raw.firstPlatformTextTemplate,
      DEFAULT_OPERATOR_SETTINGS.firstPlatformTextTemplate,
    ),
    appointmentReminderTemplate: normalizeTemplate(
      raw.appointmentReminderTemplate,
      DEFAULT_OPERATOR_SETTINGS.appointmentReminderTemplate,
    ),
    rebookReminderTemplate: normalizeTemplate(
      raw.rebookReminderTemplate,
      DEFAULT_OPERATOR_SETTINGS.rebookReminderTemplate,
    ),
    readyPickupTemplate: normalizeTemplate(
      raw.readyPickupTemplate,
      DEFAULT_OPERATOR_SETTINGS.readyPickupTemplate,
    ),
    lapsedThresholdDays: isLapsedThreshold(threshold)
      ? threshold
      : DEFAULT_OPERATOR_SETTINGS.lapsedThresholdDays,
    scheduleCalibration: normalizeScheduleCalibration(raw.scheduleCalibration),
    locationSettings: normalizeLocationSettings(raw.locationSettings),
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
    bookingConfirmationTemplate: formData.get("bookingConfirmationTemplate"),
    firstPlatformTextTemplate: formData.get("firstPlatformTextTemplate"),
    appointmentReminderTemplate: formData.get("appointmentReminderTemplate"),
    rebookReminderTemplate: formData.get("rebookReminderTemplate"),
    readyPickupTemplate: formData.get("readyPickupTemplate"),
    lapsedThresholdDays: Number(formData.get("lapsedThresholdDays")),
    locationSettings: locationSettingsFromForm(formData),
    scheduleCalibration: {
      normalDogCount: formData.get("normalDogCount"),
      heavyDogCount: formData.get("heavyDogCount"),
      largeDogMax: formData.get("largeDogMax"),
      targetLoadPoints: formData.get("targetLoadPoints"),
      heavyLoadPoints: formData.get("heavyLoadPoints"),
      smallDogPoints: formData.get("smallDogPoints"),
      mediumDogPoints: formData.get("mediumDogPoints"),
      largeDogPoints: formData.get("largeDogPoints"),
      xlDogPoints: formData.get("xlDogPoints"),
      fullGroomAdjustment: formData.get("fullGroomAdjustment"),
      bathOnlyAdjustment: formData.get("bathOnlyAdjustment"),
      nailTrimAdjustment: formData.get("nailTrimAdjustment"),
      styleAdjustment: formData.get("styleAdjustment"),
      longCoatAdjustment: formData.get("longCoatAdjustment"),
      straightShaveAdjustment: formData.get("straightShaveAdjustment"),
      behaviorAdjustment: formData.get("behaviorAdjustment"),
      mattingAdjustment: formData.get("mattingAdjustment"),
      specialHandlingNotes: formData.get("specialHandlingNotes"),
      warningLanguage: formData.get("warningLanguage"),
      annetteLargeCrateLimit: formData.get("annetteLargeCrateLimit"),
      ginaLargeCrateLimit: formData.get("ginaLargeCrateLimit"),
    },
  });
}

export function locationSettingsFromForm(formData: FormData): LocationSettingsMap {
  return normalizeLocationSettings({
    gina: {
      displayName: formData.get("location.gina.displayName"),
      customerAddress: formData.get("location.gina.customerAddress"),
      payoutType: formData.get("location.gina.payoutType") ?? "percent",
      salonKeepsPercent: formData.get("location.gina.salonKeepsPercent"),
      dailyRate: formData.get("location.gina.dailyRate"),
    },
    annette: {
      displayName: formData.get("location.annette.displayName"),
      customerAddress: formData.get("location.annette.customerAddress"),
      payoutType: formData.get("location.annette.payoutType") ?? "percent",
      salonKeepsPercent: formData.get("location.annette.salonKeepsPercent"),
      dailyRate: formData.get("location.annette.dailyRate"),
    },
  });
}

export function scheduleCalibrationFromForm(
  formData: FormData,
): ScheduleCalibration {
  return normalizeScheduleCalibration({
    normalDogCount: formData.get("normalDogCount"),
    heavyDogCount: formData.get("heavyDogCount"),
    largeDogMax: formData.get("largeDogMax"),
    targetLoadPoints: formData.get("targetLoadPoints"),
    heavyLoadPoints: formData.get("heavyLoadPoints"),
    smallDogPoints: formData.get("smallDogPoints"),
    mediumDogPoints: formData.get("mediumDogPoints"),
    largeDogPoints: formData.get("largeDogPoints"),
    xlDogPoints: formData.get("xlDogPoints"),
    fullGroomAdjustment: formData.get("fullGroomAdjustment"),
    bathOnlyAdjustment: formData.get("bathOnlyAdjustment"),
    nailTrimAdjustment: formData.get("nailTrimAdjustment"),
    styleAdjustment: formData.get("styleAdjustment"),
    longCoatAdjustment: formData.get("longCoatAdjustment"),
    straightShaveAdjustment: formData.get("straightShaveAdjustment"),
    behaviorAdjustment: formData.get("behaviorAdjustment"),
    mattingAdjustment: formData.get("mattingAdjustment"),
    specialHandlingNotes: formData.get("specialHandlingNotes"),
    warningLanguage: formData.get("warningLanguage"),
    annetteLargeCrateLimit: formData.get("annetteLargeCrateLimit"),
    ginaLargeCrateLimit: formData.get("ginaLargeCrateLimit"),
  });
}
