// Assistant intro copy — the single source of the header subtitle and the
// empty-state hint shown on the assistant surface. It is FLAG-AWARE: the words
// must match what the assistant can actually do.
//
//   - writes OFF (default): read-only. It looks things up; it can't book, text,
//     or change anything. These strings are pinned byte-for-byte to what shipped.
//   - writes ON: it can also make changes — and it always shows a confirm card
//     and saves nothing until the operator taps Confirm.
//
// Used by both the server-rendered page (the subtitle) and the client chat (the
// empty-state hint), so the truth lives in one place and the two never disagree.
// The caller decides the flag (isAgentWritesEnabled) on the server.

export type AssistantIntroCopy = {
  /** The header subtitle under "Assistant". */
  subtitle: string;
  /** The empty-transcript hint shown before the first message. */
  emptyState: string;
};

export function assistantIntroCopy(writesEnabled: boolean): AssistantIntroCopy {
  if (writesEnabled) {
    return {
      subtitle:
        "Ask about your schedule, clients, and income — or ask it to make a change. It'll always confirm before saving.",
      emptyState:
        "Ask about your schedule, a household, a dog's history and groom notes, your income, or who's due for a rebooking — or ask it to book, log, or send something. It'll always confirm before saving.",
    };
  }
  return {
    subtitle:
      "Ask about your schedule, clients, and income. It can look things up — it can't book, text, or change anything.",
    emptyState:
      "Ask about your schedule, a household, a dog's history and groom notes, your income, or who's due for a rebooking.",
  };
}
