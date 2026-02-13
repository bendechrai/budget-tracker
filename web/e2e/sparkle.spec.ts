import { test, expect } from "@playwright/test";

test.describe("Sparkle Buttons", () => {
  test("sparkle button appears on income list items", async ({ page }) => {
    await page.goto("/income");
    await expect(page.getByTestId("page-title")).toBeVisible();

    // The seeded income source "Test Salary" should have a sparkle button
    const sparkleButtons = page.locator('[data-testid^="sparkle-button-"]');
    await expect(sparkleButtons.first()).toBeVisible();
  });

  test("sparkle button appears on obligation list items", async ({ page }) => {
    await page.goto("/obligations");
    await expect(page.getByTestId("page-title")).toBeVisible();

    // The seeded obligation "Test Rent" should have a sparkle button
    const sparkleButtons = page.locator('[data-testid^="sparkle-button-"]');
    await expect(sparkleButtons.first()).toBeVisible();
  });

  test("clicking sparkle button on income opens modal with summary and presets", async ({
    page,
  }) => {
    await page.goto("/income");
    await expect(page.getByTestId("page-title")).toBeVisible();

    // Click the first sparkle button
    const sparkleButton = page.locator('[data-testid^="sparkle-button-"]').first();
    await sparkleButton.click();

    // Modal should be visible
    const modal = page.locator('[data-testid^="sparkle-modal-"]').first();
    await expect(modal).toBeVisible();

    // Modal should show item summary
    await expect(page.getByTestId("sparkle-summary")).toBeVisible();

    // Modal should show preset action buttons
    await expect(page.getByTestId("sparkle-presets")).toBeVisible();

    // Income presets: amount, frequency, pause, delete
    await expect(page.getByTestId("sparkle-preset-amount")).toBeVisible();
    await expect(page.getByTestId("sparkle-preset-frequency")).toBeVisible();
    await expect(page.getByTestId("sparkle-preset-pause")).toBeVisible();
    await expect(page.getByTestId("sparkle-preset-delete")).toBeVisible();
  });

  test("clicking sparkle button on obligation opens modal with summary and presets", async ({
    page,
  }) => {
    await page.goto("/obligations");
    await expect(page.getByTestId("page-title")).toBeVisible();

    // Click the first sparkle button
    const sparkleButton = page.locator('[data-testid^="sparkle-button-"]').first();
    await sparkleButton.click();

    // Modal should be visible
    const modal = page.locator('[data-testid^="sparkle-modal-"]').first();
    await expect(modal).toBeVisible();

    // Modal should show item summary
    await expect(page.getByTestId("sparkle-summary")).toBeVisible();

    // Modal should show preset action buttons
    await expect(page.getByTestId("sparkle-presets")).toBeVisible();

    // Obligation presets: amount, escalation, frequency, dueDate, pause, delete
    await expect(page.getByTestId("sparkle-preset-amount")).toBeVisible();
    await expect(page.getByTestId("sparkle-preset-escalation")).toBeVisible();
    await expect(page.getByTestId("sparkle-preset-frequency")).toBeVisible();
    await expect(page.getByTestId("sparkle-preset-dueDate")).toBeVisible();
    await expect(page.getByTestId("sparkle-preset-pause")).toBeVisible();
    await expect(page.getByTestId("sparkle-preset-delete")).toBeVisible();
  });

  test("sparkle modal can be closed", async ({ page }) => {
    await page.goto("/income");
    await expect(page.getByTestId("page-title")).toBeVisible();

    // Open the sparkle modal
    const sparkleButton = page.locator('[data-testid^="sparkle-button-"]').first();
    await sparkleButton.click();

    const modal = page.locator('[data-testid^="sparkle-modal-"]').first();
    await expect(modal).toBeVisible();

    // Close the modal
    await page.getByTestId("sparkle-close").click();
    await expect(modal).not.toBeVisible();
  });
});
