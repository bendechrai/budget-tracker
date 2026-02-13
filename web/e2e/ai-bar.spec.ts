import { test, expect } from "@playwright/test";

test.describe("AI Bar", () => {
  test("pill is visible on authenticated page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("ai-bar")).toBeVisible();
    await expect(page.getByTestId("ai-bar-pill")).toBeVisible();
  });

  test("clicking pill expands the input field", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("ai-bar-pill").click();

    await expect(page.getByTestId("ai-bar-panel")).toBeVisible();
    await expect(page.getByTestId("ai-bar-input")).toBeVisible();
    await expect(page.getByTestId("ai-bar-submit")).toBeVisible();
  });

  test("typing and submitting shows a response area", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("ai-bar-pill").click();

    const input = page.getByTestId("ai-bar-input");
    await input.fill("hello");
    await page.getByTestId("ai-bar-submit").click();

    // Should show either a response or an error (API key may not be set)
    await expect(page.getByTestId("ai-bar-response")).toBeVisible({ timeout: 10_000 });
  });

  test("persists across navigation", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("ai-bar")).toBeVisible();

    // Expand the bar
    await page.getByTestId("ai-bar-pill").click();
    await expect(page.getByTestId("ai-bar-panel")).toBeVisible();

    // Navigate to another page
    const nav = page.getByTestId("nav");
    await nav.getByRole("link", { name: "Income" }).click();
    await page.waitForURL("**/income");

    // AI bar should still be present
    await expect(page.getByTestId("ai-bar")).toBeVisible();

    // Navigate again
    await nav.getByRole("link", { name: "Obligations" }).click();
    await page.waitForURL("**/obligations");

    await expect(page.getByTestId("ai-bar")).toBeVisible();
  });

  test("can be collapsed after expanding", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("ai-bar-pill").click();
    await expect(page.getByTestId("ai-bar-panel")).toBeVisible();

    await page.getByTestId("ai-bar-close").click();
    await expect(page.getByTestId("ai-bar-pill")).toBeVisible();
    await expect(page.getByTestId("ai-bar-panel")).not.toBeVisible();
  });
});
