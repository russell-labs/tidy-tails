import { expect, test } from "@playwright/test";

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

test("schedule appointment flow opens actions and prepares one grouped reminder", async ({
  page,
}) => {
  const tomorrow = isoDaysFromNow(1);

  await page.goto(`/schedule?view=day&day=${tomorrow}`);

  await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
  await expect(page.getByText("Sam net · Gross $150.00")).toBeVisible();
  await expect(page.getByText("Sam $105.00")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /10:00am[\s\S]*Pepper \+ Olive/ }),
  ).toHaveCount(1);

  await page.getByRole("link", { name: /10:00am[\s\S]*Pepper/ }).click();

  await expect(page.getByRole("heading", { name: "Pepper" })).toBeVisible();
  await expect(page.getByText("Gross$72.00")).toBeVisible();
  await expect(page.getByText("Sam net$50.40")).toBeVisible();
  await expect(page.getByText("Salon payoutSalon keeps 30%")).toBeVisible();

  await page.getByRole("button", { name: "Send reminder" }).click();
  await expect(page.getByText("Reminder for Pepper and Olive")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message" })).toContainText(
    "10:00am",
  );

  await page.getByRole("button", { name: "Review reminder" }).click();
  await expect(
    page.getByText(/Hi Theo, reminder that Pepper and Olive.*10:00am/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Confirm & send" }).click();
  await expect(page.getByText("Demo only — no text was sent")).toBeVisible();
});

test("login page offers Google sign-in", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
});

test("add appointment requires a service before review", async ({ page }) => {
  await page.goto("/clients/c18");

  await page.getByRole("button", { name: "Add appointment" }).click();
  await page.getByRole("textbox", { name: "Date", exact: true }).fill(isoDaysFromNow(28));
  await page.getByRole("button", { name: "10:15am", exact: true }).click();
  await page.getByRole("button", { name: "Review booking" }).click();

  await expect(page.getByText("Pick a service.")).toBeVisible();
});

test("editing an appointment can review a booking update text", async ({ page }) => {
  const tomorrow = isoDaysFromNow(1);

  await page.goto(`/schedule?view=day&day=${tomorrow}`);
  await page.getByRole("link", { name: /10:00am[\s\S]*Pepper/ }).click();
  await page.getByRole("button", { name: "Change or cancel appointment" }).click();

  await page.getByLabel("Appointment").selectOption({ label: "Pepper + Olive" });
  await page.getByRole("textbox", { name: "Date", exact: true }).fill(isoDaysFromNow(3));
  await page.getByRole("checkbox", { name: "Text updated booking to owner" }).check();
  await page.getByRole("button", { name: "Review changes" }).click();

  await expect(page.getByText("AppointmentPepper + Olive")).toBeVisible();
  await expect(page.getByText("Booking update text to send")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Booking update text to send" })).toContainText(
    "updated booking for Pepper + Olive",
  );
  await expect(page.getByRole("textbox", { name: "Booking update text to send" })).toContainText(
    "60 Olive Crescent",
  );
});

test("message center and notification bell reflect actionable SMS state", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "1 notifications" })).toBeVisible();

  await page.goto("/inbox");
  await expect(page.getByText("1Needs action")).toBeVisible();
  await expect(page.getByText("1SMS replies")).toBeVisible();
  await expect(page.getByText("Text from 705-555-0147")).toBeVisible();

  await page.goto("/inbox/client%3Ac03");
  await expect(page.getByRole("heading", { name: "Theo Brandt" })).toBeVisible();
  await expect(page.getByText("Customer reply")).toBeVisible();
  await expect(page.getByText("Question")).toBeVisible();
  await expect(page.getByText("Sam message")).toHaveCount(2);
  await expect(page.getByText("Delivered")).toBeVisible();
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
});

test("salon payout setting changes update schedule gross and Sam net totals", async ({
  page,
}) => {
  const tomorrow = isoDaysFromNow(1);

  await page.goto("/settings");
  await page.getByRole("heading", { name: "Salon locations" }).click();
  await page
    .locator("fieldset", { hasText: "Gina" })
    .getByLabel("Salon keeps %")
    .fill("50");
  await page.getByRole("button", { name: "Save salon settings" }).click();
  await expect(page.getByText("Salon settings saved.")).toBeVisible();

  await page.goto(`/schedule?view=day&day=${tomorrow}`);

  await expect(page.getByText("Sam net · Gross $150.00")).toBeVisible();
  await expect(page.getByText("Sam $75.00")).toBeVisible();
  await expect(page.getByText("Net $75.00")).toBeVisible();

  await page.getByRole("link", { name: /10:00am[\s\S]*Pepper/ }).click();
  await expect(page.getByText("Sam net$36.00")).toBeVisible();
  await expect(page.getByText("Salon payoutSalon keeps 50%")).toBeVisible();
});
