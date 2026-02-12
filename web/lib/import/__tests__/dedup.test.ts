import { describe, it, expect } from "vitest";
import {
  deduplicateTransactions,
  generateFingerprint,
  type ExistingTransaction,
} from "../dedup";
import type { ParsedTransaction } from "../csvParser";

function makeParsed(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    date: new Date(2025, 0, 15), // Jan 15, 2025
    description: "Netflix Subscription",
    amount: 22.99,
    type: "debit",
    referenceId: null,
    ...overrides,
  };
}

function makeExisting(overrides: Partial<ExistingTransaction> = {}): ExistingTransaction {
  const base = makeParsed(overrides as Partial<ParsedTransaction>);
  return {
    referenceId: base.referenceId,
    fingerprint: generateFingerprint(base),
    date: base.date,
    amount: base.amount,
    description: base.description,
    ...overrides,
  };
}

describe("generateFingerprint", () => {
  it("produces a hex string", () => {
    const fp = generateFingerprint(makeParsed());
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces the same fingerprint for identical transactions", () => {
    const a = generateFingerprint(makeParsed());
    const b = generateFingerprint(makeParsed());
    expect(a).toBe(b);
  });

  it("produces different fingerprints for different amounts", () => {
    const a = generateFingerprint(makeParsed({ amount: 22.99 }));
    const b = generateFingerprint(makeParsed({ amount: 23.00 }));
    expect(a).not.toBe(b);
  });

  it("produces different fingerprints for different dates", () => {
    const a = generateFingerprint(makeParsed({ date: new Date(2025, 0, 15) }));
    const b = generateFingerprint(makeParsed({ date: new Date(2025, 0, 16) }));
    expect(a).not.toBe(b);
  });

  it("is case-insensitive on description", () => {
    const a = generateFingerprint(makeParsed({ description: "Netflix" }));
    const b = generateFingerprint(makeParsed({ description: "netflix" }));
    expect(a).toBe(b);
  });
});

describe("deduplicateTransactions", () => {
  describe("Layer 1: exact referenceId match", () => {
    it("skips transactions with matching referenceId", () => {
      const incoming: ParsedTransaction[] = [
        makeParsed({ referenceId: "REF-001", description: "Different description", amount: 999 }),
      ];
      const existing: ExistingTransaction[] = [
        makeExisting({ referenceId: "REF-001" }),
      ];

      const result = deduplicateTransactions(incoming, existing);

      expect(result.skipped).toHaveLength(1);
      expect(result.newTransactions).toHaveLength(0);
      expect(result.flagged).toHaveLength(0);
    });

    it("does not skip when referenceId is null", () => {
      const incoming: ParsedTransaction[] = [
        makeParsed({ referenceId: null, description: "Unique item", amount: 100, date: new Date(2025, 5, 1) }),
      ];
      const existing: ExistingTransaction[] = [
        makeExisting({ referenceId: null, description: "Something else", amount: 200, date: new Date(2025, 3, 1) }),
      ];

      const result = deduplicateTransactions(incoming, existing);

      expect(result.newTransactions).toHaveLength(1);
      expect(result.skipped).toHaveLength(0);
    });
  });

  describe("Layer 2: fingerprint match", () => {
    it("skips transactions with matching fingerprint", () => {
      const txn = makeParsed();
      const incoming: ParsedTransaction[] = [txn];
      const existing: ExistingTransaction[] = [
        {
          referenceId: null,
          fingerprint: generateFingerprint(txn),
          date: txn.date,
          amount: txn.amount,
          description: txn.description,
        },
      ];

      const result = deduplicateTransactions(incoming, existing);

      expect(result.skipped).toHaveLength(1);
      expect(result.newTransactions).toHaveLength(0);
      expect(result.flagged).toHaveLength(0);
    });

    it("detects fingerprint dupe even without referenceId", () => {
      const incoming: ParsedTransaction[] = [
        makeParsed({ referenceId: null }),
      ];
      const existing: ExistingTransaction[] = [
        makeExisting({ referenceId: null }),
      ];

      const result = deduplicateTransactions(incoming, existing);

      expect(result.skipped).toHaveLength(1);
    });
  });

  describe("Layer 3: fuzzy match", () => {
    it("flags transactions with same date, similar amount, and similar description", () => {
      const incoming: ParsedTransaction[] = [
        makeParsed({
          date: new Date(2025, 0, 15),
          description: "NETFLIX.COM Subscription",
          amount: 23.49,
          referenceId: null,
        }),
      ];
      const existing: ExistingTransaction[] = [
        {
          referenceId: null,
          fingerprint: "different-fingerprint",
          date: new Date(2025, 0, 15),
          amount: 22.99,
          description: "Netflix Subscription",
        },
      ];

      const result = deduplicateTransactions(incoming, existing);

      expect(result.flagged).toHaveLength(1);
      expect(result.flagged[0].transaction.description).toBe("NETFLIX.COM Subscription");
      expect(result.flagged[0].matchedExisting.description).toBe("Netflix Subscription");
      expect(result.flagged[0].reason).toContain("Similar transaction found");
      expect(result.newTransactions).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });

    it("does not flag when descriptions are very different", () => {
      const incoming: ParsedTransaction[] = [
        makeParsed({
          date: new Date(2025, 0, 15),
          description: "Woolworths Grocery Store",
          amount: 23.00,
          referenceId: null,
        }),
      ];
      const existing: ExistingTransaction[] = [
        {
          referenceId: null,
          fingerprint: "different-fingerprint",
          date: new Date(2025, 0, 15),
          amount: 22.99,
          description: "Netflix Subscription",
        },
      ];

      const result = deduplicateTransactions(incoming, existing);

      expect(result.newTransactions).toHaveLength(1);
      expect(result.flagged).toHaveLength(0);
    });

    it("does not flag when dates differ", () => {
      const incoming: ParsedTransaction[] = [
        makeParsed({
          date: new Date(2025, 0, 16), // different day
          description: "Netflix Subscription",
          amount: 22.99,
          referenceId: null,
        }),
      ];
      const existing: ExistingTransaction[] = [
        {
          referenceId: null,
          fingerprint: "different-fingerprint",
          date: new Date(2025, 0, 15),
          amount: 22.99,
          description: "Netflix Subscription",
        },
      ];

      const result = deduplicateTransactions(incoming, existing);

      expect(result.newTransactions).toHaveLength(1);
      expect(result.flagged).toHaveLength(0);
    });

    it("does not flag when amounts differ significantly", () => {
      const incoming: ParsedTransaction[] = [
        makeParsed({
          date: new Date(2025, 0, 15),
          description: "Netflix Subscription",
          amount: 50.00, // very different from 22.99
          referenceId: null,
        }),
      ];
      const existing: ExistingTransaction[] = [
        {
          referenceId: null,
          fingerprint: "different-fingerprint",
          date: new Date(2025, 0, 15),
          amount: 22.99,
          description: "Netflix Subscription",
        },
      ];

      const result = deduplicateTransactions(incoming, existing);

      expect(result.newTransactions).toHaveLength(1);
      expect(result.flagged).toHaveLength(0);
    });
  });

  describe("new transactions", () => {
    it("passes through genuinely new transactions", () => {
      const incoming: ParsedTransaction[] = [
        makeParsed({
          date: new Date(2025, 2, 1),
          description: "Brand New Purchase",
          amount: 42.00,
          referenceId: "NEW-REF",
        }),
      ];
      const existing: ExistingTransaction[] = [
        makeExisting({
          date: new Date(2025, 0, 15),
          description: "Netflix Subscription",
          amount: 22.99,
          referenceId: "OLD-REF",
        }),
      ];

      const result = deduplicateTransactions(incoming, existing);

      expect(result.newTransactions).toHaveLength(1);
      expect(result.newTransactions[0].description).toBe("Brand New Purchase");
      expect(result.skipped).toHaveLength(0);
      expect(result.flagged).toHaveLength(0);
    });

    it("handles empty existing transactions (all are new)", () => {
      const incoming: ParsedTransaction[] = [
        makeParsed({ description: "First" }),
        makeParsed({ description: "Second", amount: 10 }),
      ];

      const result = deduplicateTransactions(incoming, []);

      expect(result.newTransactions).toHaveLength(2);
      expect(result.skipped).toHaveLength(0);
      expect(result.flagged).toHaveLength(0);
    });

    it("handles empty incoming transactions", () => {
      const existing: ExistingTransaction[] = [makeExisting()];

      const result = deduplicateTransactions([], existing);

      expect(result.newTransactions).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
      expect(result.flagged).toHaveLength(0);
    });
  });

  describe("mixed results", () => {
    it("categorizes multiple incoming transactions correctly", () => {
      const existingTxn = makeParsed({
        description: "Netflix Subscription",
        amount: 22.99,
        date: new Date(2025, 0, 15),
      });

      const incoming: ParsedTransaction[] = [
        // Should be skipped (exact ref ID match)
        makeParsed({
          referenceId: "REF-EXISTING",
          description: "Anything",
          amount: 1,
          date: new Date(2025, 5, 1),
        }),
        // Should be skipped (fingerprint match)
        makeParsed({
          description: "Netflix Subscription",
          amount: 22.99,
          date: new Date(2025, 0, 15),
          referenceId: null,
        }),
        // Should be flagged (fuzzy match — same date, similar amount, similar description)
        makeParsed({
          description: "Netflix Monthly Subscription",
          amount: 23.00,
          date: new Date(2025, 0, 15),
          referenceId: null,
        }),
        // Should be new
        makeParsed({
          description: "Completely Different Store",
          amount: 100,
          date: new Date(2025, 6, 1),
          referenceId: null,
        }),
      ];

      const existing: ExistingTransaction[] = [
        {
          referenceId: "REF-EXISTING",
          fingerprint: generateFingerprint(existingTxn),
          date: existingTxn.date,
          amount: existingTxn.amount,
          description: existingTxn.description,
        },
      ];

      const result = deduplicateTransactions(incoming, existing);

      expect(result.skipped).toHaveLength(2);
      expect(result.flagged).toHaveLength(1);
      expect(result.newTransactions).toHaveLength(1);
      expect(result.newTransactions[0].description).toBe("Completely Different Store");
    });
  });

  describe("layer priority", () => {
    it("referenceId match takes priority over fingerprint", () => {
      const txn = makeParsed({ referenceId: "REF-001" });
      const incoming: ParsedTransaction[] = [txn];
      const existing: ExistingTransaction[] = [
        {
          referenceId: "REF-001",
          fingerprint: generateFingerprint(txn),
          date: txn.date,
          amount: txn.amount,
          description: txn.description,
        },
      ];

      const result = deduplicateTransactions(incoming, existing);

      // Should be skipped once (not counted twice)
      expect(result.skipped).toHaveLength(1);
      expect(result.newTransactions).toHaveLength(0);
      expect(result.flagged).toHaveLength(0);
    });
  });
});
