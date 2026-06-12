// TT-020 — per-thread reply-draft persistence.
//
// The inbox runs a 10s `router.refresh()` auto-refresh. A re-render/remount of
// the reply composer would otherwise reset its local `useState("")` and wipe a
// half-typed reply (Sam: "it deletes my typed words before I'm done"). Holding
// the draft in this module-level store — outside React's component state — means
// it survives any remount: the composer initialises from `loadDraft(id)` and
// writes through on every keystroke, so the text is mechanism-proof against the
// refresh regardless of why the component re-rendered.
//
// Keyed strictly per thread/message id so drafts never bleed across
// conversations. This is intentionally client-only, in-memory state (no
// persistence across a full page reload) — it exists to bridge the auto-refresh.

const drafts = new Map<string, string>();

export function saveDraft(id: string, text: string): void {
  if (!id) return;
  // An empty/whitespace draft is "no draft" — keep the store lean and let
  // loadDraft fall back to "".
  if (text.trim().length === 0) {
    drafts.delete(id);
    return;
  }
  drafts.set(id, text);
}

export function loadDraft(id: string): string {
  return drafts.get(id) ?? "";
}

export function clearDraft(id: string): void {
  drafts.delete(id);
}

// Test-only reset so module-level state never leaks between cases.
export function clearAllDrafts(): void {
  drafts.clear();
}
