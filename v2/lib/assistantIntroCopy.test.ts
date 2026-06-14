import { describe, expect, it } from "vitest";
import { assistantIntroCopy } from "./assistantIntroCopy";

// The assistant's intro copy (header subtitle + empty-state hint) must tell the
// truth about what the assistant can do, which depends on whether agent WRITES
// are enabled. Read-only by default; capability-aware once writes are flipped on.
// The OFF strings are pinned byte-for-byte to what shipped (straight apostrophes,
// matching the JSX &apos; that rendered them) so the read-only promise never drifts.
describe("assistantIntroCopy", () => {
  describe("when agent writes are OFF (read-only)", () => {
    const copy = assistantIntroCopy(false);

    it("keeps the existing read-only subtitle byte-for-byte", () => {
      expect(copy.subtitle).toBe(
        "Ask about your schedule, clients, and income. It can look things up — it can't book, text, or change anything.",
      );
    });

    it("keeps the existing read-only empty-state hint byte-for-byte", () => {
      expect(copy.emptyState).toBe(
        "Ask about your schedule, a household, a dog's history and groom notes, your income, or who's due for a rebooking.",
      );
    });

    it("does not promise it can make changes", () => {
      expect(copy.subtitle.toLowerCase()).toContain("can't");
      expect(copy.subtitle.toLowerCase()).not.toContain("confirm");
    });
  });

  describe("when agent writes are ON", () => {
    const copy = assistantIntroCopy(true);

    it("says it can make changes and will always confirm first", () => {
      expect(copy.subtitle.toLowerCase()).toContain("change");
      expect(copy.subtitle.toLowerCase()).toContain("confirm");
    });

    it("does not keep the stale read-only disclaimer", () => {
      expect(copy.subtitle).not.toContain("can't book, text, or change anything");
    });

    it("makes the empty-state hint capability- and confirm-aware too", () => {
      expect(copy.emptyState.toLowerCase()).toContain("confirm");
    });
  });
});
