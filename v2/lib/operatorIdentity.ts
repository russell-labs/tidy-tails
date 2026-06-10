// Per-org operator identity (TT-012). Replaces the hardcoded "Samantha"
// signature so every org signs its own customer texts. The operator name lives
// per-org in org_settings.settings (see lib/orgSettings.ts); these pure helpers
// resolve it and substitute it into messages. No I/O here.

// The signature token customers never see. Default message templates end with
// "— [your name]"; it is substituted with the resolved operator name (or dropped
// when none is set) so no operator name is ever hardcoded into shipping copy.
export const OPERATOR_NAME_PLACEHOLDER = "[your name]";

// Substitute the [your name] placeholder in a rendered message. With a name it
// replaces the token in place (the surrounding dash/format is preserved). With
// an empty name it drops a trailing "— [your name]" / "- [your name]" signature,
// then any bare placeholder, so the text never ends on a dangling dash.
export function applyOperatorName(text: string, operatorName: string): string {
  const name = operatorName.trim();
  if (name) {
    return text.replaceAll(OPERATOR_NAME_PLACEHOLDER, name);
  }
  return text
    .replace(/\s*[—-]\s*\[your name\]/g, "")
    .replace(/\s*\[your name\]\s*/g, " ")
    .trim();
}
