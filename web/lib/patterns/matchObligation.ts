/**
 * Pure matching logic for linking transactions to obligations.
 * No Prisma dependency — uses vendorSimilarity from vendorMatch.
 */

import { vendorSimilarity } from "./vendorMatch";

const VENDOR_SIMILARITY_THRESHOLD = 0.7;

export interface MatchableTransaction {
  id: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
}

export interface MatchableObligation {
  id: string;
  name: string;
  amount: number;
}

/**
 * Find the best obligation match for a single debit transaction.
 * Returns the obligation ID or null if no match meets the threshold.
 *
 * Algorithm:
 * 1. Skip credit transactions (income, not obligations)
 * 2. Compute vendor similarity against all obligations
 * 3. Require >= 0.7 similarity (the only hard gate)
 * 4. If multiple pass, use amount proximity as tiebreaker
 */
export function findBestObligationMatch(
  transaction: MatchableTransaction,
  obligations: MatchableObligation[]
): string | null {
  if (transaction.type === "credit") return null;
  if (obligations.length === 0) return null;

  const candidates: { obligationId: string; similarity: number; amountDiff: number }[] = [];

  for (const obligation of obligations) {
    const similarity = vendorSimilarity(transaction.description, obligation.name);
    if (similarity >= VENDOR_SIMILARITY_THRESHOLD) {
      candidates.push({
        obligationId: obligation.id,
        similarity,
        amountDiff: Math.abs(transaction.amount - obligation.amount),
      });
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].obligationId;

  // Multiple matches: sort by similarity desc, then amount proximity asc
  candidates.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    return a.amountDiff - b.amountDiff;
  });

  return candidates[0].obligationId;
}

/**
 * Match multiple transactions to obligations.
 * Returns a Map of transactionId -> obligationId for all matched transactions.
 */
export function matchTransactionsToObligations(
  transactions: MatchableTransaction[],
  obligations: MatchableObligation[]
): Map<string, string> {
  const matches = new Map<string, string>();

  for (const transaction of transactions) {
    const obligationId = findBestObligationMatch(transaction, obligations);
    if (obligationId) {
      matches.set(transaction.id, obligationId);
    }
  }

  return matches;
}
