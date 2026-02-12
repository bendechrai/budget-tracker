import { describe, it, expect } from "vitest";
import {
  normalizeVendor,
  vendorSimilarity,
  groupByVendor,
  type TransactionRecord,
} from "../vendorMatch";

describe("normalizeVendor", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeVendor("NETFLIX.COM")).toBe("netflix");
  });

  it("removes domain suffixes", () => {
    expect(normalizeVendor("spotify.com")).toBe("spotify");
    expect(normalizeVendor("store.co")).toBe("store");
  });

  it("collapses whitespace", () => {
    expect(normalizeVendor("  Big  W   Store  ")).toBe("big w store");
  });

  it("removes special characters", () => {
    expect(normalizeVendor("PAYPAL *NETFLIX")).toBe("paypal netflix");
  });
});

describe("vendorSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(vendorSimilarity("Netflix", "Netflix")).toBe(1);
  });

  it("returns 1 for case-different strings after normalization", () => {
    expect(vendorSimilarity("NETFLIX", "netflix")).toBe(1);
  });

  it("returns 1 for domain vs plain name", () => {
    expect(vendorSimilarity("NETFLIX.COM", "Netflix")).toBe(1);
  });

  it("returns high similarity for minor variations", () => {
    const sim = vendorSimilarity("NETFLIX.COM", "Netflix Inc");
    expect(sim).toBeGreaterThan(0.6);
  });

  it("returns low similarity for different vendors", () => {
    const sim = vendorSimilarity("Netflix", "Woolworths");
    expect(sim).toBeLessThan(0.3);
  });

  it("returns 0 for very short strings", () => {
    expect(vendorSimilarity("A", "B")).toBe(0);
  });
});

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

describe("groupByVendor", () => {
  it("groups identical vendor names together", () => {
    const txns = [
      makeTxn({ description: "Netflix" }),
      makeTxn({ description: "Netflix" }),
      makeTxn({ description: "Spotify" }),
    ];

    const groups = groupByVendor(txns);

    expect(groups).toHaveLength(2);
    const netflixGroup = groups.find((g) =>
      g.vendorPattern.toLowerCase().includes("netflix")
    );
    expect(netflixGroup?.transactions).toHaveLength(2);
  });

  it("groups similar vendor names together", () => {
    const txns = [
      makeTxn({ description: "NETFLIX.COM" }),
      makeTxn({ description: "Netflix" }),
      makeTxn({ description: "NETFLIX.COM Subscription" }),
    ];

    const groups = groupByVendor(txns);

    expect(groups).toHaveLength(1);
    expect(groups[0].transactions).toHaveLength(3);
  });

  it("separates dissimilar vendors", () => {
    const txns = [
      makeTxn({ description: "Netflix" }),
      makeTxn({ description: "Woolworths" }),
      makeTxn({ description: "Coles Supermarket" }),
    ];

    const groups = groupByVendor(txns);

    expect(groups).toHaveLength(3);
  });

  it("returns empty array for empty input", () => {
    const groups = groupByVendor([]);
    expect(groups).toHaveLength(0);
  });
});
