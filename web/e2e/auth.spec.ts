import { test, expect } from "@playwright/test";

// Use an empty storage state — no auth session
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Authentication gating", () => {
  test("unauthenticated request to /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login/);
  });

  test("login page does not show app nav or AI bar", async ({ page }) => {
    await page.goto("/login");

    // Nav and AI bar should NOT be present
    await expect(page.getByTestId("nav")).not.toBeVisible();
    await expect(page.getByTestId("ai-bar")).not.toBeVisible();

    // Login form should be visible
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });
});
