# Ad-hoc Tasks

## Instructions

Take a look at the backlog of tasks below and pick one and only one. Move it into the In Process queue, do the work, run tests, etc.

Keep notes on what you've done and what worked, what didn't, etc, in case you need to start this process over again on an existing task. Also helps me see what you did.

When coplete, update any specs and other documentation related to this adhoc work, and ensure the IMPLEMENTATION_PLAN.md reflects that this has been done, and move the task to the Completed section.

## In Process

## Backlog

When suggested obligations and incomes are added to the system, they are added with today's date as the due date, not the extrapolated due date based on historic recurrence data. For example, if it's monthly on the 21st, then it should come out on the next 21st. If the calculation shows it comes out every 7 weeks and it last came out 3 weeks ago, the next is in 4 weeks, and then every 7 weeks from there.

---

Pattern detector should use `custom` + `frequencyDays` instead of `irregular` for consistent non-standard intervals (e.g., every ~49 days). Currently, any interval that doesn't match standard ranges (weekly/fortnightly/monthly/quarterly/annual) gets mapped to `irregular`, which loses the detected interval entirely — `frequencyDays` is never set, so the engine can't schedule future occurrences. Also, the edit form doesn't have `irregular` in its dropdown, so irregular obligations display as "weekly" (first option fallback).

Changes needed:
1. **Pattern detector** (`detect.ts`): When median interval is consistent but doesn't match standard ranges, use `frequency: "custom"` and store the median interval as `frequencyDays` on the Suggestion model (needs a new field) and pass it through to the Obligation on acceptance.
2. **Suggestion acceptance** (`suggestions/[id]/route.ts`): Pass `frequencyDays` from suggestion to obligation when creating.
3. **Next due date calculation**: Calculate from last transaction date + interval, not today's date (related to the due date task above).
4. **Display formatting**: Smart display of `frequencyDays` in the UI:
   - Exact multiple of 7 → "Every N weeks" (49 → "Every 7 weeks")
   - Within 1 day of a week multiple → "Every ~N weeks" (50 → "Every ~7 weeks")
   - Everything else → "Every N days" (44 → "Every 44 days")
   - Short form for pills/badges: "7 weeks", "~7 weeks", "44 days"
5. **Edit form** (`ObligationForm.tsx`): Already supports `custom` + `frequencyDays` — just needs to display correctly when loaded with these values.

---

Show how much lump sum is required to pre-fund the sinking fund appropriately.

---

Add a `formatCustomFrequency(days)` utility for displaying custom frequency intervals in the UI. Display rules:
- Exact multiple of 7 → "Every N weeks" (49 → "Every 7 weeks")
- Within 1 day of a week multiple → "Every ~N weeks" (50 → "Every ~7 weeks")
- Everything else → "Every N days" (44 → "Every 44 days")
- Short form for pills/badges (drop "Every"): "7 weeks", "~7 weeks", "44 days"

Use this wherever `frequency === "custom"` and `frequencyDays` is set, replacing the current "Every N days" / "Custom" labels in obligation list cards, edit forms, dashboard, etc.

---

## Completed

---

Dashboard should show the total contribution needed per pay cycle to cover all obligations, not just the single most urgent one. The engine already computes `totalContributionPerCycle` but the snapshot/dashboard never surfaces it.

### Notes

- **Root cause:** `SnapshotData` interface and `generateSnapshot()` only exposed the *next action* (single most urgent obligation). The engine already computed `totalContributionPerCycle` in `EngineResult` but it was never surfaced.
- **Fix 1 — snapshot.ts:** Added `totalContributionPerCycle` and `cyclePeriodLabel` to `SnapshotData` interface. `generateSnapshot()` now extracts `totalContributionPerCycle` from the engine result and computes `cyclePeriodLabel` (e.g. "per week", "per fortnight") from the cycle config. Also exported new `perCycleLabel()` utility.
- **Fix 2 — recalculate API:** Returns `totalContributionPerCycle` and `cyclePeriodLabel` alongside the persisted snapshot. No Prisma migration needed — these are computed fields returned in the JSON response but not stored in the EngineSnapshot table (which is write-only/append-only).
- **Fix 3 — dashboard page.tsx:** Hero card now shows **total contribution per cycle** prominently at top (e.g. "$587.50" with label "Total contribution per fortnight" and subtitle "across all obligations"), followed by a divider and **most urgent** obligation detail below (replacing the old "Next action" label). Added `totalContributionPerCycle` and `cyclePeriodLabel` to both `EngineSnapshot` and `ScenarioSnapshot` interfaces.
- **Fix 4 — dashboard.module.css:** Added `.heroSubAmount` (smaller heading for the most urgent amount), `.heroDivider` (subtle separator between total and most-urgent sections), with dark mode support.
- **Tests updated:** 4 new `perCycleLabel` tests in snapshot.test.ts (17 total, was 13). Dashboard page.test.tsx updated for new layout (17 tests pass). Recalculate route.test.ts updated with assertions for new response fields (12 tests pass). All other affected test mocks updated (scenario, contributions, bulk contributions, fund-balances).
- Files changed: `lib/engine/snapshot.ts`, `app/(app)/dashboard/page.tsx`, `app/(app)/dashboard/dashboard.module.css`, `app/api/engine/recalculate/route.ts`, plus 6 test files
- 89/91 test files pass (2 pre-existing failures in onboarding module), no type errors, no lint errors

---

The amounts in the upcoming obligations on the dashboard are not aligned correctly

### Notes

- **Root cause:** `.itemMain` was a plain flex container with no width constraints — `.itemName` had no `flex: 1`, so amounts started at different horizontal positions depending on name length
- **Fix:** Added `flex: 1` and `min-width: 0` to `.itemMain` and `.itemName`, with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` on name (prevents long names from pushing amounts off-screen), and `white-space: nowrap; text-align: right` on `.itemAmount` to keep amounts aligned
- File changed: `upcoming.module.css` only (CSS-only fix)
- All 10 UpcomingObligations tests pass, no lint errors

---

Income sources that arrive twice monthly have a label of "twice_monthly" instead of the friendly text of "Twice monthly"

### Notes

- Issue was broader than just income sources — 4 files had missing "twice_monthly" entries in frequency label maps
- **NudgeCards.tsx** — Added "twice_monthly": "twice-monthly" to FREQUENCY_LABELS (lowercase to match sentence context)
- **onboarding/upload/page.tsx** — Added "twice_monthly": "Twice monthly" to both FREQUENCY_LABELS and FREQUENCY_OPTIONS
- **onboarding/manual/income/page.tsx** — Added FREQUENCY_LABELS map and used it when displaying entries (was showing raw value)
- **obligations/HypotheticalForm.tsx** — Added "Twice monthly" option to frequency dropdown
- All tests pass (107 onboarding + 126 obligations + 78 dashboard), no type or lint errors

---

This appears in the onboarding. We shoudl probably be offering the 1 week, firtnightly, twice monthy, monthly, etc options or "irregular" or whatever we're calling it. We should have a similar (if not the same component) as on settings. Same for currency symbol.

### Notes

- **Contribution cycle:** Replaced number input (days) with radio button group matching settings (Weekly, Fortnightly, Twice monthly, Monthly). Default is Fortnightly. Sends `contributionCycleType` enum instead of `contributionCycleDays` integer.
- **Currency symbol:** Replaced plain text input with quick-pick buttons ($, £, €, ¥, A$, NZ$) + custom input with "Set" button, matching settings page UI.
- **API update:** Updated `PUT /api/user/onboarding` to accept and validate `contributionCycleType` field, store it in the new enum column.
- **"Not sure" checkbox:** Now disables cycle radio buttons (previously disabled the days input).
- Files changed: `fund-setup/page.tsx`, `fund-setup.module.css`, `api/user/onboarding/route.ts`, `fund-setup/__tests__/page.test.tsx`
- All 15 tests pass (was 10, added 5 new tests for radio buttons, currency picks, and cycle type selection), no type errors or lint errors.

---

Uploading 12 PDFs takes a long time. It is processing each in between? If so, we should probably make a note of that so people don't get confused as to why it's taking so long.

Also, we got to file 6 of 12 and the progress bar was at 100%

### Notes

- **Root cause:** Progress bar had hardcoded `style={{ width: "100%" }}` — it always showed full regardless of actual progress
- **Fix 1:** Added `uploadProgressPercent` state that calculates real progress as `(filesCompleted / totalFiles) * 100`, wired to progress bar width
- **Fix 2:** Changed multi-file message from "Uploading file X of Y" to "Processing file X of Y" (more accurate since server-side processing is the slow part)
- **Fix 3:** Added a hint below the progress text: "Each file is uploaded and processed individually. PDFs may take longer."
- **Fix 4:** Pattern detection phase now uses an indeterminate CSS animation (sliding bar) instead of a static full bar, since duration is unknown
- All 14 existing tests pass, no type errors or lint errors in changed files

---