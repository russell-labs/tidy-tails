import { readFileSync } from "fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OneToOneDaySummary } from "@/lib/scheduling/oneToOne";
import { OneToOneDayLoadStrip } from "./OneToOneAddAppointment";

function summary(overrides: Partial<OneToOneDaySummary> = {}): OneToOneDaySummary {
  return {
    date: "2026-06-20",
    totalDogs: 3,
    bookedMinutes: 225,
    workingDayMinutes: 600,
    softTarget: 7,
    overTarget: false,
    largeDogs: 2,
    gettingHeavy: false,
    ...overrides,
  };
}

describe("OneToOneDayLoadStrip (TT-013)", () => {
  it("shows the day's load against the working-day window", () => {
    const html = renderToStaticMarkup(
      <OneToOneDayLoadStrip dayLoad={summary()} />,
    );
    expect(html).toContain("3h 45m of ~10h booked · 2 large");
  });

  it("warns when the day is getting heavy", () => {
    const html = renderToStaticMarkup(
      <OneToOneDayLoadStrip dayLoad={summary({ gettingHeavy: true })} />,
    );
    expect(html).toContain("your day&#x27;s getting full");
    expect(html).toContain("text-warn");
  });

  it("is advisory only — never a disabled control", () => {
    const html = renderToStaticMarkup(
      <OneToOneDayLoadStrip dayLoad={summary({ gettingHeavy: true })} />,
    );
    expect(html).not.toContain("<button");
    expect(html).not.toContain("disabled");
  });
});

describe("OneToOneAddAppointment wiring (TT-013)", () => {
  const source = readFileSync("components/OneToOneAddAppointment.tsx", "utf8");

  it("captures the day load from availability and renders the strip", () => {
    expect(source).toContain("result.dayLoad");
    expect(source).toContain("<OneToOneDayLoadStrip");
  });

  it("does not gate any open-time slot button on load", () => {
    // The slot buttons toggle selection only; load never adds a `disabled`.
    const slotButton = source.slice(
      source.indexOf("slots.map"),
      source.indexOf("slots.map") + 600,
    );
    expect(slotButton).not.toContain("disabled");
    expect(slotButton).not.toContain("gettingHeavy");
  });
});
