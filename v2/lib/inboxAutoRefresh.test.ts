import { afterEach, describe, expect, it } from "vitest";
import {
  anyComposerBusy,
  resetComposerActivity,
  setComposerBusy,
  shouldAutoRefresh,
} from "./inboxAutoRefresh";

afterEach(() => {
  resetComposerActivity();
});

describe("shouldAutoRefresh (TT-020 — never refresh over an active composer)", () => {
  it("refreshes when the tab is visible and no composer is busy", () => {
    expect(shouldAutoRefresh({ visible: true, composerBusy: false })).toBe(true);
  });

  it("does NOT refresh while a composer is focused or holds a draft", () => {
    expect(shouldAutoRefresh({ visible: true, composerBusy: true })).toBe(false);
  });

  it("does not refresh a hidden tab", () => {
    expect(shouldAutoRefresh({ visible: false, composerBusy: false })).toBe(false);
  });
});

describe("composer activity registry (shared across both inbox composers)", () => {
  it("reports busy when any composer is active", () => {
    setComposerBusy("sms-1", true);
    expect(anyComposerBusy()).toBe(true);
  });

  it("stays busy until every composer clears, then goes idle", () => {
    setComposerBusy("sms-1", true);
    setComposerBusy("sms-2", true);
    setComposerBusy("sms-1", false);
    expect(anyComposerBusy()).toBe(true);
    setComposerBusy("sms-2", false);
    expect(anyComposerBusy()).toBe(false);
  });

  it("is idempotent — clearing an unknown composer never goes negative", () => {
    setComposerBusy("ghost", false);
    expect(anyComposerBusy()).toBe(false);
  });
});
