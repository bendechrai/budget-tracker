# UI Testing (Playwright)

## Overview

End-to-end browser tests using Playwright that verify page structure, navigation, and interactive components work correctly across the app. These tests run in Ralph's validation loop alongside tsc, lint, and unit tests.

## Why

Unit tests validate logic in isolation but miss layout, routing, and integration issues — like a shared header/footer disappearing on certain routes because pages aren't nested under the correct layout. Playwright tests catch what the user actually sees.

## Behavior

### Test Structure

- Tests live in `web/e2e/` (separate from unit tests in `__tests__/`)
- Each test file covers one area: navigation, layout, forms, AI bar, etc.
- Tests run against the dev server inside Docker (same `web` container)
- Playwright runs in headed mode inside the container using the bundled Chromium

### What to Test

**Layout persistence (every authenticated route):**
- Header with nav links is visible
- Footer / AI bar is visible
- Page-specific content renders (not a blank page)
- Test every route: `/dashboard`, `/income`, `/obligations`, `/transactions`, `/suggestions`, `/import`

**Navigation:**
- Clicking each nav link navigates to the correct page
- Header and footer remain visible after navigation
- Active nav item is highlighted on the correct page

**Authentication gating:**
- Unauthenticated users are redirected to `/login`
- Login page does not show the app header/footer

**AI Bar (structural, not AI logic):**
- AI bar pill is visible on all authenticated pages
- Clicking the pill expands the input field
- Typing and submitting shows a response area
- Bar persists across navigation (doesn't reset)

**Sparkle Buttons:**
- Sparkle button appears on income and obligation list items
- Clicking opens the modal/popover
- Modal shows item summary and action buttons

**Forms (smoke tests):**
- Income source form submits successfully
- Obligation form submits successfully
- Form validation errors display on invalid input

### Authentication in Tests

- Use Playwright's `storageState` to persist auth across tests
- Create a global setup that logs in once and saves the session
- All test files reuse the saved session — no login per test

## Technical Approach

### Dependencies

- `@playwright/test` as a dev dependency
- Playwright config at `web/playwright.config.ts`
- Scripts in `package.json`: `"test:e2e": "npx playwright test"`

### Docker Integration

- Playwright runs inside the `web` container against `localhost:3000`
- Install Chromium in the Dockerfile (`npx playwright install --with-deps chromium`)
- No need for a separate Playwright container

### Ralph Validation Loop

- Add `npm run test:e2e` to Ralph's validation step (after `tsc`, `lint`, and `test`)
- E2E tests only run when the dev server is up (skip gracefully if not)
- Keep the test suite fast — target under 30 seconds total

### Test Data

- Use Prisma to seed a test user and sample data in global setup
- Clean up test data in global teardown
- Tests should not depend on each other's data

## Edge Cases

- Server not running: tests skip with a clear message, don't fail the build
- Slow container startup: configure Playwright `webServer` to wait for ready
- Flaky selectors: use `data-testid` attributes, not CSS classes or text content
- Auth expiry: global setup creates a fresh session each run

## Acceptance Criteria

- [ ] Playwright is installed and configured in the web container
- [ ] `npm run test:e2e` runs Playwright tests
- [ ] Global setup logs in and saves auth session
- [ ] Layout test verifies header + footer on every authenticated route
- [ ] Navigation test clicks each nav link and verifies the page loads with layout intact
- [ ] AI bar structural test verifies expand/collapse and persistence across navigation
- [ ] Auth test verifies redirect to login for unauthenticated users
- [ ] Tests pass in Docker (Ralph's validation loop)
- [ ] Tests skip gracefully when dev server is not running
- [ ] Total e2e suite runs in under 30 seconds
