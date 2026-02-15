# Rework: Calendar-Based Cycle Counting & Auto-Detection

## References

- Original spec: `specs/07-sinking-fund-engine.md`
- Related: `specs/13-settings.md` (settings page where cycle is configured/overridden)
- Related: `specs/03a-twice-monthly-frequency.md` (adds `twice_monthly` to IncomeFrequency)

## What Changed

Two changes to the engine:

1. **Calendar-based cycle counting**: The engine currently divides `daysUntilDue / cycleDays` to get cycles. This breaks for semi-monthly pay (the 15-day approximation can lose an entire cycle in February, causing per-cycle amounts to double). Replace with counting actual pay date occurrences between now and the due date.

2. **Auto-detection from income**: If the user hasn't explicitly set a cycle type, derive it from their most frequent income source.

## Why Not Day Division?

Semi-monthly pay dates (e.g. 1st & 15th) have uneven gaps: 14 days (1st→15th), then 13–17 days (15th→1st, varying by month). `floor(daysUntilDue / 15)` produces these errors:

| Window | Days | Real cycles | 15-day cycles | Error |
|--------|------|------------|---------------|-------|
| Feb 1 → Mar 1 | 28 | 2 | 1 | -1 (contribution doubles) |
| Jan 1 → Mar 1 | 59 | 4 | 3 | -1 (+33% per cycle) |
| Feb 1 → Apr 1 | 59 | 4 | 3 | -1 (+33% per cycle) |

Weekly and fortnightly are true fixed-interval cycles, so day division works fine for those. But to keep the engine uniform, all cycle types use the same calendar-counting approach.

## Specific Changes

### Engine (`lib/engine/calculate.ts`)

Replace `getCyclesUntilDue(now, nextDueDate, cycleDays)` with a new function that counts actual cycle occurrences:

```typescript
function countCyclesBetween(
  start: Date,
  due: Date,
  cycleType: "weekly" | "fortnightly" | "twice_monthly" | "monthly",
  payDays: number[],  // e.g. [1, 15] for twice_monthly, [1] for monthly
): number {
  switch (cycleType) {
    case "weekly":
      return Math.max(1, Math.floor(daysBetween(start, due) / 7));
    case "fortnightly":
      return Math.max(1, Math.floor(daysBetween(start, due) / 14));
    case "twice_monthly": {
      // Count how many pay dates [d1, d2] fall in the range [start, due)
      // Walk month by month, clamping pay days to last-of-month
      // See implementation notes below
    }
    case "monthly": {
      // Count how many pay dates [d1] fall in the range [start, due)
      // Same approach as twice_monthly but with 1 date per month
    }
  }
}
```

**End-of-month clamping**: when a pay day (e.g. 30) doesn't exist in a month (e.g. February), clamp to the last day: `Math.min(payDay, lastDayOfMonth(year, month))`.

**Closed-form alternative** (O(1), no iteration):
```typescript
function countPayDates(start: Date, due: Date, payDays: number[]): number {
  const monthsBetween = (due.getFullYear() - start.getFullYear()) * 12
    + (due.getMonth() - start.getMonth());
  let count = monthsBetween * payDays.length;
  for (const d of payDays) {
    const clampedStart = Math.min(d, lastDayOfMonth(start));
    const clampedDue = Math.min(d, lastDayOfMonth(due));
    if (clampedStart < start.getDate()) count--;
    if (clampedDue >= due.getDate()) count--;
  }
  return Math.max(count, 1);
}
```

The contribution formula stays the same: `contributionPerCycle = remaining / cyclesUntilDue`.

### Engine input types

Update `CalculationInput` to accept the new cycle info:

```typescript
interface CycleConfig {
  type: "weekly" | "fortnightly" | "twice_monthly" | "monthly";
  payDays: number[];  // day-of-month for twice_monthly/monthly; ignored for weekly/fortnightly
}
```

The engine resolves the active cycle config in this order:
1. If user has set `contributionCycleType` → use it + `contributionPayDays`
2. Else if income sources exist → derive from the most frequent regular income
3. Else → default to monthly on the 1st

### Recalculate API (`app/api/engine/recalculate/route.ts`)

- Read `user.contributionCycleType` and `user.contributionPayDays`
- If null, query income sources and derive the cycle from the shortest frequency
- Pass the resolved `CycleConfig` to the engine

### Snapshot (`lib/engine/snapshot.ts`)

- Update the hero card description to reflect cycle type: "Set aside $412 this week" / "Set aside $412 this fortnight" / "Set aside $412 this pay period" / "Set aside $412 this month"

### Dashboard hero card

- Show cycle context in the next action text

## What to Keep

- `contributionPerCycle = remaining / cyclesUntilDue` — formula unchanged
- Max contribution per cycle logic — unchanged
- Priority by due date when over capacity — unchanged
- Shortfall warnings — unchanged

## What to Deprecate

- `User.contributionCycleDays` (Int) — replaced by `contributionCycleType` + `contributionPayDays`. Keep the column during migration; new code ignores it.
- `getCyclesUntilDue(now, dueDate, cycleDays)` — replaced by `countCyclesBetween()`

## Acceptance Criteria

- [ ] Engine uses calendar-based cycle counting, not day division
- [ ] Twice-monthly counts actual pay date occurrences (exact, not approximate)
- [ ] End-of-month clamping: pay day 30 in February → 28th (or 29th in leap year)
- [ ] Weekly and fortnightly still use day division (7 and 14 are true fixed intervals)
- [ ] Engine auto-detects cycle from income when user hasn't set one
- [ ] Most frequent (shortest) income frequency is used as the default cycle
- [ ] Explicit user cycle setting overrides auto-detection
- [ ] Fallback to monthly on the 1st when no income and no override
- [ ] Dashboard hero card shows cycle-aware text
- [ ] Engine recalculation receives resolved cycle config
