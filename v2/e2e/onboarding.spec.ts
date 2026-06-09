import { expect, test } from "@playwright/test";

// Onboarding wizard UI/validation smoke (WS3 + TT-004/005).
//
// Fixtures mode + the e2e auth bypass: this drives the wizard's multi-step UI
// (structure → business → scheduling → locations → economics → review) and the
// owned/rented economics branch + review Back/Edit. It does NOT submit — the real
// org-creation write needs a live DB; that's the staging acceptance demo.

async function fillToLocations(page: import("@playwright/test").Page, structure: string) {
  await page.goto("/onboarding");
  await expect(page.getByText("Step 1 of 6 — Structure")).toBeVisible();
  if (structure !== "own") {
    await page.getByText(structure).click();
  }
  await page.getByRole("button", { name: "Continue" }).click(); // -> Business
  await page.getByLabel("Business name").fill("Rusty's Shop");
  await page.getByRole("button", { name: "Continue" }).click(); // -> Scheduling
  await page.getByRole("button", { name: "Continue" }).click(); // -> Locations
  await page.getByLabel("Name").fill("Rusty's Shop");
  await page.getByLabel("Address").fill("5 Main St");
}

test("owner-operator can mark a location owned and enter expenses (no payout)", async ({
  page,
}) => {
  await fillToLocations(page, "own");
  // Structure 'own' defaults the location to owned.
  await expect(page.getByRole("button", { name: "I own it" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Continue" }).click(); // -> Economics

  await expect(page.getByText("Step 5 of 6 — Economics")).toBeVisible();
  // Owned branch: expense categories, no "shop keeps %".
  await expect(page.getByText("You keep 100% here.")).toBeVisible();
  await expect(page.getByLabel("Rent / mortgage")).toBeVisible();
  await expect(page.getByText("The shop keeps %")).toHaveCount(0);
  await page.getByLabel("Rent / mortgage").fill("1500");
  await page.getByRole("button", { name: "Continue" }).click(); // -> Review

  await expect(page.getByText("Step 6 of 6 — Review")).toBeVisible();
  await expect(page.getByText(/own — keep 100%, 1 expense/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create my business" })).toBeVisible();
});

test("a rented location keeps the percent / daily-rate flow and validates the rate", async ({
  page,
}) => {
  await fillToLocations(page, "I work at other shops");
  // works_for_others defaults the location to rented.
  await expect(
    page.getByRole("button", { name: "I rent / get a cut" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Continue" }).click(); // -> Economics

  await expect(page.getByLabel(/The shop.s cut/)).toBeVisible();
  await page.getByLabel(/The shop.s cut/).selectOption("daily_rate");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await page.getByLabel("Daily rate ($)").fill("85");
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
});

test("the works-for-others structure de-emphasizes scheduling", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByText("I work at other shops").click();
  await page.getByRole("button", { name: "Continue" }).click(); // -> Business
  await page.getByLabel("Business name").fill("Chair Renter");
  await page.getByRole("button", { name: "Continue" }).click(); // -> Scheduling
  await expect(
    page.getByText(/they set the schedule/i),
  ).toBeVisible();
});

test("the review step supports Back and per-section Edit", async ({ page }) => {
  await fillToLocations(page, "own");
  await page.getByRole("button", { name: "Continue" }).click(); // -> Economics
  await page.getByRole("button", { name: "Continue" }).click(); // -> Review
  await expect(page.getByText("Step 6 of 6 — Review")).toBeVisible();

  // Per-section Edit jumps to the right step, pre-filled.
  await page
    .getByRole("button", { name: "Edit" })
    .nth(1) // the "Business" row's Edit
    .click();
  await expect(page.getByText("Step 2 of 6 — Business")).toBeVisible();
  await expect(page.getByLabel("Business name")).toHaveValue("Rusty's Shop");
  await page.getByLabel("Business name").fill("Rusty's Grooming");

  // Walk forward to review and confirm the edit round-tripped.
  await page.getByRole("button", { name: "Continue" }).click(); // -> Scheduling
  await page.getByRole("button", { name: "Continue" }).click(); // -> Locations
  await page.getByRole("button", { name: "Continue" }).click(); // -> Economics
  await page.getByRole("button", { name: "Continue" }).click(); // -> Review
  await expect(page.getByText(/Rusty's Grooming/)).toBeVisible();

  // Review Back returns to Economics.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Step 5 of 6 — Economics")).toBeVisible();
});
