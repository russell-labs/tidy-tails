import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HouseholdCardData } from "./HouseholdCard";

// HomeSearch pulls the Add-household and (via the launcher) assistant server
// actions at import; stub them so this is a pure render test of the gate.
vi.mock("@/lib/actions/intake", () => ({ saveIntake: vi.fn() }));
vi.mock("@/lib/actions/agentConfirm", () => ({ confirmAgentProposal: vi.fn() }));
vi.mock("@/lib/actions/agentFeedback", () => ({ recordAgentFeedback: vi.fn() }));

const { HomeSearch } = await import("./HomeSearch");

const HOUSEHOLDS: HouseholdCardData[] = [
  {
    id: "h1",
    firstName: "Ada",
    lastName: "Lovelace",
    name: "Ada Lovelace",
    phone: "5551234567",
    lastVisit: null,
    pets: [],
  },
];

// The launcher's accessible name — unique to it, so its presence is a clean proxy.
const LAUNCHER = "Ask about your business — open the assistant";

describe("HomeSearch — assistant launcher gate", () => {
  it("hides the launcher entirely when the agent is disabled", () => {
    const html = renderToStaticMarkup(
      <HomeSearch
        households={HOUSEHOLDS}
        mode="fixtures"
        agentEnabled={false}
        writesEnabled={false}
      />,
    );
    expect(html).not.toContain(LAUNCHER);
  });

  it("shows the launcher under the contacts list when the agent is enabled", () => {
    const html = renderToStaticMarkup(
      <HomeSearch
        households={HOUSEHOLDS}
        mode="fixtures"
        agentEnabled
        writesEnabled={false}
      />,
    );
    expect(html).toContain(LAUNCHER);
  });

  it("omits the launcher on the empty first-run screen even when enabled", () => {
    const html = renderToStaticMarkup(
      <HomeSearch households={[]} mode="fixtures" agentEnabled writesEnabled={false} />,
    );
    expect(html).not.toContain(LAUNCHER);
  });
});
