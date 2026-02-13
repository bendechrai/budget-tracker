import type { EscalationChangeType } from "@/app/generated/prisma/client";

export interface EscalationRule {
  id: string;
  changeType: EscalationChangeType;
  /** For absolute: target amount. For percentage: the percent (e.g. 3 = 3%). For fixed_increase: dollar amount. */
  value: number;
  effectiveDate: Date;
  /** Null means one-off; a number means recurring every N months */
  intervalMonths: number | null;
  isApplied: boolean;
}

export interface EscalationProjectionInput {
  currentAmount: number;
  rules: EscalationRule[];
  /** Start of the projection window (default: now) */
  windowStart?: Date;
  /** Number of months to project (default: 12) */
  monthsAhead?: number;
}

export interface ProjectedAmount {
  date: Date;
  amount: number;
}

/**
 * Returns midnight UTC of a date.
 */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Adds N months to a date.
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/**
 * Applies a single escalation change to an amount.
 */
function applyChange(
  currentAmount: number,
  changeType: EscalationChangeType,
  value: number,
): number {
  switch (changeType) {
    case "absolute":
      return value;
    case "percentage":
      return currentAmount * (1 + value / 100);
    case "fixed_increase":
      return currentAmount + value;
  }
}

interface ChangeEvent {
  date: Date;
  changeType: EscalationChangeType;
  value: number;
  isOneOff: boolean;
}

/**
 * Counts how many times a recurring rule has fired before a cutoff date.
 * This is needed because recurring rules are never "applied" to the base amount,
 * so past occurrences must be replayed to derive the current effective amount.
 */
function countPastRecurringOccurrences(
  rule: EscalationRule,
  cutoff: Date,
): number {
  if (rule.intervalMonths === null) return 0;

  let count = 0;
  let current = startOfDay(rule.effectiveDate);

  while (current < cutoff) {
    count++;
    current = addMonths(current, rule.intervalMonths);
  }

  return count;
}

/**
 * Generates all dates at which a recurring escalation rule fires
 * from its effective date through the end of the window.
 */
function getRecurringDatesFrom(
  rule: EscalationRule,
  windowEnd: Date,
): Date[] {
  if (rule.intervalMonths === null) return [];

  const dates: Date[] = [];
  let current = startOfDay(rule.effectiveDate);

  while (current <= windowEnd) {
    dates.push(current);
    current = addMonths(current, rule.intervalMonths);
  }

  return dates;
}

/**
 * Projects future obligation amounts based on escalation rules.
 *
 * Given a current amount and a set of escalation rules, walks forward through
 * time and applies changes in chronological order. One-off rules take precedence
 * over recurring rules that fall on the same date (recurring is skipped and
 * resumes on the next interval).
 *
 * For recurring rules whose effective date is before the window start, past
 * occurrences are replayed against the current amount to derive the correct
 * starting point, since recurring rules are never persisted to the base amount.
 *
 * Returns an array of { date, amount } pairs representing each point where the
 * amount changes within the projection window. The array is sorted by date.
 * If no rules produce changes within the window, returns an empty array.
 */
export function projectEscalatedAmounts(
  input: EscalationProjectionInput,
): ProjectedAmount[] {
  const {
    currentAmount,
    rules,
    windowStart = new Date(),
    monthsAhead = 12,
  } = input;

  const start = startOfDay(windowStart);
  const end = startOfDay(addMonths(start, monthsAhead));

  // First, compute the effective "now" amount by replaying past recurring
  // occurrences that haven't been persisted to the base amount.
  let effectiveAmount = currentAmount;
  for (const rule of rules) {
    if (rule.intervalMonths === null) continue; // one-off rules are applied to base
    const pastCount = countPastRecurringOccurrences(rule, start);
    for (let n = 0; n < pastCount; n++) {
      effectiveAmount = applyChange(
        effectiveAmount,
        rule.changeType,
        rule.value,
      );
    }
  }

  // Collect all change events within the window
  const events: ChangeEvent[] = [];

  for (const rule of rules) {
    // Skip already-applied one-off rules
    if (rule.isApplied && rule.intervalMonths === null) continue;

    if (rule.intervalMonths === null) {
      // One-off rule
      const effectiveDate = startOfDay(rule.effectiveDate);
      if (effectiveDate >= start && effectiveDate <= end) {
        events.push({
          date: effectiveDate,
          changeType: rule.changeType,
          value: rule.value,
          isOneOff: true,
        });
      }
    } else {
      // Recurring rule — only include occurrences within the window
      const allDates = getRecurringDatesFrom(rule, end);
      for (const date of allDates) {
        if (date >= start) {
          events.push({
            date,
            changeType: rule.changeType,
            value: rule.value,
            isOneOff: false,
          });
        }
      }
    }
  }

  if (events.length === 0) return [];

  // Sort by date
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Walk through events and track the running amount
  const result: ProjectedAmount[] = [];
  let runningAmount = effectiveAmount;

  // Group events by date to handle same-date precedence
  let i = 0;
  while (i < events.length) {
    const currentDate = events[i].date;
    const sameDateEvents: ChangeEvent[] = [];

    while (
      i < events.length &&
      events[i].date.getTime() === currentDate.getTime()
    ) {
      sameDateEvents.push(events[i]);
      i++;
    }

    // One-off takes precedence: if a one-off exists on this date,
    // skip recurring events entirely (recurring resumes on next interval)
    const oneOffEvent = sameDateEvents.find((e) => e.isOneOff);
    if (oneOffEvent) {
      runningAmount = applyChange(
        runningAmount,
        oneOffEvent.changeType,
        oneOffEvent.value,
      );
    } else {
      // No one-off: apply all recurring events in order
      for (const event of sameDateEvents) {
        runningAmount = applyChange(
          runningAmount,
          event.changeType,
          event.value,
        );
      }
    }

    result.push({
      date: currentDate,
      amount: runningAmount,
    });
  }

  return result;
}

/**
 * Returns the escalated amount at a specific date.
 *
 * Useful for getting the amount that should be in effect at a particular
 * due date. If no escalation applies before the target date, returns the
 * current amount (adjusted for past recurring occurrences).
 */
export function getAmountAtDate(
  input: EscalationProjectionInput,
  targetDate: Date,
): number {
  const target = startOfDay(targetDate);
  const projected = projectEscalatedAmounts(input);

  // Start with the effective amount (includes past recurring adjustments)
  const start = startOfDay(input.windowStart ?? new Date());
  let amount = input.currentAmount;

  // Account for past recurring occurrences
  for (const rule of input.rules) {
    if (rule.intervalMonths === null) continue;
    const pastCount = countPastRecurringOccurrences(rule, start);
    for (let n = 0; n < pastCount; n++) {
      amount = applyChange(amount, rule.changeType, rule.value);
    }
  }

  for (const point of projected) {
    if (point.date <= target) {
      amount = point.amount;
    } else {
      break;
    }
  }

  return amount;
}
