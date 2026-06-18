import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The embedded chat pulls the assistant server actions at import; stub them so
// this is a pure render test (their behaviour is covered elsewhere).
vi.mock("@/lib/actions/agentConfirm", () => ({ confirmAgentProposal: vi.fn() }));
vi.mock("@/lib/actions/agentFeedback", () => ({ recordAgentFeedback: vi.fn() }));

const { HomeAssistantLauncher } = await import("./HomeAssistantLauncher");

describe("HomeAssistantLauncher", () => {
  it("collapsed by default: shows only the slim composer-style bar", () => {
    const html = renderToStaticMarkup(
      <HomeAssistantLauncher writesEnabled={false} />,
    );
    // The single tap target that opens the assistant, and its composer-look hint.
    // Accessible name leads with the visible bar text (WCAG 2.5.3 Label in Name).
    expect(html).toContain("Ask about your business — open the assistant");
    expect(html).toContain("Ask about your business…");
    // Collapsed = nothing else: no expanded chat, no collapse control.
    expect(html).not.toContain("max-h-[70svh]");
    expect(html).not.toContain("Minimize");
  });

  it("expanded: boxes in the embedded chat with a collapse control", () => {
    const html = renderToStaticMarkup(
      <HomeAssistantLauncher writesEnabled={false} defaultExpanded />,
    );
    // The embedded (height-capped, non-viewport-pinning) chat card…
    expect(html).toContain("max-h-[70svh]");
    // …its composer…
    expect(html).toContain("Ask about your business…");
    // …and a way back to the slim bar.
    expect(html).toContain("Minimize");
  });

  it("passes writes capability through to the embedded chat", () => {
    // writesEnabled=false → the read-only capability line; true → the write one.
    const readOnly = renderToStaticMarkup(
      <HomeAssistantLauncher writesEnabled={false} defaultExpanded />,
    );
    const writeable = renderToStaticMarkup(
      <HomeAssistantLauncher writesEnabled defaultExpanded />,
    );
    // (apostrophe-free substrings — renderToStaticMarkup escapes ' to &#x27;)
    expect(readOnly).toContain("book, text, or change anything");
    expect(writeable).not.toContain("book, text, or change anything");
  });
});
