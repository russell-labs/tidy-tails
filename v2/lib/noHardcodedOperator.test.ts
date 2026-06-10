import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// TT-012 guard: the operator's name must never be hardcoded in shipping copy.
// "Samantha" / "Sam" used to be baked into labels, help text, and message
// templates; they now come from the per-org operator identity (operatorName in
// org_settings, resolved via lib/operatorIdentity.ts). This test fails if a
// literal operator name creeps back into a user-visible string.
//
// Scope: shipping app/component/lib source only. We exclude tests, e2e specs,
// build output, and code comments (developer notes that mention Sam's real
// workflow are fine — they are never shown to an operator). The internal
// `samNet` field is lowercase and never matches the capitalized whole word.

const ROOTS = ["app", "components", "lib"];
const FILE_RE = /\.tsx?$/;
const SKIP_DIR = new Set(["node_modules", ".next", "e2e"]);
const OPERATOR_NAME_RE = /\b(Sam|Samantha)\b/;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIR.has(entry)) out.push(...listSourceFiles(full));
      continue;
    }
    if (!FILE_RE.test(entry)) continue;
    if (entry.includes(".test.")) continue;
    out.push(full);
  }
  return out;
}

// Strip line and block comments so developer notes mentioning Sam don't trip the
// guard — only code and string/JSX copy remain.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("no hardcoded operator name in shipping copy (TT-012)", () => {
  it("has no 'Sam'/'Samantha' operator reference in user-visible strings", () => {
    const violations: string[] = [];
    for (const root of ROOTS) {
      for (const file of listSourceFiles(root)) {
        const lines = stripComments(readFileSync(file, "utf8")).split("\n");
        lines.forEach((line, i) => {
          if (OPERATOR_NAME_RE.test(line)) {
            violations.push(`${file}:${i + 1}  ${line.trim()}`);
          }
        });
      }
    }
    expect(violations, `hardcoded operator name found:\n${violations.join("\n")}`).toEqual(
      [],
    );
  });
});
