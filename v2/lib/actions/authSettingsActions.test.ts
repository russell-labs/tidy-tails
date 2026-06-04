import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPERATOR_SETTINGS } from "@/lib/operatorSettings";
import { createSupabaseHarness, form } from "./actionTestSupport";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/lib/audit.server", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/operatorSettings.server", () => ({
  readOperatorSettings: vi.fn(),
  writeOperatorSettings: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import {
  saveLocationSettingsWithState,
  saveOperatorSettings,
  saveOperatorSettingsWithState,
  saveScheduleCalibrationWithState,
} from "./settings";
import { signIn, signInWithGoogle, signOut } from "./auth";
import { recordAuditEvent } from "@/lib/audit.server";
import {
  readOperatorSettings,
  writeOperatorSettings,
} from "@/lib/operatorSettings.server";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { headers } from "next/headers";

const supabase = createSupabaseHarness();
const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const readOperatorSettingsMock = vi.mocked(readOperatorSettings);
const writeOperatorSettingsMock = vi.mocked(writeOperatorSettings);
const headersMock = vi.mocked(headers);
const recordAuditEventMock = vi.mocked(recordAuditEvent);

function settingsForm(): FormData {
  return form({
    bookingConfirmationTemplate: "Confirmed [pet name]",
    firstPlatformTextTemplate: "First hello",
    appointmentReminderTemplate: "Reminder [pet name]",
    rebookReminderTemplate: "Rebook [pet name]",
    readyPickupTemplate: "Ready [pet name]",
    lapsedThresholdDays: "120",
    "location.gina.displayName": "Gina Shop",
    "location.gina.customerAddress": "60 Olive",
    "location.gina.payoutType": "percent",
    "location.gina.salonKeepsPercent": "25",
    "location.gina.dailyRate": "",
    "location.annette.displayName": "Annette Shop",
    "location.annette.customerAddress": "290 Millard",
    "location.annette.payoutType": "daily_rate",
    "location.annette.salonKeepsPercent": "35",
    "location.annette.dailyRate": "85",
    normalDogCount: "5",
    heavyDogCount: "6",
    largeDogMax: "4",
    targetLoadPoints: "8",
    heavyLoadPoints: "7",
    smallDogPoints: "1.2",
    mediumDogPoints: "1.4",
    largeDogPoints: "2.2",
    xlDogPoints: "2.8",
    fullGroomAdjustment: "0.5",
    bathOnlyAdjustment: "-0.1",
    nailTrimAdjustment: "-0.8",
    styleAdjustment: "1",
    longCoatAdjustment: "0.7",
    straightShaveAdjustment: "-0.3",
    behaviorAdjustment: "0.8",
    mattingAdjustment: "0.4",
    specialHandlingNotes: "Handle carefully.",
    warningLanguage: "Check load.",
    annetteLargeCrateLimit: "3",
    ginaLargeCrateLimit: "5",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  supabase.reset();
  vi.stubEnv("TIDYTAILS_ALLOWED_EMAILS", "sam@example.com");

  createServerSupabaseMock.mockResolvedValue(
    supabase.client as unknown as Awaited<ReturnType<typeof createServerSupabase>>,
  );
  getCurrentUserMock.mockResolvedValue({
    id: "operator-1",
  } as Awaited<ReturnType<typeof getCurrentUser>>);
  readOperatorSettingsMock.mockResolvedValue(DEFAULT_OPERATOR_SETTINGS);
  headersMock.mockResolvedValue(
    new Headers({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "tidy.test",
    }),
  );
});

describe("auth actions", () => {
  it("signs in an allowlisted operator and redirects into the app", async () => {
    supabase.client.auth.signInWithPassword.mockResolvedValue({ error: null });
    supabase.client.auth.getUser.mockResolvedValue({
      data: { user: { id: "operator-1", email: "sam@example.com" } },
    });

    await expect(
      signIn(
        null,
        form({
          email: "sam@example.com",
          password: "correct horse battery staple",
        }),
      ),
    ).rejects.toThrow("redirect:/");

    expect(supabase.client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "sam@example.com",
      password: "correct horse battery staple",
    });
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "auth.signed_in",
      }),
    );
  });

  it("returns a friendly error when email/password validation fails", async () => {
    const result = await signIn(null, form({ email: "", password: "" }));

    expect(result).toEqual({ error: "Enter your email and password." });
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });

  it("signs out a Supabase user whose email is not allowlisted", async () => {
    supabase.client.auth.signInWithPassword.mockResolvedValue({ error: null });
    supabase.client.auth.getUser.mockResolvedValue({
      data: { user: { id: "operator-2", email: "other@example.com" } },
    });

    const result = await signIn(
      null,
      form({ email: "other@example.com", password: "secret" }),
    );

    expect(result).toEqual({
      error: "This Google/Supabase account is not allowed to access Tidy Tails.",
    });
    expect(supabase.client.auth.signOut).toHaveBeenCalledOnce();
  });

  it("starts Google OAuth with the current app callback URL", async () => {
    supabase.client.auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/v2/auth?client=test" },
      error: null,
    });

    await expect(signInWithGoogle(new FormData())).rejects.toThrow(
      "redirect:https://accounts.google.com/o/oauth2/v2/auth?client=test",
    );

    expect(supabase.client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://tidy.test/auth/callback",
      },
    });
  });

  it("signs out through Supabase and redirects to login", async () => {
    await expect(signOut()).rejects.toThrow("redirect:/login");

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "auth.signed_out" }),
    );
    expect(supabase.client.auth.signOut).toHaveBeenCalledOnce();
  });
});

describe("settings action auth guards", () => {
  it("saveOperatorSettings writes merged operator settings for an authenticated user", async () => {
    await saveOperatorSettings(settingsForm());

    expect(writeOperatorSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingConfirmationTemplate: "Confirmed [pet name]",
        scheduleCalibration: DEFAULT_OPERATOR_SETTINGS.scheduleCalibration,
        locationSettings: DEFAULT_OPERATOR_SETTINGS.locationSettings,
      }),
    );
  });

  it("saveOperatorSettings writes nothing without an authenticated user", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    await saveOperatorSettings(settingsForm());

    expect(readOperatorSettingsMock).not.toHaveBeenCalled();
    expect(writeOperatorSettingsMock).not.toHaveBeenCalled();
  });

  it("saveLocationSettingsWithState writes location settings for an authenticated user", async () => {
    const result = await saveLocationSettingsWithState(
      { status: "idle" },
      settingsForm(),
    );

    expect(result).toMatchObject({ status: "saved" });
    expect(writeOperatorSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        locationSettings: {
          gina: expect.objectContaining({
            displayName: "Gina Shop",
            customerAddress: "60 Olive",
            salonKeepsPercent: 25,
          }),
          annette: expect.objectContaining({
            displayName: "Annette Shop",
            payoutType: "daily_rate",
            dailyRate: 85,
          }),
        },
      }),
    );
  });

  it("saveLocationSettingsWithState returns idle and writes nothing without auth", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await saveLocationSettingsWithState(
      { status: "idle" },
      settingsForm(),
    );

    expect(result).toEqual({ status: "idle" });
    expect(writeOperatorSettingsMock).not.toHaveBeenCalled();
  });

  it("saveOperatorSettingsWithState writes operator settings for an authenticated user", async () => {
    const result = await saveOperatorSettingsWithState(
      { status: "idle" },
      settingsForm(),
    );

    expect(result).toMatchObject({ status: "saved" });
    expect(writeOperatorSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingConfirmationTemplate: "Confirmed [pet name]",
      }),
    );
  });

  it("saveOperatorSettingsWithState returns idle and writes nothing without auth", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await saveOperatorSettingsWithState(
      { status: "idle" },
      settingsForm(),
    );

    expect(result).toEqual({ status: "idle" });
    expect(writeOperatorSettingsMock).not.toHaveBeenCalled();
  });

  it("saveScheduleCalibrationWithState writes calibration for an authenticated user", async () => {
    const result = await saveScheduleCalibrationWithState(
      { status: "idle" },
      settingsForm(),
    );

    expect(result).toMatchObject({ status: "saved" });
    expect(writeOperatorSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleCalibration: expect.objectContaining({
          normalDogCount: 5,
          targetLoadPoints: 8,
          warningLanguage: "Check load.",
        }),
      }),
    );
  });

  it("saveScheduleCalibrationWithState returns idle and writes nothing without auth", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await saveScheduleCalibrationWithState(
      { status: "idle" },
      settingsForm(),
    );

    expect(result).toEqual({ status: "idle" });
    expect(writeOperatorSettingsMock).not.toHaveBeenCalled();
  });
});
