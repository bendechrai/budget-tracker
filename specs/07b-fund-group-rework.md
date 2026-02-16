# Fund Group Rework — Funds as First-Class Entities

## Overview

Fund groups become the primary "Fund" concept in the UI. A Fund has a real balance (reflecting money in a bank account), receives contributions, and shows aggregate health status. Individual obligations describe outgoings (amount, frequency, due dates) but have no individual funding concept. The engine still projects per-obligation internally, but everything user-facing is aggregated at the Fund (group) level.

This is a rework of concepts across specs 04, 07, 08, 13, and 14. It does not change the core engine projection math — it changes where balances live, how contributions are recorded, and how health is communicated.

## What Changed from Original Specs

| Original Spec | What Changes |
|---|---|
| **04 (Obligations)** | `fundGroupId` becomes non-nullable. Every obligation belongs to a fund. Fund group assignment is via a clickable badge on the card, not a form dropdown. Per-obligation fund balance display is removed. |
| **07 (Engine)** | `FundBalance` model is deleted. Balance moves to `FundGroup.currentBalance`. Engine output adds per-fund-group aggregation. `ContributionRecord` references `fundGroupId` instead of `obligationId`. |
| **08 (Dashboard)** | Hero card "next action" targets the most underfunded fund (not obligation). Health bar uses fund group balances. Contribution modal works at fund level. |
| **13 (Settings)** | New "Sinking Funds" section for fund CRUD, balance management, and contribution recording. |
| **14 (Contributions)** | Contributions target fund groups, not obligations. Lump sum catch-up distributes across funds. Fund balance adjustment is per fund. Contribution history is per fund. |

## Behavior

### Default Fund

- Every user has a default fund created at signup, named "Default Sinking Fund"
- The default fund cannot be deleted but can be renamed
- New obligations are automatically assigned to the default fund unless the user specifies otherwise
- Suggestions accepted as obligations are assigned to the default fund

### Fund Group as "Fund" in UI

- The word "fund group" is an internal concept — the UI calls them "funds" or "sinking funds"
- Each fund has:
  - A name (editable)
  - A current balance (real money the user has set aside — stored, not calculated)
  - A target (calculated in realtime from the aggregate of all obligations in the fund)
  - A health percentage (balance / target * 100)
  - A contribution-per-cycle amount (sum of per-obligation engine projections)
- The target is recalculated whenever obligations in the fund change (add, remove, edit amount/frequency/dates)

### Fund Balance

- `FundGroup.currentBalance` represents actual money the user has in a bank account or set aside for this fund
- This is a stored value, updated only when:
  - The user records a contribution to the fund
  - The user manually adjusts the fund balance (reconciliation)
- It is NOT recalculated from obligations — it reflects reality, not projections

### Contributions — Per Fund, Not Per Obligation

- Users contribute to a fund (group), not to an individual obligation
- `ContributionRecord` references `fundGroupId` instead of `obligationId`
- The contribution increments `FundGroup.currentBalance`
- Lump sum catch-up distributes across underfunded funds (not obligations)
- Contribution history is viewable per fund

### Obligations Page

- Per-obligation fund balance display (progress bar, "Record contribution", "Adjust balance") is removed from obligation cards
- Each obligation card shows its fund name as a clickable badge in the top-right corner
- Clicking the badge opens a popover listing all funds — selecting one moves the obligation to that fund
- Obligations are grouped by fund in the list, with a fund health summary in each group header:
  - Fund name
  - `$X of $Y funded (Z%)`
  - `$X per [cycle]` contribution needed
- A filter dropdown at the top lets the user view obligations for a specific fund or all funds
- A fund cannot be deleted if it has obligations (user must move them first)

### Settings — Sinking Funds Section

- New section in Settings for managing funds
- Lists all funds with: name, obligation count, current balance, health %
- Inline rename (click to edit)
- Create new fund
- Delete fund (disabled for default fund, rejected if fund has obligations)
- Set balance (for reconciliation with actual bank account)
- Record contribution

### Dashboard

- Hero card shows total contribution per cycle across all funds
- "Next action" targets the most underfunded fund: "Set aside $X this fortnight for [Fund Name]"
- "Mark as done" records a contribution to the target fund
- Health bar shows individual fund bars — each fund displayed with its own progress bar showing name, balance/target, and health percentage. No aggregate roll-up.
- Catch-up modal distributes across underfunded funds

### Engine Output

- Engine still calculates per-obligation projections internally (amount needed, cycles until due, contribution per cycle)
- New aggregated output per fund group:
  - `totalRequired`: sum of per-obligation `amountNeeded` in this fund
  - `currentBalance`: from `FundGroup.currentBalance`
  - `remaining`: totalRequired - currentBalance
  - `contributionPerCycle`: sum of per-obligation contributions
  - `healthPercentage`: currentBalance / totalRequired * 100
  - `isFullyFunded`: currentBalance >= totalRequired
- Global aggregates (totalRequired, totalFunded, totalContributionPerCycle) remain

## Data Model Changes

### FundGroup (modified)

Add fields:
- `isDefault Boolean @default(false)` — marks the user's default fund
- `currentBalance Float @default(0)` — real money set aside
- `contributions ContributionRecord[]` — contribution history relation

### Obligation (modified)

- `fundGroupId` becomes `String` (non-nullable, was `String?`)
- `fundGroup` becomes `FundGroup` (non-nullable, was `FundGroup?`)
- Remove `fundBalance FundBalance?` relation
- Remove `contributions ContributionRecord[]` relation

### ContributionRecord (modified)

- Replace `obligationId String` with `fundGroupId String`
- Replace `Obligation` relation with `FundGroup` relation

### FundBalance (deleted)

- Entire model removed. Balance now lives on `FundGroup.currentBalance`.

### API Endpoint Changes

| Endpoint | Change |
|---|---|
| `POST /api/contributions` | Body: `fundGroupId` replaces `obligationId`. Increments `FundGroup.currentBalance`. |
| `POST /api/contributions/bulk` | Body: array of `{ fundGroupId, amount }`. Distributes across funds. |
| `PUT /api/fund-balances/[obligationId]` | **Deleted.** Replaced by `PUT /api/fund-groups/[id]/balance`. |
| `PUT /api/fund-groups/[id]/balance` | **New.** Sets exact `FundGroup.currentBalance`. Creates `manual_adjustment` record. |
| `GET /api/fund-groups` | Returns `isDefault`, `currentBalance`, `_count.obligations`. Ordered: default first. |
| `DELETE /api/fund-groups/[id]` | Rejects if `isDefault`. Rejects with 409 if fund has obligations. |
| `POST /api/obligations` | Auto-assigns default fund if no `fundGroupId` provided. |

## Edge Cases

- User with no fund groups (legacy data): migration creates default fund for all existing users and assigns orphaned obligations
- Moving an obligation between funds: just updates `fundGroupId` — no balance migration (balances are per-fund, not per-obligation)
- Deleting a fund with obligations: rejected — user must move obligations to another fund first
- Fund balance exceeds target: fund is "over-funded" — health shows >100%, contribution per cycle drops to zero for that fund
- All funds fully funded: celebration state on dashboard
- New obligation added to a fund: fund's target increases, health % may decrease, contribution per cycle increases
- Obligation removed from a fund (moved or deleted): fund's target decreases, health % may increase

## Acceptance Criteria

- [x] Every user has a default fund created at signup
- [x] Migration creates default fund for existing users and assigns orphaned obligations
- [x] Default fund cannot be deleted but can be renamed
- [x] Funds with obligations cannot be deleted
- [x] `fundGroupId` is non-nullable on obligations
- [x] New obligations auto-assign to default fund if none specified
- [x] Accepted suggestions auto-assign to default fund
- [x] Fund balance is stored on FundGroup, not per obligation
- [x] Contributions target fund groups (not obligations)
- [x] Contribution history is per fund
- [x] Fund health % = balance / calculated target
- [x] Fund target is calculated in realtime from obligations
- [x] Obligations page shows fund badge (top-right of card) with click-to-move
- [ ] Obligations page groups by fund with health summary in headers
- [ ] Obligations page has a fund filter dropdown
- [x] Per-obligation fund balance UI is removed (no progress bars on cards)
- [x] Settings has a Funds section with CRUD (create, rename, delete)
- [ ] Settings Funds section includes balance management and contribution recording
- [x] Dashboard hero card targets most underfunded fund
- [x] Dashboard health bar shows individual fund bars with balances
- [x] Catch-up modal distributes across underfunded funds
- [x] Engine output includes per-fund-group aggregation
