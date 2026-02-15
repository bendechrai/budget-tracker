// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  calculateContributions,
  calculateWithWhatIf,
  countCyclesBetween,
  getNextDueDateAfter,
  type ObligationInput,
  type WhatIfOverrides,
} from "../calculate";
import type { EscalationRule } from "../escalation";

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

describe("countCyclesBetween", () => {
  describe("weekly counts", () => {
    it("counts 4 cycles for 28 days", () => {
      expect(
        countCyclesBetween(new Date("2025-03-01"), new Date("2025-03-29"), "weekly", [])
      ).toBe(4);
    });

    it("counts 1 cycle for less than 7 days", () => {
      expect(
        countCyclesBetween(new Date("2025-03-01"), new Date("2025-03-05"), "weekly", [])
      ).toBe(1);
    });

    it("returns 0 when due is today", () => {
      expect(
        countCyclesBetween(new Date("2025-03-01"), new Date("2025-03-01"), "weekly", [])
      ).toBe(0);
    });

    it("returns 0 when due is in the past", () => {
      expect(
        countCyclesBetween(new Date("2025-03-10"), new Date("2025-03-01"), "weekly", [])
      ).toBe(0);
    });
  });

  describe("fortnightly counts", () => {
    it("counts 2 cycles for 28 days", () => {
      expect(
        countCyclesBetween(new Date("2025-03-01"), new Date("2025-03-29"), "fortnightly", [])
      ).toBe(2);
    });

    it("counts 1 cycle for less than 14 days", () => {
      expect(
        countCyclesBetween(new Date("2025-03-01"), new Date("2025-03-10"), "fortnightly", [])
      ).toBe(1);
    });
  });

  describe("twice-monthly counts", () => {
    it("counts 2 cycles from Feb 1 to Mar 1 (not 1 like day division)", () => {
      // This is the key test from the spec: day division gives floor(28/15)=1
      // but calendar counting gives 2 (Feb 1 and Feb 15)
      expect(
        countCyclesBetween(new Date("2025-02-01"), new Date("2025-03-01"), "twice_monthly", [1, 15])
      ).toBe(2);
    });

    it("counts 4 cycles from Jan 1 to Mar 1", () => {
      // Jan 1, Jan 15, Feb 1, Feb 15
      expect(
        countCyclesBetween(new Date("2025-01-01"), new Date("2025-03-01"), "twice_monthly", [1, 15])
      ).toBe(4);
    });

    it("counts 6 cycles from Jan 1 to Apr 1", () => {
      // Jan 1, Jan 15, Feb 1, Feb 15, Mar 1, Mar 15
      expect(
        countCyclesBetween(new Date("2025-01-01"), new Date("2025-04-01"), "twice_monthly", [1, 15])
      ).toBe(6);
    });

    it("counts correctly when starting mid-month", () => {
      // Start Jan 10, due Mar 1: Jan 15, Feb 1, Feb 15
      expect(
        countCyclesBetween(new Date("2025-01-10"), new Date("2025-03-01"), "twice_monthly", [1, 15])
      ).toBe(3);
    });

    it("handles end-of-month clamping (pay day 30 in Feb → 28th)", () => {
      // Pay days [15, 30]. Feb has 28 days, so day 30 clamps to 28.
      // From Feb 1 to Mar 1: Feb 15 and Feb 28 → 2 cycles
      expect(
        countCyclesBetween(new Date("2025-02-01"), new Date("2025-03-01"), "twice_monthly", [15, 30])
      ).toBe(2);
    });

    it("handles end-of-month clamping in leap year (pay day 30 in Feb → 29th)", () => {
      // 2024 is a leap year: Feb has 29 days
      // From Feb 1 to Mar 1: Feb 15 and Feb 29 → 2 cycles
      expect(
        countCyclesBetween(new Date("2024-02-01"), new Date("2024-03-01"), "twice_monthly", [15, 30])
      ).toBe(2);
    });

    it("returns at least 1 for future due date with very short window", () => {
      // Start Feb 14, due Feb 16, pay days [1, 15]: only Feb 15 in range
      expect(
        countCyclesBetween(new Date("2025-02-14"), new Date("2025-02-16"), "twice_monthly", [1, 15])
      ).toBe(1);
    });
  });

  describe("monthly counts", () => {
    it("counts 3 cycles for Mar 1 to Jun 1", () => {
      // Mar 1, Apr 1, May 1
      expect(
        countCyclesBetween(new Date("2025-03-01"), new Date("2025-06-01"), "monthly", [1])
      ).toBe(3);
    });

    it("counts 1 cycle for short window", () => {
      // Mar 1 to Apr 1: only Mar 1
      expect(
        countCyclesBetween(new Date("2025-03-01"), new Date("2025-04-01"), "monthly", [1])
      ).toBe(1);
    });

    it("counts correctly with pay day mid-month", () => {
      // Pay day 15, Mar 1 to Jun 1: Mar 15, Apr 15, May 15
      expect(
        countCyclesBetween(new Date("2025-03-01"), new Date("2025-06-01"), "monthly", [15])
      ).toBe(3);
    });

    it("handles end-of-month clamping (pay day 31 in months with 30 days)", () => {
      // Pay day 31, Apr 1 to Jul 1:
      // Apr 30 (clamped from 31), May 31, Jun 30 (clamped)
      expect(
        countCyclesBetween(new Date("2025-04-01"), new Date("2025-07-01"), "monthly", [31])
      ).toBe(3);
    });
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

describe("what-if escalation overrides", () => {
  const NOW = new Date("2025-03-01");

  function makeEscalationRule(
    overrides: Partial<EscalationRule> = {},
  ): EscalationRule {
    return {
      id: "esc-whatif-1",
      changeType: "percentage",
      value: 5,
      effectiveDate: new Date("2025-03-15"),
      intervalMonths: null,
      isApplied: false,
      ...overrides,
    };
  }

  it("includes hypothetical escalation in scenario projection", () => {
    // Rent $1000, add a what-if 10% increase effective March 15
    // Due date April 1 (after escalation)
    const result = calculateWithWhatIf(
      {
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 1000,
            nextDueDate: new Date("2025-04-01"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      },
      {
        toggledOffIds: [],
        amountOverrides: {},
        hypotheticals: [],
        escalationOverrides: {
          "obl-1": [
            makeEscalationRule({
              changeType: "percentage",
              value: 10,
              effectiveDate: new Date("2025-03-15"),
            }),
          ],
        },
      }
    );

    // Actual: no escalation rules on the obligation, uses base $1000
    expect(result.actual.contributions[0].amountNeeded).toBe(1000);

    // Scenario: escalation adds 10% → $1100
    expect(result.scenario.contributions[0].amountNeeded).toBe(1100);
  });

  it("does not persist hypothetical escalation to actual calculation", () => {
    const result = calculateWithWhatIf(
      {
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 1000,
            nextDueDate: new Date("2025-04-01"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      },
      {
        toggledOffIds: [],
        amountOverrides: {},
        hypotheticals: [],
        escalationOverrides: {
          "obl-1": [
            makeEscalationRule({
              changeType: "absolute",
              value: 2000,
              effectiveDate: new Date("2025-03-15"),
            }),
          ],
        },
      }
    );

    // Actual should still use base amount (no escalation)
    expect(result.actual.contributions[0].amountNeeded).toBe(1000);
    expect(result.actual.totalRequired).toBe(1000);

    // Scenario uses the hypothetical escalation
    expect(result.scenario.contributions[0].amountNeeded).toBe(2000);
    expect(result.scenario.totalRequired).toBe(2000);
  });

  it("merges hypothetical escalation with existing escalation rules", () => {
    // Obligation already has a real escalation rule (absolute to $1200 on March 15)
    // What-if adds a second escalation (fixed_increase $100 on March 20)
    const result = calculateWithWhatIf(
      {
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 1000,
            nextDueDate: new Date("2025-04-01"),
            escalationRules: [
              {
                id: "esc-real",
                changeType: "absolute",
                value: 1200,
                effectiveDate: new Date("2025-03-15"),
                intervalMonths: null,
                isApplied: false,
              },
            ],
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      },
      {
        toggledOffIds: [],
        amountOverrides: {},
        hypotheticals: [],
        escalationOverrides: {
          "obl-1": [
            makeEscalationRule({
              id: "esc-whatif",
              changeType: "fixed_increase",
              value: 100,
              effectiveDate: new Date("2025-03-20"),
            }),
          ],
        },
      }
    );

    // Actual: only real escalation, absolute to $1200
    expect(result.actual.contributions[0].amountNeeded).toBe(1200);

    // Scenario: real ($1200 absolute on Mar 15) + hypothetical (+$100 on Mar 20)
    // After March 15: $1200 (absolute), then March 20: $1200 + $100 = $1300
    expect(result.scenario.contributions[0].amountNeeded).toBe(1300);
  });

  it("hypothetical escalation on toggled-off obligation is ignored", () => {
    const result = calculateWithWhatIf(
      {
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 1000,
            nextDueDate: new Date("2025-04-01"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      },
      {
        toggledOffIds: ["obl-1"],
        amountOverrides: {},
        hypotheticals: [],
        escalationOverrides: {
          "obl-1": [
            makeEscalationRule({
              changeType: "percentage",
              value: 50,
              effectiveDate: new Date("2025-03-15"),
            }),
          ],
        },
      }
    );

    // Obligation is toggled off in scenario, so no contributions
    expect(result.scenario.contributions).toHaveLength(0);
  });
});

describe("escalation integration", () => {
  const NOW = new Date("2025-03-01");

  function makeEscalationRule(
    overrides: Partial<EscalationRule> = {},
  ): EscalationRule {
    return {
      id: "esc-1",
      changeType: "percentage",
      value: 10,
      effectiveDate: new Date("2025-03-15"),
      intervalMonths: null,
      isApplied: false,
      ...overrides,
    };
  }

  describe("contributions ramp up before an increase", () => {
    it("uses escalated amount for amountNeeded when obligation has escalation rules", () => {
      // Rent is $1000, but escalation rule sets it to $1200 on March 15
      // Due date is April 1, which is after the escalation
      const result = calculateContributions({
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 1000,
            nextDueDate: new Date("2025-04-01"),
            escalationRules: [
              makeEscalationRule({
                changeType: "absolute",
                value: 1200,
                effectiveDate: new Date("2025-03-15"),
              }),
            ],
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      // Should use escalated amount ($1200) not base amount ($1000)
      expect(c.amountNeeded).toBe(1200);
      expect(c.remaining).toBe(1200);
    });

    it("uses current amount when due date is before escalation", () => {
      // Rent is $1000, escalation to $1200 on May 1
      // Due date is April 1, before the escalation takes effect
      const result = calculateContributions({
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 1000,
            nextDueDate: new Date("2025-04-01"),
            escalationRules: [
              makeEscalationRule({
                changeType: "absolute",
                value: 1200,
                effectiveDate: new Date("2025-05-01"),
              }),
            ],
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      // Should use current amount since due date is before escalation
      expect(c.amountNeeded).toBe(1000);
    });

    it("ramps up contributions with percentage escalation", () => {
      // Rent $2000, 5% increase effective March 15, due April 1
      const result = calculateContributions({
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 2000,
            nextDueDate: new Date("2025-04-01"),
            escalationRules: [
              makeEscalationRule({
                changeType: "percentage",
                value: 5,
                effectiveDate: new Date("2025-03-15"),
              }),
            ],
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      const c = result.contributions[0];
      // 2000 * 1.05 = 2100
      expect(c.amountNeeded).toBe(2100);
    });
  });

  describe("shortfall detected for post-increase amount", () => {
    it("generates shortfall warning using escalated amount", () => {
      // Rent $1000, escalation to $1500 on March 15, due April 1
      // Max capacity $800 — was enough for $1000 but not for $1500
      const result = calculateContributions({
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 1000,
            nextDueDate: new Date("2025-04-01"),
            escalationRules: [
              makeEscalationRule({
                changeType: "absolute",
                value: 1500,
                effectiveDate: new Date("2025-03-15"),
              }),
            ],
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: 800,
        contributionCycleDays: 30,
        now: NOW,
      });

      // Shortfall should be based on $1500 (escalated) not $1000
      expect(result.capacityExceeded).toBe(true);
      expect(result.shortfallWarnings).toHaveLength(1);
      expect(result.shortfallWarnings[0].amountNeeded).toBe(1500);
    });
  });

  describe("crunch point uses escalated amount", () => {
    it("uses escalated amount for contribution calculation when capacity is limited", () => {
      // Two obligations, one with escalation that pushes total over capacity
      const result = calculateContributions({
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 1000,
            nextDueDate: new Date("2025-04-01"),
            escalationRules: [
              makeEscalationRule({
                changeType: "absolute",
                value: 1800,
                effectiveDate: new Date("2025-03-15"),
              }),
            ],
          }),
          makeObligation({
            id: "obl-2",
            name: "Insurance",
            amount: 500,
            nextDueDate: new Date("2025-05-30"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: 1900,
        contributionCycleDays: 30,
        now: NOW,
      });

      // Rent escalated to $1800 in 1 cycle, Insurance $500 in 3 cycles = ~$167/cycle
      // Total: $1800 + $167 = $1967 > $1900 capacity
      expect(result.capacityExceeded).toBe(true);

      // Rent gets priority (earlier due date), uses escalated $1800
      const rent = result.contributions[0];
      expect(rent.obligationId).toBe("obl-1");
      expect(rent.amountNeeded).toBe(1800);
    });
  });

  describe("obligations without escalation are unaffected", () => {
    it("uses base amount when no escalation rules are provided", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 1000,
            nextDueDate: new Date("2025-04-01"),
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      expect(result.contributions[0].amountNeeded).toBe(1000);
    });

    it("uses base amount when escalation rules array is empty", () => {
      const result = calculateContributions({
        obligations: [
          makeObligation({
            id: "obl-1",
            name: "Rent",
            amount: 1000,
            nextDueDate: new Date("2025-04-01"),
            escalationRules: [],
          }),
        ],
        fundBalances: [],
        maxContributionPerCycle: null,
        contributionCycleDays: 30,
        now: NOW,
      });

      expect(result.contributions[0].amountNeeded).toBe(1000);
    });
  });
});
