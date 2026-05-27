import { describe, expect, it } from "vitest";
import {
  alphabetRailRevealDelay,
  isInAlphabetRailHotZone,
  letterFromRailPoint,
  shouldHandleAlphabetRailScroll,
  shouldShowContactsResults,
  shouldUseAlphabetRail,
  shouldRevealAlphabetRail,
} from "./alphabetRail";

describe("letterFromRailPoint", () => {
  const letters = ["A", "B", "C", "D"];

  it("maps a vertical pointer position to the matching letter", () => {
    expect(letterFromRailPoint({ y: 125, top: 100, height: 100, letters })).toBe("B");
    expect(letterFromRailPoint({ y: 175, top: 100, height: 100, letters })).toBe("D");
  });

  it("clamps pointer positions outside the rail", () => {
    expect(letterFromRailPoint({ y: 40, top: 100, height: 100, letters })).toBe("A");
    expect(letterFromRailPoint({ y: 260, top: 100, height: 100, letters })).toBe("D");
  });

  it("returns null when there is no usable rail", () => {
    expect(letterFromRailPoint({ y: 120, top: 100, height: 0, letters })).toBeNull();
    expect(letterFromRailPoint({ y: 120, top: 100, height: 100, letters: [] })).toBeNull();
  });
});

describe("isInAlphabetRailHotZone", () => {
  it("treats the right edge as the scrub target", () => {
    expect(isInAlphabetRailHotZone({ x: 370, viewportWidth: 390 })).toBe(true);
    expect(isInAlphabetRailHotZone({ x: 250, viewportWidth: 390 })).toBe(false);
  });
});

describe("alphabetRailRevealDelay", () => {
  it("waits briefly for normal scrolling but shows immediately while scrubbing", () => {
    expect(alphabetRailRevealDelay({ isScrubbing: false })).toBeGreaterThan(0);
    expect(alphabetRailRevealDelay({ isScrubbing: true })).toBe(0);
  });
});

describe("shouldUseAlphabetRail", () => {
  it("only enables the rail when contacts are open with enough letters", () => {
    expect(shouldUseAlphabetRail({ contactsOpen: false, letterCount: 12 })).toBe(false);
    expect(shouldUseAlphabetRail({ contactsOpen: true, letterCount: 4 })).toBe(false);
    expect(shouldUseAlphabetRail({ contactsOpen: true, letterCount: 5 })).toBe(true);
  });
});

describe("shouldShowContactsResults", () => {
  it("keeps the idle contacts list tucked away until opened", () => {
    expect(shouldShowContactsResults({ contactsOpen: false, query: "" })).toBe(false);
    expect(shouldShowContactsResults({ contactsOpen: true, query: "" })).toBe(true);
  });

  it("shows potential matches as soon as Sam types a search", () => {
    expect(shouldShowContactsResults({ contactsOpen: false, query: "k" })).toBe(true);
    expect(shouldShowContactsResults({ contactsOpen: false, query: "  kiwi " })).toBe(true);
  });
});

describe("shouldRevealAlphabetRail", () => {
  it("reveals for a real user scroll with enough movement", () => {
    expect(
      shouldRevealAlphabetRail({
        currentY: 140,
        previousY: 100,
        hasRecentScrollIntent: true,
        suppressUntil: 0,
        now: 1000,
      }),
    ).toBe(true);
  });

  it("does not reveal for input focus or keyboard viewport scroll", () => {
    expect(
      shouldRevealAlphabetRail({
        currentY: 140,
        previousY: 100,
        hasRecentScrollIntent: false,
        suppressUntil: 0,
        now: 1000,
      }),
    ).toBe(false);
    expect(
      shouldRevealAlphabetRail({
        currentY: 140,
        previousY: 100,
        hasRecentScrollIntent: true,
        suppressUntil: 1400,
        now: 1000,
      }),
    ).toBe(false);
  });

  it("reveals for intentional scroll after the focus suppression window", () => {
    expect(
      shouldRevealAlphabetRail({
        currentY: 140,
        previousY: 100,
        hasRecentScrollIntent: true,
        suppressUntil: 900,
        now: 1000,
      }),
    ).toBe(true);
  });

  it("ignores tiny scroll jitter", () => {
    expect(
      shouldRevealAlphabetRail({
        currentY: 103,
        previousY: 100,
        hasRecentScrollIntent: true,
        suppressUntil: 0,
        now: 1000,
      }),
    ).toBe(false);
  });
});

describe("shouldHandleAlphabetRailScroll", () => {
  it("keeps the rail alive once visible even without fresh touch intent", () => {
    expect(
      shouldHandleAlphabetRailScroll({
        isVisible: true,
        isScrubbing: false,
        shouldReveal: false,
      }),
    ).toBe(true);
  });

  it("handles hidden rail scroll only when reveal criteria pass", () => {
    expect(
      shouldHandleAlphabetRailScroll({
        isVisible: false,
        isScrubbing: false,
        shouldReveal: false,
      }),
    ).toBe(false);
    expect(
      shouldHandleAlphabetRailScroll({
        isVisible: false,
        isScrubbing: false,
        shouldReveal: true,
      }),
    ).toBe(true);
  });
});
