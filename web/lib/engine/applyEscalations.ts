import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging";

/**
 * Result of applying one-off escalation rules.
 */
export interface ApplyEscalationsResult {
  /** Number of rules that were applied */
  appliedCount: number;
  /** Obligation IDs whose amounts were updated */
  updatedObligationIds: string[];
}

/**
 * Applies a single escalation change to an amount.
 */
function applyChange(
  currentAmount: number,
  changeType: "absolute" | "percentage" | "fixed_increase",
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

/**
 * Checks for unapplied one-off escalation rules whose effectiveDate has passed
 * and applies them: updates the obligation's base amount and marks the rule as applied.
 *
 * Skips:
 * - Rules that are already applied
 * - Rules with a future effectiveDate
 * - Rules on paused obligations (deferred until resume)
 * - Recurring rules (they are never "applied" to the base amount)
 *
 * Called during engine recalculation.
 */
export async function applyPendingEscalations(
  userId: string,
  now: Date = new Date(),
): Promise<ApplyEscalationsResult> {
  const result: ApplyEscalationsResult = {
    appliedCount: 0,
    updatedObligationIds: [],
  };

  // Find all unapplied one-off escalation rules for the user's obligations
  // whose effectiveDate has passed
  const pendingRules = await prisma.escalation.findMany({
    where: {
      isApplied: false,
      intervalMonths: null, // one-off only
      effectiveDate: { lte: now },
      obligation: {
        userId,
        isActive: true,
        isPaused: false,
      },
    },
    include: {
      obligation: true,
    },
    orderBy: { effectiveDate: "asc" },
  });

  for (const rule of pendingRules) {
    try {
      const newAmount = applyChange(
        rule.obligation.amount,
        rule.changeType,
        Number(rule.value),
      );

      await prisma.$transaction(async (tx) => {
        await tx.obligation.update({
          where: { id: rule.obligationId },
          data: { amount: newAmount },
        });

        await tx.escalation.update({
          where: { id: rule.id },
          data: {
            isApplied: true,
            appliedAt: now,
          },
        });
      });

      result.appliedCount++;
      if (!result.updatedObligationIds.includes(rule.obligationId)) {
        result.updatedObligationIds.push(rule.obligationId);
      }
    } catch (error) {
      logError("failed to apply escalation rule", error, {
        escalationId: rule.id,
        obligationId: rule.obligationId,
      });
    }
  }

  return result;
}

/**
 * Applies deferred one-off escalation rules for a specific obligation.
 *
 * When an obligation is resumed (unpaused), this should be called to apply
 * any one-off rules whose effectiveDate passed while the obligation was paused.
 */
export async function applyDeferredEscalations(
  obligationId: string,
  now: Date = new Date(),
): Promise<ApplyEscalationsResult> {
  const result: ApplyEscalationsResult = {
    appliedCount: 0,
    updatedObligationIds: [],
  };

  const pendingRules = await prisma.escalation.findMany({
    where: {
      obligationId,
      isApplied: false,
      intervalMonths: null,
      effectiveDate: { lte: now },
    },
    include: {
      obligation: true,
    },
    orderBy: { effectiveDate: "asc" },
  });

  // Apply rules sequentially so each builds on the previous amount
  let currentAmount = pendingRules.length > 0 ? pendingRules[0].obligation.amount : 0;

  for (const rule of pendingRules) {
    try {
      const newAmount = applyChange(
        currentAmount,
        rule.changeType,
        Number(rule.value),
      );

      await prisma.$transaction(async (tx) => {
        await tx.obligation.update({
          where: { id: rule.obligationId },
          data: { amount: newAmount },
        });

        await tx.escalation.update({
          where: { id: rule.id },
          data: {
            isApplied: true,
            appliedAt: now,
          },
        });
      });

      currentAmount = newAmount;
      result.appliedCount++;
      if (!result.updatedObligationIds.includes(rule.obligationId)) {
        result.updatedObligationIds.push(rule.obligationId);
      }
    } catch (error) {
      logError("failed to apply deferred escalation rule", error, {
        escalationId: rule.id,
        obligationId: rule.obligationId,
      });
    }
  }

  return result;
}
