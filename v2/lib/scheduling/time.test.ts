import { describe, expect, it } from "vitest";
import { blocksOverlap, formatMinutes, parseTimeToMinutes } from "./time";

describe("parseTimeToMinutes", () => {
  it("parses canonical slot strings", () => {
    expect(parseTimeToMinutes("9:00am")).toBe(540);
    expect(parseTimeToMinutes("10:00am")).toBe(600);
    expect(parseTimeToMinutes("12:00pm")).toBe(720);
    expect(parseTimeToMinutes("1:00pm")).toBe(780);
    expect(parseTimeToMinutes("12:00am")).toBe(0);
    expect(parseTimeToMinutes("11:30am")).toBe(690);
  });

  it("tolerates spacing, case, and periods", () => {
    expect(parseTimeToMinutes("10:00 AM")).toBe(600);
    expect(parseTimeToMinutes("10:00 a.m.")).toBe(600);
  });

  it("returns null for anything it cannot confidently parse", () => {
    expect(parseTimeToMinutes("noon")).toBeNull();
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes(null)).toBeNull();
    expect(parseTimeToMinutes("25:00am")).toBeNull();
    expect(parseTimeToMinutes("10:75am")).toBeNull();
    expect(parseTimeToMinutes("morning")).toBeNull();
  });
});

describe("formatMinutes round-trips with parseTimeToMinutes", () => {
  for (const m of [0, 540, 600, 690, 720, 780, 1035]) {
    it(`formats and re-parses ${m}`, () => {
      expect(parseTimeToMinutes(formatMinutes(m))).toBe(m);
    });
  }
  it("matches the booking tile shape", () => {
    expect(formatMinutes(600)).toBe("10:00am");
    expect(formatMinutes(720)).toBe("12:00pm");
    expect(formatMinutes(0)).toBe("12:00am");
  });
});

describe("blocksOverlap", () => {
  it("detects overlap and lets touching blocks pass (buffer 0)", () => {
    expect(blocksOverlap(600, 60, 630, 30)).toBe(true); // 10:00-11:00 vs 10:30-11:00
    expect(blocksOverlap(600, 60, 660, 30)).toBe(false); // touch at 11:00
    expect(blocksOverlap(660, 30, 600, 60)).toBe(false); // symmetric
    expect(blocksOverlap(600, 60, 700, 30)).toBe(false); // clear gap
  });

  it("requires the buffer gap when set", () => {
    expect(blocksOverlap(600, 60, 675, 30, 15)).toBe(false); // exactly 15-min gap ok
    expect(blocksOverlap(600, 60, 670, 30, 15)).toBe(true); // 10-min gap conflicts
    expect(blocksOverlap(600, 60, 660, 30, 15)).toBe(true); // touching conflicts with buffer
  });
});
