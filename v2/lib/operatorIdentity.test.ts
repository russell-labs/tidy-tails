import { describe, expect, it } from "vitest";
import {
  OPERATOR_NAME_PLACEHOLDER,
  applyOperatorName,
} from "./operatorIdentity";

describe("applyOperatorName", () => {
  it("substitutes the placeholder with the operator name, preserving the em dash", () => {
    expect(
      applyOperatorName(`See you then! — ${OPERATOR_NAME_PLACEHOLDER}`, "Samantha"),
    ).toBe("See you then! — Samantha");
  });

  it("substitutes the placeholder after a hyphen signature", () => {
    expect(
      applyOperatorName(`cancelled. - ${OPERATOR_NAME_PLACEHOLDER}`, "Cheryl"),
    ).toBe("cancelled. - Cheryl");
  });

  it("drops an em-dash signature when the name is empty", () => {
    expect(
      applyOperatorName(`See you then! — ${OPERATOR_NAME_PLACEHOLDER}`, ""),
    ).toBe("See you then!");
  });

  it("drops a hyphen signature when the name is empty", () => {
    expect(
      applyOperatorName(`cancelled. - ${OPERATOR_NAME_PLACEHOLDER}`, "   "),
    ).toBe("cancelled.");
  });

  it("removes a bare placeholder with no dash when the name is empty", () => {
    expect(applyOperatorName(`Hi, ${OPERATOR_NAME_PLACEHOLDER} here`, "")).toBe(
      "Hi, here",
    );
  });
});
