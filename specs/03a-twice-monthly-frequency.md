# Rework: Add Twice-Monthly Income Frequency

## References

- Original spec: `specs/03-income-sources.md`
- Related: `specs/13-settings.md` (settings page where cycle is configured)

## What Changed

The original income spec supports: weekly, fortnightly, monthly, quarterly, annual, custom, irregular. We need to add `twice_monthly` as a first-class frequency option — this represents users paid on two fixed dates per month (e.g. 1st & 15th).

## Specific Changes

### Schema

- Add `twice_monthly` to the `IncomeFrequency` enum (Prisma migration)

### Engine (`lib/engine/calculate.ts`)

- Update `frequencyToDays()` to map `twice_monthly` → 15
- No other engine changes needed — the cycle days math works as-is

### Income Form (`app/(app)/income/new/page.tsx`, `app/(app)/income/edit/[id]/page.tsx`)

- Add "Twice monthly" to the frequency dropdown options

### Onboarding (`app/onboarding/manual/income/page.tsx`)

- Add "Twice monthly" to the frequency dropdown options

### Pattern Detection (`lib/patterns/`)

- If pattern detection suggests frequencies, ensure it can detect twice-monthly patterns (transactions on ~1st and ~15th of each month)

### Tests

- Update any tests that enumerate frequency options to include `twice_monthly`
- Add engine test: `twice_monthly` income → `frequencyToDays` returns 15

## What to Keep

- All existing frequency handling stays the same
- The `custom` frequency with `frequencyDays` still works for non-standard intervals

## Acceptance Criteria

- [ ] `twice_monthly` exists in `IncomeFrequency` enum
- [ ] Migration adds the new enum value
- [ ] `frequencyToDays("twice_monthly")` returns 15
- [ ] Income create/edit forms show "Twice monthly" option
- [ ] Onboarding income form shows "Twice monthly" option
- [ ] Existing income sources are unaffected
