// @vitest-environment node
import { describe, it, expect } from "vitest";
import { projectTimeline, type TimelineInput } from "../timeline";
import type { ObligationInput } from "../calculate";
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

  describe("escalation integration", () => {
    const ESCALATION_NOW = new Date("2025-01-01");

    function makeEscalationRule(
      overrides: Partial<EscalationRule> = {}
    ): EscalationRule {
      return {
        id: "esc-1",
        changeType: "absolute",
        value: 2200,
        effectiveDate: new Date("2025-04-01"),
        intervalMonths: null,
        isApplied: false,
        ...overrides,
      };
    }

    it("shows higher expense markers after escalation date", () => {
      // Rent is $1000/month, escalates to $1200 absolute on April 1
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              id: "obl-rent",
              name: "Rent",
              amount: 1000,
              frequency: "monthly",
              nextDueDate: new Date("2025-02-01"),
              escalationRules: [
                makeEscalationRule({
                  changeType: "absolute",
                  value: 1200,
                  effectiveDate: new Date("2025-04-01"),
                }),
              ],
            }),
          ],
          currentFundBalance: 10000,
          contributionPerCycle: 0,
          now: ESCALATION_NOW,
          monthsAhead: 6,
        })
      );

      // Find markers before and after the escalation date
      const beforeEscalation = result.expenseMarkers.filter(
        (m) => m.date < new Date("2025-04-01T00:00:00.000Z")
      );
      const afterEscalation = result.expenseMarkers.filter(
        (m) => m.date >= new Date("2025-04-01T00:00:00.000Z")
      );

      expect(beforeEscalation.length).toBeGreaterThan(0);
      expect(afterEscalation.length).toBeGreaterThan(0);

      // Before escalation: base amount
      for (const marker of beforeEscalation) {
        expect(marker.amount).toBe(1000);
      }
      // After escalation: escalated amount
      for (const marker of afterEscalation) {
        expect(marker.amount).toBe(1200);
      }
    });

    it("balance curve reflects stepped amounts from escalation", () => {
      // Rent is $500/month, escalates to $800 on April 1
      // Start with $5000, no contributions
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              id: "obl-rent",
              name: "Rent",
              amount: 500,
              frequency: "monthly",
              nextDueDate: new Date("2025-02-01"),
              escalationRules: [
                makeEscalationRule({
                  changeType: "absolute",
                  value: 800,
                  effectiveDate: new Date("2025-04-01"),
                }),
              ],
            }),
          ],
          currentFundBalance: 5000,
          contributionPerCycle: 0,
          now: ESCALATION_NOW,
          monthsAhead: 6,
        })
      );

      // Verify the balance drops more steeply after escalation
      // Feb: 5000-500=4500, Mar: 4500-500=4000 (next ~30 days)
      // Apr: 4000-800=3200, May: 3200-800=2400
      const expenseAmounts = result.expenseMarkers.map((m) => m.amount);
      const preEsc = expenseAmounts.filter((a) => a === 500);
      const postEsc = expenseAmounts.filter((a) => a === 800);
      expect(preEsc.length).toBeGreaterThan(0);
      expect(postEsc.length).toBeGreaterThan(0);

      // The final balance should be lower than if we used $500 the whole time
      const lastPoint = result.dataPoints[result.dataPoints.length - 1];
      const totalExpenses = result.expenseMarkers.reduce((s, m) => s + m.amount, 0);
      expect(lastPoint.projectedBalance).toBe(5000 - totalExpenses);
    });

    it("handles recurring percentage escalation across multiple due dates", () => {
      // Rent is $1000/month, goes up 10% every 3 months starting March 1
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              id: "obl-rent",
              name: "Rent",
              amount: 1000,
              frequency: "monthly",
              nextDueDate: new Date("2025-02-01"),
              escalationRules: [
                makeEscalationRule({
                  changeType: "percentage",
                  value: 10,
                  effectiveDate: new Date("2025-03-01"),
                  intervalMonths: 3,
                }),
              ],
            }),
          ],
          currentFundBalance: 50000,
          contributionPerCycle: 0,
          now: ESCALATION_NOW,
          monthsAhead: 8,
        })
      );

      // Feb: $1000 (before first escalation)
      // Mar 1 escalation: 1000 * 1.1 = 1100
      // Mar-May markers: $1100
      // Jun 1 escalation: 1100 * 1.1 = 1210
      // Jun+ markers: $1210
      const feb = result.expenseMarkers.find(
        (m) => m.date.getTime() === new Date("2025-02-01T00:00:00.000Z").getTime()
      );
      expect(feb?.amount).toBe(1000);

      // After March 1 escalation (but before June 1), amounts should be ~1100
      const marchToMay = result.expenseMarkers.filter(
        (m) =>
          m.date >= new Date("2025-03-01T00:00:00.000Z") &&
          m.date < new Date("2025-06-01T00:00:00.000Z")
      );
      for (const marker of marchToMay) {
        expect(marker.amount).toBeCloseTo(1100, 0);
      }

      // After June 1 escalation, amounts should be ~1210
      const juneOnward = result.expenseMarkers.filter(
        (m) => m.date >= new Date("2025-06-01T00:00:00.000Z")
      );
      expect(juneOnward.length).toBeGreaterThan(0);
      for (const marker of juneOnward) {
        expect(marker.amount).toBeCloseTo(1210, 0);
      }
    });

    it("escalation does not apply when amountOverride is set", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              id: "obl-rent",
              name: "Rent",
              amount: 1000,
              frequency: "monthly",
              nextDueDate: new Date("2025-02-01"),
              escalationRules: [
                makeEscalationRule({
                  changeType: "absolute",
                  value: 1500,
                  effectiveDate: new Date("2025-03-01"),
                }),
              ],
            }),
          ],
          overrides: {
            amountOverrides: { "obl-rent": 2000 },
          },
          now: ESCALATION_NOW,
          monthsAhead: 4,
        })
      );

      // All markers should use the what-if override, not escalation
      for (const marker of result.expenseMarkers) {
        expect(marker.amount).toBe(2000);
      }
    });

    it("obligation without escalation rules uses base amount", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              id: "obl-rent",
              name: "Rent",
              amount: 1000,
              frequency: "monthly",
              nextDueDate: new Date("2025-02-01"),
              // no escalationRules
            }),
          ],
          contributionPerCycle: 0,
          now: ESCALATION_NOW,
          monthsAhead: 4,
        })
      );

      for (const marker of result.expenseMarkers) {
        expect(marker.amount).toBe(1000);
      }
    });

    it("crunch point detection uses escalated amounts", () => {
      // Start with $2500, rent is $1000 but jumps to $2000 in April
      // Without escalation: Feb $1000, Mar ~$1000 → balance stays positive
      // With escalation: Apr $2000 → balance goes negative
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              id: "obl-rent",
              name: "Rent",
              amount: 1000,
              frequency: "monthly",
              nextDueDate: new Date("2025-02-01"),
              escalationRules: [
                makeEscalationRule({
                  changeType: "absolute",
                  value: 2000,
                  effectiveDate: new Date("2025-04-01"),
                }),
              ],
            }),
          ],
          currentFundBalance: 2500,
          contributionPerCycle: 0,
          now: ESCALATION_NOW,
          monthsAhead: 6,
        })
      );

      // Feb: 2500-1000=1500, Mar: 1500-1000=500, Apr: 500-2000=-1500
      expect(result.crunchPoints.length).toBeGreaterThanOrEqual(1);
      const crunch = result.crunchPoints[0];
      expect(crunch.projectedBalance).toBeLessThan(0);
      expect(crunch.triggerObligationId).toBe("obl-rent");
    });
  });
});
