import { test, expect } from "@playwright/test";

const authenticatedRoutes = [
  { path: "/dashboard", title: "Dashboard" },
  { path: "/income", title: "Income Sources" },
  { path: "/obligations", title: "Obligations" },
  { path: "/transactions", title: "Transactions" },
  { path: "/suggestions", title: "Suggestions" },
  { path: "/import", title: "Import Statements" },
];

for (const route of authenticatedRoutes) {
  test(`${route.path} has nav visible`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByTestId("nav")).toBeVisible();
  });

  test(`${route.path} has AI bar visible`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByTestId("ai-bar")).toBeVisible();
  });

  test(`${route.path} renders page content`, async ({ page }) => {
    await page.goto(route.path);
    const pageTitle = page.getByTestId("page-title");
    await expect(pageTitle).toBeVisible();
    await expect(pageTitle).toHaveText(route.title);
  });
}
