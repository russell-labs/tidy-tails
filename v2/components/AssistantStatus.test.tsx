import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssistantStatus } from "./AssistantStatus";

// Pure presentation — assert the rendered markup for each live state.

describe("AssistantStatus", () => {
  it("shows a thinking state before any tool runs", () => {
    const html = renderToStaticMarkup(<AssistantStatus phase="thinking" />);
    expect(html).toContain("Thinking…");
  });

  it("shows the specific tool-in-use phrase while a tool runs", () => {
    const html = renderToStaticMarkup(<AssistantStatus phase="tool" toolName="get_schedule" />);
    expect(html).toContain("Looking up your schedule…");
  });

  it("falls back to a generic phrase for an unknown tool", () => {
    const html = renderToStaticMarkup(<AssistantStatus phase="tool" toolName="mystery" />);
    expect(html).toContain("Looking that up…");
  });

  it("exposes a live region for assistive tech", () => {
    const html = renderToStaticMarkup(<AssistantStatus phase="thinking" />);
    expect(html).toContain('aria-live="polite"');
  });
});
