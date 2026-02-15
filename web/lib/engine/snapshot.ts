import { calculateContributions, type CycleConfig, type EngineInput, type EngineResult } from "./calculate";

export interface SnapshotData {
  totalRequired: number;
  totalFunded: number;
  nextActionAmount: number;
  nextActionDate: Date;
  nextActionDescription: string;
  nextActionObligationId: string | null;
}

/**
 * Returns a human-readable cycle period label for the given cycle type.
 */
function cyclePeriodLabel(cycleType: CycleConfig["type"]): string {
  switch (cycleType) {
    case "weekly":
      return "this week";
    case "fortnightly":
      return "this fortnight";
    case "twice_monthly":
      return "this pay period";
    case "monthly":
      return "this month";
  }
}

/**
 * Generates a snapshot from an EngineResult.
 *
 * The next action is the most urgent under-funded obligation (nearest due date).
 * If all obligations are fully funded, it shows a celebration state.
 * If there are no obligations, it prompts the user to add some.
 */
export function generateSnapshot(engineResult: EngineResult, cycleConfig?: CycleConfig): SnapshotData {
  const { contributions, totalRequired, totalFunded, isFullyFunded } = engineResult;

  // No obligations — prompt user
  if (contributions.length === 0) {
    return {
      totalRequired: 0,
      totalFunded: 0,
      nextActionAmount: 0,
      nextActionDate: new Date(),
      nextActionDescription: "Add your first obligation to get started",
      nextActionObligationId: null,
    };
  }

  // All funded — celebration state
  if (isFullyFunded) {
    // Find the nearest due date for the "next action date"
    const nearestDueDate = contributions.reduce(
      (earliest, c) =>
        c.nextDueDate.getTime() < earliest.getTime() ? c.nextDueDate : earliest,
      contributions[0].nextDueDate
    );

    return {
      totalRequired,
      totalFunded,
      nextActionAmount: 0,
      nextActionDate: nearestDueDate,
      nextActionDescription: "You're fully covered!",
      nextActionObligationId: null,
    };
  }

  // Find the most urgent under-funded obligation (already sorted by due date)
  const underFunded = contributions.filter((c) => !c.isFullyFunded);
  const nextAction = underFunded[0];

  return {
    totalRequired,
    totalFunded,
    nextActionAmount: nextAction.contributionPerCycle,
    nextActionDate: nextAction.nextDueDate,
    nextActionDescription: cycleConfig
      ? `Set aside $${nextAction.contributionPerCycle.toFixed(2)} ${cyclePeriodLabel(cycleConfig.type)} for ${nextAction.obligationName}`
      : `Set aside $${nextAction.contributionPerCycle.toFixed(2)} for ${nextAction.obligationName} by ${nextAction.nextDueDate.toISOString().split("T")[0]}`,
    nextActionObligationId: nextAction.obligationId,
  };
}

/**
 * Convenience function: runs the engine calculation and generates a snapshot in one call.
 */
export function calculateAndSnapshot(input: EngineInput): {
  result: EngineResult;
  snapshot: SnapshotData;
} {
  const result = calculateContributions(input);
  const snapshot = generateSnapshot(result, input.cycleConfig);
  return { result, snapshot };
}
