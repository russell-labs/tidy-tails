import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// M2 contract tests: the service worker and offline page are plain static
// files, so these read them as text and pin the behaviors the PWA relies on.
// If a future change drops the offline fallback, the versioned cache name,
// or the clear-caches handler, this fails the build instead of silently
// shipping a broken or tenant-leaky shell.

const sw = readFileSync(join(__dirname, "..", "public", "sw.js"), "utf8");
const offline = readFileSync(
  join(__dirname, "..", "public", "offline.html"),
  "utf8",
);

describe("service worker contract", () => {
  it("uses a versioned cache name with a single bump knob", () => {
    expect(sw).toMatch(/const VERSION = "v\d+"/);
    expect(sw).toContain("tidy-tails-v2-shell-${VERSION}");
  });

  it("precaches the offline page at install", () => {
    expect(sw).toContain('const OFFLINE_URL = "/offline.html"');
    expect(sw).toMatch(/install[\s\S]*cache\.add\(OFFLINE_URL\)/);
  });

  it("falls back to the offline page, never to '/'", () => {
    expect(sw).toMatch(/catch[\s\S]*caches\.match\(OFFLINE_URL\)/);
    expect(sw).not.toMatch(/caches\.match\("\/"\)/);
  });

  it("clears all caches on the sign-out message", () => {
    expect(sw).toContain("TIDY_CLEAR_CACHES");
    expect(sw).toMatch(/message[\s\S]*caches\.delete/);
  });

  it("drops old cache versions on activate", () => {
    expect(sw).toMatch(/activate[\s\S]*filter\(\(k\) => k !== CACHE\)/);
  });
});

describe("offline page contract", () => {
  it("is a self-contained, tenant-neutral page", () => {
    expect(offline).toContain("You&rsquo;re offline");
    // Self-contained: no external stylesheets, scripts, or images.
    expect(offline).not.toMatch(/<link[^>]+stylesheet/);
    expect(offline).not.toMatch(/src=/);
    // Tenant-neutral: no operator or tenant names baked in.
    expect(offline).not.toMatch(/Sam|Samantha|Cheryl|Gina|Annette/);
  });

  it("offers a retry", () => {
    expect(offline).toContain("location.reload()");
  });
});
