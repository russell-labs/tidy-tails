import { afterEach, describe, expect, it } from "vitest";
import {
  clearAllDrafts,
  clearDraft,
  loadDraft,
  saveDraft,
} from "./inboxDraftStore";

afterEach(() => {
  clearAllDrafts();
});

describe("inboxDraftStore (TT-020 — composer text survives the 10s auto-refresh)", () => {
  it("recovers a saved draft after the composer remounts", () => {
    // Sam is typing a reply...
    saveDraft("sms-1", "Hi Jane, see you at 2pm");
    // ...the inbox auto-refresh re-renders/remounts the composer, whose fresh
    // initial state reads the store. The half-typed reply must come back.
    expect(loadDraft("sms-1")).toBe("Hi Jane, see you at 2pm");
  });

  it("returns an empty string for a thread with no draft", () => {
    expect(loadDraft("never-typed")).toBe("");
  });

  it("keeps drafts isolated per thread so they never bleed across conversations", () => {
    saveDraft("sms-jane", "for Jane");
    saveDraft("sms-bob", "for Bob");
    expect(loadDraft("sms-jane")).toBe("for Jane");
    expect(loadDraft("sms-bob")).toBe("for Bob");
  });

  it("clears a draft once the reply is sent", () => {
    saveDraft("sms-1", "sent text");
    clearDraft("sms-1");
    expect(loadDraft("sms-1")).toBe("");
  });

  it("treats clearing the field (empty/whitespace) as no draft", () => {
    saveDraft("sms-1", "typed then deleted");
    saveDraft("sms-1", "   ");
    expect(loadDraft("sms-1")).toBe("");
  });
});
