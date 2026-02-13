// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  projectEscalatedAmounts,
  getAmountAtDate,
  type EscalationRule,
  type EscalationProjectionInput,
} from "../escalation";

const WINDOW_START = new Date("2026-01-01");

function makeRule(overrides: Partial<EscalationRule> = {}): EscalationRule {
  return {
    id: "esc-1",
    changeType: "absolute",
    value: 2200,
    effectiveDate: new Date("2026-07-01"),
    intervalMonths: null,
    isApplied: false,
    ...overrides,
  };
}

describe("projectEscalatedAmounts", () => {
  describe("one-off absolute", () => {
    it("projects a single absolute change at the effective date", () => {
      const result = projectEscalatedAmounts({
        currentAmount: 2000,
        rules: [
          makeRule({
            changeType: "absolute",
            value: 2200,
            effectiveDate: new Date("2026-07-01"),
          }),
        ],
        windowStart: WINDOW_START,
        monthsAhead: 12,
      });

      expect(result).toHaveLength(1);
      expect(result[0].date).toEqual(new Date("2026-07-01T00:00:00.000Z"));
      expect(result[0].amount).toBe(2200);
    });
  });

  describe("one-off percentage", () => {
    it("projects a percentage increase at the effective date", () => {
      const result = projectEscalatedAmounts({
        currentAmount: 1000,
        rules: [
          makeRule({
            changeType: "percentage",
            value: 8,
            effectiveDate: new Date("2026-03-01"),
          }),
        ],
        windowStart: WINDOW_START,
        monthsAhead: 12,
      });

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBeCloseTo(1080, 2);
    });
  });

  describe("one-off fixed increase", () => {
    it("projects a fixed dollar increase at the effective date", () => {
      const result = projectEscalatedAmounts({
        currentAmount: 14.99,
        rules: [
          makeRule({
            changeType: "fixed_increase",
            value: 3,
            effectiveDate: new Date("2026-02-01"),
          }),
        ],
        windowStart: WINDOW_START,
        monthsAhead: 12,
      });

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBeCloseTo(17.99, 2);
    });
  });

  describe("recurring percentage over multiple intervals", () => {
    it("projects percentage increases at each interval", () => {
      const result = projectEscalatedAmounts({
        currentAmount: 2000,
        rules: [
          makeRule({
            id: "esc-recurring",
            changeType: "percentage",
            value: 3,
            effectiveDate: new Date("2026-07-01"),
            intervalMonths: 12,
          }),
        ],
        windowStart: WINDOW_START,
        monthsAhead: 24,
      });

      // Should have two occurrences: July 2026 and July 2027
      expect(result).toHaveLength(2);
      expect(result[0].date).toEqual(new Date("2026-07-01T00:00:00.000Z"));
      expect(result[0].amount).toBeCloseTo(2060, 2); // 2000 * 1.03
      expect(result[1].date).toEqual(new Date("2027-07-01T00:00:00.000Z"));
      expect(result[1].amount).toBeCloseTo(2121.8, 1); // 2060 * 1.03
    });
  });

  describe("recurring fixed increase over multiple intervals", () => {
    it("projects fixed increases at each interval", () => {
      const result = projectEscalatedAmounts({
        currentAmount: 2000,
        rules: [
          makeRule({
            id: "esc-recurring",
            changeType: "fixed_increase",
            value: 50,
            effectiveDate: new Date("2026-07-01"),
            intervalMonths: 12,
          }),
        ],
        windowStart: WINDOW_START,
        monthsAhead: 24,
      });

      expect(result).toHaveLength(2);
      expect(result[0].amount).toBe(2050); // 2000 + 50
      expect(result[1].amount).toBe(2100); // 2050 + 50
    });
  });

  describe("combined one-off + recurring", () => {
    it("applies both a one-off and recurring rule", () => {
      const result = projectEscalatedAmounts({
        currentAmount: 2000,
        rules: [
          // One-off: rent goes to $2200 in July 2026
          makeRule({
            id: "esc-oneoff",
            changeType: "absolute",
            value: 2200,
            effectiveDate: new Date("2026-07-01"),
            intervalMonths: null,
          }),
          // Recurring: 3% annual increase starting July 2027
          makeRule({
            id: "esc-recurring",
            changeType: "percentage",
            value: 3,
            effectiveDate: new Date("2027-07-01"),
            intervalMonths: 12,
          }),
        ],
        windowStart: WINDOW_START,
        monthsAhead: 24,
      });

      expect(result).toHaveLength(2);
      // July 2026: one-off sets to $2200
      expect(result[0].amount).toBe(2200);
      // July 2027: 3% increase on $2200 = $2266
      expect(result[1].amount).toBeCloseTo(2266, 0);
    });
  });

  describe("one-off precedence on same date", () => {
    it("applies one-off instead of recurring when both fall on same date", () => {
      const result = projectEscalatedAmounts({
        currentAmount: 2000,
        rules: [
          // One-off: set to $2500 on July 2026
          makeRule({
            id: "esc-oneoff",
            changeType: "absolute",
            value: 2500,
            effectiveDate: new Date("2026-07-01"),
            intervalMonths: null,
          }),
          // Recurring: 3% every July starting July 2026
          makeRule({
            id: "esc-recurring",
            changeType: "percentage",
            value: 3,
            effectiveDate: new Date("2026-07-01"),
            intervalMonths: 12,
          }),
        ],
        windowStart: WINDOW_START,
        monthsAhead: 24,
      });

      // July 2026: one-off absolute to $2500 (recurring 3% is skipped)
      expect(result[0].date).toEqual(new Date("2026-07-01T00:00:00.000Z"));
      expect(result[0].amount).toBe(2500);

      // July 2027: recurring resumes, 3% on $2500 = $2575
      expect(result[1].date).toEqual(new Date("2027-07-01T00:00:00.000Z"));
      expect(result[1].amount).toBeCloseTo(2575, 0);
    });
  });

  describe("skips applied one-off rules", () => {
    it("does not re-apply a one-off rule that has already been applied", () => {
      const result = projectEscalatedAmounts({
        currentAmount: 2200, // already updated from the applied rule
        rules: [
          makeRule({
            id: "esc-applied",
            changeType: "absolute",
            value: 2200,
            effectiveDate: new Date("2026-03-01"),
            intervalMonths: null,
            isApplied: true,
          }),
        ],
        windowStart: WINDOW_START,
        monthsAhead: 12,
      });

      expect(result).toHaveLength(0);
    });
  });

  describe("empty rules", () => {
    it("returns empty array when no rules exist", () => {
      const result = projectEscalatedAmounts({
        currentAmount: 2000,
        rules: [],
        windowStart: WINDOW_START,
        monthsAhead: 12,
      });

      expect(result).toHaveLength(0);
    });
  });

  describe("rule outside window", () => {
    it("excludes rules whose effective date is outside the window", () => {
      const result = projectEscalatedAmounts({
        currentAmount: 2000,
        rules: [
          makeRule({
            effectiveDate: new Date("2028-01-01"), // beyond 12-month window
          }),
        ],
        windowStart: WINDOW_START,
        monthsAhead: 12,
      });

      expect(result).toHaveLength(0);
    });
  });

  describe("past recurring occurrences", () => {
    it("replays past recurring occurrences to compute correct starting amount", () => {
      // Recurring 3% starting July 2025 — one occurrence has passed by Jan 2026
      const result = projectEscalatedAmounts({
        currentAmount: 2000, // base amount (recurring never persisted)
        rules: [
          makeRule({
            id: "esc-recurring",
            changeType: "percentage",
            value: 3,
            effectiveDate: new Date("2025-07-01"),
            intervalMonths: 12,
          }),
        ],
        windowStart: WINDOW_START, // Jan 2026
        monthsAhead: 12,
      });

      // One past occurrence (July 2025): 2000 * 1.03 = 2060 is the effective amount
      // Next occurrence July 2026: 2060 * 1.03 = 2121.80
      expect(result).toHaveLength(1);
      expect(result[0].date).toEqual(new Date("2026-07-01T00:00:00.000Z"));
      expect(result[0].amount).toBeCloseTo(2121.8, 1);
    });
  });

  describe("multiple one-off rules", () => {
    it("handles multiple one-off rules on different dates", () => {
      const result = projectEscalatedAmounts({
        currentAmount: 1000,
        rules: [
          makeRule({
            id: "esc-1",
            changeType: "fixed_increase",
            value: 50,
            effectiveDate: new Date("2026-03-01"),
          }),
          makeRule({
            id: "esc-2",
            changeType: "fixed_increase",
            value: 100,
            effectiveDate: new Date("2026-06-01"),
          }),
        ],
        windowStart: WINDOW_START,
        monthsAhead: 12,
      });

      expect(result).toHaveLength(2);
      expect(result[0].amount).toBe(1050); // 1000 + 50
      expect(result[1].amount).toBe(1150); // 1050 + 100
    });
  });
});

describe("getAmountAtDate", () => {
  it("returns current amount when no rules apply before target date", () => {
    const amount = getAmountAtDate(
      {
        currentAmount: 2000,
        rules: [
          makeRule({
            effectiveDate: new Date("2026-12-01"),
          }),
        ],
        windowStart: WINDOW_START,
        monthsAhead: 12,
      },
      new Date("2026-06-01"),
    );

    expect(amount).toBe(2000);
  });

  it("returns escalated amount after a one-off change", () => {
    const amount = getAmountAtDate(
      {
        currentAmount: 2000,
        rules: [
          makeRule({
            changeType: "absolute",
            value: 2200,
            effectiveDate: new Date("2026-07-01"),
          }),
        ],
        windowStart: WINDOW_START,
        monthsAhead: 12,
      },
      new Date("2026-09-01"),
    );

    expect(amount).toBe(2200);
  });

  it("returns correct amount between two escalation events", () => {
    const input: EscalationProjectionInput = {
      currentAmount: 1000,
      rules: [
        makeRule({
          id: "esc-1",
          changeType: "fixed_increase",
          value: 100,
          effectiveDate: new Date("2026-03-01"),
        }),
        makeRule({
          id: "esc-2",
          changeType: "fixed_increase",
          value: 200,
          effectiveDate: new Date("2026-09-01"),
        }),
      ],
      windowStart: WINDOW_START,
      monthsAhead: 12,
    };

    // Before first escalation
    expect(getAmountAtDate(input, new Date("2026-02-15"))).toBe(1000);
    // After first, before second
    expect(getAmountAtDate(input, new Date("2026-06-01"))).toBe(1100);
    // After second
    expect(getAmountAtDate(input, new Date("2026-10-01"))).toBe(1300);
  });
});
