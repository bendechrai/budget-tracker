import {
  getNextDueDateAfter,
  type ObligationInput,
  type FundBalanceInput,
  type CustomEntryInput,
} from "./calculate";
import { getAmountAtDate } from "./escalation";

export interface TimelineInput {
  obligations: ObligationInput[];
  fundBalances: FundBalanceInput[];
  /** Total current fund balance across all obligations */
  currentFundBalance: number;
  /** Contribution amount per cycle (from engine calculation) */
  contributionPerCycle: number;
  /** Days per contribution cycle (default 30) */
  contributionCycleDays: number | null;
  /** Projection window in months (default 6, max 12) */
  monthsAhead?: number;
  /** Reference date for the projection (default now) */
  now?: Date;
  /** Optional what-if overrides */
  overrides?: WhatIfOverrides;
}

export interface WhatIfOverrides {
  /** Obligation IDs to exclude from projection */
  excludeObligationIds?: string[];
  /** Amount overrides per obligation: { obligationId: newAmount } */
  amountOverrides?: Record<string, number>;
  /** Hypothetical obligations to include */
  hypotheticalObligations?: ObligationInput[];
}

export interface TimelineDataPoint {
  date: Date;
  projectedBalance: number;
}

export interface ExpenseMarker {
  date: Date;
  obligationId: string;
  obligationName: string;
  amount: number;
}

export interface ContributionMarker {
  date: Date;
  amount: number;
}

export interface CrunchPoint {
  date: Date;
  projectedBalance: number;
  /** The expense that caused the crunch */
  triggerObligationId: string;
  triggerObligationName: string;
}

export interface TimelineResult {
  dataPoints: TimelineDataPoint[];
  expenseMarkers: ExpenseMarker[];
  contributionMarkers: ContributionMarker[];
  crunchPoints: CrunchPoint[];
  startDate: Date;
  endDate: Date;
}

const MS_PER_DAY = 86_400_000;

/**
 * Returns the start of a day (midnight UTC).
 */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Adds a number of days to a date.
 */
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * Returns an end date that is `months` months after the start date.
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/**
 * Returns the escalated amount for an obligation at a specific date.
 * If the obligation has no escalation rules or an amountOverride is set,
 * returns the override or base amount.
 */
function getEscalatedAmount(
  obligation: ObligationInput,
  date: Date,
  windowStart: Date,
  amountOverride?: number,
): number {
  if (amountOverride !== undefined) return amountOverride;
  if (!obligation.escalationRules || obligation.escalationRules.length === 0) {
    return obligation.amount;
  }
  return getAmountAtDate(
    {
      currentAmount: obligation.amount,
      rules: obligation.escalationRules,
      windowStart,
      monthsAhead: 24,
    },
    date,
  );
}

/**
 * Collects all due dates for an obligation within a time window.
 * Returns an array of { date, amount } pairs. When escalation rules exist,
 * each marker uses the escalated amount at that specific date.
 */
function collectDueDates(
  obligation: ObligationInput,
  windowStart: Date,
  windowEnd: Date,
  amountOverride?: number,
): ExpenseMarker[] {
  const markers: ExpenseMarker[] = [];

  if (obligation.type === "custom") {
    // Custom obligations have explicit entries
    const entries = (obligation.customEntries ?? []).filter(
      (e: CustomEntryInput) => !e.isPaid
    );
    for (const entry of entries) {
      const entryDate = startOfDay(entry.dueDate);
      if (entryDate >= windowStart && entryDate <= windowEnd) {
        markers.push({
          date: entryDate,
          obligationId: obligation.id,
          obligationName: obligation.name,
          amount: amountOverride ?? entry.amount,
        });
      }
    }
    return markers;
  }

  if (obligation.type === "one_off") {
    const dueDate = startOfDay(obligation.nextDueDate);
    if (dueDate >= windowStart && dueDate <= windowEnd) {
      markers.push({
        date: dueDate,
        obligationId: obligation.id,
        obligationName: obligation.name,
        amount: getEscalatedAmount(obligation, dueDate, windowStart, amountOverride),
      });
    }
    return markers;
  }

  // Recurring or recurring_with_end
  let currentDate = startOfDay(obligation.nextDueDate);

  // If the first due date is before the window, advance it forward
  while (currentDate < windowStart) {
    const next = getNextDueDateAfter(
      currentDate,
      obligation.frequency,
      obligation.frequencyDays
    );
    if (!next) break;
    currentDate = startOfDay(next);
  }

  // Collect all due dates within the window
  while (currentDate <= windowEnd) {
    // For recurring_with_end, stop if past end date
    if (
      obligation.endDate &&
      currentDate > startOfDay(obligation.endDate)
    ) {
      break;
    }

    markers.push({
      date: currentDate,
      obligationId: obligation.id,
      obligationName: obligation.name,
      amount: getEscalatedAmount(obligation, currentDate, windowStart, amountOverride),
    });

    const next = getNextDueDateAfter(
      currentDate,
      obligation.frequency,
      obligation.frequencyDays
    );
    if (!next) break;
    currentDate = startOfDay(next);
  }

  return markers;
}

/**
 * Projects fund balance over a configurable time window.
 *
 * Walks through time, applying contributions and expenses to produce
 * a projected balance curve with markers and crunch point detection.
 */
export function projectTimeline(input: TimelineInput): TimelineResult {
  const {
    obligations,
    currentFundBalance,
    contributionPerCycle,
    contributionCycleDays,
    monthsAhead = 6,
    now = new Date(),
    overrides,
  } = input;

  const cycleDays = contributionCycleDays ?? 30;
  const clampedMonths = Math.max(1, Math.min(12, monthsAhead));
  const startDate = startOfDay(now);
  const endDate = startOfDay(addMonths(startDate, clampedMonths));

  // Determine which obligations to include
  const excludeIds = new Set(overrides?.excludeObligationIds ?? []);
  const activeObligations = obligations.filter(
    (o) => o.isActive && !o.isPaused && !excludeIds.has(o.id)
  );

  // Apply amount overrides
  const amountOverrides = overrides?.amountOverrides ?? {};

  // Include hypothetical obligations
  const hypotheticals = overrides?.hypotheticalObligations ?? [];
  const allObligations = [...activeObligations, ...hypotheticals];

  // Collect all expense markers within the window
  const expenseMarkers: ExpenseMarker[] = [];
  for (const obligation of allObligations) {
    const markers = collectDueDates(
      obligation,
      startDate,
      endDate,
      amountOverrides[obligation.id]
    );
    expenseMarkers.push(...markers);
  }
  expenseMarkers.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Generate contribution dates within the window
  const contributionMarkers: ContributionMarker[] = [];
  if (contributionPerCycle > 0) {
    let contributionDate = addDays(startDate, cycleDays);
    while (contributionDate <= endDate) {
      contributionMarkers.push({
        date: startOfDay(contributionDate),
        amount: contributionPerCycle,
      });
      contributionDate = addDays(contributionDate, cycleDays);
    }
  }

  // Build a unified timeline of events sorted by date
  interface TimelineEvent {
    date: Date;
    type: "contribution" | "expense";
    amount: number;
    obligationId?: string;
    obligationName?: string;
  }

  const events: TimelineEvent[] = [];
  for (const marker of expenseMarkers) {
    events.push({
      date: marker.date,
      type: "expense",
      amount: marker.amount,
      obligationId: marker.obligationId,
      obligationName: marker.obligationName,
    });
  }
  for (const marker of contributionMarkers) {
    events.push({
      date: marker.date,
      type: "contribution",
      amount: marker.amount,
    });
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Walk through events to build data points and detect crunch points
  const dataPoints: TimelineDataPoint[] = [];
  const crunchPoints: CrunchPoint[] = [];
  let balance = currentFundBalance;

  // Starting point
  dataPoints.push({ date: startDate, projectedBalance: balance });

  for (const event of events) {
    if (event.type === "contribution") {
      balance += event.amount;
    } else {
      balance -= event.amount;
    }

    dataPoints.push({ date: event.date, projectedBalance: balance });

    // Detect crunch point: balance at or below zero after an expense
    if (event.type === "expense" && balance <= 0) {
      crunchPoints.push({
        date: event.date,
        projectedBalance: balance,
        triggerObligationId: event.obligationId!,
        triggerObligationName: event.obligationName!,
      });
    }
  }

  // Add end date data point if it's not already the last one
  const lastPoint = dataPoints[dataPoints.length - 1];
  if (lastPoint.date.getTime() !== endDate.getTime()) {
    dataPoints.push({ date: endDate, projectedBalance: balance });
  }

  return {
    dataPoints,
    expenseMarkers,
    contributionMarkers,
    crunchPoints,
    startDate,
    endDate,
  };
}
