import { describe, expect, it } from "vitest";
import {
  isActiveHouseholdSearch,
  shouldHideBottomNavForSearch,
  shouldShowSearchClearButton,
} from "./searchUi";

describe("isActiveHouseholdSearch", () => {
  it("keeps the search page expanded when the query is empty", () => {
    expect(isActiveHouseholdSearch("")).toBe(false);
    expect(isActiveHouseholdSearch("   ")).toBe(false);
  });

  it("switches to compact search mode as soon as Sam types", () => {
    expect(isActiveHouseholdSearch("k")).toBe(true);
    expect(isActiveHouseholdSearch("  kiwi")).toBe(true);
  });
});

describe("shouldHideBottomNavForSearch", () => {
  it("keeps the bottom nav available while browsing the clean search page", () => {
    expect(shouldHideBottomNavForSearch("")).toBe(false);
  });

  it("hides the bottom nav while typed search results are active", () => {
    expect(shouldHideBottomNavForSearch("ki")).toBe(true);
  });
});

describe("shouldShowSearchClearButton", () => {
  it("only shows the clear control when there is text in the search box", () => {
    expect(shouldShowSearchClearButton("")).toBe(false);
    expect(shouldShowSearchClearButton("k")).toBe(true);
    expect(shouldShowSearchClearButton(" ")).toBe(true);
  });
});
