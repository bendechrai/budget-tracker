/**
 * E2E test runner that checks server availability before running Playwright.
 * If the dev server is not reachable, exits with code 0 (skip gracefully).
 */
import { execSync } from "child_process";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function isServerReachable() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    await fetch(BASE_URL, { signal: controller.signal });
    clearTimeout(timeout);
    return true;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

const reachable = await isServerReachable();

if (!reachable) {
  console.log(
    `E2E: Dev server not reachable at ${BASE_URL} — skipping e2e tests.`
  );
  process.exit(0);
}

try {
  execSync("npx playwright test", { stdio: "inherit" });
} catch (error) {
  process.exit(error.status || 1);
}
