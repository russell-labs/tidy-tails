import { describe, expect, it } from "vitest";
import { FOCUSABLE_SELECTOR, resolveTabTarget } from "./focusTrap";

describe("FOCUSABLE_SELECTOR", () => {
  it("covers the standard interactive elements and excludes disabled/hidden", () => {
    expect(FOCUSABLE_SELECTOR).toContain("a[href]");
    expect(FOCUSABLE_SELECTOR).toContain("button:not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain("input:not([disabled]):not([type='hidden'])");
    expect(FOCUSABLE_SELECTOR).toContain("select:not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain("textarea:not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain("[tabindex]:not([tabindex='-1'])");
  });
});

describe("resolveTabTarget", () => {
  const a = "a";
  const b = "b";
  const c = "c";
  const els = [a, b, c] as const;

  it("returns null when there is nothing to focus", () => {
    expect(resolveTabTarget([], a, false)).toBeNull();
  });

  it("wraps forward from the last element to the first", () => {
    expect(resolveTabTarget(els, c, false)).toBe(a);
  });

  it("wraps backward from the first element to the last", () => {
    expect(resolveTabTarget(els, a, true)).toBe(c);
  });

  it("lets the browser handle movement in the middle of the order", () => {
    expect(resolveTabTarget(els, b, false)).toBeNull();
    expect(resolveTabTarget(els, b, true)).toBeNull();
    expect(resolveTabTarget(els, a, false)).toBeNull();
    expect(resolveTabTarget(els, c, true)).toBeNull();
  });

  it("recaptures focus that escaped the container", () => {
    expect(resolveTabTarget(els, null, false)).toBe(a);
    expect(resolveTabTarget(els, "outside", false)).toBe(a);
    expect(resolveTabTarget(els, "outside", true)).toBe(c);
  });
});
