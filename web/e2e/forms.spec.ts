import { test, expect } from "@playwright/test";

test.describe("Form Smoke Tests", () => {
  test.describe("Income Source Form", () => {
    test("submits successfully and new item appears in list", async ({
      page,
    }) => {
      await page.goto("/income/new");
      await expect(
        page.getByRole("heading", { name: "Add Income Source" })
      ).toBeVisible();

      // Fill in required fields
      await page.locator("#income-name").fill("E2E Freelance");
      await page.locator("#income-amount").fill("3000");
      await page.locator("#income-frequency").selectOption("monthly");

      // Submit the form
      await page.getByRole("button", { name: "Add Income Source" }).click();

      // Should redirect to income list
      await page.waitForURL("**/income");
      await expect(page.getByTestId("page-title")).toHaveText("Income Sources");

      // New item should appear in the list
      await expect(page.getByText("E2E Freelance")).toBeVisible();
    });

    test("shows validation error when name is missing", async ({ page }) => {
      await page.goto("/income/new");
      await expect(
        page.getByRole("heading", { name: "Add Income Source" })
      ).toBeVisible();

      // Fill amount but leave name empty
      await page.locator("#income-amount").fill("1000");

      // Submit the form
      await page.getByRole("button", { name: "Add Income Source" }).click();

      // Should show validation error
      await expect(page.locator('[role="alert"]')).toBeVisible();
      await expect(page.locator('[role="alert"]')).toHaveText(
        "Name is required"
      );

      // Should still be on the form page (not redirected)
      await expect(
        page.getByRole("heading", { name: "Add Income Source" })
      ).toBeVisible();
    });
  });

  test.describe("Obligation Form", () => {
    test("submits successfully and new item appears in list", async ({
      page,
    }) => {
      await page.goto("/obligations/new");
      await expect(
        page.getByRole("heading", { name: "Add Obligation" })
      ).toBeVisible();

      // Fill in required fields for a recurring obligation
      await page.locator("#obligation-name").fill("E2E Gym");
      await page.locator("#obligation-type").selectOption("recurring");
      await page.locator("#obligation-amount").fill("50");
      await page.locator("#obligation-frequency").selectOption("monthly");
      await page.locator("#obligation-start-date").fill("2026-01-01");
      await page.locator("#obligation-next-due-date").fill("2026-03-01");

      // Submit the form
      await page.getByRole("button", { name: "Add Obligation" }).click();

      // Should redirect to obligations list
      await page.waitForURL("**/obligations");
      await expect(page.getByTestId("page-title")).toHaveText("Obligations");

      // New item should appear in the list
      await expect(page.getByText("E2E Gym")).toBeVisible();
    });

    test("shows validation error when name is missing", async ({ page }) => {
      await page.goto("/obligations/new");
      await expect(
        page.getByRole("heading", { name: "Add Obligation" })
      ).toBeVisible();

      // Fill some fields but leave name empty
      await page.locator("#obligation-amount").fill("100");
      await page.locator("#obligation-start-date").fill("2026-01-01");
      await page.locator("#obligation-next-due-date").fill("2026-03-01");

      // Submit the form
      await page.getByRole("button", { name: "Add Obligation" }).click();

      // Should show validation error
      await expect(page.locator('[role="alert"]')).toBeVisible();
      await expect(page.locator('[role="alert"]')).toHaveText(
        "Name is required"
      );

      // Should still be on the form page
      await expect(
        page.getByRole("heading", { name: "Add Obligation" })
      ).toBeVisible();
    });

    test("shows validation error when dates are missing", async ({ page }) => {
      await page.goto("/obligations/new");
      await expect(
        page.getByRole("heading", { name: "Add Obligation" })
      ).toBeVisible();

      // Fill name and amount but leave dates empty
      await page.locator("#obligation-name").fill("Missing Dates");
      await page.locator("#obligation-amount").fill("100");

      // Submit the form
      await page.getByRole("button", { name: "Add Obligation" }).click();

      // Should show validation error about dates
      await expect(page.locator('[role="alert"]')).toBeVisible();
      await expect(page.locator('[role="alert"]')).toHaveText(
        "Start date is required"
      );
    });
  });
});
