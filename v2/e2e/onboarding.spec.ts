import { expect, test } from "@playwright/test";

// WS3 Slice B — onboarding wizard UI/validation smoke.
//
// The e2e harness runs the app in FIXTURES mode (NEXT_PUBLIC_USE_LIVE_DATA=off)
// against a placeholder Supabase URL, with the e2e auth bypass on. So this test
// drives the wizard's multi-step UI and client-side gating up to the review
// step; it does NOT submit, because the real org-creation write path needs a
// live database. The true signup -> confirm -> onboarding -> first-screen path
// is the manual staging acceptance demo (per the WS3 plan), not this job.

test("onboarding wizard walks business -> scheduling -> locations -> economics -> review", async ({
  page,
}) => {
  await page.goto("/onboarding");

  // Step 1 — business name; Continue is gated until a name is entered.
  await expect(page.getByText("Step 1 of 5 — Business")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

  await page.getByLabel("Business name").fill("Cheryl's Mobile Grooming");
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 — scheduling style (generic; not Sam-specific).
  await expect(page.getByText("Step 2 of 5 — Scheduling")).toBeVisible();
  await page.getByText("By appointment time (1:1 blocks)").click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3 — a generic location (name + address), not hardcoded gina/annette.
  await expect(page.getByText("Step 3 of 5 — Locations")).toBeVisible();
  await page.getByLabel("Name").fill("Downtown van");
  await page.getByLabel("Address").fill("100 King St W, Toronto");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4 — economics (percent payout default).
  await expect(page.getByText("Step 4 of 5 — Economics")).toBeVisible();
  await expect(page.getByLabel("Salon keeps %")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 5 — review reflects the captured answers and offers to create.
  await expect(page.getByText("Step 5 of 5 — Review")).toBeVisible();
  await expect(page.getByText("Cheryl's Mobile Grooming")).toBeVisible();
  await expect(
    page.getByText(/Downtown van — 100 King St W, Toronto/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create my business" }),
  ).toBeVisible();
});

test("onboarding requires a daily rate before leaving the economics step", async ({
  page,
}) => {
  await page.goto("/onboarding");

  await page.getByLabel("Business name").fill("Flat Rate Grooming");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // scheduling default

  await page.getByLabel("Name").fill("Main shop");
  await page.getByLabel("Address").fill("5 High St");
  await page.getByRole("button", { name: "Continue" }).click();

  // Switch this location to a flat daily rate but leave the rate blank.
  await page.getByLabel("Payout model").selectOption("daily_rate");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

  await page.getByLabel("Daily rate ($)").fill("85");
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
});
