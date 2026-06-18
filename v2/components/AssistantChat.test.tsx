import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The server actions the chat imports pull the supabase/google server clients at
// import; stub them so this stays a pure render test (their behaviour is covered
// by agentConfirm / agentFeedback tests).
vi.mock("@/lib/actions/agentConfirm", () => ({ confirmAgentProposal: vi.fn() }));
vi.mock("@/lib/actions/agentFeedback", () => ({ recordAgentFeedback: vi.fn() }));

const { AssistantChat } = await import("./AssistantChat");

// The /assistant route renders AssistantChat full-screen: it fills a 100dvh flex
// chain and pins the app shell via a body flag. Embedding it on the home page
// must NOT do either — it has to be a self-contained, height-capped card that
// scrolls its own transcript, or it would hijack the host page's scroll. These
// tests pin the layout difference at the markup level (effects don't run under
// renderToStaticMarkup, which is exactly the static surface we care about here).

// The full-screen panel root — today's behavior, must stay byte-identical.
const FULL_ROOT =
  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-canvas";

describe("AssistantChat layout modes", () => {
  it("full mode (default) fills the viewport flex chain — unchanged", () => {
    const html = renderToStaticMarkup(<AssistantChat writesEnabled={false} />);
    expect(html).toContain(FULL_ROOT);
    // No self-contained height cap: the full route relies on the 100dvh chain.
    expect(html).not.toContain("max-h-[70svh]");
  });

  it("embedded mode is a self-contained, height-capped card", () => {
    const html = renderToStaticMarkup(
      <AssistantChat embedded writesEnabled={false} />,
    );
    // Its own bounded height + internal scroll, never the viewport-fill root that
    // assumes the pinned 100dvh shell.
    expect(html).toContain("max-h-[70svh]");
    expect(html).not.toContain(FULL_ROOT);
  });

  it("renders the identical chat composer in both modes", () => {
    const full = renderToStaticMarkup(<AssistantChat writesEnabled={false} />);
    const embedded = renderToStaticMarkup(
      <AssistantChat embedded writesEnabled={false} />,
    );
    expect(full).toContain("Ask about your business…");
    expect(embedded).toContain("Ask about your business…");
  });
});
