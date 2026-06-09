import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OwnerTakeHomeSection } from "./OwnerTakeHomeSection";
import type { OwnerTakeHomeView } from "@/lib/ownerEconomics";

// Pure presentation — rendered to static markup (no jsdom needed).

const withExpenses: OwnerTakeHomeView = {
  isWholeMonth: true,
  locations: [
    {
      locationName: "Cheryl's Shop",
      fees: 280,
      tips: 25,
      collected: 305,
      expenseLines: [
        { key: "rentMortgage", label: "Rent / mortgage", amount: 1200 },
        { key: "cleaning", label: "Cleaning", amount: 50 },
      ],
      totalExpenses: 1250,
      hasExpensesOnFile: true,
      takeHome: -945,
    },
  ],
};

describe("OwnerTakeHomeSection", () => {
  it("shows owner-operator framing — fees, tips, costs, your take-home — and never split words", () => {
    const html = renderToStaticMarkup(
      <OwnerTakeHomeSection view={withExpenses} />,
    );
    expect(html).toContain("Your take-home");
    expect(html).toContain("Cheryl&#x27;s Shop");
    expect(html).toContain("Fees");
    expect(html).toContain("Tips");
    expect(html).toContain("Collected");
    expect(html).toContain("Rent / mortgage");
    expect(html).toContain("Total costs");
    // No rented/split vocabulary.
    expect(html).not.toMatch(/salon/i);
    expect(html).not.toMatch(/payout/i);
    expect(html).not.toContain("%");
  });

  it("prompts to add costs when no expenses are on file (no fake take-home)", () => {
    const html = renderToStaticMarkup(
      <OwnerTakeHomeSection
        view={{
          isWholeMonth: true,
          locations: [
            {
              locationName: "Cheryl's Shop",
              fees: 280,
              tips: 25,
              collected: 305,
              expenseLines: [],
              totalExpenses: 0,
              hasExpensesOnFile: false,
              takeHome: null,
            },
          ],
        }}
      />,
    );
    expect(html).toContain("Add your monthly costs");
    // The take-home figure block (Total costs row) must NOT render.
    expect(html).not.toContain("Total costs");
  });

  it("asks for a single month when the range is not a whole month", () => {
    const html = renderToStaticMarkup(
      <OwnerTakeHomeSection
        view={{ ...withExpenses, isWholeMonth: false }}
      />,
    );
    expect(html).toContain("Pick a single month");
    // No take-home / costs figures for a partial range.
    expect(html).not.toContain("Total costs");
  });
});
