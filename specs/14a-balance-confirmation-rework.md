# Balance Confirmation Rework

## Overview

Rework of spec 14 (Contributions & Catch-Up). The original spec had users recording individual contributions and lump-sum catch-ups. The new model replaces this with periodic balance confirmation — users confirm what their fund accounts actually hold, and the system adjusts.

See updated `specs/14-contributions.md` for the full new spec.

## What Changed

The original spec 14 had:
- "Record contribution" button on dashboard opening a ContributionModal
- "Catch up" button for lump-sum distribution across underfunded funds
- POST /api/contributions for single contributions
- POST /api/contributions/bulk for lump-sum catch-ups

The new spec replaces all of the above with:
- "Confirm fund balances" button on dashboard opening a ConfirmBalancesModal
- Modal shows all fund groups with editable balance inputs
- Saves via existing PUT /api/fund-groups/[id]/balance (already creates audit records)

## Files to Remove

- `web/app/(app)/obligations/ContributionModal.tsx` + CSS + test
- `web/app/(app)/dashboard/CatchUpModal.tsx` + CSS + test
- `web/app/api/contributions/route.ts` (POST) + test
- `web/app/api/contributions/bulk/route.ts` (POST) + test

## Files to Create

- `web/app/(app)/dashboard/ConfirmBalancesModal.tsx` + CSS + test

## Files to Modify

- `web/app/(app)/dashboard/page.tsx` — replace ContributionModal/CatchUpModal with ConfirmBalancesModal
- `web/app/(app)/dashboard/dashboard.module.css` — remove unused button styles, add confirm button style
- `web/app/(app)/dashboard/__tests__/page.test.tsx` — replace old button/modal tests with new ones
- `web/app/(app)/settings/ContributionHistory.tsx` — relabel "Contribution History" to "Balance History"
- `web/app/(app)/settings/FundsSection.tsx` — relabel "History" button to "Balance history"
- `web/app/(app)/settings/__tests__/ContributionHistory.test.tsx` — update label assertions
- `web/app/(app)/settings/__tests__/FundsSection.test.tsx` — update button name assertions

## What to Keep

- Prisma schema (ContributionRecord model, ContributionType enum)
- Engine (calculate.ts, timeline.ts, snapshot.ts)
- PUT /api/fund-groups/[id]/balance route
- GET /api/contributions/[fundGroupId] route (history)
- AdjustBalanceModal (orphaned but kept for future use)
- HealthBar component

## Acceptance Criteria

- [x] ContributionModal, CatchUpModal, and their tests/CSS deleted
- [x] POST /api/contributions and POST /api/contributions/bulk routes and tests deleted
- [x] ConfirmBalancesModal created with editable balance inputs for all fund groups
- [x] Dashboard uses ConfirmBalancesModal instead of ContributionModal/CatchUpModal
- [x] Settings labels updated: "Balance History", "Balance history", "Balance update"
- [x] All tests pass, tsc clean, lint clean
