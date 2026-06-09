import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FirstRunEmptyState } from "./FirstRunEmptyState";

// Rendered to static markup (no jsdom needed) — the component is pure
// presentation, so asserting the output HTML is enough.

describe("FirstRunEmptyState", () => {
  it("renders the title and description", () => {
    const html = renderToStaticMarkup(
      <FirstRunEmptyState
        title="Welcome to Tidy Tails"
        description="Add your first client to get started."
      />,
    );
    expect(html).toContain("Welcome to Tidy Tails");
    expect(html).toContain("Add your first client to get started.");
  });

  it("renders the action when provided", () => {
    const html = renderToStaticMarkup(
      <FirstRunEmptyState
        title="t"
        description="d"
        action={<button type="button">Add household</button>}
      />,
    );
    expect(html).toContain("Add household");
  });

  it("omits the action wrapper when no action is given", () => {
    const html = renderToStaticMarkup(
      <FirstRunEmptyState title="t" description="d" />,
    );
    // The action wrapper uses max-w-xs; absent means no action region rendered.
    expect(html).not.toContain("max-w-xs");
  });
});
