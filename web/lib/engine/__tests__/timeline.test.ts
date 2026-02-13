// @vitest-environment node
import { describe, it, expect } from "vitest";
import { projectTimeline, type TimelineInput } from "../timeline";
import type { ObligationInput } from "../calculate";

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

function makeInput(overrides: Partial<TimelineInput> = {}): TimelineInput {
  return {
    obligations: [makeObligation()],
    fundBalances: [],
    currentFundBalance: 0,
    contributionPerCycle: 400,
    contributionCycleDays: 30,
    monthsAhead: 6,
    now: NOW,
    ...overrides,
  };
}

describe("projectTimeline", () => {
  describe("projection shows correct balance curve", () => {
    it("starts at the current fund balance", () => {
      const result = projectTimeline(makeInput({ currentFundBalance: 500 }));

      expect(result.dataPoints[0].projectedBalance).toBe(500);
      expect(result.dataPoints[0].date).toEqual(
        new Date("2025-03-01T00:00:00.000Z")
      );
    });

    it("increases balance on contribution dates", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [],
          currentFundBalance: 1000,
          contributionPerCycle: 200,
          contributionCycleDays: 30,
          monthsAhead: 2,
        })
      );

      // No expenses, only contributions
      expect(result.contributionMarkers.length).toBeGreaterThan(0);
      // Balance should increase over time
      const lastPoint = result.dataPoints[result.dataPoints.length - 1];
      expect(lastPoint.projectedBalance).toBeGreaterThan(1000);
    });

    it("decreases balance on expense dates", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              nextDueDate: new Date("2025-04-01"),
              amount: 1200,
            }),
          ],
          currentFundBalance: 2000,
          contributionPerCycle: 0,
          monthsAhead: 2,
        })
      );

      // Find the data point after the expense
      const afterExpense = result.dataPoints.find(
        (p) =>
          p.date.getTime() ===
          new Date("2025-04-01T00:00:00.000Z").getTime()
      );
      expect(afterExpense).toBeDefined();
      expect(afterExpense!.projectedBalance).toBe(2000 - 1200);
    });

    it("balances contributions and expenses over time", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              id: "obl-1",
              name: "Rent",
              amount: 600,
              nextDueDate: new Date("2025-04-01"),
              frequency: "monthly",
            }),
          ],
          currentFundBalance: 1000,
          contributionPerCycle: 400,
          contributionCycleDays: 30,
          monthsAhead: 3,
        })
      );

      // Should have both contributions and expenses
      expect(result.contributionMarkers.length).toBeGreaterThan(0);
      expect(result.expenseMarkers.length).toBeGreaterThan(0);
    });
  });

  describe("expense markers at correct dates", () => {
    it("places expense markers at recurring obligation due dates", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              nextDueDate: new Date("2025-04-01"),
              frequency: "monthly",
              amount: 500,
            }),
          ],
          monthsAhead: 3,
        })
      );

      // Should have markers at Apr 1, May 1, Jun 1 (approx, 30-day freq)
      expect(result.expenseMarkers.length).toBeGreaterThanOrEqual(3);
      expect(result.expenseMarkers[0].date).toEqual(
        new Date("2025-04-01T00:00:00.000Z")
      );
      expect(result.expenseMarkers[0].amount).toBe(500);
      expect(result.expenseMarkers[0].obligationName).toBe("Rent");
    });

    it("places expense marker for one-off obligations", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              type: "one_off",
              frequency: null,
              nextDueDate: new Date("2025-05-15"),
              amount: 3000,
            }),
          ],
          monthsAhead: 6,
        })
      );

      expect(result.expenseMarkers).toHaveLength(1);
      expect(result.expenseMarkers[0].date).toEqual(
        new Date("2025-05-15T00:00:00.000Z")
      );
      expect(result.expenseMarkers[0].amount).toBe(3000);
    });

    it("places expense markers for custom obligation entries", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              type: "custom",
              frequency: null,
              customEntries: [
                {
                  dueDate: new Date("2025-04-01"),
                  amount: 200,
                  isPaid: false,
                },
                {
                  dueDate: new Date("2025-06-01"),
                  amount: 300,
                  isPaid: false,
                },
                {
                  dueDate: new Date("2025-02-01"),
                  amount: 100,
                  isPaid: true,
                },
              ],
            }),
          ],
          monthsAhead: 6,
        })
      );

      // Should only include unpaid entries within window
      expect(result.expenseMarkers).toHaveLength(2);
      expect(result.expenseMarkers[0].amount).toBe(200);
      expect(result.expenseMarkers[1].amount).toBe(300);
    });

    it("excludes paused obligations", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [makeObligation({ isPaused: true })],
        })
      );

      expect(result.expenseMarkers).toHaveLength(0);
    });

    it("excludes inactive obligations", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [makeObligation({ isActive: false })],
        })
      );

      expect(result.expenseMarkers).toHaveLength(0);
    });

    it("stops recurring_with_end obligations at end date", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              type: "recurring_with_end",
              nextDueDate: new Date("2025-04-01"),
              endDate: new Date("2025-05-15"),
              frequency: "monthly",
              amount: 100,
            }),
          ],
          monthsAhead: 6,
        })
      );

      // Apr 1 is within range, May 1 (30 days later) is within end date, Jun would be past end date
      expect(result.expenseMarkers).toHaveLength(2);
    });
  });

  describe("crunch points detected", () => {
    it("detects crunch point when balance goes negative", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              nextDueDate: new Date("2025-04-01"),
              amount: 2000,
            }),
          ],
          currentFundBalance: 500,
          contributionPerCycle: 100,
          monthsAhead: 2,
        })
      );

      expect(result.crunchPoints.length).toBeGreaterThanOrEqual(1);
      const crunch = result.crunchPoints[0];
      expect(crunch.projectedBalance).toBeLessThan(0);
      expect(crunch.triggerObligationId).toBe("obl-1");
      expect(crunch.triggerObligationName).toBe("Rent");
    });

    it("detects crunch point when balance reaches exactly zero", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              type: "one_off",
              frequency: null,
              nextDueDate: new Date("2025-04-01"),
              amount: 500,
            }),
          ],
          currentFundBalance: 500,
          contributionPerCycle: 0,
          monthsAhead: 2,
        })
      );

      // Balance goes from 500 to 0 after the one-off expense
      expect(result.crunchPoints).toHaveLength(1);
      expect(result.crunchPoints[0].projectedBalance).toBe(0);
    });

    it("does not flag crunch when balance stays positive", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              nextDueDate: new Date("2025-04-01"),
              amount: 200,
            }),
          ],
          currentFundBalance: 5000,
          contributionPerCycle: 500,
          monthsAhead: 2,
        })
      );

      expect(result.crunchPoints).toHaveLength(0);
    });
  });

  describe("contribution markers", () => {
    it("generates contribution markers at cycle intervals", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [],
          contributionPerCycle: 300,
          contributionCycleDays: 30,
          monthsAhead: 3,
        })
      );

      // ~3 months = ~90 days, 30-day cycle = 3 contributions
      expect(result.contributionMarkers).toHaveLength(3);
      expect(result.contributionMarkers[0].amount).toBe(300);

      // First contribution is 30 days from start
      const expectedFirst = new Date("2025-03-31T00:00:00.000Z");
      expect(result.contributionMarkers[0].date).toEqual(expectedFirst);
    });

    it("generates no contribution markers when contribution is zero", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [],
          contributionPerCycle: 0,
          monthsAhead: 3,
        })
      );

      expect(result.contributionMarkers).toHaveLength(0);
    });
  });

  describe("time window", () => {
    it("defaults to 6 months", () => {
      const result = projectTimeline(
        makeInput({ monthsAhead: undefined })
      );

      const expectedEnd = new Date("2025-09-01T00:00:00.000Z");
      expect(result.endDate).toEqual(expectedEnd);
    });

    it("clamps to max 12 months", () => {
      const result = projectTimeline(makeInput({ monthsAhead: 24 }));

      const expectedEnd = new Date("2026-03-01T00:00:00.000Z");
      expect(result.endDate).toEqual(expectedEnd);
    });

    it("clamps to min 1 month", () => {
      const result = projectTimeline(makeInput({ monthsAhead: 0 }));

      const expectedEnd = new Date("2025-04-01T00:00:00.000Z");
      expect(result.endDate).toEqual(expectedEnd);
    });
  });

  describe("what-if overrides", () => {
    it("excludes obligations by ID", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              id: "obl-1",
              name: "Rent",
              amount: 1200,
            }),
            makeObligation({
              id: "obl-2",
              name: "Netflix",
              amount: 20,
              nextDueDate: new Date("2025-04-01"),
            }),
          ],
          overrides: {
            excludeObligationIds: ["obl-1"],
          },
        })
      );

      // Only Netflix should appear
      const obligationIds = result.expenseMarkers.map(
        (m) => m.obligationId
      );
      expect(obligationIds).not.toContain("obl-1");
      expect(obligationIds).toContain("obl-2");
    });

    it("applies amount overrides", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              id: "obl-1",
              amount: 1200,
              nextDueDate: new Date("2025-04-01"),
            }),
          ],
          overrides: {
            amountOverrides: { "obl-1": 1500 },
          },
          monthsAhead: 2,
        })
      );

      // All expense markers for obl-1 should use the overridden amount
      for (const marker of result.expenseMarkers) {
        expect(marker.amount).toBe(1500);
      }
    });

    it("includes hypothetical obligations", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [],
          overrides: {
            hypotheticalObligations: [
              makeObligation({
                id: "hyp-1",
                name: "Holiday",
                type: "one_off",
                frequency: null,
                amount: 5000,
                nextDueDate: new Date("2025-06-01"),
              }),
            ],
          },
          monthsAhead: 6,
        })
      );

      expect(result.expenseMarkers).toHaveLength(1);
      expect(result.expenseMarkers[0].obligationId).toBe("hyp-1");
      expect(result.expenseMarkers[0].amount).toBe(5000);
    });
  });

  describe("edge cases", () => {
    it("handles no obligations", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [],
          currentFundBalance: 1000,
          contributionPerCycle: 200,
          monthsAhead: 3,
        })
      );

      expect(result.expenseMarkers).toHaveLength(0);
      expect(result.crunchPoints).toHaveLength(0);
      // Balance only increases
      const lastPoint = result.dataPoints[result.dataPoints.length - 1];
      expect(lastPoint.projectedBalance).toBeGreaterThan(1000);
    });

    it("handles obligation due date before projection window", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              nextDueDate: new Date("2025-02-01"),
              frequency: "monthly",
              amount: 500,
            }),
          ],
          monthsAhead: 3,
        })
      );

      // Should advance past due date to find ones in the window
      // Feb 1 → Mar 3 → Apr 2 → May 2
      expect(result.expenseMarkers.length).toBeGreaterThan(0);
      for (const marker of result.expenseMarkers) {
        expect(marker.date.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
      }
    });

    it("includes an end date data point", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [],
          contributionPerCycle: 0,
          monthsAhead: 3,
        })
      );

      const lastPoint = result.dataPoints[result.dataPoints.length - 1];
      expect(lastPoint.date).toEqual(result.endDate);
    });

    it("handles multiple obligations on the same date", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              id: "obl-1",
              name: "Rent",
              type: "one_off",
              frequency: null,
              amount: 1000,
              nextDueDate: new Date("2025-04-01"),
            }),
            makeObligation({
              id: "obl-2",
              name: "Insurance",
              type: "one_off",
              frequency: null,
              amount: 500,
              nextDueDate: new Date("2025-04-01"),
            }),
          ],
          currentFundBalance: 2000,
          contributionPerCycle: 0,
          monthsAhead: 2,
        })
      );

      // Both expenses on the same date
      const apr1Markers = result.expenseMarkers.filter(
        (m) =>
          m.date.getTime() ===
          new Date("2025-04-01T00:00:00.000Z").getTime()
      );
      expect(apr1Markers).toHaveLength(2);

      // Balance should reflect both deductions
      const afterBoth = result.dataPoints.find(
        (p) =>
          p.date.getTime() ===
            new Date("2025-04-01T00:00:00.000Z").getTime() &&
          p.projectedBalance === 500
      );
      expect(afterBoth).toBeDefined();
    });

    it("defaults contributionCycleDays to 30 when null", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [],
          contributionPerCycle: 100,
          contributionCycleDays: null,
          monthsAhead: 2,
        })
      );

      // With 30-day cycle over ~2 months, expect 2 contributions
      expect(result.contributionMarkers).toHaveLength(2);
    });
  });
});
