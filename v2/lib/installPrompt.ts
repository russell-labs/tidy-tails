// Install-prompt decision logic (M2). Pure functions so the policy is
// unit-testable; the InstallAppPrompt component supplies the browser inputs.

export type InstallPlatform = "ios" | "android" | "other";

export function detectInstallPlatform(userAgent: string): InstallPlatform {
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  if (/android/i.test(userAgent)) return "android";
  return "other";
}

// Show the prompt when the app isn't already installed (standalone), the
// operator hasn't dismissed it, and we actually have something to offer:
// instructions on iOS (no install API exists), or the captured
// beforeinstallprompt event elsewhere.
export function shouldShowInstallPrompt({
  platform,
  standalone,
  dismissed,
  canNativeInstall,
}: {
  platform: InstallPlatform;
  standalone: boolean;
  dismissed: boolean;
  canNativeInstall: boolean;
}): boolean {
  if (standalone || dismissed) return false;
  if (platform === "ios") return true;
  return canNativeInstall;
}

export const INSTALL_PROMPT_DISMISSED_KEY = "tidytails-install-prompt-dismissed";
