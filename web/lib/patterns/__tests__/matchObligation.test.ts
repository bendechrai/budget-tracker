import { describe, it, expect } from "vitest";
import { findBestObligationMatch, matchTransactionsToObligations } from "../matchObligation";
import type { MatchableTransaction, MatchableObligation } from "../matchObligation";

describe("findBestObligationMatch", () => {
  const obligations: MatchableObligation[] = [
    { id: "obl-netflix", name: "Netflix", amount: 22.99 },
    { id: "obl-spotify", name: "Spotify", amount: 14.99 },
    { id: "obl-electricity", name: "City Power Electricity", amount: 150 },
  ];

  it("matches a transaction with similar vendor name", () => {
    const tx: MatchableTransaction = {
      id: "tx-1",
      description: "NETFLIX.COM",
      amount: 22.99,
      type: "debit",
    };
    expect(findBestObligationMatch(tx, obligations)).toBe("obl-netflix");
  });

  it("matches even when amount differs significantly", () => {
    // Heat wave — electricity bill 50% higher
    const tx: MatchableTransaction = {
      id: "tx-2",
      description: "CITY POWER ELECTRICITY",
      amount: 225,
      type: "debit",
    };
    expect(findBestObligationMatch(tx, obligations)).toBe("obl-electricity");
  });

  it("skips credit transactions", () => {
    const tx: MatchableTransaction = {
      id: "tx-3",
      description: "NETFLIX REFUND",
      amount: 22.99,
      type: "credit",
    };
    expect(findBestObligationMatch(tx, obligations)).toBeNull();
  });

  it("returns null when no obligation matches", () => {
    const tx: MatchableTransaction = {
      id: "tx-4",
      description: "GROCERY STORE",
      amount: 85.0,
      type: "debit",
    };
    expect(findBestObligationMatch(tx, obligations)).toBeNull();
  });

  it("returns null for empty obligations list", () => {
    const tx: MatchableTransaction = {
      id: "tx-5",
      description: "NETFLIX",
      amount: 22.99,
      type: "debit",
    };
    expect(findBestObligationMatch(tx, [])).toBeNull();
  });

  it("uses amount proximity as tiebreaker when multiple obligations match", () => {
    const similarObligations: MatchableObligation[] = [
      { id: "obl-netflix-basic", name: "Netflix Basic", amount: 9.99 },
      { id: "obl-netflix-premium", name: "Netflix Premium", amount: 22.99 },
    ];
    const tx: MatchableTransaction = {
      id: "tx-6",
      description: "NETFLIX",
      amount: 22.99,
      type: "debit",
    };
    expect(findBestObligationMatch(tx, similarObligations)).toBe("obl-netflix-premium");
  });

  it("matches with partial vendor name in description", () => {
    const tx: MatchableTransaction = {
      id: "tx-7",
      description: "SPOTIFY PREMIUM SUBSCRIPTION",
      amount: 14.99,
      type: "debit",
    };
    expect(findBestObligationMatch(tx, obligations)).toBe("obl-spotify");
  });
});

describe("matchTransactionsToObligations", () => {
  const obligations: MatchableObligation[] = [
    { id: "obl-netflix", name: "Netflix", amount: 22.99 },
    { id: "obl-spotify", name: "Spotify", amount: 14.99 },
  ];

  it("matches multiple transactions", () => {
    const transactions: MatchableTransaction[] = [
      { id: "tx-1", description: "NETFLIX.COM", amount: 22.99, type: "debit" },
      { id: "tx-2", description: "SPOTIFY", amount: 14.99, type: "debit" },
      { id: "tx-3", description: "GROCERY STORE", amount: 50, type: "debit" },
      { id: "tx-4", description: "SALARY DEPOSIT", amount: 5000, type: "credit" },
    ];

    const matches = matchTransactionsToObligations(transactions, obligations);
    expect(matches.size).toBe(2);
    expect(matches.get("tx-1")).toBe("obl-netflix");
    expect(matches.get("tx-2")).toBe("obl-spotify");
    expect(matches.has("tx-3")).toBe(false);
    expect(matches.has("tx-4")).toBe(false);
  });

  it("returns empty map when no matches", () => {
    const transactions: MatchableTransaction[] = [
      { id: "tx-1", description: "RANDOM VENDOR", amount: 100, type: "debit" },
    ];
    const matches = matchTransactionsToObligations(transactions, obligations);
    expect(matches.size).toBe(0);
  });

  it("returns empty map for empty inputs", () => {
    expect(matchTransactionsToObligations([], obligations).size).toBe(0);
    expect(matchTransactionsToObligations([], []).size).toBe(0);
  });
});
