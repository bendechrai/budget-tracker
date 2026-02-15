/**
 * Pattern detection engine.
 * Analyzes transactions to detect recurring patterns (income and expenses).
 * Groups by vendor similarity, detects frequency and amount patterns,
 * classifies as income or expense, and calculates confidence.
 */

import type { IncomeFrequency, SuggestionConfidence, SuggestionType } from "@/app/generated/prisma/client";
import { groupByVendor, vendorSimilarity, type TransactionRecord, type VendorGroup } from "./vendorMatch";

/** Minimum number of transactions required to form a suggestion. */
const MIN_TRANSACTIONS = 2;

/** Maximum allowed coefficient of variation before amount is considered "variable". */
const AMOUNT_VARIABLE_THRESHOLD = 0.15;

export interface DetectedPattern {
  vendorPattern: string;
  type: SuggestionType;
  detectedAmount: number;
  detectedAmountMin: number | null;
  detectedAmountMax: number | null;
  detectedFrequency: IncomeFrequency;
  confidence: SuggestionConfidence;
  matchingTransactionCount: number;
  transactionIds: string[];
}

export interface ExistingPattern {
  name: string;
  amount: number;
  type: "income" | "expense";
}

/**
 * Detect recurring patterns from a set of transactions.
 * Excludes patterns that match already-tracked income sources or obligations.
 */
export function detectPatterns(
  transactions: TransactionRecord[],
  existingPatterns: ExistingPattern[]
): DetectedPattern[] {
  const groups = groupByVendor(transactions);
  const results: DetectedPattern[] = [];

  for (const group of groups) {
    if (group.transactions.length < MIN_TRANSACTIONS) {
      continue;
    }

    const pattern = analyzeGroup(group);
    if (!pattern) continue;

    if (isAlreadyTracked(pattern, existingPatterns)) {
      continue;
    }

    results.push(pattern);
  }

  return results;
}

/**
 * Analyze a vendor group to extract pattern information.
 * Returns null if no recognizable pattern is found.
 */
function analyzeGroup(group: VendorGroup): DetectedPattern | null {
  const { transactions } = group;
  const type = classifyType(transactions);
  const amounts = transactions.map((t) => t.amount);
  const amountStats = computeAmountStats(amounts);
  const frequency = detectFrequency(transactions);
  const confidence = calculateConfidence(transactions, amountStats, frequency);

  return {
    vendorPattern: group.vendorPattern,
    type,
    detectedAmount: amountStats.mean,
    detectedAmountMin: amountStats.isVariable ? amountStats.min : null,
    detectedAmountMax: amountStats.isVariable ? amountStats.max : null,
    detectedFrequency: frequency,
    confidence,
    matchingTransactionCount: transactions.length,
    transactionIds: transactions.map((t) => t.id),
  };
}

/**
 * Classify a group of transactions as income or expense.
 * Credit transactions → income, debit transactions → expense.
 * If mixed, use the majority type.
 */
function classifyType(transactions: TransactionRecord[]): SuggestionType {
  const credits = transactions.filter((t) => t.type === "credit").length;
  return credits > transactions.length / 2 ? "income" : "expense";
}

interface AmountStats {
  mean: number;
  min: number;
  max: number;
  stddev: number;
  isVariable: boolean;
}

function computeAmountStats(amounts: number[]): AmountStats {
  const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const variance = amounts.reduce((sum, a) => sum + (a - mean) ** 2, 0) / amounts.length;
  const stddev = Math.sqrt(variance);
  const cv = mean > 0 ? stddev / mean : 0;

  return {
    mean: Math.round(mean * 100) / 100,
    min,
    max,
    stddev,
    isVariable: cv > AMOUNT_VARIABLE_THRESHOLD,
  };
}

/**
 * Detect the frequency of transactions by analyzing the intervals between them.
 * Sorts by date, calculates median interval, and maps to a known frequency.
 */
export function detectFrequency(transactions: TransactionRecord[]): IncomeFrequency {
  if (transactions.length < 2) return "irregular";

  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diffMs = sorted[i].date.getTime() - sorted[i - 1].date.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    intervals.push(diffDays);
  }

  const medianInterval = median(intervals);

  // For intervals in the fortnightly/twice-monthly range, check day-of-month pattern
  if (medianInterval >= 11 && medianInterval <= 18) {
    if (isTwiceMonthlyPattern(sorted)) {
      return "twice_monthly";
    }
    return "fortnightly";
  }

  return mapIntervalToFrequency(medianInterval);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/** Maximum allowed deviation (in days) from a cluster center for day-of-month grouping. */
const DAY_OF_MONTH_TOLERANCE = 3;

/**
 * Determine whether transactions follow a twice-monthly pattern by checking
 * if they cluster around exactly two days of the month (e.g. 1st & 15th).
 *
 * Twice-monthly differs from fortnightly: twice-monthly lands on two fixed
 * calendar days each month while fortnightly drifts across month boundaries.
 */
function isTwiceMonthlyPattern(sortedTransactions: TransactionRecord[]): boolean {
  const days = sortedTransactions.map((t) => t.date.getDate());

  // Find two clusters in the day-of-month values
  // Use a simple approach: sort days and try to split into two groups
  const sortedDays = [...days].sort((a, b) => a - b);

  // Try every possible split point and find the two-cluster assignment
  // with the lowest total deviation from cluster centers
  let bestCost = Infinity;
  let bestValid = false;

  for (let split = 1; split < sortedDays.length; split++) {
    const group1 = sortedDays.slice(0, split);
    const group2 = sortedDays.slice(split);

    if (group1.length === 0 || group2.length === 0) continue;

    const center1 = Math.round(group1.reduce((s, d) => s + d, 0) / group1.length);
    const center2 = Math.round(group2.reduce((s, d) => s + d, 0) / group2.length);

    // The two cluster centers must be sufficiently separated
    if (Math.abs(center2 - center1) < 10) continue;

    // Check that all values in each group are within tolerance of their center
    const allWithinTolerance =
      group1.every((d) => Math.abs(d - center1) <= DAY_OF_MONTH_TOLERANCE) &&
      group2.every((d) => Math.abs(d - center2) <= DAY_OF_MONTH_TOLERANCE);

    if (!allWithinTolerance) continue;

    const cost =
      group1.reduce((s, d) => s + Math.abs(d - center1), 0) +
      group2.reduce((s, d) => s + Math.abs(d - center2), 0);

    if (cost < bestCost) {
      bestCost = cost;
      bestValid = true;
    }
  }

  return bestValid;
}

/**
 * Map a median interval (in days) to a known frequency.
 * Allows ~20% tolerance on each range.
 * Note: the 11-18 day range (fortnightly/twice_monthly) is handled
 * separately in detectFrequency() before this function is called.
 */
function mapIntervalToFrequency(days: number): IncomeFrequency {
  if (days >= 5 && days <= 9) return "weekly";
  if (days >= 11 && days <= 18) return "fortnightly";
  if (days >= 25 && days <= 38) return "monthly";
  if (days >= 75 && days <= 110) return "quarterly";
  if (days >= 330 && days <= 400) return "annual";
  return "irregular";
}

/**
 * Calculate confidence level based on:
 * - Number of matching transactions (more = higher)
 * - Amount consistency (lower variance = higher)
 * - Frequency regularity (recognized pattern = higher)
 */
function calculateConfidence(
  transactions: TransactionRecord[],
  amountStats: AmountStats,
  frequency: IncomeFrequency
): SuggestionConfidence {
  let score = 0;

  // Transaction count scoring
  if (transactions.length >= 6) score += 3;
  else if (transactions.length >= 4) score += 2;
  else if (transactions.length >= 2) score += 1;

  // Amount consistency scoring
  if (!amountStats.isVariable) score += 2;
  else if (amountStats.stddev / amountStats.mean < 0.3) score += 1;

  // Frequency regularity scoring
  if (frequency !== "irregular") score += 2;

  if (score >= 6) return "high";
  if (score >= 4) return "medium";
  return "low";
}

/**
 * Check whether a detected pattern is already tracked as an existing
 * income source or obligation. Matches by vendor name similarity and
 * amount proximity.
 */
function isAlreadyTracked(
  pattern: DetectedPattern,
  existing: ExistingPattern[]
): boolean {
  const patternType = pattern.type === "income" ? "income" : "expense";

  for (const ex of existing) {
    if (ex.type !== patternType) continue;

    const similarity = vendorSimilarity(pattern.vendorPattern, ex.name);
    if (similarity < 0.7) continue;

    // Check amount proximity (within 20%)
    const amountDiff = Math.abs(pattern.detectedAmount - ex.amount);
    const threshold = Math.max(ex.amount, pattern.detectedAmount) * 0.2;
    if (amountDiff <= threshold) return true;
  }

  return false;
}
