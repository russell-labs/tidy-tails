import { describe, expect, it } from "vitest";
import {
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

  it("returns defaults for malformed JSON", () => {
    expect(parseOperatorSettings("{nope")).toEqual(DEFAULT_OPERATOR_SETTINGS);
  });

  it("merges valid stored values with defaults", () => {
    const parsed = parseOperatorSettings(
      JSON.stringify({
        appointmentReminderTemplate: "Appointment text",
        rebookReminderTemplate: "Rebook text",
        lapsedThresholdDays: 120,
      }),
    );
    expect(parsed.appointmentReminderTemplate).toBe("Appointment text");
    expect(parsed.rebookReminderTemplate).toBe("Rebook text");
    expect(parsed.lapsedThresholdDays).toBe(120);
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
        appointmentReminderTemplate: "   ",
        rebookReminderTemplate: "",
      }),
    );
    expect(parsed.appointmentReminderTemplate).toBe(
      DEFAULT_OPERATOR_SETTINGS.appointmentReminderTemplate,
    );
    expect(parsed.rebookReminderTemplate).toBe(
      DEFAULT_OPERATOR_SETTINGS.rebookReminderTemplate,
    );
  });

  it("keeps serialized settings parseable", () => {
    const serialized = serializeOperatorSettings({
      appointmentReminderTemplate: "A",
      rebookReminderTemplate: "B",
      lapsedThresholdDays: 180,
    });
    expect(parseOperatorSettings(serialized)).toEqual({
      appointmentReminderTemplate: "A",
      rebookReminderTemplate: "B",
      lapsedThresholdDays: 180,
    });
  });
});

describe("operator settings form parsing", () => {
  it("reads settings from a form post", () => {
    const form = new FormData();
    form.set("appointmentReminderTemplate", "Appointment");
    form.set("rebookReminderTemplate", "Follow-up");
    form.set("lapsedThresholdDays", "60");
    expect(operatorSettingsFromForm(form)).toEqual({
      appointmentReminderTemplate: "Appointment",
      rebookReminderTemplate: "Follow-up",
      lapsedThresholdDays: 60,
    });
  });

  it("bounds very long templates", () => {
    const form = new FormData();
    form.set("appointmentReminderTemplate", "x".repeat(TEMPLATE_MAX_LENGTH + 5));
    const settings = operatorSettingsFromForm(form);
    expect(settings.appointmentReminderTemplate).toHaveLength(
      TEMPLATE_MAX_LENGTH,
    );
  });
});
