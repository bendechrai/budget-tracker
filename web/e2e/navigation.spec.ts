import { test, expect } from "@playwright/test";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/income", label: "Income" },
  { href: "/obligations", label: "Obligations" },
  { href: "/import", label: "Import" },
  { href: "/transactions", label: "Transactions" },
  { href: "/suggestions", label: "Suggestions" },
];

test.describe("Navigation", () => {
  for (const link of navLinks) {
    test(`clicking "${link.label}" navigates to ${link.href}`, async ({ page }) => {
      // Start from a different page to ensure navigation actually occurs
      const startPath = link.href === "/dashboard" ? "/income" : "/dashboard";
      await page.goto(startPath);
      await expect(page.getByTestId("nav")).toBeVisible();

      // Click the nav link
      const nav = page.getByTestId("nav");
      await nav.getByRole("link", { name: link.label }).click();

      // Verify we navigated to the correct page
      await page.waitForURL(`**${link.href}`);
      await expect(page).toHaveURL(new RegExp(`${link.href}$`));
    });

    test(`"${link.label}" link has active state on ${link.href}`, async ({ page }) => {
      await page.goto(link.href);

      const nav = page.getByTestId("nav");
      const navLink = nav.getByRole("link", { name: link.label });
      await expect(navLink).toHaveAttribute("aria-current", "page");
    });
  }

  test("nav and AI bar remain visible after navigation", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("nav")).toBeVisible();
    await expect(page.getByTestId("ai-bar")).toBeVisible();

    // Navigate to another page
    const nav = page.getByTestId("nav");
    await nav.getByRole("link", { name: "Income" }).click();
    await page.waitForURL("**/income");

    // Verify layout elements are still present
    await expect(page.getByTestId("nav")).toBeVisible();
    await expect(page.getByTestId("ai-bar")).toBeVisible();

    // Navigate again
    await nav.getByRole("link", { name: "Obligations" }).click();
    await page.waitForURL("**/obligations");

    await expect(page.getByTestId("nav")).toBeVisible();
    await expect(page.getByTestId("ai-bar")).toBeVisible();
  });

  test("only the current page link has active state", async ({ page }) => {
    await page.goto("/income");
    const nav = page.getByTestId("nav");

    // Income should be active
    await expect(nav.getByRole("link", { name: "Income" })).toHaveAttribute("aria-current", "page");

    // Others should not be active
    await expect(nav.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Obligations" })).not.toHaveAttribute("aria-current", "page");
  });
});
