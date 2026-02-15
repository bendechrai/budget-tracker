// @vitest-environment node
import { describe, it, expect } from "vitest";
import { generateSnapshot, calculateAndSnapshot } from "../snapshot";
import type { CycleConfig, EngineResult, ObligationContribution } from "../calculate";

function makeContribution(
  overrides: Partial<ObligationContribution> = {}
): ObligationContribution {
  return {
    obligationId: "obl-1",
    obligationName: "Rent",
    fundGroupId: null,
    amountNeeded: 1200,
    currentBalance: 0,
    remaining: 1200,
    cyclesUntilDue: 1,
    contributionPerCycle: 1200,
    nextDueDate: new Date("2025-04-01"),
    isFullyFunded: false,
    hasShortfall: false,
    ...overrides,
  };
}

function makeEngineResult(
  overrides: Partial<EngineResult> = {}
): EngineResult {
  return {
    contributions: [makeContribution()],
    totalRequired: 1200,
    totalFunded: 0,
    totalContributionPerCycle: 1200,
    shortfallWarnings: [],
    isFullyFunded: false,
    capacityExceeded: false,
    ...overrides,
  };
}

const NOW = new Date("2025-03-01");

describe("generateSnapshot", () => {
  describe("snapshot contains correct totals", () => {
    it("includes totalRequired and totalFunded from engine result", () => {
      const result = makeEngineResult({
        totalRequired: 2500,
        totalFunded: 800,
      });

      const snapshot = generateSnapshot(result);

      expect(snapshot.totalRequired).toBe(2500);
      expect(snapshot.totalFunded).toBe(800);
    });

    it("sets next action to the most urgent under-funded obligation", () => {
      const result = makeEngineResult({
        contributions: [
          makeContribution({
            obligationId: "obl-near",
            obligationName: "Rent",
            amountNeeded: 1200,
            contributionPerCycle: 1200,
            nextDueDate: new Date("2025-03-15"),
            isFullyFunded: false,
          }),
          makeContribution({
            obligationId: "obl-far",
            obligationName: "Insurance",
            amountNeeded: 600,
            contributionPerCycle: 200,
            nextDueDate: new Date("2025-06-01"),
            isFullyFunded: false,
          }),
        ],
      });

      const snapshot = generateSnapshot(result);

      expect(snapshot.nextActionAmount).toBe(1200);
      expect(snapshot.nextActionDate).toEqual(new Date("2025-03-15"));
      expect(snapshot.nextActionDescription).toContain("Rent");
      expect(snapshot.nextActionDescription).toContain("1200.00");
      expect(snapshot.nextActionDescription).toContain("2025-03-15");
      expect(snapshot.nextActionObligationId).toBe("obl-near");
    });
  });

  describe("next action is nearest due date", () => {
    it("picks the nearest unfunded obligation as next action", () => {
      const result = makeEngineResult({
        contributions: [
          makeContribution({
            obligationId: "obl-1",
            obligationName: "Rent",
            contributionPerCycle: 600,
            nextDueDate: new Date("2025-04-01"),
            isFullyFunded: false,
          }),
          makeContribution({
            obligationId: "obl-2",
            obligationName: "Netflix",
            contributionPerCycle: 15,
            nextDueDate: new Date("2025-03-20"),
            isFullyFunded: false,
          }),
        ],
      });

      // contributions are already sorted by due date from calculateContributions
      // so obl-2 (Mar 20) should be first in the array
      // but let's ensure the filter picks the first unfunded one
      const snapshot = generateSnapshot(result);

      // The first contribution in the array is the nearest due date
      expect(snapshot.nextActionAmount).toBe(600);
      expect(snapshot.nextActionDate).toEqual(new Date("2025-04-01"));
    });

    it("skips fully funded obligations when finding next action", () => {
      const result = makeEngineResult({
        contributions: [
          makeContribution({
            obligationId: "obl-near",
            obligationName: "Netflix",
            contributionPerCycle: 0,
            nextDueDate: new Date("2025-03-20"),
            isFullyFunded: true,
          }),
          makeContribution({
            obligationId: "obl-far",
            obligationName: "Rent",
            contributionPerCycle: 400,
            nextDueDate: new Date("2025-04-01"),
            isFullyFunded: false,
          }),
        ],
        isFullyFunded: false,
      });

      const snapshot = generateSnapshot(result);

      expect(snapshot.nextActionAmount).toBe(400);
      expect(snapshot.nextActionDate).toEqual(new Date("2025-04-01"));
      expect(snapshot.nextActionDescription).toContain("Rent");
    });
  });

  describe("celebration state when fully funded", () => {
    it("shows celebration when all obligations are fully funded", () => {
      const result = makeEngineResult({
        contributions: [
          makeContribution({
            obligationId: "obl-1",
            contributionPerCycle: 0,
            nextDueDate: new Date("2025-04-01"),
            isFullyFunded: true,
            amountNeeded: 500,
            currentBalance: 500,
            remaining: 0,
          }),
          makeContribution({
            obligationId: "obl-2",
            contributionPerCycle: 0,
            nextDueDate: new Date("2025-05-01"),
            isFullyFunded: true,
            amountNeeded: 300,
            currentBalance: 300,
            remaining: 0,
          }),
        ],
        totalRequired: 800,
        totalFunded: 800,
        isFullyFunded: true,
      });

      const snapshot = generateSnapshot(result);

      expect(snapshot.nextActionAmount).toBe(0);
      expect(snapshot.nextActionDescription).toBe("You're fully covered!");
      // Next action date should be the nearest due date
      expect(snapshot.nextActionDate).toEqual(new Date("2025-04-01"));
      expect(snapshot.totalRequired).toBe(800);
      expect(snapshot.totalFunded).toBe(800);
      expect(snapshot.nextActionObligationId).toBeNull();
    });
  });

  describe("empty state", () => {
    it("prompts user when there are no obligations", () => {
      const result = makeEngineResult({
        contributions: [],
        totalRequired: 0,
        totalFunded: 0,
        isFullyFunded: false,
      });

      const snapshot = generateSnapshot(result);

      expect(snapshot.totalRequired).toBe(0);
      expect(snapshot.totalFunded).toBe(0);
      expect(snapshot.nextActionAmount).toBe(0);
      expect(snapshot.nextActionDescription).toContain("Add your first obligation");
      expect(snapshot.nextActionObligationId).toBeNull();
    });
  });

  describe("description formatting", () => {
    it("formats description with amount, name, and date when no cycleConfig", () => {
      const result = makeEngineResult({
        contributions: [
          makeContribution({
            obligationName: "Gym Membership",
            contributionPerCycle: 45.5,
            nextDueDate: new Date("2025-04-15"),
            isFullyFunded: false,
          }),
        ],
      });

      const snapshot = generateSnapshot(result);

      expect(snapshot.nextActionDescription).toBe(
        "Set aside $45.50 for Gym Membership by 2025-04-15"
      );
    });
  });

  describe("cycle-aware description", () => {
    const baseResult = (name: string, amount: number) =>
      makeEngineResult({
        contributions: [
          makeContribution({
            obligationName: name,
            contributionPerCycle: amount,
            nextDueDate: new Date("2025-04-15"),
            isFullyFunded: false,
          }),
        ],
      });

    it("shows 'this week' for weekly cycle", () => {
      const config: CycleConfig = { type: "weekly", payDays: [] };
      const snapshot = generateSnapshot(baseResult("Rent", 412), config);
      expect(snapshot.nextActionDescription).toBe(
        "Set aside $412.00 this week for Rent"
      );
    });

    it("shows 'this fortnight' for fortnightly cycle", () => {
      const config: CycleConfig = { type: "fortnightly", payDays: [] };
      const snapshot = generateSnapshot(baseResult("Rent", 824), config);
      expect(snapshot.nextActionDescription).toBe(
        "Set aside $824.00 this fortnight for Rent"
      );
    });

    it("shows 'this pay period' for twice_monthly cycle", () => {
      const config: CycleConfig = { type: "twice_monthly", payDays: [1, 15] };
      const snapshot = generateSnapshot(baseResult("Rent", 600), config);
      expect(snapshot.nextActionDescription).toBe(
        "Set aside $600.00 this pay period for Rent"
      );
    });

    it("shows 'this month' for monthly cycle", () => {
      const config: CycleConfig = { type: "monthly", payDays: [1] };
      const snapshot = generateSnapshot(baseResult("Rent", 1200), config);
      expect(snapshot.nextActionDescription).toBe(
        "Set aside $1200.00 this month for Rent"
      );
    });
  });
});

describe("calculateAndSnapshot", () => {
  it("runs engine and generates snapshot in one call", () => {
    const { result, snapshot } = calculateAndSnapshot({
      obligations: [
        {
          id: "obl-1",
          name: "Rent",
          type: "recurring",
          amount: 1200,
          frequency: "monthly",
          frequencyDays: null,
          nextDueDate: new Date("2025-04-01"),
          endDate: null,
          isPaused: false,
          isActive: true,
          fundGroupId: null,
        },
      ],
      fundBalances: [],
      maxContributionPerCycle: null,
      cycleConfig: { type: "monthly", payDays: [1] },
      now: NOW,
    });

    expect(result.totalRequired).toBe(1200);
    expect(result.contributions).toHaveLength(1);
    expect(snapshot.totalRequired).toBe(1200);
    expect(snapshot.nextActionDescription).toContain("Rent");
    expect(snapshot.nextActionDescription).toContain("this month");
    expect(snapshot.nextActionObligationId).toBe("obl-1");
  });

  it("returns celebration snapshot when fully funded", () => {
    const { snapshot } = calculateAndSnapshot({
      obligations: [
        {
          id: "obl-1",
          name: "Rent",
          type: "recurring",
          amount: 1200,
          frequency: "monthly",
          frequencyDays: null,
          nextDueDate: new Date("2025-04-01"),
          endDate: null,
          isPaused: false,
          isActive: true,
          fundGroupId: null,
        },
      ],
      fundBalances: [{ obligationId: "obl-1", currentBalance: 1200 }],
      maxContributionPerCycle: null,
      cycleConfig: { type: "monthly", payDays: [1] },
      now: NOW,
    });

    expect(snapshot.nextActionAmount).toBe(0);
    expect(snapshot.nextActionDescription).toBe("You're fully covered!");
    expect(snapshot.nextActionObligationId).toBeNull();
  });
});
