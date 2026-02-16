import type { ContributionCycleType, IntervalUnit, ObligationType } from "@/app/generated/prisma/client";
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
  intervalUnit: IntervalUnit | null;
  intervalCount: number;
  nextDueDate: Date;
  endDate: Date | null;
  isPaused: boolean;
  isActive: boolean;
  fundGroupId: string;
  customEntries?: CustomEntryInput[];
  escalationRules?: EscalationRule[];
}

export interface CustomEntryInput {
  dueDate: Date;
  amount: number;
  isPaid: boolean;
}

export interface FundGroupBalanceInput {
  fundGroupId: string;
  name: string;
  currentBalance: number;
}

export interface CycleConfig {
  type: "weekly" | "fortnightly" | "twice_monthly" | "monthly";
  payDays: number[]; // day-of-month for twice_monthly/monthly; ignored for weekly/fortnightly
}

export interface EngineInput {
  obligations: ObligationInput[];
  fundGroupBalances: FundGroupBalanceInput[];
  cycleConfig: CycleConfig;
  now?: Date;
}

export interface ObligationContribution {
  obligationId: string;
  obligationName: string;
  fundGroupId: string;
  amountNeeded: number;
  cyclesUntilDue: number;
  contributionPerCycle: number;
  nextDueDate: Date;
  hasShortfall: boolean;
}

export interface FundGroupContribution {
  fundGroupId: string;
  fundGroupName: string;
  totalRequired: number;
  currentBalance: number;
  remaining: number;
  contributionPerCycle: number;
  healthPercentage: number;
  isFullyFunded: boolean;
  obligationCount: number;
}

export interface EngineResult {
  contributions: ObligationContribution[];
  fundGroupContributions: FundGroupContribution[];
  totalRequired: number;
  totalFunded: number;
  totalContributionPerCycle: number;
  isFullyFunded: boolean;
}

const MS_PER_DAY = 86_400_000;

/**
 * Advances a date by the given interval unit and count, using calendar-aware
 * arithmetic for month/quarter/year (with end-of-month clamping).
 *
 * Returns null when unit is null (irregular).
 */
export function addInterval(
  date: Date,
  unit: IntervalUnit | null,
  count: number
): Date | null {
  if (unit === null) return null;

  switch (unit) {
    case "day":
      return new Date(date.getTime() + count * MS_PER_DAY);

    case "week":
      return new Date(date.getTime() + count * 7 * MS_PER_DAY);

    case "twice_monthly": {
      // Advance to the next semi-monthly pay date (1st or 15th)
      const d = new Date(date);
      const day = d.getUTCDate();
      if (day < 15) {
        d.setUTCDate(15);
      } else {
        d.setUTCMonth(d.getUTCMonth() + 1);
        d.setUTCDate(1);
      }
      return d;
    }

    case "month":
    case "quarter":
    case "year": {
      const months = unit === "month" ? count
        : unit === "quarter" ? count * 3
        : count * 12;
      const result = new Date(date);
      const targetDay = result.getUTCDate();
      result.setUTCMonth(result.getUTCMonth() + months);
      // End-of-month clamping: if the day shifted (e.g. Jan 31 → Mar 3),
      // go back to the last day of the intended month.
      if (result.getUTCDate() !== targetDay) {
        result.setUTCDate(0); // last day of previous month
      }
      return result;
    }
  }
}

/**
 * Calculates the next due date after a given date, based on interval.
 * Returns null when unit is null (irregular).
 */
export function getNextDueDateAfter(
  currentDueDate: Date,
  intervalUnit: IntervalUnit | null,
  intervalCount: number
): Date | null {
  return addInterval(currentDueDate, intervalUnit, intervalCount);
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
 * Used during the migration period while callers still read contributionCycleDays from the database.
 */
export function cycleDaysToConfig(cycleDays: number | null): CycleConfig {
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

/** Minimal user fields needed for cycle resolution */
export interface CycleUserInput {
  contributionCycleType: ContributionCycleType | null;
  contributionPayDays: number[];
}

/** Minimal income source fields needed for cycle resolution */
export interface CycleIncomeInput {
  intervalUnit: IntervalUnit | null;
  intervalCount: number;
  isActive: boolean;
  isPaused: boolean;
}

/** Cycle-eligible interval patterns, ordered by frequency (most frequent first). */
interface CyclePattern {
  unit: IntervalUnit;
  count: number;
  config: CycleConfig;
}

const CYCLE_PATTERNS: CyclePattern[] = [
  { unit: "week", count: 1, config: { type: "weekly", payDays: [] } },
  { unit: "week", count: 2, config: { type: "fortnightly", payDays: [] } },
  { unit: "twice_monthly", count: 1, config: { type: "twice_monthly", payDays: [1, 15] } },
  { unit: "month", count: 1, config: { type: "monthly", payDays: [1] } },
];

/**
 * Maps an interval unit+count to a CycleConfig.
 * Returns null for intervals that don't map to a contribution cycle type.
 */
function intervalToCycleConfig(unit: IntervalUnit | null, count: number): CycleConfig | null {
  if (unit === null) return null;
  const match = CYCLE_PATTERNS.find((p) => p.unit === unit && p.count === count);
  return match?.config ?? null;
}

/**
 * Resolves the active CycleConfig for engine calculations.
 *
 * Priority:
 * 1. User's explicit contributionCycleType + contributionPayDays
 * 2. Derive from the most frequent non-irregular, active income source
 * 3. Default to monthly on the 1st
 */
export function resolveCycleConfig(
  user: CycleUserInput,
  incomeSources: CycleIncomeInput[],
): CycleConfig {
  // 1. Explicit user setting
  if (user.contributionCycleType !== null) {
    const type = user.contributionCycleType as CycleConfig["type"];
    const payDays = user.contributionPayDays.length > 0
      ? user.contributionPayDays
      : type === "twice_monthly"
        ? [1, 15]
        : type === "monthly"
          ? [1]
          : [];
    return { type, payDays };
  }

  // 2. Auto-detect from income sources (filter out irregular = null unit)
  const eligible = incomeSources.filter(
    (s) => s.isActive && !s.isPaused && s.intervalUnit !== null,
  );

  let bestPriority = CYCLE_PATTERNS.length; // sentinel: worse than any valid
  let bestConfig: CycleConfig | null = null;

  for (const source of eligible) {
    const idx = CYCLE_PATTERNS.findIndex(
      (p) => p.unit === source.intervalUnit && p.count === source.intervalCount,
    );
    if (idx !== -1 && idx < bestPriority) {
      bestPriority = idx;
      bestConfig = intervalToCycleConfig(source.intervalUnit, source.intervalCount);
    }
  }

  if (bestConfig) {
    return bestConfig;
  }

  // 3. Fallback
  return { type: "monthly", payDays: [1] };
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
    fundGroupBalances,
    cycleConfig,
    now = new Date(),
  } = input;

  // Build a lookup for fund group balances and names
  const groupBalanceMap = new Map<string, number>();
  const groupNameMap = new Map<string, string>();
  for (const fgb of fundGroupBalances) {
    groupBalanceMap.set(fgb.fundGroupId, fgb.currentBalance);
    groupNameMap.set(fgb.fundGroupId, fgb.name);
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
            obligation.intervalUnit,
            obligation.intervalCount
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

    const cyclesUntilDue = countCyclesBetween(now, nextDueDate, cycleConfig.type, cycleConfig.payDays);

    // Per-obligation contribution: amountNeeded / cycles (no per-ob balance)
    const contributionPerCycle = cyclesUntilDue > 0
      ? amountNeeded / cyclesUntilDue
      : amountNeeded;

    rawContributions.push({
      obligationId: obligation.id,
      obligationName: obligation.name,
      fundGroupId: obligation.fundGroupId,
      amountNeeded,
      cyclesUntilDue,
      contributionPerCycle,
      nextDueDate,
      hasShortfall: false,
    });
  }

  // Sort by nearest due date (for prioritization)
  rawContributions.sort(
    (a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime()
  );

  // Aggregate by fund group
  const groupMap = new Map<string, {
    totalRequired: number;
    contributionPerCycle: number;
    obligationCount: number;
  }>();

  for (const c of rawContributions) {
    const existing = groupMap.get(c.fundGroupId);
    if (existing) {
      existing.totalRequired += c.amountNeeded;
      existing.contributionPerCycle += c.contributionPerCycle;
      existing.obligationCount += 1;
    } else {
      groupMap.set(c.fundGroupId, {
        totalRequired: c.amountNeeded,
        contributionPerCycle: c.contributionPerCycle,
        obligationCount: 1,
      });
    }
  }

  // Also add fund groups that have a balance but no active obligations
  for (const fgb of fundGroupBalances) {
    if (!groupMap.has(fgb.fundGroupId)) {
      groupMap.set(fgb.fundGroupId, {
        totalRequired: 0,
        contributionPerCycle: 0,
        obligationCount: 0,
      });
    }
  }

  const fundGroupContributions: FundGroupContribution[] = [];
  let totalRequired = 0;
  let totalFunded = 0;

  for (const [groupId, data] of groupMap) {
    const currentBalance = groupBalanceMap.get(groupId) ?? 0;
    const remaining = Math.max(0, data.totalRequired - currentBalance);
    const healthPct = data.totalRequired > 0
      ? (currentBalance / data.totalRequired) * 100
      : currentBalance > 0 ? 100 : 0;

    totalRequired += data.totalRequired;
    totalFunded += currentBalance;

    // Find group name from fund group balances (or fall back to ID)
    const groupName = groupNameMap.get(groupId) ?? groupId;

    fundGroupContributions.push({
      fundGroupId: groupId,
      fundGroupName: groupName,
      totalRequired: data.totalRequired,
      currentBalance,
      remaining,
      contributionPerCycle: data.contributionPerCycle,
      healthPercentage: healthPct,
      isFullyFunded: remaining <= 0,
      obligationCount: data.obligationCount,
    });
  }

  // Adjust per-obligation contributions for fund group balances
  // Distribute fund group balance proportionally across obligations in the group
  for (const fgc of fundGroupContributions) {
    if (fgc.currentBalance <= 0 || fgc.totalRequired <= 0) continue;

    const groupObligations = rawContributions.filter(
      (c) => c.fundGroupId === fgc.fundGroupId
    );

    for (const c of groupObligations) {
      // Pro-rate the balance across obligations proportionally
      const share = c.amountNeeded / fgc.totalRequired;
      const balanceShare = fgc.currentBalance * share;
      const remaining = Math.max(0, c.amountNeeded - balanceShare);

      c.contributionPerCycle = c.cyclesUntilDue > 0
        ? remaining / c.cyclesUntilDue
        : remaining;
    }

    // Recalculate group contribution per cycle from adjusted obligations
    fgc.contributionPerCycle = groupObligations.reduce(
      (sum, c) => sum + c.contributionPerCycle, 0
    );
  }

  const rawTotalPerCycle = rawContributions.reduce(
    (sum, c) => sum + c.contributionPerCycle,
    0
  );

  return {
    contributions: rawContributions,
    fundGroupContributions,
    totalRequired,
    totalFunded,
    totalContributionPerCycle: rawTotalPerCycle,
    isFullyFunded: fundGroupContributions.length > 0 &&
      fundGroupContributions.every((fgc) => fgc.isFullyFunded),
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
