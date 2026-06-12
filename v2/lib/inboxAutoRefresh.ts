// TT-020 — gate the inbox's 10s `router.refresh()` so it never fires while a
// reply composer is in use. Two inbox composers (the per-message
// `InboxSmsActions` and `InboxMessageCenter`'s thread composer) register their
// "busy" state (focused or holding a non-empty draft) here; the single interval
// in `InboxMessageCenter` consults it before refreshing. Pure + shared so both
// composers and the interval agree, and so the decision is unit-testable.

const busyComposers = new Set<string>();

export function setComposerBusy(id: string, busy: boolean): void {
  if (!id) return;
  if (busy) busyComposers.add(id);
  else busyComposers.delete(id);
}

export function anyComposerBusy(): boolean {
  return busyComposers.size > 0;
}

export function shouldAutoRefresh(state: {
  visible: boolean;
  composerBusy: boolean;
}): boolean {
  return state.visible && !state.composerBusy;
}

// Test-only reset so module-level state never leaks between cases.
export function resetComposerActivity(): void {
  busyComposers.clear();
}
