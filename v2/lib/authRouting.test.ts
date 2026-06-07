import { describe, expect, it } from "vitest";
import {
  APP_HOME_PATH,
  ONBOARDING_PATH,
  postAuthDestination,
} from "./authRouting";

describe("postAuthDestination (membership gate)", () => {
  it("sends a user with a membership into the app", () => {
    expect(postAuthDestination(true)).toBe(APP_HOME_PATH);
  });

  it("sends a confirmed user with no membership to onboarding", () => {
    expect(postAuthDestination(false)).toBe(ONBOARDING_PATH);
  });
});
