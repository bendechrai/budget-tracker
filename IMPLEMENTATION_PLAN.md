# Implementation Plan

## Completed

- [x] **Add `User` model with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/01-auth.md`
  - Acceptance: `User` model exists in schema with fields: id, email (unique), passwordHash, currencySymbol (default "$"), onboardingComplete (default false), currentFundBalance (default 0), maxContributionPerCycle (nullable), contributionCycleDays (nullable), createdAt, updatedAt. Migration runs cleanly.
  - Tests: Prisma generate succeeds; migration applies without errors

- [x] **Add `logError` utility in `web/lib/logging.ts`**
  - Files: `web/lib/logging.ts`
  - Spec: `AGENTS.md` convention
  - Acceptance: `logError()` function exported, logs errors with context. Used in catch blocks throughout the app.
  - Tests: Unit test for `logError` verifying it logs to console.error with expected format

- [x] **Add password hashing utilities**
  - Files: `web/lib/auth/password.ts`, `web/package.json` (add bcryptjs)
  - Spec: `specs/01-auth.md`
  - Acceptance: `hashPassword(plain)` and `verifyPassword(plain, hash)` functions exported and working
  - Tests: Unit test: hash a password, verify it matches; verify wrong password fails

- [x] **Add session management utilities**
  - Files: `web/lib/auth/session.ts`, `web/package.json` (add jose), `web/lib/env.ts`, `.env.devports`, `docker-compose.yml.devports`
  - Spec: `specs/01-auth.md`
  - Acceptance: Functions to create session, read session from cookies, and destroy session. Sessions persist across browser refreshes.
  - Tests: Unit test: create a session token, parse it back, verify payload

- [x] **Add `POST /api/auth/signup` route**
  - Files: `web/app/api/auth/signup/route.ts`
  - Spec: `specs/01-auth.md`
  - Acceptance: Creates user with hashed password, returns session cookie. Rejects duplicate email with 409 and message "email already registered". Enforces minimum 8-char password.
  - Tests: Test signup with valid data (201), duplicate email (409), short password (400)

- [x] **Add `POST /api/auth/login` route**
  - Files: `web/app/api/auth/login/route.ts`
  - Spec: `specs/01-auth.md`
  - Acceptance: Verifies credentials, returns session cookie. Invalid credentials return 401 with generic "invalid email or password" message.
  - Tests: Test login with valid creds (200 + cookie), wrong password (401), nonexistent email (401)

- [x] **Add `POST /api/auth/logout` route**
  - Files: `web/app/api/auth/logout/route.ts`
  - Spec: `specs/01-auth.md`
  - Acceptance: Clears session cookie, returns 200
  - Tests: Test logout clears session

- [x] **Add auth middleware for protected routes**
  - Files: `web/middleware.ts`
  - Spec: `specs/01-auth.md`
  - Acceptance: Unauthenticated requests to protected routes redirect to `/login`. Auth routes (`/login`, `/signup`) are public. Preserves intended destination for post-login redirect.
  - Tests: Test that protected routes redirect when no session; public routes pass through

- [x] **Add `getCurrentUser` server helper**
  - Files: `web/lib/auth/getCurrentUser.ts`
  - Spec: `specs/01-auth.md`
  - Acceptance: Reads session cookie, returns user record or null. Used in server components and API routes to scope data queries.
  - Tests: Unit test with mocked cookie

- [x] **Add signup page UI**
  - Files: `web/app/signup/page.tsx`, `web/app/signup/signup.module.css`
  - Spec: `specs/01-auth.md`
  - Acceptance: Form with email + password fields. Submits to signup API. Shows validation errors. Redirects to onboarding on success.
  - Tests: Component test: renders form, shows error on duplicate email

- [x] **Add login page UI**
  - Files: `web/app/login/page.tsx`, `web/app/login/login.module.css`
  - Spec: `specs/01-auth.md`
  - Acceptance: Form with email + password fields. Submits to login API. Shows generic error on failure. Redirects to dashboard (or intended destination) on success.
  - Tests: Component test: renders form, shows error on bad credentials

- [x] **Update landing page with auth links**
  - Files: `web/app/page.tsx`, `web/app/page.module.css`
  - Spec: `specs/01-auth.md`
  - Acceptance: Landing page shows Sign Up and Log In buttons/links. Clean, branded design.
  - Tests: Component test: renders both links

- [x] **Add onboarding layout and welcome step page**
  - Files: `web/app/onboarding/layout.tsx`, `web/app/onboarding/page.tsx`, `web/app/onboarding/onboarding.module.css`
  - Spec: `specs/02-onboarding.md`
  - Acceptance: Welcome screen appears after signup. Shows two equally prominent paths: "Upload Statements" and "Manual Entry". Explains the sinking fund concept. Authenticated route.
  - Tests: Component test: both path buttons render with equal prominence

- [x] **Add onboarding manual income step page**
  - Files: `web/app/onboarding/manual/income/page.tsx`, `web/app/onboarding/manual/income/income.module.css`
  - Spec: `specs/02-onboarding.md`
  - Acceptance: User can add income sources one at a time via a traditional form. Can skip. Navigates to obligations step.
  - Tests: Component test: form renders, skip button works

- [x] **Add onboarding manual obligations step page**
  - Files: `web/app/onboarding/manual/obligations/page.tsx`, `web/app/onboarding/manual/obligations/obligations.module.css`
  - Spec: `specs/02-onboarding.md`
  - Acceptance: User can add obligations one at a time via a traditional form. Can skip. Navigates to fund setup.
  - Tests: Component test: form renders, skip button works

- [x] **Add onboarding fund setup step page**
  - Files: `web/app/onboarding/fund-setup/page.tsx`, `web/app/onboarding/fund-setup/fund-setup.module.css`
  - Spec: `specs/02-onboarding.md`
  - Acceptance: Collects current fund balance, max contribution per cycle, contribution cycle days, and currency symbol. "I'm not sure" option for contribution capacity. Marks onboarding complete on finish. Redirects to dashboard.
  - Tests: Component test: all fields render, "I'm not sure" option works, submit marks onboarding complete

- [x] **Add `PUT /api/user/onboarding` route for fund setup**
  - Files: `web/app/api/user/onboarding/route.ts`
  - Spec: `specs/02-onboarding.md`
  - Acceptance: Updates user's fund balance, max contribution, cycle days, currency symbol, and sets onboardingComplete = true. Returns updated user.
  - Tests: Test valid update (200), missing auth (401)

- [x] **Add onboarding completion redirect logic**
  - Files: `web/middleware.ts` (update)
  - Spec: `specs/02-onboarding.md`
  - Acceptance: Users with onboardingComplete=false are redirected to onboarding (except when already on onboarding routes). Users with onboardingComplete=true skip onboarding and go to dashboard.
  - Tests: Test redirect logic for both onboarding states

- [x] **Add `IncomeSource` model with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/03-income-sources.md`
  - Acceptance: `IncomeSource` model with fields: id, userId, name, expectedAmount, frequency (enum), frequencyDays (nullable), isIrregular, minimumExpected (nullable), nextExpectedDate (nullable), isPaused (default false), isActive (default true), createdAt, updatedAt. Relation to User. Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

- [x] **Add `POST /api/income-sources` route**
  - Files: `web/app/api/income-sources/route.ts`
  - Spec: `specs/03-income-sources.md`
  - Acceptance: Creates an income source for the authenticated user. Validates required fields. Returns 201 with the created record.
  - Tests: Test create with valid data (201), missing fields (400), unauthenticated (401)

- [x] **Add `GET /api/income-sources` route**
  - Files: `web/app/api/income-sources/route.ts`
  - Spec: `specs/03-income-sources.md`
  - Acceptance: Returns all active income sources for the authenticated user, ordered by createdAt desc.
  - Tests: Test returns user's income sources only (not other users'), empty list for new user

- [x] **Add `PUT /api/income-sources/[id]` route**
  - Files: `web/app/api/income-sources/[id]/route.ts`
  - Spec: `specs/03-income-sources.md`
  - Acceptance: Updates an income source. Only allows updating own records. Supports updating name, amount, frequency, pause status.
  - Tests: Test update (200), update someone else's record (403/404), unauthenticated (401)

- [x] **Add `DELETE /api/income-sources/[id]` route**
  - Files: `web/app/api/income-sources/[id]/route.ts`
  - Spec: `specs/03-income-sources.md`
  - Acceptance: Soft-deletes (sets isActive=false) an income source. Only allows deleting own records.
  - Tests: Test delete (200), delete someone else's record (403/404)

- [x] **Add income sources list page**
  - Files: `web/app/income/page.tsx`, `web/app/income/income.module.css`
  - Spec: `specs/03-income-sources.md`
  - Acceptance: Lists all income sources showing name, amount, frequency, next expected date. Empty state guides user to add first income source. Each item has edit/delete actions.
  - Tests: Component test: renders list, shows empty state when no data

- [x] **Add income source form component**
  - Files: `web/app/income/IncomeForm.tsx`, `web/app/income/income-form.module.css`
  - Spec: `specs/03-income-sources.md`
  - Acceptance: Traditional form with fields for name, amount, frequency (dropdown with all types), frequency days (for custom), irregular flag, minimum expected, next expected date. Supports both create and edit modes.
  - Tests: Component test: renders all fields, submits valid data, shows validation errors

- [x] **Add pause/resume toggle for income sources**
  - Files: `web/app/income/page.tsx` (update), `web/app/income/income.module.css` (update)
  - Spec: `specs/03-income-sources.md`
  - Acceptance: Each income source has a pause/resume toggle. Paused items appear greyed out. Toggle calls PUT API to update isPaused.
  - Tests: Component test: toggle changes visual state and calls API

- [x] **Add `Obligation`, `CustomScheduleEntry`, and `FundGroup` models with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: All three models exist with correct fields and relations. Obligation types: recurring, recurring_with_end, one_off, custom. FundGroup belongs to User. Obligation optionally belongs to FundGroup. CustomScheduleEntry belongs to Obligation. Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

- [x] **Add `POST /api/obligations` route**
  - Files: `web/app/api/obligations/route.ts`
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: Creates an obligation for the authenticated user. Supports all four types. For custom type, also creates associated CustomScheduleEntry records. Returns 201.
  - Tests: Test create each of the four types (201), missing fields (400), unauthenticated (401)

- [x] **Add `GET /api/obligations` route**
  - Files: `web/app/api/obligations/route.ts`
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: Returns all active, non-archived obligations for the authenticated user, including related CustomScheduleEntries and FundGroup. Ordered by nextDueDate.
  - Tests: Test returns user's obligations only, includes custom schedule entries

- [x] **Add `PUT /api/obligations/[id]` route**
  - Files: `web/app/api/obligations/[id]/route.ts`
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: Updates an obligation. Only allows updating own records. Supports pause, amount change, frequency change, due date change, fund group assignment.
  - Tests: Test update (200), ownership check (403/404)

- [x] **Add `DELETE /api/obligations/[id]` route**
  - Files: `web/app/api/obligations/[id]/route.ts`
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: Soft-deletes (sets isActive=false) an obligation. Only allows deleting own records.
  - Tests: Test delete (200), ownership check (403/404)

- [x] **Add `POST /api/fund-groups` and `GET /api/fund-groups` routes**
  - Files: `web/app/api/fund-groups/route.ts`
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: Create a fund group (name + userId). List all fund groups for the authenticated user. Returns 201 on create, 200 on list.
  - Tests: Test create (201), list returns only user's groups

- [x] **Add `PUT /api/fund-groups/[id]` and `DELETE /api/fund-groups/[id]` routes**
  - Files: `web/app/api/fund-groups/[id]/route.ts`
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: Rename or delete a fund group. Deleting a group sets obligations in that group to null fundGroupId (default group). Only own records.
  - Tests: Test rename (200), delete unassigns obligations, ownership check

- [x] **Add obligations list page**
  - Files: `web/app/obligations/page.tsx`, `web/app/obligations/obligations.module.css`
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: Lists obligations grouped by fund group. Each shows name, type, amount, frequency, next due date, paused status. Past-due obligations are visually highlighted. Empty state guides user. Archive section for completed obligations.
  - Tests: Component test: renders grouped list, empty state, past-due highlighting

- [x] **Add obligation form component**
  - Files: `web/app/obligations/ObligationForm.tsx`, `web/app/obligations/obligation-form.module.css`, `web/app/obligations/new/page.tsx`, `web/app/obligations/edit/[id]/page.tsx`
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: Form adapts based on selected obligation type. Recurring: amount + frequency. Recurring with end: + end date + count. One-off: amount + due date. Custom: add individual date/amount entries. Supports create and edit modes.
  - Tests: Component test: renders correct fields per type, submits valid data

- [x] **Add pause/resume and archive logic for obligations**
  - Files: `web/app/obligations/page.tsx` (update), `web/app/obligations/obligations.module.css` (update), `web/app/api/obligations/route.ts` (update), `web/app/api/obligations/[id]/route.ts` (update)
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: Pause/resume toggle. Paused items greyed out. Completed obligations (past end date or paid one-off) are automatically archived. Archived items visible in archive section.
  - Tests: Component test: pause toggle, archive display

- [x] **Add `Transaction` and `ImportLog` models with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Transaction model with: id, userId, date, description, amount, type (credit/debit), referenceId (nullable), fingerprint, sourceFileName, importedAt, createdAt. ImportLog model with: id, userId, fileName, format (pdf/csv/ofx), transactionsFound, transactionsImported, duplicatesSkipped, duplicatesFlagged, importedAt. Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

- [x] **Add CSV statement parser utility**
  - Files: `web/lib/import/csvParser.ts`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Parses CSV content into transaction objects. Auto-detects common column layouts (date, description, amount, credit/debit). Falls back to manual column mapping config. Handles common date formats.
  - Tests: Unit test with sample CSV data: auto-detect columns, parse dates correctly, handle edge cases

- [x] **Add OFX statement parser utility**
  - Files: `web/lib/import/ofxParser.ts`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Parses OFX/QFX content into transaction objects. Extracts date, description, amount, type, reference ID.
  - Tests: Unit test with sample OFX data

- [x] **Add transaction deduplication utility**
  - Files: `web/lib/import/dedup.ts`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Three-layer dedup: (1) exact reference ID match → auto-skip, (2) composite fingerprint (hash of date+amount+description) → auto-skip, (3) fuzzy match (same date + similar amount + similar description) → flag for review. Returns categorized results: new, skipped, flagged.
  - Tests: Unit test: exact dupe detected, fingerprint dupe detected, fuzzy match flagged, new transaction passes

- [x] **Add `POST /api/import/upload` route**
  - Files: `web/app/api/import/upload/route.ts`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Accepts file upload (CSV or OFX). Parses transactions. Runs dedup against existing user transactions. Saves new transactions and creates ImportLog. Deletes uploaded file after processing. Returns import summary (new count, skipped count, flagged items).
  - Tests: Test CSV upload (201 + summary), OFX upload, duplicate detection, auth check

- [x] **Add `POST /api/import/resolve` route for flagged duplicates**
  - Files: `web/app/api/import/resolve/route.ts`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Receives user decisions on flagged near-duplicate transactions (keep or skip each). Saves kept transactions. Updates ImportLog counts.
  - Tests: Test resolve keep (saves transaction), resolve skip (does not save)

- [x] **Add `GET /api/transactions` route**
  - Files: `web/app/api/transactions/route.ts`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Returns paginated transactions for the authenticated user. Supports filtering by date range. Ordered by date desc.
  - Tests: Test returns user's transactions, pagination works, date filter works

- [x] **Add `GET /api/import/history` route**
  - Files: `web/app/api/import/history/route.ts`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Returns import logs for the authenticated user, ordered by importedAt desc.
  - Tests: Test returns user's import logs only

## In Progress

## Backlog

### Spec 05 — Bank Statement Import

- [ ] **Add statement upload page UI**
  - Files: `web/app/import/page.tsx`, `web/app/import/import.module.css`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Drag-and-drop and file picker for CSV/OFX uploads. Shows progress during upload. Displays import summary after completion. Shows flagged duplicates for user review (keep/skip each). Links to import history.
  - Tests: Component test: file input renders, summary displays after upload

- [ ] **Add transactions browse page**
  - Files: `web/app/transactions/page.tsx`, `web/app/transactions/transactions.module.css`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Lists imported transactions with date, description, amount, type. Supports date range filtering. Paginated.
  - Tests: Component test: renders transaction list, filter works

- [ ] **Add import history page**
  - Files: `web/app/import/history/page.tsx`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Shows past imports with date, filename, format, and counts (found, imported, skipped, flagged).
  - Tests: Component test: renders import history list

### Spec 06 — Pattern Detection & Suggestions

- [ ] **Add `Suggestion` and `SuggestionTransaction` models with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Suggestion model with: id, userId, type (income/expense), vendorPattern, detectedAmount, detectedAmountMin, detectedAmountMax, detectedFrequency, confidence (high/medium/low), matchingTransactionCount, status (pending/accepted/dismissed), linkedIncomeSourceId, linkedObligationId, createdAt, updatedAt. SuggestionTransaction junction table. Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

- [ ] **Add pattern detection engine**
  - Files: `web/lib/patterns/detect.ts`, `web/lib/patterns/vendorMatch.ts`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Analyzes transactions to detect recurring patterns. Groups by vendor similarity (fuzzy matching with normalization). Detects frequency (weekly/fortnightly/monthly/quarterly/annual). Classifies as income or expense. Calculates confidence based on match count and consistency. Excludes already-tracked patterns.
  - Tests: Unit tests: detect monthly subscription, detect income pattern, detect variable-amount pattern, fuzzy vendor matching, confidence scoring

- [ ] **Add `POST /api/patterns/detect` route (trigger after import)**
  - Files: `web/app/api/patterns/detect/route.ts`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Runs pattern detection for the authenticated user. Creates Suggestion records with linked transactions. Skips patterns that match existing income sources or obligations. Returns count of new suggestions.
  - Tests: Test detection creates suggestions, skips already-tracked patterns

- [ ] **Add `GET /api/suggestions` route**
  - Files: `web/app/api/suggestions/route.ts`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Returns pending suggestions for the authenticated user. Includes linked transaction details. Returns count for badge display.
  - Tests: Test returns pending suggestions only, includes transaction links

- [ ] **Add `PUT /api/suggestions/[id]` route (accept/dismiss)**
  - Files: `web/app/api/suggestions/[id]/route.ts`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Accept: creates corresponding IncomeSource or Obligation, links to suggestion, sets status=accepted. Dismiss: sets status=dismissed. Tweak+accept: creates with user-modified values.
  - Tests: Test accept creates income/obligation, dismiss updates status, tweak+accept uses modified values

- [ ] **Add suggestions feed page**
  - Files: `web/app/suggestions/page.tsx`, `web/app/suggestions/suggestions.module.css`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Lists pending suggestions showing vendor, amount/range, frequency, confidence, transaction count. Each has Accept, Tweak, and Dismiss buttons. Tweak opens pre-filled form. Empty state message when no suggestions.
  - Tests: Component test: renders suggestion list, accept/dismiss/tweak actions work

- [ ] **Add suggestions badge to navigation**
  - Files: `web/app/components/Nav.tsx` (update)
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Nav shows suggestions count badge when pending suggestions > 0. Badge updates after accept/dismiss actions.
  - Tests: Component test: badge shows count, hides when count is 0

### Spec 07 — Sinking Fund Engine

- [ ] **Add `FundBalance`, `ContributionRecord`, and `EngineSnapshot` models with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/07-sinking-fund-engine.md`
  - Acceptance: FundBalance: id, obligationId, currentBalance, lastUpdatedAt. ContributionRecord: id, obligationId, amount, date, type (contribution/manual_adjustment), note (nullable), createdAt. EngineSnapshot: id, userId, calculatedAt, totalRequired, totalFunded, nextActionAmount, nextActionDate, nextActionDescription. Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

- [ ] **Add sinking fund calculation engine (core logic)**
  - Files: `web/lib/engine/calculate.ts`
  - Spec: `specs/07-sinking-fund-engine.md`
  - Acceptance: Given a user's obligations, fund balances, income, and capacity: calculates per-obligation contribution per cycle. Implements adaptive contributions (ramp-up/ramp-down). Respects max contribution capacity. Prioritizes by nearest due date when capacity exceeded. Generates shortfall warnings. Handles recurring cycle resets.
  - Tests: Unit tests: steady state calc, ramp-up scenario, ramp-down scenario, capacity exceeded prioritization, shortfall warning generation, recurring cycle reset

- [ ] **Add engine snapshot generation**
  - Files: `web/lib/engine/snapshot.ts`
  - Spec: `specs/07-sinking-fund-engine.md`
  - Acceptance: Creates an EngineSnapshot record with totalRequired, totalFunded, nextActionAmount, nextActionDate, nextActionDescription. Next action is the most urgent under-funded obligation. Celebration state when all funded.
  - Tests: Unit test: snapshot contains correct totals, next action is nearest due date, celebration state when fully funded

- [ ] **Add `POST /api/engine/recalculate` route**
  - Files: `web/app/api/engine/recalculate/route.ts`
  - Spec: `specs/07-sinking-fund-engine.md`
  - Acceptance: Triggers engine recalculation for the authenticated user. Creates new EngineSnapshot. Returns the snapshot.
  - Tests: Test recalculation produces correct snapshot

- [ ] **Add `POST /api/contributions` route (mark contribution done)**
  - Files: `web/app/api/contributions/route.ts`
  - Spec: `specs/07-sinking-fund-engine.md`
  - Acceptance: Records a contribution or manual adjustment for an obligation. Updates the FundBalance. Triggers engine recalculation. Returns updated fund balance.
  - Tests: Test contribution updates balance, manual adjustment works, triggers recalculation

- [ ] **Add `PUT /api/fund-balances/[obligationId]` route (manual balance adjustment)**
  - Files: `web/app/api/fund-balances/[obligationId]/route.ts`
  - Spec: `specs/07-sinking-fund-engine.md`
  - Acceptance: Allows user to set a fund balance directly. Creates a ContributionRecord of type manual_adjustment. Triggers recalculation.
  - Tests: Test manual adjustment updates balance and creates record

- [ ] **Add engine timeline projection utility**
  - Files: `web/lib/engine/timeline.ts`
  - Spec: `specs/07-sinking-fund-engine.md`, `specs/08-dashboard.md`
  - Acceptance: Projects fund balance over a configurable 6–12 month window. Returns data points with dates, projected balance, expense markers at obligation due dates, contribution markers, and crunch points (where balance dips near or below zero). Accepts optional overrides for what-if scenarios.
  - Tests: Unit tests: projection shows correct balance curve, expense markers at correct dates, crunch points detected

### Spec 08 — Dashboard

- [ ] **Add main navigation component**
  - Files: `web/app/components/Nav.tsx`, `web/app/components/nav.module.css`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Navigation bar with links to Dashboard, Income, Obligations, Import, Transactions, Suggestions. Highlights current page. Responsive.
  - Tests: Component test: renders all links, highlights active link

- [ ] **Add authenticated app layout with navigation**
  - Files: `web/app/(app)/layout.tsx`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Layout wraps authenticated pages. Includes Nav component. Logout button.
  - Tests: Component test: renders nav and children

- [ ] **Add dashboard page with hero card**
  - Files: `web/app/(app)/dashboard/page.tsx`, `web/app/(app)/dashboard/dashboard.module.css`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Hero card displays next action from EngineSnapshot: amount and deadline. Shows celebration state when fully funded. Shows prompts when no data exists. Updates when contributions are marked done.
  - Tests: Component test: renders next action, celebration state, empty state

- [ ] **Add health bar component**
  - Files: `web/app/(app)/dashboard/HealthBar.tsx`, `web/app/(app)/dashboard/health-bar.module.css`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Progress bar showing total funded vs. total required. Color coded: green (≥90%), amber (60-89%), red (<60%). Shows absolute numbers. Expandable to per-group breakdown.
  - Tests: Component test: correct color at thresholds, shows numbers, expands to groups

- [ ] **Add timeline chart component**
  - Files: `web/app/(app)/dashboard/TimelineChart.tsx`, `web/app/(app)/dashboard/timeline.module.css`, `web/package.json` (add chart library)
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Line chart projecting fund balance 6–12 months. X axis: time, Y axis: balance. Expense markers at due dates. Crunch points highlighted in red. Adjustable time range. Supports what-if overlay (solid=actual, dashed=scenario).
  - Tests: Component test: renders chart, markers at correct positions

- [ ] **Add upcoming obligations component**
  - Files: `web/app/(app)/dashboard/UpcomingObligations.tsx`, `web/app/(app)/dashboard/upcoming.module.css`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Lists obligations due in next 30 days. Each shows name, amount, date, fund status (fully/partially/unfunded). Sorted by due date. Same-day obligations grouped.
  - Tests: Component test: renders sorted list, groups same-day items, shows fund status

- [ ] **Add smart nudge cards on dashboard**
  - Files: `web/app/(app)/dashboard/NudgeCards.tsx`, `web/app/(app)/dashboard/nudge.module.css`
  - Spec: `specs/08-dashboard.md`, `specs/06-pattern-detection.md`
  - Acceptance: Displays high-confidence suggestions as dismissible cards. Links to suggestions feed. Example: "We noticed a new $14.99 monthly charge from Spotify."
  - Tests: Component test: renders nudge cards for high-confidence suggestions, dismiss works

- [ ] **Add responsive dashboard layout**
  - Files: `web/app/(app)/dashboard/dashboard.module.css` (update)
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Desktop: hero + health bar side by side at top, timeline full width below, upcoming in sidebar. Mobile: single column stack. CSS Modules media queries.
  - Tests: Component test: renders without error at different viewport sizes (or snapshot test)

### Spec 09 — AI Interaction Layer

- [ ] **Add NL parser service**
  - Files: `web/lib/ai/nlParser.ts`, `web/lib/ai/types.ts`
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: Parses natural language into structured intents: create (income/obligation with all fields), edit (target + changes), delete (target), query (question). Handles complex inputs like the Melbourne council tax example. Returns parsed intent with confidence.
  - Tests: Unit tests: parse "Netflix $22.99 monthly" → create expense, parse "change gym to $60" → edit, parse "delete Spotify" → delete, parse "what's my biggest expense" → query

- [ ] **Add `POST /api/ai/parse` route**
  - Files: `web/app/api/ai/parse/route.ts`
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: Receives raw text input, returns parsed intent with preview data. For queries, returns the answer directly. For ambiguous input, returns clarification prompt. Logs interaction in AIInteractionLog.
  - Tests: Test parse returns correct intent type, ambiguous input returns clarification

- [ ] **Add `AIInteractionLog` model with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: AIInteractionLog: id, userId, rawInput, parsedIntent (JSON), actionTaken, success (boolean), createdAt. Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

- [ ] **Add floating AI bar component**
  - Files: `web/app/components/AIBar.tsx`, `web/app/components/ai-bar.module.css`
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: Renders as collapsed pill/icon in bottom-right. Expands to show text input. Draggable to any screen position. Persists across page navigation (in layout). Sends input to parse API. Shows responses/previews inline.
  - Tests: Component test: renders collapsed, expands on click, submits input

- [ ] **Add sparkle button component**
  - Files: `web/app/components/SparkleButton.tsx`, `web/app/components/sparkle.module.css`
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: ✨ button that opens a modal/popover. Shows item summary at top. Contextual preset action buttons (income presets: change amount, frequency, pause, delete; obligation presets: + change due date). Free text input at bottom. Preset buttons generate structured intents directly. Free text goes through NL parser.
  - Tests: Component test: renders button, opens modal, shows presets, submits free text

- [ ] **Add preview/confirmation component for AI actions**
  - Files: `web/app/components/AIPreview.tsx`, `web/app/components/ai-preview.module.css`
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: Shows parsed intent as a preview (create: full form preview, edit: diff view, delete: confirmation). User can confirm, tweak, or cancel. On confirm, executes the action via the appropriate API.
  - Tests: Component test: renders preview, confirm executes action, cancel dismisses

- [ ] **Integrate AI bar and sparkle button into app layout and list pages**
  - Files: `web/app/(app)/layout.tsx` (update), `web/app/income/page.tsx` (update), `web/app/obligations/page.tsx` (update)
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: AI bar appears in the app layout (all authenticated pages). Sparkle buttons appear on every income source and obligation in list views. Actions from both trigger engine recalculation on data changes.
  - Tests: Integration test: AI bar visible on dashboard, sparkle buttons on list items

### Spec 10 — What-If Modeling

- [ ] **Add what-if state management (React context)**
  - Files: `web/app/contexts/WhatIfContext.tsx`
  - Spec: `specs/10-what-if.md`
  - Acceptance: React context holds what-if overrides: toggled-off obligation IDs, amount overrides, hypothetical obligations. Provides functions to toggle, override amount, add hypothetical, reset all, and apply. Client-side only, does not persist on refresh.
  - Tests: Unit test: toggle obligation, override amount, add hypothetical, reset clears all

- [ ] **Add what-if engine calculation variant**
  - Files: `web/lib/engine/calculate.ts` (update)
  - Spec: `specs/10-what-if.md`
  - Acceptance: Engine calculation function accepts optional what-if overrides parameter. Excludes toggled-off obligations. Uses overridden amounts. Includes hypothetical obligations. Returns separate scenario projection alongside actual.
  - Tests: Unit test: calculation with toggled-off obligation, with amount override, with hypothetical

- [ ] **Add what-if toggle controls on obligations list**
  - Files: `web/app/obligations/page.tsx` (update)
  - Spec: `specs/10-what-if.md`
  - Acceptance: Each obligation has a what-if toggle switch. Toggling off marks it as excluded in the what-if context. Amount fields are editable for temporary overrides. "Add hypothetical" button creates a temporary obligation.
  - Tests: Component test: toggle updates context, amount override updates context

- [ ] **Add scenario banner component**
  - Files: `web/app/components/ScenarioBanner.tsx`, `web/app/components/scenario-banner.module.css`
  - Spec: `specs/10-what-if.md`
  - Acceptance: Appears at top of dashboard when what-if changes are active. Shows summary of changes ("2 expenses toggled off, 1 amount changed"). Reset button clears all. Apply button with confirmation dialog makes changes permanent (pauses toggled-off, updates amounts, saves hypotheticals).
  - Tests: Component test: shows summary, reset clears context, apply triggers confirmation

- [ ] **Update dashboard to support what-if overlay**
  - Files: `web/app/(app)/dashboard/page.tsx` (update), `web/app/(app)/dashboard/TimelineChart.tsx` (update), `web/app/(app)/dashboard/HealthBar.tsx` (update)
  - Spec: `specs/10-what-if.md`
  - Acceptance: When what-if changes are active: timeline shows solid (actual) and dashed (scenario) lines. Hero card shows scenario next action with visual indicator. Health bar shows scenario status. All update live as toggles/tweaks change.
  - Tests: Component test: chart renders both lines, hero shows scenario indicator

- [ ] **Add what-if support to AI bar NL parser**
  - Files: `web/lib/ai/nlParser.ts` (update), `web/app/components/AIBar.tsx` (update)
  - Spec: `specs/10-what-if.md`
  - Acceptance: "What if I cancel gym?" → toggles gym off in what-if context. "What if Netflix goes up to $30?" → overrides amount. "What if I add a $2,000 holiday in December?" → adds hypothetical. Multiple what-if commands are additive.
  - Tests: Unit test: parse what-if intents correctly, additive behavior

### Spec 02 (continued) — Onboarding Statement Upload Path

- [ ] **Add onboarding statement upload step page**
  - Files: `web/app/onboarding/upload/page.tsx`
  - Spec: `specs/02-onboarding.md`
  - Acceptance: User can upload bank statements (reuses import infrastructure). After parsing, shows detected patterns as suggestions. User can accept/tweak/dismiss each. Navigates to fund setup when done. Can skip.
  - Tests: Component test: upload works, suggestions display, skip navigates to fund setup

### Spec 01 (continued) — Password Reset

- [ ] **Add password reset request route (`POST /api/auth/reset-request`)**
  - Files: `web/app/api/auth/reset-request/route.ts`
  - Spec: `specs/01-auth.md`
  - Acceptance: Accepts email, generates a time-limited reset token, stores it. In development, logs the reset link to console (no email service required initially). Returns 200 regardless of whether email exists (prevents enumeration).
  - Tests: Test token generation for existing user, 200 for nonexistent email

- [ ] **Add password reset confirm route (`POST /api/auth/reset-confirm`)**
  - Files: `web/app/api/auth/reset-confirm/route.ts`
  - Spec: `specs/01-auth.md`
  - Acceptance: Accepts token + new password. Validates token (not expired, not used). Updates password hash. Invalidates token. Returns 200.
  - Tests: Test valid reset (200), expired token (400), already-used token (400)

- [ ] **Add password reset UI pages**
  - Files: `web/app/reset-password/page.tsx`, `web/app/reset-password/confirm/page.tsx`
  - Spec: `specs/01-auth.md`
  - Acceptance: Request page: email input, submit sends reset request. Confirm page: new password input (accessed via token link). Shows success/error messages.
  - Tests: Component test: both pages render and submit correctly

### Spec 05 (continued) — PDF Statement Import

- [ ] **Add PDF statement parser utility (AI-powered)**
  - Files: `web/lib/import/pdfParser.ts`, `web/package.json` (add pdf-parse or similar)
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Extracts text from PDF. Sends to AI (Opus 4.6) to parse into transaction objects. Returns transactions with confidence indicators for unusual formats. Handles multi-page statements.
  - Tests: Unit test with sample PDF data (mocked AI response)

- [ ] **Update import upload route to support PDF format**
  - Files: `web/app/api/import/upload/route.ts` (update)
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Accepts PDF uploads alongside CSV/OFX. Routes to PDF parser. Low-confidence transactions are flagged for user review. Import summary includes confidence info.
  - Tests: Test PDF upload flow with mocked parser

### Spec 11 — Obligation Amount Escalation

- [ ] **Add `Escalation` model with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/11-escalation.md`
  - Acceptance: `Escalation` model with fields: id, obligationId, changeType (enum: absolute, percentage, fixed_increase), value (Decimal), effectiveDate (DateTime), intervalMonths (Int, nullable — null means one-off), isApplied (Boolean, default false), appliedAt (DateTime, nullable), createdAt, updatedAt. Relation to Obligation (cascade delete). Unique partial index on obligationId where intervalMonths is not null (at most one recurring rule per obligation). Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

- [ ] **Add `POST /api/escalations` route**
  - Files: `web/app/api/escalations/route.ts`
  - Spec: `specs/11-escalation.md`
  - Acceptance: Creates an escalation rule for an obligation owned by the authenticated user. Validates: absolute changeType requires intervalMonths=null; obligation must not be one-off type. If a recurring rule already exists for the obligation, replaces it. If one-off rule has effectiveDate in the past, applies immediately (updates obligation amount, sets isApplied=true). Warns if value >50% increase. Returns 201.
  - Tests: Test create one-off absolute (201), recurring percentage (201), reject absolute+recurring (400), reject for one-off obligation (400), past-date one-off auto-applies, replacing existing recurring rule, unauthenticated (401)

- [ ] **Add `GET /api/escalations` route**
  - Files: `web/app/api/escalations/route.ts`
  - Spec: `specs/11-escalation.md`
  - Acceptance: Returns all escalation rules for a given obligationId (query param), scoped to the authenticated user. Includes both applied and unapplied rules, ordered by effectiveDate.
  - Tests: Test returns rules for user's obligation only, includes applied rules for history

- [ ] **Add `DELETE /api/escalations/[id]` route**
  - Files: `web/app/api/escalations/[id]/route.ts`
  - Spec: `specs/11-escalation.md`
  - Acceptance: Deletes an escalation rule. Only allows deleting own records (via obligation ownership). Returns 200.
  - Tests: Test delete (200), ownership check (403/404)

- [ ] **Add escalation projection utility**
  - Files: `web/lib/engine/escalation.ts`
  - Spec: `specs/11-escalation.md`
  - Acceptance: Given an obligation's current amount and its escalation rules, projects future amounts at each due date over a configurable window. Applies one-off rules at their effective dates (absolute sets amount, percentage/fixed_increase modify it). Applies recurring rules at each interval. One-off takes precedence over recurring on the same date. Returns array of {date, amount} pairs.
  - Tests: Unit tests: one-off absolute projection, one-off percentage, one-off fixed increase, recurring percentage over multiple intervals, recurring fixed increase, combined one-off + recurring, one-off precedence on same date

- [ ] **Integrate escalation into sinking fund engine calculations**
  - Files: `web/lib/engine/calculate.ts` (update)
  - Spec: `specs/11-escalation.md`
  - Acceptance: Engine uses escalated future amounts (from escalation projection utility) when calculating per-obligation contributions instead of the current static amount. Ramps up contributions ahead of scheduled increases. Shortfall warnings account for escalated amounts. Crunch point detection uses escalated amounts.
  - Tests: Unit tests: contributions ramp up before an increase, shortfall detected for post-increase amount, crunch point uses escalated amount

- [ ] **Integrate escalation into timeline projection**
  - Files: `web/lib/engine/timeline.ts` (update)
  - Spec: `specs/11-escalation.md`
  - Acceptance: Timeline projection uses escalated amounts for each obligation's future due dates. Expense markers reflect the escalated amount at that point in time. Step changes are visible in the projected balance curve.
  - Tests: Unit tests: timeline shows higher expense markers after escalation date, balance curve reflects stepped amounts

- [ ] **Add escalation form component**
  - Files: `web/app/obligations/EscalationForm.tsx`, `web/app/obligations/escalation-form.module.css`
  - Spec: `specs/11-escalation.md`
  - Acceptance: Mini-form with: change type selector (absolute/percentage/fixed_increase), value input, effective date picker, optional "repeats every N months" toggle. Preview shows timeline of amount changes. Submits to POST /api/escalations. Confirmation prompt for >50% increases. Hidden for one-off obligations.
  - Tests: Component test: renders all fields, preview updates on input, submits valid data, shows confirmation for large increases

- [ ] **Add escalation display to obligations list/detail**
  - Files: `web/app/obligations/page.tsx` (update)
  - Spec: `specs/11-escalation.md`
  - Acceptance: Each obligation shows upcoming escalation rules as a timeline of changes. Applied rules shown as history. Delete button on each rule. "Add price change" action available. Escalation section hidden for one-off obligations.
  - Tests: Component test: renders escalation timeline, delete calls API, hidden for one-off type

- [ ] **Add "Add price change" preset to sparkle button for obligations**
  - Files: `web/app/components/SparkleButton.tsx` (update)
  - Spec: `specs/11-escalation.md`
  - Acceptance: Obligation sparkle button gains "Add price change" preset alongside existing presets. Tapping it opens the EscalationForm. Existing "Change amount" preset remains for immediate changes.
  - Tests: Component test: "Add price change" preset appears for obligations, opens escalation form

- [ ] **Add escalation NL parsing support**
  - Files: `web/lib/ai/nlParser.ts` (update)
  - Spec: `specs/11-escalation.md`
  - Acceptance: NL parser recognizes escalation intents: "rent goes up to $2,200 in July" → one-off absolute, "rent goes up 3% every July" → recurring percentage, "Netflix going up $3 next month" → one-off fixed increase, "cancel the rent increase" → delete escalation rule. Returns structured escalation intent with change type, value, effective date, and interval.
  - Tests: Unit tests: parse all NL examples from spec 11, including cancel/remove intents

- [ ] **Add what-if support for hypothetical escalation rules**
  - Files: `web/app/contexts/WhatIfContext.tsx` (update), `web/lib/engine/calculate.ts` (update)
  - Spec: `specs/11-escalation.md`
  - Acceptance: What-if context supports adding hypothetical escalation rules to obligations. "What if rent goes up 5% next year?" adds a temporary escalation rule. Engine calculation with what-if overrides includes hypothetical escalation in projections. Session-only, not persisted.
  - Tests: Unit test: hypothetical escalation appears in what-if projection, does not persist

- [ ] **Add auto-apply logic for one-off escalation rules**
  - Files: `web/lib/engine/applyEscalations.ts`
  - Spec: `specs/11-escalation.md`
  - Acceptance: Utility that checks for unapplied one-off escalation rules whose effectiveDate has passed (and obligation is not paused). Updates the obligation's base amount according to the rule. Marks the rule as applied with appliedAt timestamp. Called during engine recalculation. For paused obligations, defers application until resume.
  - Tests: Unit tests: applies past-date one-off, skips future-date, skips paused obligations, skips already-applied rules, applies deferred rules on resume
