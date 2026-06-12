import { describe, expect, it } from "vitest";
import { detectInstallPlatform, shouldShowInstallPrompt } from "./installPrompt";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

describe("detectInstallPlatform", () => {
  it("detects iPhone Safari as ios", () => {
    expect(detectInstallPlatform(IPHONE_UA)).toBe("ios");
  });
  it("detects Android Chrome as android", () => {
    expect(detectInstallPlatform(ANDROID_UA)).toBe("android");
  });
  it("treats desktop as other", () => {
    expect(detectInstallPlatform(DESKTOP_UA)).toBe("other");
  });
});

describe("shouldShowInstallPrompt", () => {
  const base = {
    platform: "ios" as const,
    standalone: false,
    dismissed: false,
    canNativeInstall: false,
  };

  it("shows instructions on iOS without any install API", () => {
    expect(shouldShowInstallPrompt(base)).toBe(true);
  });
  it("never shows when already installed (standalone)", () => {
    expect(shouldShowInstallPrompt({ ...base, standalone: true })).toBe(false);
    expect(
      shouldShowInstallPrompt({
        ...base,
        platform: "android",
        canNativeInstall: true,
        standalone: true,
      }),
    ).toBe(false);
  });
  it("never shows after dismissal", () => {
    expect(shouldShowInstallPrompt({ ...base, dismissed: true })).toBe(false);
  });
  it("on android requires the captured beforeinstallprompt event", () => {
    expect(
      shouldShowInstallPrompt({ ...base, platform: "android" }),
    ).toBe(false);
    expect(
      shouldShowInstallPrompt({
        ...base,
        platform: "android",
        canNativeInstall: true,
      }),
    ).toBe(true);
  });
  it("on desktop also keys off the install event", () => {
    expect(shouldShowInstallPrompt({ ...base, platform: "other" })).toBe(false);
    expect(
      shouldShowInstallPrompt({
        ...base,
        platform: "other",
        canNativeInstall: true,
      }),
    ).toBe(true);
  });
});
