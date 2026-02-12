import type { IncomeFrequency, ObligationType } from "@/app/generated/prisma/client";

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
 * Calculates the number of contribution cycles between now and a due date.
 * Returns at least 1 if the due date is in the future (even if less than one full cycle).
 * Returns 0 if the due date is today or past.
 */
function getCyclesUntilDue(
  now: Date,
  dueDate: Date,
  cycleDays: number
): number {
  const daysUntilDue = Math.max(
    0,
    Math.floor((dueDate.getTime() - now.getTime()) / MS_PER_DAY)
  );
  if (daysUntilDue <= 0) return 0;
  return Math.max(1, Math.floor(daysUntilDue / cycleDays));
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

  const cycleDays = contributionCycleDays ?? 30; // default to monthly

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

      amountNeeded = obligation.amount;
      nextDueDate = effectiveDueDate;
    }

    const currentBalance = balanceMap.get(obligation.id) ?? 0;
    const remaining = Math.max(0, amountNeeded - currentBalance);
    const cyclesUntilDue = getCyclesUntilDue(now, nextDueDate, cycleDays);
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
