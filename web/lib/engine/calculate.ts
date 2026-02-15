import type { IncomeFrequency, ObligationType } from "@/app/generated/prisma/client";
import { getAmountAtDate, type EscalationRule } from "./escalation";

export interface WhatIfOverrides {
  /** Obligation IDs to exclude from the scenario */
  toggledOffIds: string[];
  /** Map of obligation ID → overridden amount */
  amountOverrides: Record<string, number>;
  /** Hypothetical obligations to include in the scenario */
  hypotheticals: ObligationInput[];
  /** Map of obligation ID → hypothetical escalation rules to add in the scenario */
  escalationOverrides?: Record<string, EscalationRule[]>;
}

export interface WhatIfResult {
  actual: EngineResult;
  scenario: EngineResult;
}

export interface ObligationInput {
  id: string;
  name: string;
  type: ObligationType;
  amount: number;
  frequency: IncomeFrequency | null;
  frequencyDays: number | null;
  nextDueDate: Date;
  endDate: Date | null;
  isPaused: boolean;
  isActive: boolean;
  fundGroupId: string | null;
  customEntries?: CustomEntryInput[];
  escalationRules?: EscalationRule[];
}

export interface CustomEntryInput {
  dueDate: Date;
  amount: number;
  isPaid: boolean;
}

export interface FundBalanceInput {
  obligationId: string;
  currentBalance: number;
}

export interface CycleConfig {
  type: "weekly" | "fortnightly" | "twice_monthly" | "monthly";
  payDays: number[]; // day-of-month for twice_monthly/monthly; ignored for weekly/fortnightly
}

export interface EngineInput {
  obligations: ObligationInput[];
  fundBalances: FundBalanceInput[];
  maxContributionPerCycle: number | null;
  contributionCycleDays: number | null;
  now?: Date;
}

export interface ObligationContribution {
  obligationId: string;
  obligationName: string;
  fundGroupId: string | null;
  amountNeeded: number;
  currentBalance: number;
  remaining: number;
  cyclesUntilDue: number;
  contributionPerCycle: number;
  nextDueDate: Date;
  isFullyFunded: boolean;
  hasShortfall: boolean;
}

export interface ShortfallWarning {
  obligationId: string;
  obligationName: string;
  amountNeeded: number;
  amountCanFund: number;
  shortfall: number;
  dueDate: Date;
  message: string;
}

export interface EngineResult {
  contributions: ObligationContribution[];
  totalRequired: number;
  totalFunded: number;
  totalContributionPerCycle: number;
  shortfallWarnings: ShortfallWarning[];
  isFullyFunded: boolean;
  capacityExceeded: boolean;
}

const MS_PER_DAY = 86_400_000;

/**
 * Returns the number of days for a given frequency.
 */
function frequencyToDays(
  frequency: IncomeFrequency | null,
  frequencyDays: number | null
): number | null {
  if (frequency === null) return null;
  switch (frequency) {
    case "weekly":
      return 7;
    case "fortnightly":
      return 14;
    case "twice_monthly":
      return 15;
    case "monthly":
      return 30;
    case "quarterly":
      return 90;
    case "annual":
      return 365;
    case "custom":
      return frequencyDays ?? null;
    case "irregular":
      return null;
  }
}

/**
 * Calculates the next due date after a given date, based on frequency.
 */
export function getNextDueDateAfter(
  currentDueDate: Date,
  frequency: IncomeFrequency | null,
  frequencyDays: number | null
): Date | null {
  const days = frequencyToDays(frequency, frequencyDays);
  if (days === null) return null;
  return new Date(currentDueDate.getTime() + days * MS_PER_DAY);
}

/**
 * For a custom obligation, returns the next unpaid entry's due date and amount.
 */
function getNextCustomEntry(
  entries: CustomEntryInput[]
): { dueDate: Date; amount: number } | null {
  const unpaid = entries
    .filter((e) => !e.isPaid)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  return unpaid.length > 0
    ? { dueDate: unpaid[0].dueDate, amount: unpaid[0].amount }
    : null;
}

/**
 * Returns the last day of a given month (1-indexed).
 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Counts actual pay date occurrences in [start, due) for monthly/twice_monthly.
 * payDays: sorted array of day-of-month values (e.g. [1, 15]).
 *
 * Uses a closed-form O(1) approach: counts months from start to due (inclusive),
 * then subtracts pay dates that fall before start day or on/after due day.
 */
function countPayDates(start: Date, due: Date, payDays: number[]): number {
  const startYear = start.getFullYear();
  const startMonth = start.getMonth(); // 0-based
  const startDay = start.getDate();

  const dueYear = due.getFullYear();
  const dueMonth = due.getMonth();
  const dueDay = due.getDate();

  // Number of months from startMonth to dueMonth inclusive
  const monthSpan =
    (dueYear - startYear) * 12 + (dueMonth - startMonth) + 1;

  let count = monthSpan * payDays.length;

  for (const d of payDays) {
    const clampedStart = Math.min(d, lastDayOfMonth(startYear, startMonth + 1));
    // Pay dates strictly before the start day have already passed
    if (clampedStart < startDay) count--;

    const clampedDue = Math.min(d, lastDayOfMonth(dueYear, dueMonth + 1));
    // Pay dates on or after the due day haven't arrived yet
    if (clampedDue >= dueDay) count--;
  }

  return count;
}

/**
 * Counts the number of contribution cycles between start and due.
 *
 * - Weekly/fortnightly: day division (7 or 14 days).
 * - Twice_monthly/monthly: counts actual pay date occurrences with end-of-month clamping.
 *
 * Returns at least 1 for future dates. Returns 0 if due is today or past.
 */
export function countCyclesBetween(
  start: Date,
  due: Date,
  cycleType: CycleConfig["type"],
  payDays: number[],
): number {
  const daysUntilDue = Math.max(
    0,
    Math.floor((due.getTime() - start.getTime()) / MS_PER_DAY)
  );
  if (daysUntilDue <= 0) return 0;

  switch (cycleType) {
    case "weekly":
      return Math.max(1, Math.floor(daysUntilDue / 7));
    case "fortnightly":
      return Math.max(1, Math.floor(daysUntilDue / 14));
    case "twice_monthly":
    case "monthly":
      return Math.max(1, countPayDates(start, due, payDays));
  }
}

/**
 * Converts a legacy cycleDays value into a CycleConfig.
 * Used during the migration period while EngineInput still has contributionCycleDays.
 */
function cycleDaysToConfig(cycleDays: number | null): CycleConfig {
  switch (cycleDays) {
    case 7:
      return { type: "weekly", payDays: [] };
    case 14:
      return { type: "fortnightly", payDays: [] };
    case 15:
      return { type: "twice_monthly", payDays: [1, 15] };
    case null:
    case 30:
      return { type: "monthly", payDays: [1] };
    default:
      // For non-standard cycle days, approximate with monthly on the 1st
      return { type: "monthly", payDays: [1] };
  }
}

/**
 * Core sinking fund engine calculation.
 *
 * Given a user's obligations, fund balances, and contribution capacity,
 * calculates per-obligation contribution per cycle with adaptive
 * ramp-up/ramp-down, respecting max capacity and prioritizing by due date.
 */
export function calculateContributions(input: EngineInput): EngineResult {
  const {
    obligations,
    fundBalances,
    maxContributionPerCycle,
    contributionCycleDays,
    now = new Date(),
  } = input;

  // Derive CycleConfig from legacy contributionCycleDays
  const cycleConfig = cycleDaysToConfig(contributionCycleDays);

  // Build a lookup for fund balances
  const balanceMap = new Map<string, number>();
  for (const fb of fundBalances) {
    balanceMap.set(fb.obligationId, fb.currentBalance);
  }

  // Filter to active, non-paused obligations
  const activeObligations = obligations.filter(
    (o) => o.isActive && !o.isPaused
  );

  // Calculate raw needs per obligation
  const rawContributions: ObligationContribution[] = [];

  for (const obligation of activeObligations) {
    let amountNeeded: number;
    let nextDueDate: Date;

    if (obligation.type === "custom") {
      const nextEntry = getNextCustomEntry(obligation.customEntries ?? []);
      if (!nextEntry) continue; // all entries paid
      amountNeeded = nextEntry.amount;
      nextDueDate = nextEntry.dueDate;
    } else if (obligation.type === "one_off") {
      amountNeeded = obligation.amount;
      nextDueDate = obligation.nextDueDate;
    } else {
      // recurring or recurring_with_end
      let effectiveDueDate = obligation.nextDueDate;

      // If the due date has passed, advance until it's in the future
      while (effectiveDueDate.getTime() <= now.getTime()) {
        if (
          obligation.type === "recurring" ||
          obligation.type === "recurring_with_end"
        ) {
          const nextDate = getNextDueDateAfter(
            effectiveDueDate,
            obligation.frequency,
            obligation.frequencyDays
          );
          if (nextDate) {
            effectiveDueDate = nextDate;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      // For recurring_with_end, skip if past the end date
      if (
        obligation.endDate &&
        effectiveDueDate.getTime() > obligation.endDate.getTime()
      ) {
        continue;
      }

      nextDueDate = effectiveDueDate;

      // Use escalated amount at the due date if escalation rules exist
      if (obligation.escalationRules && obligation.escalationRules.length > 0) {
        amountNeeded = getAmountAtDate(
          {
            currentAmount: obligation.amount,
            rules: obligation.escalationRules,
            windowStart: now,
            monthsAhead: 24,
          },
          nextDueDate,
        );
      } else {
        amountNeeded = obligation.amount;
      }
    }

    const currentBalance = balanceMap.get(obligation.id) ?? 0;
    const remaining = Math.max(0, amountNeeded - currentBalance);
    const cyclesUntilDue = countCyclesBetween(now, nextDueDate, cycleConfig.type, cycleConfig.payDays);
    const isFullyFunded = remaining <= 0;

    // Adaptive contribution: remaining divided by cycles
    // If 0 cycles remain (due today/past), the entire remaining is needed now
    const contributionPerCycle = isFullyFunded
      ? 0
      : cyclesUntilDue > 0
        ? remaining / cyclesUntilDue
        : remaining;

    rawContributions.push({
      obligationId: obligation.id,
      obligationName: obligation.name,
      fundGroupId: obligation.fundGroupId,
      amountNeeded,
      currentBalance,
      remaining,
      cyclesUntilDue,
      contributionPerCycle,
      nextDueDate,
      isFullyFunded,
      hasShortfall: false,
    });
  }

  // Sort by nearest due date (for prioritization)
  rawContributions.sort(
    (a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime()
  );

  const totalRequired = rawContributions.reduce(
    (sum, c) => sum + c.amountNeeded,
    0
  );
  const totalFunded = rawContributions.reduce(
    (sum, c) => sum + c.currentBalance,
    0
  );
  const rawTotalPerCycle = rawContributions.reduce(
    (sum, c) => sum + c.contributionPerCycle,
    0
  );

  const shortfallWarnings: ShortfallWarning[] = [];

  // If max capacity is set and exceeded, prioritize by due date
  if (
    maxContributionPerCycle !== null &&
    maxContributionPerCycle > 0 &&
    rawTotalPerCycle > maxContributionPerCycle
  ) {
    let remainingCapacity = maxContributionPerCycle;

    for (const contribution of rawContributions) {
      if (contribution.isFullyFunded) continue;

      if (remainingCapacity >= contribution.contributionPerCycle) {
        remainingCapacity -= contribution.contributionPerCycle;
      } else {
        // This obligation gets partial funding
        const allocated = remainingCapacity;
        const originalPerCycle = contribution.contributionPerCycle;
        contribution.contributionPerCycle = allocated;
        contribution.hasShortfall = true;
        remainingCapacity = 0;

        // Calculate shortfall over the remaining cycles
        const shortfallPerCycle = originalPerCycle - allocated;
        const totalShortfall = shortfallPerCycle * Math.max(1, contribution.cyclesUntilDue);
        const amountCanFund =
          contribution.currentBalance +
          allocated * Math.max(1, contribution.cyclesUntilDue);

        shortfallWarnings.push({
          obligationId: contribution.obligationId,
          obligationName: contribution.obligationName,
          amountNeeded: contribution.amountNeeded,
          amountCanFund: Math.min(amountCanFund, contribution.amountNeeded),
          shortfall: Math.min(totalShortfall, contribution.remaining),
          dueDate: contribution.nextDueDate,
          message: `You need $${contribution.amountNeeded.toFixed(2)} for ${contribution.obligationName} by ${contribution.nextDueDate.toISOString().split("T")[0]} but can only save $${amountCanFund.toFixed(2)} at current capacity`,
        });
      }
    }

    return {
      contributions: rawContributions,
      totalRequired,
      totalFunded,
      totalContributionPerCycle: maxContributionPerCycle,
      shortfallWarnings,
      isFullyFunded:
        rawContributions.length > 0 &&
        rawContributions.every((c) => c.isFullyFunded),
      capacityExceeded: true,
    };
  }

  return {
    contributions: rawContributions,
    totalRequired,
    totalFunded,
    totalContributionPerCycle: rawTotalPerCycle,
    shortfallWarnings,
    isFullyFunded:
      rawContributions.length > 0 &&
      rawContributions.every((c) => c.isFullyFunded),
    capacityExceeded: false,
  };
}

/**
 * Applies what-if overrides to an EngineInput, producing a modified input
 * for scenario calculation.
 *
 * - Excludes obligations whose IDs are in toggledOffIds
 * - Replaces amounts for obligations in amountOverrides
 * - Appends hypothetical obligations
 */
function applyWhatIfOverrides(
  input: EngineInput,
  overrides: WhatIfOverrides
): EngineInput {
  const toggledOffSet = new Set(overrides.toggledOffIds);
  const amountMap = new Map(Object.entries(overrides.amountOverrides));
  const escalationMap = overrides.escalationOverrides ?? {};

  const filteredObligations = input.obligations
    .filter((o) => !toggledOffSet.has(o.id))
    .map((o) => {
      let result = o;
      const overriddenAmount = amountMap.get(o.id);
      if (overriddenAmount !== undefined) {
        result = { ...result, amount: overriddenAmount };
      }
      const hypotheticalEscalations = escalationMap[o.id];
      if (hypotheticalEscalations && hypotheticalEscalations.length > 0) {
        result = {
          ...result,
          escalationRules: [
            ...(result.escalationRules ?? []),
            ...hypotheticalEscalations,
          ],
        };
      }
      return result;
    });

  const scenarioObligations = [
    ...filteredObligations,
    ...overrides.hypotheticals,
  ];

  return {
    ...input,
    obligations: scenarioObligations,
  };
}

/**
 * Calculates both actual and scenario projections.
 *
 * Runs the engine once with the original input (actual) and once with
 * what-if overrides applied (scenario). Returns both results for comparison.
 */
export function calculateWithWhatIf(
  input: EngineInput,
  overrides: WhatIfOverrides
): WhatIfResult {
  const actual = calculateContributions(input);
  const scenarioInput = applyWhatIfOverrides(input, overrides);
  const scenario = calculateContributions(scenarioInput);
  return { actual, scenario };
}
