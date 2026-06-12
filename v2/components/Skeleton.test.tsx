import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomeLoading from "../app/(app)/loading";
import ScheduleLoading from "../app/(app)/schedule/loading";
import ClientLoading from "../app/(app)/clients/[id]/loading";
import InboxLoading from "../app/(app)/inbox/loading";
import ReportsLoading from "../app/(app)/reports/loading";
import { SkeletonBlock, SkeletonPage } from "./Skeleton";

// M1: every (app) route the plan named has a loading skeleton that announces
// itself accessibly and keeps the shimmer blocks decorative.

const routes: Array<[string, () => React.ReactElement, string]> = [
  ["home", HomeLoading, "Loading clients"],
  ["schedule", ScheduleLoading, "Loading schedule"],
  ["client", ClientLoading, "Loading household"],
  ["inbox", InboxLoading, "Loading inbox"],
  ["reports", ReportsLoading, "Loading reports"],
];

describe("route loading skeletons", () => {
  for (const [name, Loading, label] of routes) {
    it(`${name} renders a labelled status region`, () => {
      const html = renderToStaticMarkup(<Loading />);
      expect(html).toContain('role="status"');
      expect(html).toContain(`aria-label="${label}"`);
      // Screen-reader text without exposing shimmer noise.
      expect(html).toContain("sr-only");
      expect(html).toContain("animate-pulse");
    });
  }

  it("keeps shimmer blocks decorative (aria-hidden)", () => {
    const html = renderToStaticMarkup(<SkeletonBlock className="h-4 w-10" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("animate-pulse");
  });

  it("page wrapper matches the app main padding shape", () => {
    const html = renderToStaticMarkup(
      <SkeletonPage label="Loading x">
        <div>child</div>
      </SkeletonPage>,
    );
    expect(html).toContain('class="px-4 py-4"');
    expect(html).toContain("child");
  });
});
