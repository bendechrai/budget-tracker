// @vitest-environment node
import { describe, it, expect } from "vitest";
import { projectTimeline, calculateSteadyStatePerCycle, type TimelineInput } from "../timeline";
import type { ObligationInput, CycleConfig } from "../calculate";
import type { EscalationRule } from "../escalation";

function makeObligation(
  overrides: Partial<ObligationInput> = {}
): ObligationInput {
  return {
    id: "obl-1",
    name: "Rent",
    type: "recurring",
    amount: 1200,
    intervalUnit: "month",
    intervalCount: 1,
    nextDueDate: new Date("2025-04-01"),
    endDate: null,
    isPaused: false,
    isActive: true,
    fundGroupId: "fg-1",
    ...overrides,
  };
}

const NOW = new Date("2025-03-01");

const MONTHLY_CYCLE: CycleConfig = { type: "monthly", payDays: [1] };

function makeInput(overrides: Partial<TimelineInput> = {}): TimelineInput {
  return {
    obligations: [makeObligation()],
    fundGroupBalances: [],
    currentFundBalance: 0,
    cycleConfig: MONTHLY_CYCLE,
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
      // With an obligation, the derived contribution adds funds at each cycle date
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              amount: 600,
              nextDueDate: new Date("2025-04-01"),
            }),
          ],
          currentFundBalance: 1000,
          cycleConfig: MONTHLY_CYCLE,
          monthsAhead: 2,
        })
      );

      expect(result.contributionMarkers.length).toBeGreaterThan(0);
      // Each contribution event should add the derived per-cycle amount
      expect(result.contributionMarkers[0].amount).toBeGreaterThan(0);
    });

    it("decreases balance on expense dates", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              type: "one_off",
              intervalUnit: null,
              nextDueDate: new Date("2025-05-01"),
              amount: 1200,
            }),
          ],
          currentFundBalance: 2000,
          cycleConfig: { type: "monthly", payDays: [15] },
          monthsAhead: 3,
        })
      );

      // Expense on May 1, contributions on the 15th — no overlap
      // Balance before the expense should be higher than after
      const beforeExpense = result.dataPoints
        .filter((p) => p.date.getTime() < new Date("2025-05-01T00:00:00.000Z").getTime())
        .pop();
      const afterExpense = result.dataPoints.find(
        (p) =>
          p.date.getTime() ===
          new Date("2025-05-01T00:00:00.000Z").getTime()
      );
      expect(beforeExpense).toBeDefined();
      expect(afterExpense).toBeDefined();
      expect(afterExpense!.projectedBalance).toBeLessThan(beforeExpense!.projectedBalance);
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
              intervalUnit: "month",
            }),
          ],
          currentFundBalance: 1000,
          cycleConfig: MONTHLY_CYCLE,
          monthsAhead: 3,
        })
      );

      // Should have both contributions and expenses
      expect(result.contributionMarkers.length).toBeGreaterThan(0);
      expect(result.expenseMarkers.length).toBeGreaterThan(0);
    });
  });

  describe("steady-state contribution calculation", () => {
    it("derives per-cycle amount from total expenses / cycle count", () => {
      // $600/month obligation, 3-month window, monthly cycle → 3 expenses, 3 cycles
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              amount: 600,
              nextDueDate: new Date("2025-04-01"),
              intervalUnit: "month",
            }),
          ],
          cycleConfig: MONTHLY_CYCLE,
          monthsAhead: 3,
        })
      );

      // 3 expenses of $600 = $1800, 3 cycles → $600/cycle
      expect(result.contributionPerCycle).toBe(600);
      for (const marker of result.contributionMarkers) {
        expect(marker.amount).toBe(600);
      }
    });

    it("halves per-cycle amount for twice-monthly vs monthly obligations", () => {
      const obligation = makeObligation({
        amount: 1000,
        nextDueDate: new Date("2025-04-01"),
        intervalUnit: "month",
      });

      const monthly = projectTimeline(
        makeInput({
          obligations: [obligation],
          cycleConfig: { type: "monthly", payDays: [1] },
          monthsAhead: 6,
        })
      );

      const twiceMonthly = projectTimeline(
        makeInput({
          obligations: [obligation],
          cycleConfig: { type: "twice_monthly", payDays: [1, 15] },
          monthsAhead: 6,
        })
      );

      // Twice-monthly should have ~2x as many markers at ~half the amount
      expect(twiceMonthly.contributionMarkers.length).toBeGreaterThan(
        monthly.contributionMarkers.length
      );
      expect(twiceMonthly.contributionPerCycle).toBeCloseTo(
        monthly.contributionPerCycle / 2,
        0
      );
    });

    it("returns zero per-cycle when there are no expenses", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [],
          monthsAhead: 3,
        })
      );

      expect(result.contributionPerCycle).toBe(0);
      expect(result.contributionMarkers).toHaveLength(0);
    });

    it("end balance returns to start balance for recurring obligations", () => {
      // With steady-state contributions exactly matching expenses,
      // the end balance should equal the start balance
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              amount: 500,
              nextDueDate: new Date("2025-04-01"),
              intervalUnit: "month",
            }),
          ],
          currentFundBalance: 1000,
          cycleConfig: MONTHLY_CYCLE,
          monthsAhead: 6,
        })
      );

      const lastPoint = result.dataPoints[result.dataPoints.length - 1];
      expect(lastPoint.projectedBalance).toBeCloseTo(1000, 0);
    });
  });

  describe("expense markers at correct dates", () => {
    it("places expense markers at recurring obligation due dates", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              nextDueDate: new Date("2025-04-01"),
              intervalUnit: "month",
              amount: 500,
            }),
          ],
          monthsAhead: 3,
        })
      );

      // Should have markers at Apr 1, May 1, Jun 1 (calendar months)
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
              intervalUnit: null,
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
              intervalUnit: null,
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
              intervalUnit: "month",
              amount: 100,
            }),
          ],
          monthsAhead: 6,
        })
      );

      // Apr 1 is within range, May 1 (+1 month) is within end date, Jun 1 would be past end date
      expect(result.expenseMarkers).toHaveLength(2);
    });
  });

  describe("crunch points detected", () => {
    it("detects crunch point when balance goes negative", () => {
      // One-off expense exceeds per-cycle contribution, so balance goes negative
      // even after the contribution processes first on the same date
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              type: "one_off",
              intervalUnit: null,
              nextDueDate: new Date("2025-04-01"),
              amount: 3000,
            }),
          ],
          currentFundBalance: 0,
          monthsAhead: 2,
        })
      );

      // contributionPerCycle = 3000 / 2 = 1500
      // Apr 1: +1500 → 1500, -3000 → -1500
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
              intervalUnit: null,
              nextDueDate: new Date("2025-04-01"),
              amount: 1000,
            }),
          ],
          // contribution = 1000/2 = 500; Apr 1: 500 + 500 - 1000 = 0
          currentFundBalance: 500,
          monthsAhead: 2,
        })
      );

      // Balance reaches exactly 0 after contribution + expense
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
          monthsAhead: 2,
        })
      );

      expect(result.crunchPoints).toHaveLength(0);
    });
  });

  describe("minProjectedBalance", () => {
    it("returns the minimum projected balance across all data points", () => {
      // One-off expense exceeds per-cycle contribution, so balance goes negative
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              type: "one_off",
              intervalUnit: null,
              nextDueDate: new Date("2025-04-01"),
              amount: 3000,
            }),
          ],
          currentFundBalance: 0,
          monthsAhead: 2,
        })
      );

      // contributionPerCycle = 3000/2 = 1500; Apr 1: +1500 -3000 = -1500
      expect(result.minProjectedBalance).toBeLessThan(0);
      expect(result.minProjectedBalance).toBe(
        Math.min(...result.dataPoints.map((dp) => dp.projectedBalance))
      );
    });

    it("returns non-negative value when balance never goes negative", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              nextDueDate: new Date("2025-04-01"),
              amount: 200,
            }),
          ],
          currentFundBalance: 5000,
          monthsAhead: 2,
        })
      );

      expect(result.minProjectedBalance).toBeGreaterThanOrEqual(0);
    });

    it("equals starting balance when there are no obligations", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [],
          currentFundBalance: 1000,
          monthsAhead: 3,
        })
      );

      expect(result.minProjectedBalance).toBe(1000);
    });
  });

  describe("contribution markers", () => {
    it("generates contribution markers at cycle intervals", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              amount: 900,
              nextDueDate: new Date("2025-04-01"),
              intervalUnit: "month",
            }),
          ],
          cycleConfig: MONTHLY_CYCLE,
          monthsAhead: 3,
        })
      );

      // Monthly on the 1st, start=Mar 1: contributions at Apr 1, May 1, Jun 1
      expect(result.contributionMarkers).toHaveLength(3);
      // 3 expenses of $900 / 3 cycles = $900/cycle
      expect(result.contributionMarkers[0].amount).toBe(900);

      // First contribution is on the next pay date after start
      const expectedFirst = new Date("2025-04-01T00:00:00.000Z");
      expect(result.contributionMarkers[0].date).toEqual(expectedFirst);
    });

    it("generates no contribution markers when there are no expenses", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [],
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
                intervalUnit: null,
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
          monthsAhead: 3,
        })
      );

      expect(result.expenseMarkers).toHaveLength(0);
      expect(result.crunchPoints).toHaveLength(0);
      // No expenses means no contributions — balance stays the same
      const lastPoint = result.dataPoints[result.dataPoints.length - 1];
      expect(lastPoint.projectedBalance).toBe(1000);
    });

    it("handles obligation due date before projection window", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              nextDueDate: new Date("2025-02-01"),
              intervalUnit: "month",
              amount: 500,
            }),
          ],
          monthsAhead: 3,
        })
      );

      // Should advance past due date to find ones in the window
      // Feb 1 → Mar 1 → Apr 1 → May 1 (calendar months)
      expect(result.expenseMarkers.length).toBeGreaterThan(0);
      for (const marker of result.expenseMarkers) {
        expect(marker.date.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
      }
    });

    it("includes an end date data point", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [],
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
              intervalUnit: null,
              amount: 1000,
              nextDueDate: new Date("2025-04-01"),
            }),
            makeObligation({
              id: "obl-2",
              name: "Insurance",
              type: "one_off",
              intervalUnit: null,
              amount: 500,
              nextDueDate: new Date("2025-04-01"),
            }),
          ],
          currentFundBalance: 2000,
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

      // Contributions process before expenses on the same date
      // contributionPerCycle = 1500/2 = 750
      // Apr 1: +750 → 2750, -1000 → 1750, -500 → 1250
      const apr1Points = result.dataPoints.filter(
        (p) =>
          p.date.getTime() ===
          new Date("2025-04-01T00:00:00.000Z").getTime()
      );
      // Last data point at Apr 1 reflects all events
      const lastApr1 = apr1Points[apr1Points.length - 1];
      expect(lastApr1.projectedBalance).toBe(1250);
    });

    it("places contribution markers at actual cycle dates for twice_monthly", () => {
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              amount: 400,
              nextDueDate: new Date("2025-04-01"),
              intervalUnit: "month",
            }),
          ],
          cycleConfig: { type: "twice_monthly", payDays: [1, 15] },
          monthsAhead: 2,
          now: new Date("2025-03-01"),
        })
      );

      // Mar 1 is start (excluded), next pay dates: Mar 15, Apr 1, Apr 15, May 1
      expect(result.contributionMarkers).toHaveLength(4);
      expect(result.contributionMarkers[0].date).toEqual(
        new Date("2025-03-15T00:00:00.000Z")
      );
      expect(result.contributionMarkers[1].date).toEqual(
        new Date("2025-04-01T00:00:00.000Z")
      );
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
              intervalUnit: "month",
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
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              id: "obl-rent",
              name: "Rent",
              amount: 500,
              intervalUnit: "month",
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
          now: ESCALATION_NOW,
          monthsAhead: 6,
        })
      );

      const expenseAmounts = result.expenseMarkers.map((m) => m.amount);
      const preEsc = expenseAmounts.filter((a) => a === 500);
      const postEsc = expenseAmounts.filter((a) => a === 800);
      expect(preEsc.length).toBeGreaterThan(0);
      expect(postEsc.length).toBeGreaterThan(0);

      // With steady-state contributions, end balance should return to start
      const lastPoint = result.dataPoints[result.dataPoints.length - 1];
      expect(lastPoint.projectedBalance).toBeCloseTo(5000, 0);
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
              intervalUnit: "month",
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

      // After June 1 escalation (before Sep 1), amounts should be ~1210
      const juneToAug = result.expenseMarkers.filter(
        (m) =>
          m.date >= new Date("2025-06-01T00:00:00.000Z") &&
          m.date < new Date("2025-09-01T00:00:00.000Z")
      );
      expect(juneToAug.length).toBeGreaterThan(0);
      for (const marker of juneToAug) {
        expect(marker.amount).toBeCloseTo(1210, 0);
      }

      // After Sep 1 escalation, amounts should be ~1331
      const sepOnward = result.expenseMarkers.filter(
        (m) => m.date >= new Date("2025-09-01T00:00:00.000Z")
      );
      for (const marker of sepOnward) {
        expect(marker.amount).toBeCloseTo(1331, 0);
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
              intervalUnit: "month",
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
              intervalUnit: "month",
              nextDueDate: new Date("2025-02-01"),
              // no escalationRules
            }),
          ],
          now: ESCALATION_NOW,
          monthsAhead: 4,
        })
      );

      for (const marker of result.expenseMarkers) {
        expect(marker.amount).toBe(1000);
      }
    });

    it("crunch point detection uses escalated amounts", () => {
      // Base $100/month with escalation to $5000 on Apr 1.
      // Expenses fall on the 5th; contributions on the 15th.
      // Starting balance of $200 easily covers the $100 base expenses
      // but the $5000 escalated amounts eventually drain the fund,
      // causing a crunch in June that wouldn't happen at the base rate.
      const result = projectTimeline(
        makeInput({
          obligations: [
            makeObligation({
              id: "obl-rent",
              name: "Rent",
              amount: 100,
              intervalUnit: "month",
              nextDueDate: new Date("2025-01-05"),
              escalationRules: [
                makeEscalationRule({
                  changeType: "absolute",
                  value: 5000,
                  effectiveDate: new Date("2025-04-01"),
                }),
              ],
            }),
          ],
          currentFundBalance: 200,
          cycleConfig: { type: "monthly", payDays: [15] },
          now: ESCALATION_NOW,
          monthsAhead: 6,
        })
      );

      // The escalated $5000 expenses outpace the averaged contribution,
      // causing the balance to go negative in June
      expect(result.crunchPoints.length).toBeGreaterThanOrEqual(1);
      const crunch = result.crunchPoints[0];
      expect(crunch.projectedBalance).toBeLessThan(0);
      expect(crunch.triggerObligationId).toBe("obl-rent");
    });
  });

  describe("calculateSteadyStatePerCycle", () => {
    it("returns total expenses divided by cycle count", () => {
      const perCycle = calculateSteadyStatePerCycle({
        obligations: [
          makeObligation({
            amount: 600,
            nextDueDate: new Date("2025-04-01"),
            intervalUnit: "month",
          }),
        ],
        cycleConfig: MONTHLY_CYCLE,
        monthsAhead: 6,
        now: NOW,
      });

      // 6 expenses of $600 / 6 monthly cycles = $600
      expect(perCycle).toBe(600);
    });

    it("halves amount for twice-monthly contributions", () => {
      const perCycle = calculateSteadyStatePerCycle({
        obligations: [
          makeObligation({
            amount: 1000,
            nextDueDate: new Date("2025-04-01"),
            intervalUnit: "month",
          }),
        ],
        cycleConfig: { type: "twice_monthly", payDays: [1, 15] },
        monthsAhead: 6,
        now: NOW,
      });

      // 6 expenses of $1000 / 12 twice-monthly cycles ≈ $500
      expect(perCycle).toBeCloseTo(500, 0);
    });

    it("returns zero when there are no obligations", () => {
      const perCycle = calculateSteadyStatePerCycle({
        obligations: [],
        cycleConfig: MONTHLY_CYCLE,
        now: NOW,
      });

      expect(perCycle).toBe(0);
    });
  });
});
