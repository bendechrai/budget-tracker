// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  calculateContributions,
  calculateWithWhatIf,
  getNextDueDateAfter,
  type ObligationInput,
  type WhatIfOverrides,
} from "../calculate";

function makeObligation(
  overrides: Partial<ObligationInput> = {}
): ObligationInput {
  return {
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
    ...overrides,
  };
}

const NOW = new Date("2025-03-01");

describe("calculateContributions", () => {
  describe("steady state calculation", () => {
    it("calculates even contribution when user has empty fund balance", () => {
      const result = calculateContributions({
        obligations: [makeObligation()],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      expect(result.contributions).toHaveLength(1);
      const c = result.contributions[0];
      // 31 days until due, 30-day cycle = 1 cycle
      // $1200 needed, $0 funded, 1 cycle remaining => $1200/cycle
      expect(c.obligationId).toBe("obl-1");
      expect(c.amountNeeded).toBe(1200);
      expect(c.currentBalance).toBe(0);
      expect(c.remaining).toBe(1200);
      expect(c.contributionPerCycle).toBe(1200);
      expect(c.isFullyFunded).toBe(false);
      expect(result.isFullyFunded).toBe(false);
      expect(result.totalRequired).toBe(1200);
      expect(result.totalFunded).toBe(0);
    });

    it("calculates even contribution over multiple cycles", () => {
      // Due date is 90 days out, 30-day cycles = 3 cycles
      const result = calculateContributions({
        obligations: [
          makeObligation({
            nextDueDate: new Date("2025-05-30"),
            amount: 900,
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      expect(c.cyclesUntilDue).toBe(3);
      expect(c.contributionPerCycle).toBe(300);
    });

    it("accounts for existing fund balance", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            nextDueDate: new Date("2025-05-30"),
            amount: 900,
          }),
        ],
        fundBalances: [{ obligationId: "obl-1", currentBalance: 300 }],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      expect(c.currentBalance).toBe(300);
      expect(c.remaining).toBe(600);
      // 600 remaining / 3 cycles = 200/cycle
      expect(c.contributionPerCycle).toBe(200);
    });
  });

  describe("ramp-up scenario (behind schedule)", () => {
    it("increases per-cycle amount when started late", () => {
      // Obligation due in 30 days, with only 1 cycle left
      // Normally would be spread across multiple cycles
      const result = calculateContributions({
        obligations: [
          makeObligation({
            amount: 600,
            nextDueDate: new Date("2025-03-31"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      // Only 1 cycle (30 days), $600 needed: ramp-up = $600/cycle
      expect(c.cyclesUntilDue).toBe(1);
      expect(c.contributionPerCycle).toBe(600);
    });

    it("requires full amount immediately when due date is very close", () => {
      // Due in 10 days, with 30-day cycle: less than one full cycle
      // getCyclesUntilDue returns max(1, floor(10/30)) = 1
      const result = calculateContributions({
        obligations: [
          makeObligation({
            amount: 500,
            nextDueDate: new Date("2025-03-11"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      // Partial cycle counts as 1 cycle, so $500 / 1 = $500/cycle
      expect(c.cyclesUntilDue).toBe(1);
      expect(c.contributionPerCycle).toBe(500);
    });
  });

  describe("ramp-down scenario (ahead of schedule)", () => {
    it("reduces per-cycle amount when user is ahead", () => {
      // 900 needed over 3 cycles, but user has already saved 600
      const result = calculateContributions({
        obligations: [
          makeObligation({
            amount: 900,
            nextDueDate: new Date("2025-05-30"),
          }),
        ],
        fundBalances: [{ obligationId: "obl-1", currentBalance: 600 }],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      // Only 300 remaining, 3 cycles: 100/cycle (ramped down from 300)
      expect(c.contributionPerCycle).toBe(100);
    });

    it("returns zero contribution when fully funded", () => {
      const result = calculateContributions({
        obligations: [makeObligation({ amount: 500 })],
        fundBalances: [{ obligationId: "obl-1", currentBalance: 500 }],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      expect(c.isFullyFunded).toBe(true);
      expect(c.contributionPerCycle).toBe(0);
      expect(c.remaining).toBe(0);
      expect(result.isFullyFunded).toBe(true);
    });

    it("returns zero contribution when over-funded", () => {
      const result = calculateContributions({
        obligations: [makeObligation({ amount: 500 })],
        fundBalances: [{ obligationId: "obl-1", currentBalance: 700 }],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      expect(c.isFullyFunded).toBe(true);
      expect(c.contributionPerCycle).toBe(0);
      expect(c.remaining).toBe(0);
    });
  });

  describe("capacity exceeded prioritization", () => {
    it("prioritizes nearest due date when capacity is exceeded", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            id: "obl-far",
            name: "Insurance",
            amount: 600,
            nextDueDate: new Date("2025-05-30"),
          }),
          makeObligation({
            id: "obl-near",
            name: "Rent",
            amount: 600,
            nextDueDate: new Date("2025-03-31"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: 500,
        contributionCycleDays: 30,
        now: NOW,
      });

      expect(result.capacityExceeded).toBe(true);
      // Should be sorted by due date
      expect(result.contributions[0].obligationId).toBe("obl-near");
      expect(result.contributions[1].obligationId).toBe("obl-far");

      // obl-near needs $600 in 1 cycle = $600/cycle
      // obl-far: 3 cycles, $600 needed = $200/cycle
      // Total: $800/cycle, max is $500
      // obl-near gets $500 (partial), remaining capacity = $0
      // obl-far gets $0 → shortfall
      const nearContrib = result.contributions[0];
      expect(nearContrib.contributionPerCycle).toBe(500);
      expect(nearContrib.hasShortfall).toBe(true);

      const farContrib = result.contributions[1];
      expect(farContrib.contributionPerCycle).toBe(0);
      expect(farContrib.hasShortfall).toBe(true);

      // Both have shortfall warnings
      expect(result.shortfallWarnings).toHaveLength(2);
      expect(result.shortfallWarnings[0].obligationId).toBe("obl-near");
      expect(result.shortfallWarnings[1].obligationId).toBe("obl-far");
    });

    it("partially funds lower-priority obligations with remaining capacity", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            id: "obl-near",
            name: "Rent",
            amount: 300,
            nextDueDate: new Date("2025-03-31"),
          }),
          makeObligation({
            id: "obl-far",
            name: "Insurance",
            amount: 600,
            nextDueDate: new Date("2025-05-30"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: 400,
        contributionCycleDays: 30,
        now: NOW,
      });

      // obl-near: 1 cycle, $300/cycle → fully allocated
      // obl-far: 3 cycles, $200/cycle → gets $100 (400 - 300 remaining)
      expect(result.contributions[0].contributionPerCycle).toBe(300);
      expect(result.contributions[1].contributionPerCycle).toBe(100);
      expect(result.contributions[1].hasShortfall).toBe(true);
      expect(result.capacityExceeded).toBe(true);
    });
  });

  describe("shortfall warning generation", () => {
    it("generates warning message with specific amounts", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 1000,
            nextDueDate: new Date("2025-03-31"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: 200,
        contributionCycleDays: 30,
        now: NOW,
      });

      expect(result.shortfallWarnings).toHaveLength(1);
      const warning = result.shortfallWarnings[0];
      expect(warning.obligationId).toBe("obl-1");
      expect(warning.obligationName).toBe("Rent");
      expect(warning.amountNeeded).toBe(1000);
      expect(warning.shortfall).toBeGreaterThan(0);
      expect(warning.dueDate).toEqual(new Date("2025-03-31"));
      expect(warning.message).toContain("Rent");
      expect(warning.message).toContain("1000.00");
    });

    it("does not generate warnings when capacity is sufficient", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            amount: 300,
            nextDueDate: new Date("2025-03-31"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: 500,
        contributionCycleDays: 30,
        now: NOW,
      });

      expect(result.shortfallWarnings).toHaveLength(0);
      expect(result.capacityExceeded).toBe(false);
    });
  });

  describe("recurring cycle resets", () => {
    it("advances to next due date when current due date has passed", () => {
      // nextDueDate is in the past
      const result = calculateContributions({
        obligations: [
          makeObligation({
            nextDueDate: new Date("2025-02-15"),
            frequency: "monthly",
            amount: 600,
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      // Should advance to ~March 17 (Feb 15 + 30 days)
      expect(c.nextDueDate.getTime()).toBeGreaterThan(NOW.getTime());
    });

    it("advances multiple periods when obligation is far past due", () => {
      // nextDueDate is several months in the past
      const result = calculateContributions({
        obligations: [
          makeObligation({
            nextDueDate: new Date("2024-12-01"),
            frequency: "monthly",
            amount: 300,
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW, // 2025-03-01
      });

      const c = result.contributions[0];
      // Dec 1 → Dec 31 → Jan 30 → Mar 1 (still <= NOW) → Mar 31
      // Should keep advancing until future
      expect(c.nextDueDate.getTime()).toBeGreaterThan(NOW.getTime());
    });

    it("skips recurring_with_end obligations past their end date", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            type: "recurring_with_end",
            nextDueDate: new Date("2025-02-15"),
            endDate: new Date("2025-02-28"),
            frequency: "monthly",
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      // Next due would be March 17, but end date is Feb 28 — should be excluded
      expect(result.contributions).toHaveLength(0);
    });
  });

  describe("obligation filtering", () => {
    it("excludes paused obligations", () => {
      const result = calculateContributions({
        obligations: [makeObligation({ isPaused: true })],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      expect(result.contributions).toHaveLength(0);
    });

    it("excludes inactive obligations", () => {
      const result = calculateContributions({
        obligations: [makeObligation({ isActive: false })],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      expect(result.contributions).toHaveLength(0);
    });
  });

  describe("one-off obligations", () => {
    it("calculates contribution for one-off obligation", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            type: "one_off",
            amount: 3000,
            frequency: null,
            nextDueDate: new Date("2025-06-01"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      // ~92 days / 30 = 3 cycles
      expect(c.cyclesUntilDue).toBe(3);
      expect(c.contributionPerCycle).toBe(1000);
    });
  });

  describe("custom obligations", () => {
    it("uses next unpaid custom entry", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            type: "custom",
            frequency: null,
            customEntries: [
              {
                dueDate: new Date("2025-02-15"),
                amount: 200,
                isPaid: true,
              },
              {
                dueDate: new Date("2025-04-01"),
                amount: 500,
                isPaid: false,
              },
              {
                dueDate: new Date("2025-06-01"),
                amount: 300,
                isPaid: false,
              },
            ],
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      expect(c.amountNeeded).toBe(500);
      expect(c.nextDueDate).toEqual(new Date("2025-04-01"));
    });

    it("skips custom obligation when all entries are paid", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            type: "custom",
            frequency: null,
            customEntries: [
              {
                dueDate: new Date("2025-02-15"),
                amount: 200,
                isPaid: true,
              },
            ],
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      expect(result.contributions).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("handles no obligations (empty state)", () => {
      const result = calculateContributions({
        obligations: [],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      expect(result.contributions).toHaveLength(0);
      expect(result.totalRequired).toBe(0);
      expect(result.totalFunded).toBe(0);
      // No obligations means nothing is funded (empty state, not celebration)
      expect(result.isFullyFunded).toBe(false);
      expect(result.shortfallWarnings).toHaveLength(0);
    });

    it("defaults to 30-day cycle when contributionCycleDays is null", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            amount: 900,
            nextDueDate: new Date("2025-05-30"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: null,
        now: NOW,
      });

      const c = result.contributions[0];
      // Same as 30-day cycle: 90 days / 30 = 3 cycles
      expect(c.cyclesUntilDue).toBe(3);
      expect(c.contributionPerCycle).toBe(300);
    });

    it("celebration state when all obligations are fully funded", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({ id: "obl-1", amount: 500 }),
          makeObligation({ id: "obl-2", amount: 300 }),
        ],
        fundBalances: [
          { obligationId: "obl-1", currentBalance: 500 },
          { obligationId: "obl-2", currentBalance: 300 },
        ],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      expect(result.isFullyFunded).toBe(true);
      expect(result.totalContributionPerCycle).toBe(0);
    });

    it("handles multiple obligations with different fund groups", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 600,
            nextDueDate: new Date("2025-03-31"),
            fundGroupId: "group-housing",
          }),
          makeObligation({
            id: "obl-2",
            name: "Netflix",
            amount: 30,
            nextDueDate: new Date("2025-03-31"),
            fundGroupId: "group-subs",
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      expect(result.contributions).toHaveLength(2);
      expect(result.contributions[0].fundGroupId).toBe("group-housing");
      expect(result.contributions[1].fundGroupId).toBe("group-subs");
      expect(result.totalRequired).toBe(630);
    });
  });

  describe("frequency handling", () => {
    it("handles weekly frequency", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            frequency: "weekly",
            nextDueDate: new Date("2025-02-20"),
            amount: 100,
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 7,
        now: NOW,
      });

      // Due date passed: Feb 20 → Feb 27 → Mar 6 (advances until future)
      // Mar 6 is 5 days from NOW (Mar 1), cycle is 7 days
      // getCyclesUntilDue = max(1, floor(5/7)) = 1
      // $100 / 1 cycle = $100/cycle
      const c = result.contributions[0];
      expect(c.nextDueDate).toEqual(new Date("2025-03-06"));
      expect(c.contributionPerCycle).toBe(100);
    });
  });
});

describe("getNextDueDateAfter", () => {
  it("returns date 30 days later for monthly frequency", () => {
    const result = getNextDueDateAfter(
      new Date("2025-03-01"),
      "monthly",
      null
    );
    expect(result).toEqual(new Date("2025-03-31"));
  });

  it("returns date 7 days later for weekly frequency", () => {
    const result = getNextDueDateAfter(
      new Date("2025-03-01"),
      "weekly",
      null
    );
    expect(result).toEqual(new Date("2025-03-08"));
  });

  it("returns date 14 days later for fortnightly frequency", () => {
    const result = getNextDueDateAfter(
      new Date("2025-03-01"),
      "fortnightly",
      null
    );
    expect(result).toEqual(new Date("2025-03-15"));
  });

  it("returns date 90 days later for quarterly frequency", () => {
    const result = getNextDueDateAfter(
      new Date("2025-03-01"),
      "quarterly",
      null
    );
    expect(result).toEqual(new Date("2025-05-30"));
  });

  it("returns date 365 days later for annual frequency", () => {
    const result = getNextDueDateAfter(
      new Date("2025-03-01"),
      "annual",
      null
    );
    // 365 days after March 1, 2025 = March 1, 2026
    expect(result).toEqual(new Date("2026-03-01"));
  });

  it("uses custom frequency days", () => {
    const result = getNextDueDateAfter(
      new Date("2025-03-01"),
      "custom",
      45
    );
    expect(result).toEqual(new Date("2025-04-15"));
  });

  it("returns null for irregular frequency", () => {
    const result = getNextDueDateAfter(
      new Date("2025-03-01"),
      "irregular",
      null
    );
    expect(result).toBeNull();
  });

  it("returns null for null frequency", () => {
    const result = getNextDueDateAfter(new Date("2025-03-01"), null, null);
    expect(result).toBeNull();
  });
});

describe("calculateWithWhatIf", () => {
  const emptyOverrides: WhatIfOverrides = {
    toggledOffIds: [],
    amountOverrides: {},
    hypotheticals: [],
  };

  describe("with toggled-off obligation", () => {
    it("excludes toggled-off obligations from scenario but keeps them in actual", () => {
      const obligations = [
        makeObligation({ id: "obl-1", name: "Rent", amount: 1200 }),
        makeObligation({ id: "obl-2", name: "Gym", amount: 50, nextDueDate: new Date("2025-04-01") }),
      ];

      const result = calculateWithWhatIf(
        {
          obligations,
          fundBalances: [],
          maxContributionPerCycle: null,
          contributionCycleDays: 30,
          now: NOW,
        },
        {
          ...emptyOverrides,
          toggledOffIds: ["obl-2"],
        }
      );

      // Actual includes both
      expect(result.actual.contributions).toHaveLength(2);
      expect(result.actual.totalRequired).toBe(1250);

      // Scenario excludes Gym
      expect(result.scenario.contributions).toHaveLength(1);
      expect(result.scenario.contributions[0].obligationId).toBe("obl-1");
      expect(result.scenario.totalRequired).toBe(1200);
    });

    it("toggling off all obligations yields fully funded scenario", () => {
      const result = calculateWithWhatIf(
        {
          obligations: [makeObligation({ id: "obl-1", amount: 500 })],
          fundBalances: [],
          maxContributionPerCycle: null,
          contributionCycleDays: 30,
          now: NOW,
        },
        {
          ...emptyOverrides,
          toggledOffIds: ["obl-1"],
        }
      );

      expect(result.scenario.contributions).toHaveLength(0);
      expect(result.scenario.totalRequired).toBe(0);
      // No obligations = empty state (isFullyFunded false)
      expect(result.scenario.isFullyFunded).toBe(false);
    });
  });

  describe("with amount override", () => {
    it("uses overridden amount in scenario while keeping original in actual", () => {
      const result = calculateWithWhatIf(
        {
          obligations: [
            makeObligation({
              id: "obl-1",
              name: "Netflix",
              amount: 15,
              nextDueDate: new Date("2025-04-01"),
            }),
          ],
          fundBalances: [],
          maxContributionPerCycle: null,
          contributionCycleDays: 30,
          now: NOW,
        },
        {
          ...emptyOverrides,
          amountOverrides: { "obl-1": 30 },
        }
      );

      // Actual uses original amount
      expect(result.actual.contributions[0].amountNeeded).toBe(15);
      expect(result.actual.totalRequired).toBe(15);

      // Scenario uses overridden amount
      expect(result.scenario.contributions[0].amountNeeded).toBe(30);
      expect(result.scenario.totalRequired).toBe(30);
    });
  });

  describe("with hypothetical obligation", () => {
    it("includes hypothetical in scenario but not in actual", () => {
      const hypothetical: ObligationInput = makeObligation({
        id: "hyp-1",
        name: "Holiday",
        type: "one_off",
        amount: 2000,
        frequency: null,
        nextDueDate: new Date("2025-12-01"),
      });

      const result = calculateWithWhatIf(
        {
          obligations: [
            makeObligation({ id: "obl-1", amount: 600, nextDueDate: new Date("2025-04-01") }),
          ],
          fundBalances: [],
          maxContributionPerCycle: null,
          contributionCycleDays: 30,
          now: NOW,
        },
        {
          ...emptyOverrides,
          hypotheticals: [hypothetical],
        }
      );

      // Actual has only the real obligation
      expect(result.actual.contributions).toHaveLength(1);
      expect(result.actual.totalRequired).toBe(600);

      // Scenario has both real + hypothetical
      expect(result.scenario.contributions).toHaveLength(2);
      expect(result.scenario.totalRequired).toBe(2600);
      const hypContrib = result.scenario.contributions.find(
        (c) => c.obligationId === "hyp-1"
      );
      expect(hypContrib).toBeDefined();
      expect(hypContrib!.amountNeeded).toBe(2000);
    });

    it("generates shortfall when hypothetical pushes past capacity", () => {
      const hypothetical: ObligationInput = makeObligation({
        id: "hyp-1",
        name: "Holiday",
        type: "one_off",
        amount: 5000,
        frequency: null,
        nextDueDate: new Date("2025-04-01"),
      });

      const result = calculateWithWhatIf(
        {
          obligations: [
            makeObligation({ id: "obl-1", amount: 600, nextDueDate: new Date("2025-04-01") }),
          ],
          fundBalances: [],
          maxContributionPerCycle: 500,
          contributionCycleDays: 30,
          now: NOW,
        },
        {
          ...emptyOverrides,
          hypotheticals: [hypothetical],
        }
      );

      // Actual: $600 in 1 cycle, capacity $500 → shortfall
      expect(result.actual.capacityExceeded).toBe(true);

      // Scenario: $600 + $5000 in 1 cycle, capacity $500 → worse shortfall
      expect(result.scenario.capacityExceeded).toBe(true);
      expect(result.scenario.shortfallWarnings.length).toBeGreaterThanOrEqual(1);
      expect(result.scenario.totalRequired).toBe(5600);
    });
  });

  describe("with no overrides", () => {
    it("returns identical actual and scenario results", () => {
      const result = calculateWithWhatIf(
        {
          obligations: [makeObligation({ id: "obl-1", amount: 600 })],
          fundBalances: [],
          maxContributionPerCycle: null,
          contributionCycleDays: 30,
          now: NOW,
        },
        emptyOverrides
      );

      expect(result.actual.totalRequired).toBe(result.scenario.totalRequired);
      expect(result.actual.totalFunded).toBe(result.scenario.totalFunded);
      expect(result.actual.contributions).toHaveLength(
        result.scenario.contributions.length
      );
      expect(result.actual.isFullyFunded).toBe(result.scenario.isFullyFunded);
    });
  });

  describe("combined overrides", () => {
    it("applies toggle, amount override, and hypothetical together", () => {
      const hypothetical: ObligationInput = makeObligation({
        id: "hyp-1",
        name: "Holiday",
        type: "one_off",
        amount: 1000,
        frequency: null,
        nextDueDate: new Date("2025-06-01"),
      });

      const result = calculateWithWhatIf(
        {
          obligations: [
            makeObligation({ id: "obl-1", name: "Rent", amount: 1200, nextDueDate: new Date("2025-04-01") }),
            makeObligation({ id: "obl-2", name: "Gym", amount: 50, nextDueDate: new Date("2025-04-01") }),
            makeObligation({ id: "obl-3", name: "Netflix", amount: 15, nextDueDate: new Date("2025-04-01") }),
          ],
          fundBalances: [],
          maxContributionPerCycle: null,
          contributionCycleDays: 30,
          now: NOW,
        },
        {
          toggledOffIds: ["obl-2"],       // Toggle off Gym
          amountOverrides: { "obl-3": 30 }, // Netflix $15 → $30
          hypotheticals: [hypothetical],     // Add Holiday $1000
        }
      );

      // Actual: Rent(1200) + Gym(50) + Netflix(15) = 1265
      expect(result.actual.contributions).toHaveLength(3);
      expect(result.actual.totalRequired).toBe(1265);

      // Scenario: Rent(1200) + Netflix(30) + Holiday(1000) = 2230
      // Gym toggled off, Netflix overridden to 30
      expect(result.scenario.contributions).toHaveLength(3);
      expect(result.scenario.totalRequired).toBe(2230);

      // Verify Gym is not in scenario
      const gymInScenario = result.scenario.contributions.find(
        (c) => c.obligationId === "obl-2"
      );
      expect(gymInScenario).toBeUndefined();

      // Verify Netflix uses overridden amount
      const netflixInScenario = result.scenario.contributions.find(
        (c) => c.obligationId === "obl-3"
      );
      expect(netflixInScenario!.amountNeeded).toBe(30);
    });
  });
});
