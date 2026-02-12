import { describe, it, expect } from "vitest";
import { detectPatterns, detectFrequency, type ExistingPattern } from "../detect";
import type { TransactionRecord } from "../vendorMatch";

function makeTxn(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: "txn-" + Math.random().toString(36).slice(2, 8),
    date: new Date(2025, 0, 15),
    description: "Netflix Subscription",
    amount: 22.99,
    type: "debit",
    ...overrides,
  };
}

/** Create a series of monthly transactions for a given vendor. */
function makeMonthlyTransactions(
  description: string,
  amount: number,
  type: "credit" | "debit",
  count: number,
  startMonth = 0
): TransactionRecord[] {
  return Array.from({ length: count }, (_, i) =>
    makeTxn({
      id: `txn-${description.toLowerCase().replace(/\s/g, "-")}-${i}`,
      date: new Date(2025, startMonth + i, 15),
      description,
      amount,
      type,
    })
  );
}

describe("detectFrequency", () => {
  it("detects weekly frequency", () => {
    const txns = Array.from({ length: 5 }, (_, i) =>
      makeTxn({ date: new Date(2025, 0, 1 + i * 7) })
    );
    expect(detectFrequency(txns)).toBe("weekly");
  });

  it("detects fortnightly frequency", () => {
    const txns = Array.from({ length: 4 }, (_, i) =>
      makeTxn({ date: new Date(2025, 0, 1 + i * 14) })
    );
    expect(detectFrequency(txns)).toBe("fortnightly");
  });

  it("detects monthly frequency", () => {
    const txns = makeMonthlyTransactions("Test", 10, "debit", 4);
    expect(detectFrequency(txns)).toBe("monthly");
  });

  it("detects quarterly frequency", () => {
    const txns = [0, 3, 6, 9].map((m) =>
      makeTxn({ date: new Date(2025, m, 15) })
    );
    expect(detectFrequency(txns)).toBe("quarterly");
  });

  it("detects annual frequency", () => {
    const txns = [
      makeTxn({ date: new Date(2023, 6, 1) }),
      makeTxn({ date: new Date(2024, 6, 1) }),
      makeTxn({ date: new Date(2025, 6, 1) }),
    ];
    expect(detectFrequency(txns)).toBe("annual");
  });

  it("returns irregular for single transaction", () => {
    const txns = [makeTxn()];
    expect(detectFrequency(txns)).toBe("irregular");
  });

  it("returns irregular for unrecognizable intervals", () => {
    const txns = [
      makeTxn({ date: new Date(2025, 0, 1) }),
      makeTxn({ date: new Date(2025, 0, 22) }), // 21-day interval
    ];
    expect(detectFrequency(txns)).toBe("irregular");
  });
});

describe("detectPatterns", () => {
  it("detects a monthly subscription", () => {
    const txns = makeMonthlyTransactions("Netflix", 22.99, "debit", 4);

    const patterns = detectPatterns(txns, []);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].vendorPattern).toBe("Netflix");
    expect(patterns[0].type).toBe("expense");
    expect(patterns[0].detectedAmount).toBe(22.99);
    expect(patterns[0].detectedFrequency).toBe("monthly");
    expect(patterns[0].matchingTransactionCount).toBe(4);
    expect(patterns[0].transactionIds).toHaveLength(4);
  });

  it("detects an income pattern from credit transactions", () => {
    const txns = makeMonthlyTransactions("EMPLOYER PTY LTD", 5000, "credit", 6);

    const patterns = detectPatterns(txns, []);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe("income");
    expect(patterns[0].detectedAmount).toBe(5000);
    expect(patterns[0].detectedFrequency).toBe("monthly");
  });

  it("detects variable-amount pattern with min/max", () => {
    const txns = [
      makeTxn({ id: "txn-1", description: "Electricity Corp", amount: 120, type: "debit", date: new Date(2025, 0, 15) }),
      makeTxn({ id: "txn-2", description: "Electricity Corp", amount: 180, type: "debit", date: new Date(2025, 3, 15) }),
      makeTxn({ id: "txn-3", description: "Electricity Corp", amount: 95, type: "debit", date: new Date(2025, 6, 15) }),
      makeTxn({ id: "txn-4", description: "Electricity Corp", amount: 150, type: "debit", date: new Date(2025, 9, 15) }),
    ];

    const patterns = detectPatterns(txns, []);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].detectedAmountMin).toBe(95);
    expect(patterns[0].detectedAmountMax).toBe(180);
    expect(patterns[0].detectedFrequency).toBe("quarterly");
  });

  it("excludes groups with fewer than 2 transactions", () => {
    const txns = [makeTxn({ description: "One Time Purchase" })];

    const patterns = detectPatterns(txns, []);

    expect(patterns).toHaveLength(0);
  });

  it("excludes already-tracked income sources", () => {
    const txns = makeMonthlyTransactions("Employer", 5000, "credit", 4);
    const existing: ExistingPattern[] = [
      { name: "Employer", amount: 5000, type: "income" },
    ];

    const patterns = detectPatterns(txns, existing);

    expect(patterns).toHaveLength(0);
  });

  it("excludes already-tracked obligations", () => {
    const txns = makeMonthlyTransactions("Netflix", 22.99, "debit", 4);
    const existing: ExistingPattern[] = [
      { name: "Netflix", amount: 22.99, type: "expense" },
    ];

    const patterns = detectPatterns(txns, existing);

    expect(patterns).toHaveLength(0);
  });

  it("does not exclude when vendor is similar but type differs", () => {
    const txns = makeMonthlyTransactions("Netflix", 22.99, "debit", 4);
    const existing: ExistingPattern[] = [
      { name: "Netflix", amount: 22.99, type: "income" },
    ];

    const patterns = detectPatterns(txns, existing);

    expect(patterns).toHaveLength(1);
  });

  it("does not exclude when amount differs significantly", () => {
    const txns = makeMonthlyTransactions("Netflix", 50, "debit", 4);
    const existing: ExistingPattern[] = [
      { name: "Netflix", amount: 22.99, type: "expense" },
    ];

    const patterns = detectPatterns(txns, existing);

    expect(patterns).toHaveLength(1);
  });

  it("detects multiple patterns from mixed transactions", () => {
    const netflixTxns = makeMonthlyTransactions("Netflix", 22.99, "debit", 3);
    const salaryTxns = makeMonthlyTransactions("ACME Corp Salary", 5000, "credit", 3);
    const oneOff = [makeTxn({ description: "Random Store", amount: 42 })];

    const patterns = detectPatterns([...netflixTxns, ...salaryTxns, ...oneOff], []);

    expect(patterns).toHaveLength(2);
    const expense = patterns.find((p) => p.type === "expense");
    const income = patterns.find((p) => p.type === "income");
    expect(expense).toBeDefined();
    expect(income).toBeDefined();
  });

  it("assigns high confidence to consistent monthly pattern with many transactions", () => {
    const txns = makeMonthlyTransactions("Netflix", 22.99, "debit", 8);

    const patterns = detectPatterns(txns, []);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].confidence).toBe("high");
  });

  it("assigns lower confidence to patterns with few transactions", () => {
    const txns = makeMonthlyTransactions("New Service", 9.99, "debit", 2);

    const patterns = detectPatterns(txns, []);

    expect(patterns).toHaveLength(1);
    expect(["low", "medium"]).toContain(patterns[0].confidence);
  });

  it("fuzzy vendor matching groups variations together", () => {
    const txns = [
      makeTxn({ id: "txn-1", description: "NETFLIX.COM", amount: 22.99, date: new Date(2025, 0, 15) }),
      makeTxn({ id: "txn-2", description: "Netflix", amount: 22.99, date: new Date(2025, 1, 15) }),
      makeTxn({ id: "txn-3", description: "NETFLIX.COM Subscription", amount: 22.99, date: new Date(2025, 2, 15) }),
    ];

    const patterns = detectPatterns(txns, []);

    // All three should be grouped into one pattern
    expect(patterns).toHaveLength(1);
    expect(patterns[0].matchingTransactionCount).toBe(3);
  });
});
