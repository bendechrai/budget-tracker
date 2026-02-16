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
  - Acceptance: Collects current fund balance, max contribution per cycle, contribution cycle type (radio buttons: Weekly/Fortnightly/Twice monthly/Monthly), and currency symbol (quick-pick buttons + custom input). "I'm not sure" option for contribution capacity. Marks onboarding complete on finish. Redirects to dashboard.
  - Tests: Component test: all fields render, "I'm not sure" option works, submit marks onboarding complete

- [x] **Add `PUT /api/user/onboarding` route for fund setup**
  - Files: `web/app/api/user/onboarding/route.ts`
  - Spec: `specs/02-onboarding.md`
  - Acceptance: Updates user's fund balance, max contribution, cycle type (enum), currency symbol, and sets onboardingComplete = true. Returns updated user.
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

- [x] **Add statement upload page UI**
  - Files: `web/app/import/page.tsx`, `web/app/import/import.module.css`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Drag-and-drop and file picker for CSV/OFX uploads. Shows progress during upload. Displays import summary after completion. Shows flagged duplicates for user review (keep/skip each). Links to import history.
  - Tests: Component test: file input renders, summary displays after upload

- [x] **Add transactions browse page**
  - Files: `web/app/transactions/page.tsx`, `web/app/transactions/transactions.module.css`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Lists imported transactions with date, description, amount, type. Supports date range filtering. Paginated.
  - Tests: Component test: renders transaction list, filter works

- [x] **Add import history page**
  - Files: `web/app/import/history/page.tsx`, `web/app/import/history/history.module.css`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Shows past imports with date, filename, format, and counts (found, imported, skipped, flagged).
  - Tests: Component test: renders import history list

- [x] **Add `Suggestion` and `SuggestionTransaction` models with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Suggestion model with: id, userId, type (income/expense), vendorPattern, detectedAmount, detectedAmountMin, detectedAmountMax, detectedFrequency, confidence (high/medium/low), matchingTransactionCount, status (pending/accepted/dismissed), linkedIncomeSourceId, linkedObligationId, createdAt, updatedAt. SuggestionTransaction junction table. Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

- [x] **Add pattern detection engine**
  - Files: `web/lib/patterns/detect.ts`, `web/lib/patterns/vendorMatch.ts`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Analyzes transactions to detect recurring patterns. Groups by vendor similarity (fuzzy matching with normalization). Detects frequency (weekly/fortnightly/monthly/quarterly/annual). Classifies as income or expense. Calculates confidence based on match count and consistency. Excludes already-tracked patterns.
  - Tests: Unit tests: detect monthly subscription, detect income pattern, detect variable-amount pattern, fuzzy vendor matching, confidence scoring

- [x] **Add `POST /api/patterns/detect` route (trigger after import)**
  - Files: `web/app/api/patterns/detect/route.ts`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Runs pattern detection for the authenticated user. Creates Suggestion records with linked transactions. Skips patterns that match existing income sources or obligations. Returns count of new suggestions.
  - Tests: Test detection creates suggestions, skips already-tracked patterns

- [x] **Add `GET /api/suggestions` route**
  - Files: `web/app/api/suggestions/route.ts`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Returns pending suggestions for the authenticated user. Includes linked transaction details. Returns count for badge display.
  - Tests: Test returns pending suggestions only, includes transaction links

- [x] **Add `PUT /api/suggestions/[id]` route (accept/dismiss)**
  - Files: `web/app/api/suggestions/[id]/route.ts`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Accept: creates corresponding IncomeSource or Obligation, links to suggestion, sets status=accepted. Dismiss: sets status=dismissed. Tweak+accept: creates with user-modified values.
  - Tests: Test accept creates income/obligation, dismiss updates status, tweak+accept uses modified values

- [x] **Add suggestions feed page**
  - Files: `web/app/suggestions/page.tsx`, `web/app/suggestions/suggestions.module.css`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Lists pending suggestions showing vendor, amount/range, frequency, confidence, transaction count. Each has Accept, Tweak, and Dismiss buttons. Tweak opens pre-filled form. Empty state message when no suggestions.
  - Tests: Component test: renders suggestion list, accept/dismiss/tweak actions work

- [x] **Add suggestions badge to navigation**
  - Files: `web/app/components/Nav.tsx`, `web/app/components/nav.module.css`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Nav shows suggestions count badge when pending suggestions > 0. Badge updates after accept/dismiss actions.
  - Tests: Component test: badge shows count, hides when count is 0

- [x] **Add SuggestionsCountContext for real-time badge updates**
  - Files: `web/app/contexts/SuggestionsCountContext.tsx`, `web/app/Providers.tsx`, `web/app/components/Nav.tsx`, `web/app/(app)/suggestions/page.tsx`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Shared context provides suggestions count to Nav and SuggestionsPage. Accepting/dismissing a suggestion decrements the count immediately without page reload. Nav badge reflects the current count in real time.
  - Tests: Nav test: badge renders from context. Suggestions page test: decrement called on accept/dismiss.

- [x] **Sort suggestions by confidence (high → medium → low)**
  - Files: `web/app/api/suggestions/route.ts`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: `GET /api/suggestions` returns suggestions ordered by confidence (high first) then by createdAt desc within each confidence level. PostgreSQL enum ordering used via Prisma `orderBy`.
  - Tests: API route test verifies orderBy includes confidence asc and createdAt desc

- [x] **Trigger pattern detection after CSV import**
  - Files: `web/app/(app)/import/page.tsx`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: After successful file upload on the import page, a fire-and-forget `POST /api/patterns/detect` call triggers pattern detection. Detection failure is non-blocking. Not called when all uploads fail.
  - Tests: Component test: verifies `/api/patterns/detect` is called after successful upload, not called on failure

- [x] **Add `FundBalance`, `ContributionRecord`, and `EngineSnapshot` models with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/07-sinking-fund-engine.md`
  - Acceptance: FundBalance: id, obligationId, currentBalance, lastUpdatedAt. ContributionRecord: id, obligationId, amount, date, type (contribution/manual_adjustment), note (nullable), createdAt. EngineSnapshot: id, userId, calculatedAt, totalRequired, totalFunded, nextActionAmount, nextActionDate, nextActionDescription. Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

- [x] **Add sinking fund calculation engine (core logic)**
  - Files: `web/lib/engine/calculate.ts`
  - Spec: `specs/07-sinking-fund-engine.md`
  - Acceptance: Given a user's obligations, fund balances, income, and capacity: calculates per-obligation contribution per cycle. Implements adaptive contributions (ramp-up/ramp-down). Respects max contribution capacity. Prioritizes by nearest due date when capacity exceeded. Generates shortfall warnings. Handles recurring cycle resets.
  - Tests: Unit tests: steady state calc, ramp-up scenario, ramp-down scenario, capacity exceeded prioritization, shortfall warning generation, recurring cycle reset

- [x] **Add engine snapshot generation**
  - Files: `web/lib/engine/snapshot.ts`
  - Spec: `specs/07-sinking-fund-engine.md`
  - Acceptance: Creates an EngineSnapshot record with totalRequired, totalFunded, nextActionAmount, nextActionDate, nextActionDescription. Next action is the most urgent under-funded obligation. Celebration state when all funded.
  - Tests: Unit test: snapshot contains correct totals, next action is nearest due date, celebration state when fully funded

- [x] **Add `POST /api/engine/recalculate` route**
  - Files: `web/app/api/engine/recalculate/route.ts`
  - Spec: `specs/07-sinking-fund-engine.md`
  - Acceptance: Triggers engine recalculation for the authenticated user. Creates new EngineSnapshot. Returns the snapshot.
  - Tests: Test recalculation produces correct snapshot

- [x] **Add `POST /api/contributions` route (mark contribution done)**
  - Files: `web/app/api/contributions/route.ts`
  - Spec: `specs/07-sinking-fund-engine.md`
  - Acceptance: Records a contribution or manual adjustment for an obligation. Updates the FundBalance. Triggers engine recalculation. Returns updated fund balance.
  - Tests: Test contribution updates balance, manual adjustment works, triggers recalculation

- [x] **Add `PUT /api/fund-balances/[obligationId]` route (manual balance adjustment)**
  - Files: `web/app/api/fund-balances/[obligationId]/route.ts`
  - Spec: `specs/07-sinking-fund-engine.md`
  - Acceptance: Allows user to set a fund balance directly. Creates a ContributionRecord of type manual_adjustment. Triggers recalculation.
  - Tests: Test manual adjustment updates balance and creates record

- [x] **Add engine timeline projection utility**
  - Files: `web/lib/engine/timeline.ts`
  - Spec: `specs/07-sinking-fund-engine.md`, `specs/08-dashboard.md`
  - Acceptance: Projects fund balance over a configurable 6–12 month window. Returns data points with dates, projected balance, expense markers at obligation due dates, contribution markers, and crunch points (where balance dips near or below zero). Accepts optional overrides for what-if scenarios.
  - Tests: Unit tests: projection shows correct balance curve, expense markers at correct dates, crunch points detected

- [x] **Add main navigation component**
  - Files: `web/app/components/Nav.tsx`, `web/app/components/nav.module.css`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Navigation bar with links to Dashboard, Income, Obligations, Import, Transactions, Suggestions. Highlights current page. Responsive.
  - Tests: Component test: renders all links, highlights active link

- [x] **Add authenticated app layout with navigation**
  - Files: `web/app/(app)/layout.tsx`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Layout wraps authenticated pages. Includes Nav component. Logout button.
  - Tests: Component test: renders nav and children

- [x] **Add dashboard page with hero card**
  - Files: `web/app/(app)/dashboard/page.tsx`, `web/app/(app)/dashboard/dashboard.module.css`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Hero card displays next action from EngineSnapshot: amount and deadline. Shows celebration state when fully funded. Shows prompts when no data exists. Updates when contributions are marked done.
  - Tests: Component test: renders next action, celebration state, empty state

- [x] **Add health bar component**
  - Files: `web/app/(app)/dashboard/HealthBar.tsx`, `web/app/(app)/dashboard/health-bar.module.css`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Progress bar showing total funded vs. total required. Color coded: green (≥90%), amber (60-89%), red (<60%). Shows absolute numbers. Expandable to per-group breakdown.
  - Tests: Component test: correct color at thresholds, shows numbers, expands to groups

- [x] **Add timeline chart component**
  - Files: `web/app/(app)/dashboard/TimelineChart.tsx`, `web/app/(app)/dashboard/timeline.module.css`, `web/package.json` (add recharts), `web/app/api/engine/timeline/route.ts`, `web/app/(app)/dashboard/page.tsx` (update)
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Line chart projecting fund balance 6–12 months. X axis: time, Y axis: balance. Expense markers at due dates. Crunch points highlighted in red. Adjustable time range. Supports what-if overlay (solid=actual, dashed=scenario).
  - Tests: Component test: renders chart, markers at correct positions

- [x] **Add upcoming obligations component**
  - Files: `web/app/(app)/dashboard/UpcomingObligations.tsx`, `web/app/(app)/dashboard/upcoming.module.css`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Lists obligations due in next 30 days. Each shows name, amount, date, fund status (fully/partially/unfunded). Sorted by due date. Same-day obligations grouped.
  - Tests: Component test: renders sorted list, groups same-day items, shows fund status

- [x] **Add smart nudge cards on dashboard**
  - Files: `web/app/(app)/dashboard/NudgeCards.tsx`, `web/app/(app)/dashboard/nudge.module.css`
  - Spec: `specs/08-dashboard.md`, `specs/06-pattern-detection.md`
  - Acceptance: Displays high-confidence suggestions as dismissible cards. Links to suggestions feed. Example: "We noticed a new $14.99 monthly charge from Spotify."
  - Tests: Component test: renders nudge cards for high-confidence suggestions, dismiss works

- [x] **Add responsive dashboard layout**
  - Files: `web/app/(app)/dashboard/dashboard.module.css` (update), `web/app/(app)/dashboard/page.tsx` (update)
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Desktop: hero + health bar side by side at top, timeline full width below, upcoming in sidebar. Mobile: single column stack. CSS Modules media queries.
  - Tests: Component test: renders without error at different viewport sizes (or snapshot test)

- [x] **Add NL parser service**
  - Files: `web/lib/ai/nlParser.ts`, `web/lib/ai/types.ts`
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: Parses natural language into structured intents: create (income/obligation with all fields), edit (target + changes), delete (target), query (question). Handles complex inputs like the Melbourne council tax example. Returns parsed intent with confidence.
  - Tests: Unit tests: parse "Netflix $22.99 monthly" → create expense, parse "change gym to $60" → edit, parse "delete Spotify" → delete, parse "what's my biggest expense" → query

- [x] **Add `POST /api/ai/parse` route**
  - Files: `web/app/api/ai/parse/route.ts`
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: Receives raw text input, returns parsed intent with preview data. For queries, returns the answer directly. For ambiguous input, returns clarification prompt. Logs interaction in AIInteractionLog.
  - Tests: Test parse returns correct intent type, ambiguous input returns clarification
  - Note: AIInteractionLog logging deferred to next task (model does not exist yet).

- [x] **Add `AIInteractionLog` model with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: AIInteractionLog: id, userId, rawInput, parsedIntent (JSON), actionTaken, success (boolean), createdAt. Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

- [x] **Add floating AI bar component**
  - Files: `web/app/components/AIBar.tsx`, `web/app/components/ai-bar.module.css`
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: Renders as collapsed pill/icon in bottom-right. Expands to show text input. Draggable to any screen position. Persists across page navigation (in layout). Sends input to parse API. Shows responses/previews inline.
  - Tests: Component test: renders collapsed, expands on click, submits input

- [x] **Add sparkle button component**
  - Files: `web/app/components/SparkleButton.tsx`, `web/app/components/sparkle.module.css`
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: ✨ button that opens a modal/popover. Shows item summary at top. Contextual preset action buttons (income presets: change amount, frequency, pause, delete; obligation presets: + change due date). Free text input at bottom. Preset buttons generate structured intents directly. Free text goes through NL parser.
  - Tests: Component test: renders button, opens modal, shows presets, submits free text

- [x] **Add preview/confirmation component for AI actions**
  - Files: `web/app/components/AIPreview.tsx`, `web/app/components/ai-preview.module.css`
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: Shows parsed intent as a preview (create: full form preview, edit: diff view, delete: confirmation). User can confirm, tweak, or cancel. On confirm, executes the action via the appropriate API.
  - Tests: Component test: renders preview, confirm executes action, cancel dismisses

- [x] **Integrate AI bar and sparkle button into app layout and list pages**
  - Files: `web/app/(app)/layout.tsx` (update), `web/app/income/page.tsx` (update), `web/app/obligations/page.tsx` (update)
  - Spec: `specs/09-ai-interaction.md`
  - Acceptance: AI bar appears in the app layout (all authenticated pages). Sparkle buttons appear on every income source and obligation in list views. Actions from both trigger engine recalculation on data changes.
  - Tests: Integration test: AI bar visible on dashboard, sparkle buttons on list items

- [x] **Add what-if engine calculation variant**
  - Files: `web/lib/engine/calculate.ts` (update)
  - Spec: `specs/10-what-if.md`
  - Acceptance: Engine calculation function accepts optional what-if overrides parameter. Excludes toggled-off obligations. Uses overridden amounts. Includes hypothetical obligations. Returns separate scenario projection alongside actual.
  - Tests: Unit test: calculation with toggled-off obligation, with amount override, with hypothetical

- [x] **Add what-if toggle controls on obligations list**
  - Files: `web/app/obligations/page.tsx` (update), `web/app/obligations/HypotheticalForm.tsx`, `web/app/obligations/obligations.module.css` (update), `web/app/layout.tsx` (update), `web/app/Providers.tsx`
  - Spec: `specs/10-what-if.md`
  - Acceptance: Each obligation has a what-if toggle switch. Toggling off marks it as excluded in the what-if context. Amount fields are editable for temporary overrides. "Add hypothetical" button creates a temporary obligation.
  - Tests: Component test: toggle updates context, amount override updates context

- [x] **Add `Escalation` model with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/11-escalation.md`
  - Acceptance: `Escalation` model with fields: id, obligationId, changeType (enum: absolute, percentage, fixed_increase), value (Decimal), effectiveDate (DateTime), intervalMonths (Int, nullable — null means one-off), isApplied (Boolean, default false), appliedAt (DateTime, nullable), createdAt, updatedAt. Relation to Obligation (cascade delete). Unique partial index on obligationId where intervalMonths is not null (at most one recurring rule per obligation). Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

## In Progress

## Completed (continued)

- [x] **Add password reset UI pages**
  - Files: `web/app/reset-password/page.tsx`, `web/app/reset-password/confirm/page.tsx`
  - Spec: `specs/01-auth.md`
  - Acceptance: Request page: email input, submit sends reset request. Confirm page: new password input (accessed via token link). Shows success/error messages.
  - Tests: Component test: both pages render and submit correctly

- [x] **Add password reset confirm route (`POST /api/auth/reset-confirm`)**
  - Files: `web/app/api/auth/reset-confirm/route.ts`
  - Spec: `specs/01-auth.md`
  - Acceptance: Accepts token + new password. Validates token (not expired, not used). Updates password hash. Invalidates token. Returns 200.
  - Tests: Test valid reset (200), expired token (400), already-used token (400)

- [x] **Add password reset request route (`POST /api/auth/reset-request`)**
  - Files: `web/app/api/auth/reset-request/route.ts`, `web/prisma/schema.prisma`, new migration
  - Spec: `specs/01-auth.md`
  - Acceptance: Accepts email, generates a time-limited reset token, stores it. In development, logs the reset link to console (no email service required initially). Returns 200 regardless of whether email exists (prevents enumeration).
  - Tests: Test token generation for existing user, 200 for nonexistent email

- [x] **Add what-if support to AI bar NL parser**
  - Files: `web/lib/ai/nlParser.ts` (update), `web/lib/ai/types.ts` (update), `web/app/components/AIBar.tsx` (update), `web/app/api/ai/parse/route.ts` (update)
  - Spec: `specs/10-what-if.md`
  - Acceptance: "What if I cancel gym?" → toggles gym off in what-if context. "What if Netflix goes up to $30?" → overrides amount. "What if I add a $2,000 holiday in December?" → adds hypothetical. Multiple what-if commands are additive.
  - Tests: Unit test: parse what-if intents correctly, additive behavior

- [x] **Add scenario banner component**
  - Files: `web/app/components/ScenarioBanner.tsx`, `web/app/components/scenario-banner.module.css`
  - Spec: `specs/10-what-if.md`
  - Acceptance: Appears at top of dashboard when what-if changes are active. Shows summary of changes ("2 expenses toggled off, 1 amount changed"). Reset button clears all. Apply button with confirmation dialog makes changes permanent (pauses toggled-off, updates amounts, saves hypotheticals).
  - Tests: Component test: shows summary, reset clears context, apply triggers confirmation

- [x] **Update dashboard to support what-if overlay**
  - Files: `web/app/(app)/dashboard/page.tsx` (update), `web/app/(app)/dashboard/HealthBar.tsx` (update), `web/app/api/engine/scenario/route.ts` (new), `web/app/(app)/dashboard/dashboard.module.css` (update)
  - Spec: `specs/10-what-if.md`
  - Acceptance: When what-if changes are active: timeline shows solid (actual) and dashed (scenario) lines. Hero card shows scenario next action with visual indicator. Health bar shows scenario status. All update live as toggles/tweaks change.
  - Tests: Component test: chart renders both lines, hero shows scenario indicator

- [x] **Add `POST /api/escalations` route**
  - Files: `web/app/api/escalations/route.ts`
  - Spec: `specs/11-escalation.md`
  - Acceptance: Creates an escalation rule for an obligation owned by the authenticated user. Validates: absolute changeType requires intervalMonths=null; obligation must not be one-off type. If a recurring rule already exists for the obligation, replaces it. If one-off rule has effectiveDate in the past, applies immediately (updates obligation amount, sets isApplied=true). Warns if value >50% increase. Returns 201.
  - Tests: Test create one-off absolute (201), recurring percentage (201), reject absolute+recurring (400), reject for one-off obligation (400), past-date one-off auto-applies, replacing existing recurring rule, unauthenticated (401)

- [x] **Add `GET /api/escalations` route**
  - Files: `web/app/api/escalations/route.ts`
  - Spec: `specs/11-escalation.md`
  - Acceptance: Returns all escalation rules for a given obligationId (query param), scoped to the authenticated user. Includes both applied and unapplied rules, ordered by effectiveDate.
  - Tests: Test returns rules for user's obligation only, includes applied rules for history

- [x] **Add onboarding statement upload step page**
  - Files: `web/app/onboarding/upload/page.tsx`, `web/app/onboarding/upload/upload.module.css`
  - Spec: `specs/02-onboarding.md`
  - Acceptance: User can upload bank statements (reuses import infrastructure). After parsing, shows detected patterns as suggestions. User can accept/tweak/dismiss each. Navigates to fund setup when done. Can skip.
  - Tests: Component test: upload works, suggestions display, skip navigates to fund setup

- [x] **Add PDF statement parser utility (AI-powered)**
  - Files: `web/lib/import/pdfParser.ts`, `web/package.json` (add pdf-parse, @anthropic-ai/sdk)
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Extracts text from PDF. Sends to AI (Opus 4.6) to parse into transaction objects. Returns transactions with confidence indicators for unusual formats. Handles multi-page statements.
  - Tests: Unit test with sample PDF data (mocked AI response)

- [x] **Update import upload route to support PDF format**
  - Files: `web/app/api/import/upload/route.ts` (update)
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Accepts PDF uploads alongside CSV/OFX. Routes to PDF parser. Low-confidence transactions are flagged for user review. Import summary includes confidence info.
  - Tests: Test PDF upload flow with mocked parser

- [x] **Add `DELETE /api/escalations/[id]` route**
  - Files: `web/app/api/escalations/[id]/route.ts`
  - Spec: `specs/11-escalation.md`
  - Acceptance: Deletes an escalation rule. Only allows deleting own records (via obligation ownership). Returns 200.
  - Tests: Test delete (200), ownership check (403/404)

- [x] **Add escalation projection utility**
  - Files: `web/lib/engine/escalation.ts`
  - Spec: `specs/11-escalation.md`
  - Acceptance: Given an obligation's current amount and its escalation rules, projects future amounts at each due date over a configurable window. Applies one-off rules at their effective dates (absolute sets amount, percentage/fixed_increase modify it). Applies recurring rules at each interval. One-off takes precedence over recurring on the same date. Returns array of {date, amount} pairs.
  - Tests: Unit tests: one-off absolute projection, one-off percentage, one-off fixed increase, recurring percentage over multiple intervals, recurring fixed increase, combined one-off + recurring, one-off precedence on same date

- [x] **Integrate escalation into sinking fund engine calculations**
  - Files: `web/lib/engine/calculate.ts` (update)
  - Spec: `specs/11-escalation.md`
  - Acceptance: Engine uses escalated future amounts (from escalation projection utility) when calculating per-obligation contributions instead of the current static amount. Ramps up contributions ahead of scheduled increases. Shortfall warnings account for escalated amounts. Crunch point detection uses escalated amounts.
  - Tests: Unit tests: contributions ramp up before an increase, shortfall detected for post-increase amount, crunch point uses escalated amount

- [x] **Integrate escalation into timeline projection**
  - Files: `web/lib/engine/timeline.ts` (update)
  - Spec: `specs/11-escalation.md`
  - Acceptance: Timeline projection uses escalated amounts for each obligation's future due dates. Expense markers reflect the escalated amount at that point in time. Step changes are visible in the projected balance curve.
  - Tests: Unit tests: timeline shows higher expense markers after escalation date, balance curve reflects stepped amounts

- [x] **Add escalation form component**
  - Files: `web/app/obligations/EscalationForm.tsx`, `web/app/obligations/escalation-form.module.css`
  - Spec: `specs/11-escalation.md`
  - Acceptance: Mini-form with: change type selector (absolute/percentage/fixed_increase), value input, effective date picker, optional "repeats every N months" toggle. Preview shows timeline of amount changes. Submits to POST /api/escalations. Confirmation prompt for >50% increases. Hidden for one-off obligations.
  - Tests: Component test: renders all fields, preview updates on input, submits valid data, shows confirmation for large increases

- [x] **Add escalation display to obligations list/detail**
  - Files: `web/app/obligations/page.tsx` (update), `web/app/obligations/obligations.module.css` (update)
  - Spec: `specs/11-escalation.md`
  - Acceptance: Each obligation shows upcoming escalation rules as a timeline of changes. Applied rules shown as history. Delete button on each rule. "Add price change" action available. Escalation section hidden for one-off obligations.
  - Tests: Component test: renders escalation timeline, delete calls API, hidden for one-off type

- [x] **Add "Add price change" preset to sparkle button for obligations**
  - Files: `web/app/components/SparkleButton.tsx` (update), `web/app/components/sparkle.module.css` (update), `web/app/obligations/page.tsx` (update)
  - Spec: `specs/11-escalation.md`
  - Acceptance: Obligation sparkle button gains "Add price change" preset alongside existing presets. Tapping it opens the EscalationForm. Existing "Change amount" preset remains for immediate changes.
  - Tests: Component test: "Add price change" preset appears for obligations, opens escalation form

- [x] **Add escalation NL parsing support**
  - Files: `web/lib/ai/nlParser.ts` (update), `web/lib/ai/types.ts` (update)
  - Spec: `specs/11-escalation.md`
  - Acceptance: NL parser recognizes escalation intents: "rent goes up to $2,200 in July" → one-off absolute, "rent goes up 3% every July" → recurring percentage, "Netflix going up $3 next month" → one-off fixed increase, "cancel the rent increase" → delete escalation rule. Returns structured escalation intent with change type, value, effective date, and interval.
  - Tests: Unit tests: parse all NL examples from spec 11, including cancel/remove intents

- [x] **Add what-if support for hypothetical escalation rules**
  - Files: `web/app/contexts/WhatIfContext.tsx` (update), `web/lib/engine/calculate.ts` (update)
  - Spec: `specs/11-escalation.md`
  - Acceptance: What-if context supports adding hypothetical escalation rules to obligations. "What if rent goes up 5% next year?" adds a temporary escalation rule. Engine calculation with what-if overrides includes hypothetical escalation in projections. Session-only, not persisted.
  - Tests: Unit test: hypothetical escalation appears in what-if projection, does not persist

- [x] **Add auto-apply logic for one-off escalation rules**
  - Files: `web/lib/engine/applyEscalations.ts`
  - Spec: `specs/11-escalation.md`
  - Acceptance: Utility that checks for unapplied one-off escalation rules whose effectiveDate has passed (and obligation is not paused). Updates the obligation's base amount according to the rule. Marks the rule as applied with appliedAt timestamp. Called during engine recalculation. For paused obligations, defers application until resume.
  - Tests: Unit tests: applies past-date one-off, skips future-date, skips paused obligations, skips already-applied rules, applies deferred rules on resume

- [x] **Install Playwright and create configuration**
  - Files: `web/package.json`, `web/playwright.config.ts`, `Dockerfile.web`
  - Spec: `specs/12-ui-testing.md`
  - Acceptance: `@playwright/test` is a dev dependency. `playwright.config.ts` exists with baseURL `http://localhost:3000`, Chromium project, `storageState` support, and reasonable timeouts. `npm run test:e2e` script runs Playwright. Dockerfile installs Chromium via `npx playwright install --with-deps chromium`. `npx playwright test` exits cleanly (no tests yet).
  - Tests: `npm run test:e2e` executes without configuration errors

- [x] **Add Playwright global setup with auth session**
  - Files: `web/e2e/global-setup.ts`, `web/e2e/global-teardown.ts`, `web/playwright.config.ts` (update)
  - Spec: `specs/12-ui-testing.md`
  - Acceptance: Global setup seeds a test user via Prisma (with onboardingComplete=true and sample data: at least one income source, one obligation). Logs in via the `/api/auth/login` endpoint and saves `storageState` to a file. Global teardown cleans up the test user and associated data. All subsequent test files reuse the saved session.
  - Tests: Running `npm run test:e2e` completes global setup without error; storageState file is created

- [x] **Add layout persistence e2e test**
  - Files: `web/e2e/layout.spec.ts`
  - Spec: `specs/12-ui-testing.md`
  - Acceptance: Test visits every authenticated route (`/dashboard`, `/income`, `/obligations`, `/transactions`, `/suggestions`, `/import`) and verifies: nav component is visible, AI bar pill is visible, page-specific content renders (not blank). Uses `data-testid` selectors.
  - Tests: All six routes pass layout assertions

- [x] **Add navigation e2e test**
  - Files: `web/e2e/navigation.spec.ts`
  - Spec: `specs/12-ui-testing.md`
  - Acceptance: Clicks each nav link and verifies navigation to the correct page. Header and AI bar remain visible after each navigation. Active nav item is highlighted on the correct page.
  - Tests: Navigation between all six routes works; active state is correct on each page

- [x] **Add authentication gating e2e test**
  - Files: `web/e2e/auth.spec.ts`
  - Spec: `specs/12-ui-testing.md`
  - Acceptance: Unauthenticated request to `/dashboard` redirects to `/login`. Login page does not show the app header/nav or AI bar. Uses a separate browser context without storageState.
  - Tests: Redirect and layout absence assertions pass

## In Progress

## Completed (continued 2)

- [x] **Add AI bar structural e2e test**
  - Files: `web/e2e/ai-bar.spec.ts`
  - Spec: `specs/12-ui-testing.md`
  - Acceptance: AI bar pill is visible. Clicking it expands the input field. Typing and submitting shows a response area. After navigating to another page, the AI bar is still present (persists across navigation).
  - Tests: Expand/collapse, input submission, and cross-navigation persistence assertions pass

- [x] **Add sparkle button e2e test**
  - Files: `web/e2e/sparkle.spec.ts`
  - Spec: `specs/12-ui-testing.md`
  - Acceptance: Sparkle button appears on income and obligation list items. Clicking a sparkle button opens the modal/popover. Modal shows item summary and action buttons.
  - Tests: Sparkle button visibility, modal open, and content assertions pass

- [x] **Add form smoke e2e tests**
  - Files: `web/e2e/forms.spec.ts`
  - Spec: `specs/12-ui-testing.md`
  - Acceptance: Income source form at `/income/new` submits successfully (new item appears in list). Obligation form at `/obligations/new` submits successfully. Submitting a form with missing required fields displays validation errors. Tests use the seeded auth session.
  - Tests: Form submission success and validation error assertions pass

- [x] **Add e2e test runner to Ralph validation loop**
  - Files: `PROMPT_build.md`, `web/package.json`, `web/e2e/run-e2e.mjs`
  - Spec: `specs/12-ui-testing.md`
  - Acceptance: `PROMPT_build.md` validation step includes `docker compose -f /project/docker-compose.yml exec web npm run test:e2e` after the existing `npm test` step. E2e tests skip gracefully (exit 0) when the dev server is not running.
  - Tests: Ralph validation step list includes e2e command; e2e tests skip without failure when server is unavailable

## Completed (continued 3)

- [x] **Rewrite `nlParser.ts` to call Claude API (Sonnet) instead of regex**
  - Files: `web/lib/ai/nlParser.ts`
  - Spec: `specs/09a-nl-to-claude-api.md`
  - Acceptance: `parseNaturalLanguage(input, context)` is async and calls Anthropic SDK with model `claude-sonnet-4-5-20250929`. System prompt defines all intent types and JSON schemas. User message includes financial context (income sources, obligations). Returns `ParseResult` matching existing types. No regex pattern matching remains.
  - Tests: Unit tests with mocked Anthropic SDK: parse "Add an income of $1000 a month" → create income with sensible name; parse "Netflix $22.99 monthly" → create expense; parse "change gym to $60" → edit; parse "delete Spotify" → delete; parse "what's my biggest expense" → query

- [x] **Update parse API route to load financial context and handle errors**
  - Files: `web/app/api/ai/parse/route.ts`
  - Spec: `specs/09a-nl-to-claude-api.md`
  - Acceptance: Route loads user's income sources and obligations from database before calling parser. Passes `FinancialContext` to async `parseNaturalLanguage()`. Returns structured error when `ANTHROPIC_API_KEY` is not set. Catches Anthropic API errors and returns user-friendly messages. Loading state is not blocked.
  - Tests: Test missing API key returns specific error type; test API failure returns user-friendly error; test context is loaded and passed

- [x] **Replace regex parser tests with Claude API mock tests**
  - Files: `web/lib/ai/__tests__/nlParser.test.ts`
  - Spec: `specs/09a-nl-to-claude-api.md`
  - Acceptance: All old regex-based tests removed. New tests mock `@anthropic-ai/sdk` and verify: each intent type (create income, create obligation, edit, delete, query, what-if, escalation, clarification), the "Add an income of $1000 a month" failure case now produces a sensible name, missing API key returns structured error, API failure returns user-friendly error. All existing component tests for AIBar/AIPreview/SparkleButton still pass.
  - Tests: All new parser tests pass; all existing component tests pass

- [x] **Wire AIBar to open AIPreview for create/edit/delete intents**
  - Files: `web/app/components/AIBar.tsx`
  - Spec: `specs/09a-nl-to-claude-api.md`
  - Acceptance: When parse API returns a create, edit, or delete intent, AIBar opens the existing AIPreview component with the parsed intent data. Query and what-if intents continue to be handled inline. AIPreview executes the action on confirm and triggers engine recalculation. Cancel dismisses the preview. Loading indicator shown while parse API call is in flight.
  - Tests: Component test: create intent opens AIPreview; confirm executes action; cancel dismisses; query intent handled inline

- [x] **Add graceful degradation for missing API key in AIBar**
  - Files: `web/app/components/AIBar.tsx` (update)
  - Spec: `specs/09a-nl-to-claude-api.md`
  - Acceptance: When parse API returns the missing-API-key error type, AIBar displays "AI features require an API key — you can still use the app normally" instead of a generic error. Message is persistent (not dismissed on next input). Rest of app continues to function. SparkleButton preset actions (which generate structured intents directly) still work without API key.
  - Tests: Component test: missing API key error shows friendly message; app remains usable

- [x] **Add `twice_monthly` to `IncomeFrequency` enum with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/03a-twice-monthly-frequency.md`
  - Acceptance: `IncomeFrequency` enum includes `twice_monthly`. Migration applies cleanly without data loss. Prisma generate succeeds.
  - Tests: Migration applies; Prisma generate succeeds

- [x] **Add `twice_monthly` mapping in engine `frequencyToDays()`**
  - Files: `web/lib/engine/calculate.ts`
  - Spec: `specs/03a-twice-monthly-frequency.md`
  - Acceptance: `frequencyToDays("twice_monthly", null)` returns `15`. No other frequency mappings change.
  - Tests: Unit test: `frequencyToDays("twice_monthly", null)` returns 15
  - Note: Completed alongside enum migration because tsc required exhaustive switch coverage.

## In Progress

## Completed (continued 4)

- [x] **Add settings page — profile section**
  - Files: `web/app/(app)/settings/page.tsx`, `web/app/(app)/settings/settings.module.css`
  - Spec: `specs/13-settings.md`
  - Acceptance: Settings page with profile section showing current email and forms to change email and password. Email change requires current password. Password change requires current + new + confirm. Inline validation errors.
  - Tests: Component test: renders email, change email form submits, change password form submits, validation errors display

- [x] **Add cycle auto-detection from income sources**
  - Files: `web/lib/engine/calculate.ts`
  - Spec: `specs/07a-cycle-auto-detection.md`
  - Acceptance: New `resolveCycleConfig(user, incomeSources)` function. Priority: (1) user's explicit `contributionCycleType` + `contributionPayDays`, (2) derive from most frequent non-irregular income source, (3) default to monthly on the 1st. Maps income frequency to cycle type.
  - Tests: Unit tests: explicit user config used, auto-detect from weekly income, auto-detect from twice-monthly income, fallback to monthly when no income

- [x] **Add "Twice monthly" option to income source form**
  - Files: `web/app/(app)/income/IncomeForm.tsx`
  - Spec: `specs/03a-twice-monthly-frequency.md`
  - Acceptance: Frequency dropdown includes "Twice monthly" as an option between "Fortnightly" and "Monthly". Selecting it sets frequency to `twice_monthly`.
  - Tests: Component test: "Twice monthly" option renders in frequency dropdown

## Backlog

### Spec 03a — Add twice-monthly income frequency

- [x] **Add "Twice monthly" option to onboarding manual income form**
  - Files: `web/app/onboarding/manual/income/page.tsx`
  - Spec: `specs/03a-twice-monthly-frequency.md`
  - Acceptance: Onboarding income form frequency dropdown includes "Twice monthly" option.
  - Tests: Component test: "Twice monthly" option renders in onboarding income form

- [x] **Add twice-monthly detection to pattern detection engine**
  - Files: `web/lib/patterns/detect.ts`
  - Spec: `specs/03a-twice-monthly-frequency.md`
  - Acceptance: Pattern detection can detect transactions occurring on approximately the 1st and 15th of each month as `twice_monthly` frequency. Existing frequency detection unchanged.
  - Tests: Unit test: transactions on 1st and 15th of consecutive months detected as twice_monthly

### Spec 07a — Calendar-based cycle counting & auto-detection

- [x] **Add `ContributionCycleType` enum and User model fields with Prisma migration**
  - Files: `web/prisma/schema.prisma`, new migration
  - Spec: `specs/07a-cycle-auto-detection.md`, `specs/13-settings.md`
  - Acceptance: `ContributionCycleType` enum with values: `weekly`, `fortnightly`, `twice_monthly`, `monthly`. User model gains `contributionCycleType` (nullable ContributionCycleType) and `contributionPayDays` (Int[], default []). Existing `contributionCycleDays` column kept but deprecated. Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

- [x] **Add `countCyclesBetween()` function replacing `getCyclesUntilDue()`**
  - Files: `web/lib/engine/calculate.ts`
  - Spec: `specs/07a-cycle-auto-detection.md`
  - Acceptance: New `countCyclesBetween(start, due, cycleType, payDays)` function. Weekly/fortnightly use day division (7/14). Twice-monthly counts actual pay date occurrences with end-of-month clamping. Monthly counts month occurrences. Returns at least 1 for future dates. `getCyclesUntilDue()` removed. `calculateContributions()` uses new function via `CycleConfig`.
  - Tests: Unit tests: weekly counts, fortnightly counts, twice-monthly Feb edge case (2 cycles not 1), monthly counts, end-of-month clamping (pay day 30 in Feb → 28th)

- [x] **Update `EngineInput` to accept `CycleConfig` instead of `contributionCycleDays`**
  - Files: `web/lib/engine/calculate.ts`
  - Spec: `specs/07a-cycle-auto-detection.md`
  - Acceptance: `EngineInput` interface replaces `contributionCycleDays: number | null` with `cycleConfig: CycleConfig`. `CycleConfig` has `type` and `payDays` fields. `calculateContributions()` uses `cycleConfig` throughout. All callers updated.
  - Tests: Existing engine tests updated to pass `cycleConfig` instead of `contributionCycleDays`; all pass

- [x] **Update recalculate API route to resolve and pass `CycleConfig`**
  - Files: `web/app/api/engine/recalculate/route.ts`
  - Spec: `specs/07a-cycle-auto-detection.md`
  - Acceptance: Route reads `user.contributionCycleType` and `user.contributionPayDays`. If null, queries income sources and derives cycle via `resolveCycleConfig()`. Passes resolved `CycleConfig` to engine calculation.
  - Tests: Test recalculation with explicit user cycle config; test auto-detection when no cycle set

- [x] **Update engine snapshot description to show cycle-aware text**
  - Files: `web/lib/engine/snapshot.ts`
  - Spec: `specs/07a-cycle-auto-detection.md`
  - Acceptance: Snapshot `nextActionDescription` reflects cycle type: "Set aside $X this week" / "this fortnight" / "this pay period" / "this month" based on the resolved cycle config. Snapshot generation accepts `CycleConfig` parameter.
  - Tests: Unit test: snapshot description matches cycle type for each of the four types

- [x] **Update timeline projection to use `CycleConfig`**
  - Files: `web/lib/engine/timeline.ts`
  - Spec: `specs/07a-cycle-auto-detection.md`
  - Acceptance: Timeline projection uses `CycleConfig` instead of `cycleDays`. Contribution markers placed at actual cycle dates (not fixed intervals for twice-monthly/monthly).
  - Tests: Existing timeline tests updated to use `CycleConfig`; all pass

- [x] **Update scenario API route to resolve and pass `CycleConfig`**
  - Files: `web/app/api/engine/scenario/route.ts`
  - Spec: `specs/07a-cycle-auto-detection.md`
  - Acceptance: Scenario route resolves `CycleConfig` the same way as recalculate route and passes it to engine calculations.
  - Tests: Test scenario calculation with resolved cycle config

- [x] **Update timeline API route to resolve and pass `CycleConfig`**
  - Files: `web/app/api/engine/timeline/route.ts`
  - Spec: `specs/07a-cycle-auto-detection.md`
  - Acceptance: Timeline route resolves `CycleConfig` and passes it to timeline projection.
  - Tests: Test timeline route returns correct data with resolved cycle config

### Spec 13 — Settings & profile

- [x] **Add `GET /api/user/settings` route**
  - Files: `web/app/api/user/settings/route.ts`
  - Spec: `specs/13-settings.md`
  - Acceptance: Returns current user's email, contributionCycleType, contributionPayDays, currencySymbol, maxContributionPerCycle. Includes auto-detected cycle recommendation from income sources. Returns 401 if unauthenticated.
  - Tests: Test returns user settings (200), unauthenticated (401), includes auto-detected cycle

- [x] **Add `PUT /api/user/settings` route**
  - Files: `web/app/api/user/settings/route.ts`
  - Spec: `specs/13-settings.md`
  - Acceptance: Updates user's contributionCycleType, contributionPayDays, currencySymbol, maxContributionPerCycle. Triggers engine recalculation after cycle or max contribution changes. Returns updated settings.
  - Tests: Test update cycle type (200), update currency (200), cycle change triggers recalculation, unauthenticated (401)

- [x] **Add `PUT /api/user/email` route**
  - Files: `web/app/api/user/email/route.ts`
  - Spec: `specs/13-settings.md`
  - Acceptance: Updates user's email. Requires current password confirmation. Validates email format. Rejects if new email already in use. Returns 200 on success.
  - Tests: Test update email (200), wrong password (403), duplicate email (409), invalid format (400)

- [x] **Add `PUT /api/user/password` route**
  - Files: `web/app/api/user/password/route.ts`
  - Spec: `specs/13-settings.md`
  - Acceptance: Updates user's password. Requires current password. New password must be ≥8 chars and differ from current. Returns 200 on success.
  - Tests: Test update password (200), wrong current password (403), short new password (400), same password (400)

- [x] **Add `POST /api/user/export` route**
  - Files: `web/app/api/user/export/route.ts`
  - Spec: `specs/13-settings.md`
  - Acceptance: Generates CSV files for transactions, obligations, income sources, and contribution records. Returns as a zip download. Scoped to authenticated user's data only.
  - Tests: Test export returns zip with correct CSV files, unauthenticated (401)

- [x] **Add `DELETE /api/user/account` route**
  - Files: `web/app/api/user/account/route.ts`
  - Spec: `specs/13-settings.md`
  - Acceptance: Hard-deletes all user data (cascade). Requires confirmation token ("DELETE" string). Clears session. Returns 200.
  - Tests: Test delete with correct confirmation (200), wrong confirmation (400), unauthenticated (401)

- [x] **Add settings page — budget preferences section**
  - Files: `web/app/(app)/settings/page.tsx` (update), `web/app/(app)/settings/settings.module.css` (update)
  - Spec: `specs/13-settings.md`
  - Acceptance: Budget section with: contribution cycle selector (weekly/fortnightly/twice monthly/monthly) showing auto-detected recommendation, currency symbol with quick picks ($, £, €, ¥, A$, NZ$) and free text input, max contribution per cycle input with clear option. Changes save via PUT /api/user/settings. Cycle changes trigger engine recalculation.
  - Tests: Component test: cycle selector renders with recommendation, currency picks work, max contribution saves

- [x] **Add settings page — account section**
  - Files: `web/app/(app)/settings/page.tsx` (update), `web/app/(app)/settings/settings.module.css` (update)
  - Spec: `specs/13-settings.md`
  - Acceptance: Account section with "Export data" button (triggers download) and "Delete account" button (requires typing "DELETE" to confirm). Export calls POST /api/user/export. Delete calls DELETE /api/user/account and redirects to landing page.
  - Tests: Component test: export button triggers download, delete requires confirmation, delete redirects

- [x] **Add Settings link to navigation**
  - Files: `web/app/components/Nav.tsx`
  - Spec: `specs/13-settings.md`
  - Acceptance: Nav component includes a "Settings" link that navigates to `/settings`. Highlights when active.
  - Tests: Component test: Settings link renders and navigates correctly

### Spec 14 — Contributions & catch-up

- [x] **Add `POST /api/contributions/bulk` route for lump sum**
  - Files: `web/app/api/contributions/bulk/route.ts`
  - Spec: `specs/14-contributions.md`
  - Acceptance: Accepts array of `{ obligationId, amount }`. Creates ContributionRecord for each with type `contribution` and note "Lump sum catch-up". Updates FundBalance for each. Triggers one engine recalculation at the end. Validates: all obligations belong to user, no zero amounts. Returns 201 with updated balances.
  - Tests: Test bulk create (201), ownership check, zero amount rejected, single recalculation triggered

- [x] **Add contribution modal component**
  - Files: `web/app/(app)/obligations/ContributionModal.tsx`, `web/app/(app)/obligations/contribution-modal.module.css`
  - Spec: `specs/14-contributions.md`
  - Acceptance: Modal shows obligation name, current balance, amount needed, and engine's recommended contribution pre-filled. User can accept or enter custom amount. On save: calls POST /api/contributions, dispatches `budget-data-changed` event. Validates: no zero or negative amounts.
  - Tests: Component test: renders with pre-filled amount, custom amount input, submits successfully, validation rejects zero

- [x] **Add fund balance display to obligations list**
  - Files: `web/app/(app)/obligations/page.tsx` (update), `web/app/(app)/obligations/obligations.module.css` (update)
  - Spec: `specs/14-contributions.md`
  - Acceptance: Each obligation in the list shows fund balance: progress bar or text "$X of $Y saved" with percentage. Color coded: green (≥80%), amber (40-79%), red (<40%). "Record contribution" button on each obligation opens ContributionModal.
  - Tests: Component test: fund balance renders with correct color, contribution button opens modal

- [x] **Add "Mark as done" action to dashboard hero card**
  - Files: `web/app/(app)/dashboard/page.tsx` (update), `web/app/(app)/dashboard/dashboard.module.css` (update), `web/lib/engine/snapshot.ts` (update), `web/prisma/schema.prisma` (update), `web/app/api/engine/recalculate/route.ts` (update)
  - Spec: `specs/14-contributions.md`
  - Acceptance: Hero card's next action has a "Mark as done" button. Clicking it opens ContributionModal pre-filled with the hero card amount and target obligation. After saving, dashboard refreshes (engine recalculates, snapshot updates).
  - Tests: Component test: "Mark as done" button renders, opens modal with correct pre-fill

- [x] **Add lump sum catch-up modal component**
  - Files: `web/app/(app)/dashboard/CatchUpModal.tsx`, `web/app/(app)/dashboard/catchup-modal.module.css`
  - Spec: `specs/14-contributions.md`
  - Acceptance: Modal for entering a lump sum amount. Shows distribution preview: per-obligation allocation prioritized by nearest due date. User can adjust individual allocations (must sum to total). Confirms via POST /api/contributions/bulk. Shows "all funded" message if no shortfall exists.
  - Tests: Component test: renders amount input, shows distribution preview, adjustable allocations sum correctly, submits bulk

- [x] **Add "Catch up" button to dashboard**
  - Files: `web/app/(app)/dashboard/page.tsx` (update), `web/app/(app)/dashboard/dashboard.module.css` (update)
  - Spec: `specs/14-contributions.md`
  - Acceptance: Dashboard shows a "Catch up" button when multiple obligations are underfunded. Clicking it opens CatchUpModal. Hidden when all obligations are fully funded.
  - Tests: Component test: button appears when underfunded, hidden when fully funded, opens modal

- [x] **Add balance adjustment modal to obligation detail**
  - Files: `web/app/(app)/obligations/AdjustBalanceModal.tsx`, `web/app/(app)/obligations/adjust-balance-modal.module.css`
  - Spec: `specs/14-contributions.md`
  - Acceptance: Modal shows current fund balance. User enters new exact balance. On save: calls PUT /api/fund-balances/[obligationId]. Supports both increasing and decreasing. Dispatches `budget-data-changed` event.
  - Tests: Component test: renders current balance, accepts new balance, submits adjustment

- [x] **Add "Adjust balance" action to obligations list**
  - Files: `web/app/(app)/obligations/page.tsx` (update)
  - Spec: `specs/14-contributions.md`
  - Acceptance: Each obligation has an "Adjust balance" link/button that opens AdjustBalanceModal. Available alongside the "Record contribution" button.
  - Tests: Component test: adjust balance button renders, opens modal

- [x] **Add contribution history to obligation detail**
  - Files: `web/app/api/contributions/[obligationId]/route.ts`, `web/app/(app)/obligations/ContributionHistory.tsx`, `web/app/(app)/obligations/contribution-history.module.css`
  - Spec: `specs/14-contributions.md`
  - Acceptance: GET /api/contributions/[obligationId] returns chronological list of contributions and adjustments for an obligation. UI component shows date, amount, type, and note for each entry. Displayed on the obligation edit/detail page.
  - Tests: API test: returns contributions for user's obligation only. Component test: renders history list

- [x] **Show total contribution per cycle on dashboard hero card** (ad-hoc)
  - Files: `web/lib/engine/snapshot.ts`, `web/app/(app)/dashboard/page.tsx`, `web/app/(app)/dashboard/dashboard.module.css`, `web/app/api/engine/recalculate/route.ts`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Dashboard hero card shows total contribution per cycle across all obligations (e.g. "$587.50 per fortnight") as the primary figure, with the most urgent obligation shown below. Engine snapshot includes `totalContributionPerCycle` and `cyclePeriodLabel` in API response.
  - Tests: 4 new perCycleLabel tests, updated dashboard page tests and API route tests

### Spec 07b — Fund group rework (funds as first-class entities)

- [x] **Prisma migration — restructure models for fund-group-level balances**
  - Files: `web/prisma/schema.prisma`, `web/prisma/migrations/20260216000000_fund_group_rework/`, `web/prisma/migrations/20260216000001_add_fund_group_id_to_snapshot/`
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: FundGroup gains `isDefault` and `currentBalance`. Obligation `fundGroupId` becomes non-nullable. ContributionRecord references `fundGroupId` instead of `obligationId`. FundBalance model deleted. EngineSnapshot gains `nextActionFundGroupId`. Default fund created for existing users; orphaned obligations assigned. Migration runs cleanly.
  - Tests: Migration applies; Prisma generate succeeds

- [x] **Create default fund group on signup**
  - Files: `web/app/api/auth/signup/route.ts`, `web/app/api/auth/signup/__tests__/route.test.ts`, `web/e2e/global-setup.ts`
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: Signup creates user + default fund group ("Default Sinking Fund", isDefault=true, currentBalance=0) in a single transaction. E2E global setup creates default fund for test user.
  - Tests: Signup test verifies transaction creates both user and fund group

- [x] **Engine — add fund group aggregation to output**
  - Files: `web/lib/engine/calculate.ts`, `web/lib/engine/snapshot.ts`, `web/lib/engine/timeline.ts`, `web/lib/engine/__tests__/calculate.test.ts`, `web/lib/engine/__tests__/snapshot.test.ts`, `web/lib/engine/__tests__/timeline.test.ts`
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: Engine accepts fund group balances instead of per-obligation FundBalance. Output includes per-fund-group aggregation (totalRequired, currentBalance, remaining, contributionPerCycle, healthPercentage). Snapshot targets most underfunded fund group for next action. Timeline uses fund group balances.
  - Tests: All engine tests updated and passing

- [x] **Rewrite contribution and balance APIs for fund groups**
  - Files: `web/app/api/contributions/route.ts`, `web/app/api/contributions/bulk/route.ts`, `web/app/api/contributions/[obligationId]/route.ts`, `web/app/api/fund-groups/[id]/balance/route.ts` (new), plus test files
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: POST /api/contributions accepts `fundGroupId` instead of `obligationId`, increments FundGroup.currentBalance. Bulk contributions target fund groups. GET /api/contributions/[id] looks up by fund group first, then obligation. New PUT /api/fund-groups/[id]/balance sets exact balance with manual_adjustment record. Old fund-balances routes deleted.
  - Tests: All contribution and balance API tests updated and passing

- [x] **Update fund group APIs — delete guards, ordering, counts**
  - Files: `web/app/api/fund-groups/route.ts`, `web/app/api/fund-groups/[id]/route.ts`, plus test files
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: GET returns `isDefault`, `currentBalance`, `_count.obligations`, ordered by isDefault desc then createdAt asc. DELETE rejects with 400 if default, 409 if fund has obligations.
  - Tests: Fund group API tests updated and passing

- [x] **Auto-assign default fund on obligation and suggestion creation**
  - Files: `web/app/api/obligations/route.ts`, `web/app/api/suggestions/[id]/route.ts`, plus test files
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: POST /api/obligations assigns default fund group when no fundGroupId provided. Accepted suggestions assign default fund group.
  - Tests: Obligation and suggestion API tests updated and passing

- [x] **Rewrite engine API routes for fund group balances**
  - Files: `web/app/api/engine/recalculate/route.ts`, `web/app/api/engine/scenario/route.ts`, `web/app/api/engine/timeline/route.ts`, plus test files
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: Recalculate, scenario, and timeline routes fetch fund group balances instead of FundBalance records. Pass fund group data to engine calculations.
  - Tests: All engine route tests updated and passing

- [x] **Rewrite ContributionModal, AdjustBalanceModal, ContributionHistory for fund groups**
  - Files: `web/app/(app)/obligations/ContributionModal.tsx`, `web/app/(app)/obligations/AdjustBalanceModal.tsx`, `web/app/(app)/obligations/ContributionHistory.tsx`, plus test files
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: ContributionModal accepts fundGroupId/Name, shows fund balance and target. AdjustBalanceModal calls /api/fund-groups/[id]/balance. ContributionHistory queries by fundGroupId.
  - Tests: All modal and history component tests updated and passing

- [x] **Rewrite CatchUpModal for fund groups**
  - Files: `web/app/(app)/dashboard/CatchUpModal.tsx`, `web/app/(app)/dashboard/__tests__/CatchUpModal.test.tsx`
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: CatchUpModal distributes lump sum across underfunded fund groups (not obligations). Dashboard passes underfunded fund group data.
  - Tests: CatchUpModal tests updated and passing

- [x] **Remove per-obligation fund balance UI from obligations page**
  - Files: `web/app/(app)/obligations/page.tsx`, `web/app/(app)/obligations/__tests__/page.test.tsx`
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: Per-obligation fund balance display (progress bar, "Record contribution", "Adjust balance") removed from obligation cards. ObligationForm updated for fund group dropdown.
  - Tests: Obligations page tests updated and passing

- [x] **Dashboard hero card targets most underfunded fund group**
  - Files: `web/app/(app)/dashboard/page.tsx`, `web/app/(app)/dashboard/__tests__/page.test.tsx`
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: Hero card "Mark as done" opens ContributionModal with the most underfunded fund group. Next action description references fund group name.
  - Tests: Dashboard page tests pass

- [x] **Dashboard HealthBar — show individual fund bars instead of aggregate**
  - Files: `web/app/(app)/dashboard/HealthBar.tsx`, `web/app/(app)/dashboard/health-bar.module.css`, `web/app/(app)/dashboard/page.tsx`, `web/app/(app)/dashboard/__tests__/HealthBar.test.tsx`
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: HealthBar shows each fund group as its own progress bar with name, balance/target, and percentage. No aggregate roll-up or expand/collapse. Dashboard passes fund group health data as props.
  - Tests: 11 HealthBar tests, 17 dashboard page tests — all passing

- [x] **Update user export and account deletion for schema changes**
  - Files: `web/app/api/user/export/route.ts`, `web/app/api/user/account/route.ts`, `web/e2e/global-teardown.ts`, plus test files
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: Export uses fundGroupId for contribution records. Account deletion includes ImportFile and ImportBatch cleanup (discovered during testing). E2E teardown updated.
  - Tests: Export and account deletion tests updated and passing

- [x] **Update all test files for fund group rework schema changes**
  - Files: 30+ test files across engine, API routes, dashboard, and obligations
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: All 1,225+ tests across 95 files pass. No type errors. No lint errors.
  - Tests: Full suite green

### Replace `window.confirm()` with styled ConfirmDialog

- [x] **Add ConfirmDialog presentational component**
  - Files: `web/app/components/ConfirmDialog.tsx`, `web/app/components/confirm-dialog.module.css`, `web/app/components/__tests__/ConfirmDialog.test.tsx`
  - Acceptance: Styled modal overlay at z-index 1010 (above all modals). Props: open, title, message, confirmLabel, cancelLabel, variant ("default" | "danger"), onConfirm, onCancel. Renders nothing when closed. Handles Escape key and overlay click. Danger variant shows red confirm button.
  - Tests: 9 tests: renders nothing when closed, renders when open, button clicks, Escape key, overlay click, card click doesn't dismiss, default labels, accessible dialog role

- [x] **Add useConfirmDialog promise-based hook**
  - Files: `web/lib/hooks/useConfirmDialog.tsx`
  - Acceptance: `confirm(opts)` returns `Promise<boolean>`, `confirmDialog` is ReactNode to render. State-managed internally with pending resolve callback in a ref.
  - Tests: Tested via useModalClose and consumer component tests

- [x] **Update useModalClose to use ConfirmDialog instead of window.confirm()**
  - Files: `web/lib/hooks/useModalClose.ts`, `web/lib/hooks/__tests__/useModalClose.test.ts`
  - Acceptance: Returns `{ handleClose, confirmDialog }` instead of `() => void`. Uses `useConfirmDialog` internally with `isConfirmingRef` to prevent double-Escape conflicts. All 5 consumers updated to destructure new return type and render `{confirmDialog}`.
  - Tests: useModalClose tests rewritten to interact with ConfirmDialog DOM elements instead of `window.confirm` spies

- [x] **Update all modal consumers for styled ConfirmDialog**
  - Files: `web/app/(app)/obligations/ContributionModal.tsx`, `web/app/(app)/obligations/AdjustBalanceModal.tsx`, `web/app/(app)/dashboard/CatchUpModal.tsx`, `web/app/components/SparkleButton.tsx`, `web/app/components/AIPreview.tsx`, plus test files
  - Acceptance: Each modal destructures `{ handleClose, confirmDialog }` from `useModalClose` and renders `{confirmDialog}` in JSX. Dirty-state Escape key tests updated to assert ConfirmDialog DOM elements.
  - Tests: All modal test files updated with `act()` wrappers for Escape dispatch and ConfirmDialog assertions

- [x] **Replace confirm() in EscalationForm, obligations page, and income page**
  - Files: `web/app/(app)/obligations/EscalationForm.tsx`, `web/app/(app)/obligations/page.tsx`, `web/app/(app)/income/page.tsx`, plus test files
  - Acceptance: EscalationForm uses `useConfirmDialog` for large increase warning. Obligations and income pages use `useConfirmDialog` with `variant: "danger"` for delete confirmations. All render `{confirmDialog}` in JSX.
  - Tests: All tests updated to interact with ConfirmDialog instead of `window.confirm` spies. Full suite of 1,259 tests across 98 files passes.

### Simplify what-if controls on obligations page

- [x] **Add `clearAmountOverride` to WhatIfContext**
  - Files: `web/app/contexts/WhatIfContext.tsx`, `web/app/contexts/__tests__/WhatIfContext.test.tsx`
  - Spec: `specs/10-what-if.md`
  - Acceptance: `clearAmountOverride(id)` deletes the entry from `amountOverrides` Map. Added to interface, provider value, and dependency array. 3 new tests: clears specific override, clears one while keeping another, no-op for non-existent.
  - Tests: 15 WhatIfContext tests pass

- [x] **Remove what-if checkbox, add reset button to amount override**
  - Files: `web/app/(app)/obligations/page.tsx`, `web/app/(app)/obligations/obligations.module.css`, `web/app/(app)/obligations/__tests__/page.test.tsx`
  - Spec: `specs/10-what-if.md`
  - Acceptance: Removed what-if toggle checkbox, "What-if: off" badge, `isToggledOff` variable, and `listItemToggledOff` styling from obligations list. Amount input changed from `type="number"` to `type="text" inputMode="decimal"` (removes spinner arrows). Input wrapped in `.amountOverrideWrapper` with conditional reset (×) button that calls `clearAmountOverride`. Emptying input via backspace also calls `clearAmountOverride`. Dark mode styles for reset button added. 3 checkbox tests removed, 4 reset button tests added.
  - Tests: 48 obligations page tests pass

### Resume active import batch on page revisit

- [x] **Add `GET /api/import/batch` route — find active batch**
  - Files: `web/app/api/import/batch/route.ts`, `web/app/api/import/batch/__tests__/route.test.ts`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: GET handler queries for user's most recent batch with status `pending` or `processing`. Returns `{ batch: null }` when none found (not 404). Returns same shape as `[batchId]` GET when found. Includes stale-job recovery (re-triggers processing if no update in 5 minutes). Returns 401 when unauthenticated.
  - Tests: 5 new tests: 401 unauth, null when no active batch, returns active batch, re-triggers stale batch, skips fresh batch

- [x] **Add mount check + `isLoading` to `useBatchImport` hook**
  - Files: `web/lib/hooks/useBatchImport.ts`, `web/lib/hooks/__tests__/useBatchImport.test.ts`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: `useEffect` on mount calls `GET /api/import/batch`. If active batch found, sets batch state and starts polling. `isLoading` state starts true, resolves to false after check. Exposed in return value. Cancellation cleanup on unmount.
  - Tests: 3 new tests: resumes active batch on mount, no-ops when no active batch, upload works after mount check. Existing tests updated to account for mount fetch.

- [x] **Update import page to handle loading state**
  - Files: `web/app/(app)/import/page.tsx`
  - Spec: `specs/05-bank-statement-import.md`
  - Acceptance: Destructures `isLoading` from `useBatchImport()`. Upload zone gated on `!isLoading` to prevent flash before active-batch check completes. No other page changes needed.
  - Tests: Existing page tests unaffected (no import page test file changes needed)

### Settings page: collapsible sections + fund CRUD

- [x] **Add CollapsibleSection controlled component**
  - Files: `web/app/(app)/settings/CollapsibleSection.tsx`, `web/app/(app)/settings/settings.module.css`, `web/app/(app)/settings/__tests__/CollapsibleSection.test.tsx`
  - Spec: `specs/13-settings.md`
  - Acceptance: Controlled disclosure wrapper with `expanded` and `onToggle` props. Renders title in a button with chevron toggle and `aria-expanded`. Content hidden when collapsed. CSS styles for header, chevron rotation, dark mode.
  - Tests: 4 tests: renders when expanded, aria-expanded values, hides when collapsed, calls onToggle on click

- [x] **Extract ProfileSection component**
  - Files: `web/app/(app)/settings/ProfileSection.tsx`, `web/app/(app)/settings/__tests__/ProfileSection.test.tsx`
  - Spec: `specs/13-settings.md`
  - Acceptance: Self-contained component with email display, change email form, change password form. Receives `email` and `onEmailChange` props from parent. All form state managed internally.
  - Tests: 11 tests: email display, form rendering, submit success, validation errors, API errors

- [x] **Extract BudgetPreferencesSection component**
  - Files: `web/app/(app)/settings/BudgetPreferencesSection.tsx`, `web/app/(app)/settings/__tests__/BudgetPreferencesSection.test.tsx`
  - Spec: `specs/13-settings.md`
  - Acceptance: Self-contained component with contribution cycle selector, currency quick picks, max contribution input. Receives settings props and `onSettingsChange` callback. All form state managed internally.
  - Tests: 7 tests: cycle selector, currency picks, max contribution save/clear

- [x] **Extract AccountSection component**
  - Files: `web/app/(app)/settings/AccountSection.tsx`, `web/app/(app)/settings/__tests__/AccountSection.test.tsx`
  - Spec: `specs/13-settings.md`
  - Acceptance: Self-contained component with export data button and delete account form. Manages its own router for post-delete redirect. All state managed internally.
  - Tests: 7 tests: export button, download trigger, export error, delete form, confirmation validation, delete success redirect, API error

- [x] **Build FundsSection with CRUD**
  - Files: `web/app/(app)/settings/FundsSection.tsx`, `web/app/(app)/settings/__tests__/FundsSection.test.tsx`
  - Spec: `specs/13-settings.md`, `specs/07b-fund-group-rework.md`
  - Acceptance: Fetches `GET /api/fund-groups` on mount. Lists funds with name, "Default" badge, obligation count. Inline create form (`POST`). Inline rename via click-to-edit (`PUT`). Delete with `useConfirmDialog` confirmation (`DELETE`). Delete disabled for default group and groups with obligations.
  - Tests: 16 tests: loading, list rendering, badges, counts, error handling, create, rename (save/cancel/escape), delete (confirm/cancel/disabled/error)

- [x] **Wire up parent page with accordion layout**
  - Files: `web/app/(app)/settings/page.tsx`, `web/app/(app)/settings/__tests__/page.test.tsx`
  - Spec: `specs/13-settings.md`
  - Acceptance: Parent slimmed to ~120 lines. Fetches settings, renders 4 CollapsibleSection wrappers (Profile, Budget Preferences, Funds, Account). Accordion behavior: only one section open at a time, Profile starts expanded. Opening a section closes the previous one.
  - Tests: 7 tests: loading, title, fetch error, section headings, first section expanded by default, accordion toggle, collapse all

### Fund pill on obligation cards

- [x] **Create FundPill component**
  - Files: `web/app/(app)/obligations/FundPill.tsx`, `web/app/(app)/obligations/__tests__/FundPill.test.tsx`
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: Self-contained component (~100 lines). Renders a pill button in blue badge palette (`#2b6cb0`/`#ebf8ff`). When multiple funds exist, clicking opens a dropdown listing other funds. Selecting a fund calls `onMoveFund` callback. Click-outside and Escape key close the dropdown. Renders as a static `<span>` when only one fund exists. Uses `role="listbox"` / `role="option"` for accessibility.
  - Tests: 8 tests: renders fund name, static when single fund, button when multiple, opens dropdown, excludes current fund, calls onMoveFund on selection, closes on Escape, closes on click-outside

- [x] **Add FundPill CSS styles**
  - Files: `web/app/(app)/obligations/obligations.module.css`
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: `position: relative` on `.listItem`. `padding-right: 100px` on `.listItemName` to avoid overlap. New classes: `.fundPillWrapper` (absolute top-right), `.fundPill` (blue badge), `.fundPillStatic` (non-interactive), `.fundDropdown`, `.fundDropdownItem`. `max-width` + `text-overflow: ellipsis` on pill. Dark mode variants (`#63b3ed`/`#1a365d`). Mobile adjustments (smaller max-width).

- [x] **Integrate FundPill into obligations page**
  - Files: `web/app/(app)/obligations/page.tsx`, `web/app/(app)/obligations/__tests__/page.test.tsx`
  - Spec: `specs/07b-fund-group-rework.md`
  - Acceptance: `fundGroups` state fetched from `GET /api/fund-groups` in parallel with obligations. `handleMoveFund` PUTs to `/api/obligations/[id]` with `{ fundGroupId }`, updates local state from response. `<FundPill>` rendered on each active obligation card (not on archived or hypothetical cards). Fund groups sorted alphabetically in the listing.
  - Tests: 7 new tests: pills render on active cards, correct fund name shown, move API called with correct fundGroupId, error state on API failure, static pill with single fund, no pills on archived cards. 2 existing tests updated for text ambiguity with fund pill text.

### Obligation action button icons

- [x] **Replace obligation action button text with icons and right-align**
  - Files: `web/app/(app)/obligations/page.tsx`, `web/app/(app)/obligations/obligations.module.css`, `web/app/(app)/obligations/HypotheticalForm.tsx`, `web/app/(app)/obligations/__tests__/page.test.tsx`
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: Action buttons (sparkle, pause/play, edit, delete) use inline SVG icons instead of text labels. Pause shows two vertical bars; play shows a triangle. Edit shows a pencil. Delete shows a trash can. Buttons are right-aligned via `margin-left: auto` on the actions container. All buttons have `title` tooltips and `aria-label` attributes. `.pauseButton` and `.editButton` CSS classes replaced with shared `.iconButton` class. HypotheticalForm cancel button uses new `.secondaryButton` class. Dark mode styles updated.
  - Tests: Existing tests updated to use aria-label queries instead of text content assertions. All 54 obligation page tests pass.

### Simplify frequency UI and fix suggestion display

- [x] **Simplify frequency controls in IncomeForm**
  - Files: `web/app/(app)/income/IncomeForm.tsx`, `web/app/(app)/income/income-form.module.css`, `web/app/(app)/income/__tests__/IncomeForm.test.tsx`
  - Spec: `specs/03-income-sources.md`
  - Acceptance: Removed `INTERVAL_PRESETS` buttons, `isPresetMatch()`, `applyPreset()`, `activePreset`, `isIrregular` flag, and `minimumExpected` state. Form always shows "Every N [unit]" controls with `intervalUnit` defaulting to `"month"`. Added helper text: "If your income varies, enter a conservative estimate for the amount and period you can count on." Removed irregular minimum-expected section. `intervalUnit` is always non-null (`string` not `string | null`).
  - Tests: 12 tests — replaced preset button and irregular tests with interval control and helper text tests.

- [x] **Simplify frequency controls in ObligationForm**
  - Files: `web/app/(app)/obligations/ObligationForm.tsx`, `web/app/(app)/obligations/__tests__/ObligationForm.test.tsx`
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: Removed `INTERVAL_PRESETS`, `isPresetMatch()`, `applyPreset()`, `activePreset`, and preset button row. Only "Every N [unit]" controls remain for recurring and recurring_with_end types.
  - Tests: 18 tests — replaced preset button tests with interval unit dropdown tests.

- [x] **Simplify frequency controls in HypotheticalForm**
  - Files: `web/app/(app)/obligations/HypotheticalForm.tsx`
  - Spec: `specs/04-expenses-obligations.md`
  - Acceptance: Removed `INTERVAL_PRESETS` and `applyPreset()`. Added `INTERVAL_UNIT_OPTIONS` constant. Replaced inline-styled preset buttons with clean unit dropdown.

- [x] **Replace frequency presets with interval controls in onboarding income page**
  - Files: `web/app/onboarding/manual/income/page.tsx`, `web/app/onboarding/manual/income/__tests__/page.test.tsx`
  - Spec: `specs/02-onboarding.md`
  - Acceptance: Replaced `INTERVAL_PRESETS` array and `selectedPreset` state with `intervalUnit`/`intervalCount` states. Form shows "Every" number input + "Unit" select dropdown instead of preset `<select>`. Updated `handleAdd()` to validate count and use new state. Removed "Irregular" option. Updated `formatInterval()` to remove "Irregular" and "Fortnightly" special cases.
  - Tests: 10 tests — updated to use "Every"/"Unit" labels instead of "Frequency".

- [x] **Replace frequency presets with interval controls in onboarding obligations page**
  - Files: `web/app/onboarding/manual/obligations/page.tsx`, `web/app/onboarding/manual/obligations/__tests__/page.test.tsx`
  - Spec: `specs/02-onboarding.md`
  - Acceptance: Same treatment as onboarding income page — `INTERVAL_UNIT_OPTIONS`, `intervalUnit`/`intervalCount` states, "Every N [unit]" controls, updated `formatInterval()`.
  - Tests: 9 tests — updated to use "Every"/"Unit" labels instead of "Frequency".

- [x] **Update formatInterval() display across list pages**
  - Files: `web/app/(app)/income/page.tsx`, `web/app/(app)/obligations/page.tsx`, `web/app/(app)/income/__tests__/page.test.tsx`
  - Spec: `specs/03-income-sources.md`, `specs/04-expenses-obligations.md`
  - Acceptance: Removed "Fortnightly" special case (now "Every 2 weeks"). Income page: `null` unit displays "—" instead of "Irregular". Count=1 shows friendly label (Weekly, Monthly, etc.), count>1 shows "Every N [units]".
  - Tests: Updated assertion from "Irregular" to "—".

- [x] **Fix suggestion display on suggestions page**
  - Files: `web/app/(app)/suggestions/page.tsx`, `web/app/(app)/suggestions/__tests__/page.test.tsx`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Replaced `Suggestion` interface: `detectedFrequency` → `detectedIntervalUnit`/`detectedIntervalCount`. Replaced `FREQUENCY_LABELS`/`FREQUENCY_OPTIONS` with `INTERVAL_UNIT_OPTIONS` and `formatInterval()`. Tweak form uses "Every N [unit]" controls instead of frequency `<select>`. `handleSaveTweak()` sends `intervalUnit`/`intervalCount` instead of `frequency`. `handleStartTweak()` reads from `detectedIntervalUnit`/`detectedIntervalCount`. Irregular check uses `detectedIntervalUnit === null`.
  - Tests: 15 tests — updated mocks to use `detectedIntervalUnit`/`detectedIntervalCount`, tweak form assertions updated for "Every"/"Unit" labels and new request body format.

- [x] **Fix suggestion display on onboarding upload page**
  - Files: `web/app/onboarding/upload/page.tsx`, `web/app/onboarding/upload/__tests__/page.test.tsx`
  - Spec: `specs/02-onboarding.md`, `specs/06-pattern-detection.md`
  - Acceptance: Same changes as suggestions page — updated `Suggestion` interface, replaced frequency constants, updated tweak state/handlers, replaced tweak form controls with "Every N [unit]".
  - Tests: Already using new interval fields in mocks — no test changes needed.

- [x] **Fix suggestion display on dashboard NudgeCards**
  - Files: `web/app/(app)/dashboard/NudgeCards.tsx`, `web/app/(app)/dashboard/__tests__/NudgeCards.test.tsx`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Updated `Suggestion` interface with `detectedIntervalUnit`/`detectedIntervalCount`. Replaced `FREQUENCY_LABELS` with `formatInterval()` function (lowercase labels for inline text: "weekly", "monthly", etc.).
  - Tests: 8 tests — removed `detectedFrequency` from all mock data.

- [x] **Fix suggestion display on dashboard SuggestionsCard**
  - Files: `web/app/(app)/dashboard/SuggestionsCard.tsx`, `web/app/(app)/dashboard/__tests__/SuggestionsCard.test.tsx`
  - Spec: `specs/08-dashboard.md`
  - Acceptance: Updated `Suggestion` interface with interval fields. Replaced `frequencyShort(freq: string)` with `frequencyShort(unit: string | null, count: number)` supporting count>1 cases (e.g. `/2wks`).
  - Tests: Already using new interval fields — no test changes needed.

- [x] **Add irregular income baseline computation in suggestion acceptance API**
  - Files: `web/app/api/suggestions/[id]/route.ts`, `web/app/api/suggestions/[id]/__tests__/route.test.ts`
  - Spec: `specs/06-pattern-detection.md`
  - Acceptance: Added `computeIrregularBaseline()` helper that takes transaction dates+amounts and returns `{ amount, intervalUnit, intervalCount, minimumExpected }`. When `intervalUnit` is null on acceptance: computes baseline from linked transactions, sets conservative amount (min of average and median), defaults to monthly (or weekly if per-week > $10), appends "(irregular baseline)" to name, sets `minimumExpected` to minimum observed amount. Works for both income and expense suggestion types.
  - Tests: Added `suggestionTransactions` to existing mock data. Added test for irregular income baseline computation verifying name suffix, interval fields, and minimumExpected.