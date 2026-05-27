import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE_CALIBRATION,
  DEFAULT_OPERATOR_SETTINGS,
  parseOperatorSettings,
  serializeOperatorSettings,
  operatorSettingsFromForm,
  TEMPLATE_MAX_LENGTH,
} from "./operatorSettings";

describe("operator settings parsing", () => {
  it("returns defaults for a missing cookie", () => {
    expect(parseOperatorSettings(undefined)).toEqual(DEFAULT_OPERATOR_SETTINGS);
  });

  it("uses plural-safe default booking drafts for household bookings", () => {
    expect(DEFAULT_OPERATOR_SETTINGS.bookingConfirmationTemplate).toContain(
      "booking confirmed for [pet name]",
    );
    expect(DEFAULT_OPERATOR_SETTINGS.bookingConfirmationTemplate).not.toContain(
      "[pet name] is booked",
    );
    expect(DEFAULT_OPERATOR_SETTINGS.firstPlatformTextTemplate).toContain(
      "Booking confirmed for [pet name]",
    );
  });

  it("defaults salon location settings to current shop addresses and payout rules", () => {
    expect(DEFAULT_OPERATOR_SETTINGS.locationSettings).toEqual({
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
    });
  });

  it("returns defaults for malformed JSON", () => {
    expect(parseOperatorSettings("{nope")).toEqual(DEFAULT_OPERATOR_SETTINGS);
  });

  it("merges valid stored values with defaults", () => {
    const parsed = parseOperatorSettings(
      JSON.stringify({
        bookingConfirmationTemplate: "Booking text",
        firstPlatformTextTemplate: "Intro text",
        appointmentReminderTemplate: "Appointment text",
        rebookReminderTemplate: "Rebook text",
        readyPickupTemplate: "Pickup text",
        lapsedThresholdDays: 120,
      }),
    );
    expect(parsed.bookingConfirmationTemplate).toBe("Booking text");
    expect(parsed.firstPlatformTextTemplate).toBe("Intro text");
    expect(parsed.appointmentReminderTemplate).toBe("Appointment text");
    expect(parsed.rebookReminderTemplate).toBe("Rebook text");
    expect(parsed.readyPickupTemplate).toBe("Pickup text");
    expect(parsed.lapsedThresholdDays).toBe(120);
    expect(parsed.scheduleCalibration).toEqual(DEFAULT_SCHEDULE_CALIBRATION);
    expect(parsed.locationSettings).toEqual(
      DEFAULT_OPERATOR_SETTINGS.locationSettings,
    );
  });

  it("normalizes stored salon location settings", () => {
    const parsed = parseOperatorSettings(
      JSON.stringify({
        locationSettings: {
          gina: {
            displayName: "Gina custom",
            customerAddress: "Custom address",
            payoutType: "percent",
            salonKeepsPercent: 31.5,
          },
          annette: {
            displayName: "",
            customerAddress: "",
            payoutType: "daily_rate",
            dailyRate: 45.25,
          },
        },
      }),
    );

    expect(parsed.locationSettings.gina).toEqual({
      ...DEFAULT_OPERATOR_SETTINGS.locationSettings.gina,
      displayName: "Gina custom",
      customerAddress: "Custom address",
      salonKeepsPercent: 31.5,
    });
    expect(parsed.locationSettings.annette).toEqual({
      ...DEFAULT_OPERATOR_SETTINGS.locationSettings.annette,
      payoutType: "daily_rate",
      dailyRate: 45.25,
    });
  });

  it("normalizes stored schedule calibration values", () => {
    const parsed = parseOperatorSettings(
      JSON.stringify({
        scheduleCalibration: {
          heavyDogCount: 6,
          largeDogMax: 4,
          styleAdjustment: 1.2,
          warningLanguage: "Check the day before booking.",
        },
      }),
    );
    expect(parsed.scheduleCalibration).toEqual({
      ...DEFAULT_SCHEDULE_CALIBRATION,
      heavyDogCount: 6,
      largeDogMax: 4,
      styleAdjustment: 1.2,
      warningLanguage: "Check the day before booking.",
    });
  });

  it("falls back when the stored threshold is not supported", () => {
    const parsed = parseOperatorSettings(
      JSON.stringify({ lapsedThresholdDays: 365 }),
    );
    expect(parsed.lapsedThresholdDays).toBe(
      DEFAULT_OPERATOR_SETTINGS.lapsedThresholdDays,
    );
  });

  it("trims empty templates back to defaults", () => {
    const parsed = parseOperatorSettings(
      JSON.stringify({
        bookingConfirmationTemplate: "",
        firstPlatformTextTemplate: "",
        appointmentReminderTemplate: "   ",
        rebookReminderTemplate: "",
        readyPickupTemplate: "",
      }),
    );
    expect(parsed.bookingConfirmationTemplate).toBe(
      DEFAULT_OPERATOR_SETTINGS.bookingConfirmationTemplate,
    );
    expect(parsed.appointmentReminderTemplate).toBe(
      DEFAULT_OPERATOR_SETTINGS.appointmentReminderTemplate,
    );
    expect(parsed.firstPlatformTextTemplate).toBe(
      DEFAULT_OPERATOR_SETTINGS.firstPlatformTextTemplate,
    );
    expect(parsed.rebookReminderTemplate).toBe(
      DEFAULT_OPERATOR_SETTINGS.rebookReminderTemplate,
    );
    expect(parsed.readyPickupTemplate).toBe(
      DEFAULT_OPERATOR_SETTINGS.readyPickupTemplate,
    );
  });

  it("keeps serialized settings parseable", () => {
    const serialized = serializeOperatorSettings({
      bookingConfirmationTemplate: "Booking",
      firstPlatformTextTemplate: "Intro",
      appointmentReminderTemplate: "A",
      rebookReminderTemplate: "B",
      readyPickupTemplate: "C",
      lapsedThresholdDays: 180,
      scheduleCalibration: {
        ...DEFAULT_SCHEDULE_CALIBRATION,
        heavyDogCount: 6,
      },
      locationSettings: DEFAULT_OPERATOR_SETTINGS.locationSettings,
    });
    expect(parseOperatorSettings(serialized)).toEqual({
      bookingConfirmationTemplate: "Booking",
      firstPlatformTextTemplate: "Intro",
      appointmentReminderTemplate: "A",
      rebookReminderTemplate: "B",
      readyPickupTemplate: "C",
      lapsedThresholdDays: 180,
      scheduleCalibration: {
        ...DEFAULT_SCHEDULE_CALIBRATION,
        heavyDogCount: 6,
      },
      locationSettings: DEFAULT_OPERATOR_SETTINGS.locationSettings,
    });
  });
});

describe("operator settings form parsing", () => {
  it("reads settings from a form post", () => {
    const form = new FormData();
    form.set("bookingConfirmationTemplate", "Booking");
    form.set("firstPlatformTextTemplate", "Intro");
    form.set("appointmentReminderTemplate", "Appointment");
    form.set("rebookReminderTemplate", "Follow-up");
    form.set("readyPickupTemplate", "Pickup");
    form.set("lapsedThresholdDays", "60");
    expect(operatorSettingsFromForm(form)).toEqual({
      bookingConfirmationTemplate: "Booking",
      firstPlatformTextTemplate: "Intro",
      appointmentReminderTemplate: "Appointment",
      rebookReminderTemplate: "Follow-up",
      readyPickupTemplate: "Pickup",
      lapsedThresholdDays: 60,
      scheduleCalibration: DEFAULT_SCHEDULE_CALIBRATION,
      locationSettings: DEFAULT_OPERATOR_SETTINGS.locationSettings,
    });
  });

  it("reads salon location settings from a form post", () => {
    const form = new FormData();
    form.set("location.gina.displayName", "Gina custom");
    form.set("location.gina.customerAddress", "Custom Gina address");
    form.set("location.gina.salonKeepsPercent", "32");
    form.set("location.annette.displayName", "Annette custom");
    form.set("location.annette.customerAddress", "Custom Annette address");
    form.set("location.annette.salonKeepsPercent", "36");

    expect(operatorSettingsFromForm(form).locationSettings).toEqual({
      gina: {
        displayName: "Gina custom",
        customerAddress: "Custom Gina address",
        payoutType: "percent",
        salonKeepsPercent: 32,
        dailyRate: null,
      },
      annette: {
        displayName: "Annette custom",
        customerAddress: "Custom Annette address",
        payoutType: "percent",
        salonKeepsPercent: 36,
        dailyRate: null,
      },
    });
  });

  it("reads schedule calibration from a form post", () => {
    const form = new FormData();
    form.set("heavyDogCount", "6");
    form.set("largeDogMax", "4");
    form.set("smallDogPoints", "1.5");
    form.set("styleAdjustment", "1.1");
    form.set("warningLanguage", "Check details before booking.");
    const settings = operatorSettingsFromForm(form);
    expect(settings.scheduleCalibration).toEqual({
      ...DEFAULT_SCHEDULE_CALIBRATION,
      heavyDogCount: 6,
      largeDogMax: 4,
      smallDogPoints: 1.5,
      styleAdjustment: 1.1,
      warningLanguage: "Check details before booking.",
    });
  });

  it("bounds very long templates", () => {
    const form = new FormData();
    form.set(
      "bookingConfirmationTemplate",
      "x".repeat(TEMPLATE_MAX_LENGTH + 5),
    );
    const settings = operatorSettingsFromForm(form);
    expect(settings.bookingConfirmationTemplate).toHaveLength(
      TEMPLATE_MAX_LENGTH,
    );
  });
});
